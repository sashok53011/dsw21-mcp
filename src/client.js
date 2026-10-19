// Deutsche Bahn client built on db-vendo-client, with in-memory caching,
// request throttling and localized error handling.

import {createClient} from 'db-vendo-client';
import {defaultProfile} from 'db-vendo-client/lib/default-profile.js';
import {profile as dbProfile} from 'db-vendo-client/p/db/index.js';
import {profile as dbnavProfile} from 'db-vendo-client/p/dbnav/index.js';
import {profile as dbwebProfile} from 'db-vendo-client/p/dbweb/index.js';
import {profile as dbrisProfile} from 'db-vendo-client/p/dbris/index.js';
import pThrottle from 'p-throttle';
import {TtlCache} from './cache.js';
import {t} from './i18n.js';

const PROFILES = {
	db: dbProfile,
	dbnav: dbnavProfile,
	dbweb: dbwebProfile,
	dbris: dbrisProfile,
};
const FORBIDDEN_USER_AGENTS = new Set([
	'my-awesome-program',
	'hafas-client-example',
	'link-to-your-project-or-email',
	'db-vendo-client',
]);

// Per-method cache TTLs (ms). Boards/trips are realtime data, locations are
// mostly static.
const TTL = {
	locations: 6 * 60 * 60 * 1000, // 6h
	nearby: 60 * 60 * 1000, // 1h
	departures: 30 * 1000, // 30s
	arrivals: 30 * 1000, // 30s
	trip: 15 * 1000, // 15s
	journeys: 60 * 1000, // 60s
};

// Cache key builders: keep arguments that affect the response.
const stationKey = (station) => {
	if (station && typeof station === 'object' && station.id) return String(station.id);
	return String(station);
};

const createDbClient = ({profileName, userAgent, enrichStations = false} = {}) => {
	const name = profileName || process.env.DB_PROFILE || 'dbnav';
	const profile = PROFILES[name];
	if (!profile) {
		throw new Error(`Unknown DB profile "${name}". Available: ${Object.keys(PROFILES).join(', ')}`);
	}

	let ua = userAgent || process.env.DB_USER_AGENT || '';
	if (!ua || FORBIDDEN_USER_AGENTS.has(ua.toLowerCase())) {
		// db-vendo-client refuses placeholder UAs; fall back to a descriptive one
		// and let the operator override it via DB_USER_AGENT.
		ua = 'dsw21-mcp/0.1 (+local MCP server; set DB_USER_AGENT to identify yourself)';
		console.error('[dsw21-mcp] Warning: DB_USER_AGENT is not set or is a placeholder. ' +
			'Deutsche Bahn asks for a UA that identifies/contact you, e.g. "my-app (https://example.org; me@example.org)".');
	}

	// ~60 requests/min is the documented limit for the dbnav profile; throttle
	// below it to be polite and to reduce the chance of being blocked.
	const requestsPerMinute = parseInt(process.env.DB_REQUESTS_PER_MINUTE || '30', 10);
	const throttle = pThrottle({
		limit: Math.max(1, requestsPerMinute),
		interval: 60 * 1000,
	});
	const merged = {...defaultProfile, ...profile};
	const throttled = {
		...merged,
		request: throttle(merged.request),
	};

	const client = createClient(throttled, ua, {enrichStations});
	const cache = new TtlCache();
	const lang = process.env.DB_LANG || 'en';

	// Wrap a client method with caching. Errors are never cached.
	const cached = (method, ttl, keyFn) => async (...args) => {
		const key = method + ':' + keyFn(...args);
		return cache.wrap(key, ttl, () => client[method](...args));
	};

	const wrapped = {
		profileName: name,
		language: lang,
		locations: cached('locations', TTL.locations, (query, opt) => JSON.stringify([query, opt])),
		nearby: cached('nearby', TTL.nearby, (loc, opt) => JSON.stringify([loc, opt])),
		departures: cached('departures', TTL.departures, (station, opt) => stationKey(station) + ':' + JSON.stringify([opt?.duration, opt?.products, opt?.stopovers, opt?.when && new Date(opt.when).getTime()])),
		arrivals: cached('arrivals', TTL.arrivals, (station, opt) => stationKey(station) + ':' + JSON.stringify([opt?.duration, opt?.products, opt?.stopovers, opt?.when && new Date(opt.when).getTime()])),
		trip: cached('trip', TTL.trip, (id) => String(id)),
		journeys: cached('journeys', TTL.journeys, (from, to, opt) => JSON.stringify([stationKey(from), stationKey(to), opt?.via, opt?.departure && new Date(opt.departure).getTime(), opt?.transfers, opt?.products, opt?.results])),
	};
	return wrapped;
};

// Resolve a user-supplied station reference (name or EVA number) to a station
// object. Names are looked up via locations(); EVA numbers are passed through.
const resolveStation = async (client, stationRef) => {
	const str = String(stationRef).trim();
	if (!str) {
		const err = new Error('EMPTY_STATION');
		err.statusCode = 400;
		throw err;
	}
	// EVA numbers are numeric IDs like 8011160.
	if (/^\d+$/.test(str)) {
		return {id: str, name: str};
	}
	const res = await client.locations(str, {results: 1, fuzzy: true, stops: true, addresses: false, poi: false});
	const first = res && res[0];
	if (!first || !first.id) {
		const err = new Error('STATION_NOT_FOUND:' + str);
		err.statusCode = 404;
		throw err;
	}
	return first;
};

// Classify an upstream failure so we can return a localized, actionable
// message instead of a cryptic "Unknown" (which db-vendo-client produces from
// res.statusText when DB answers with an error body).
const classifyUpstream = (err) => {
	if (!err) return null;
	const status = err.response?.status ?? err.statusCode;
	const body = typeof err.hafasMessage === 'string' ? err.hafasMessage : '';
	const msg = typeof err.message === 'string' ? err.message : '';
	// DB answers HTTP 452 with {"status":"ERROR","code":"OPS_BLOCKED",...}.
	if (status === 452 || /OPS_BLOCKED/i.test(msg) || /OPS_BLOCKED/i.test(body)) return 'blocked';
	if (status === 429) return 'ratelimited';
	if (status === 403) return 'forbidden';
	if (status === 404) return 'unavailable';
	// Network-level failures.
	if (['ENOTFOUND', 'ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT'].includes(err.code)) return 'network';
	if (status >= 500) return 'unavailable';
	if (err.isHafasError) return 'hafas';
	return null;
};

// Map internal error codes to localized, human-readable messages.
const localizeError = (err, lang, profileName) => {
	const tt = t(lang);
	if (err && typeof err.message === 'string') {
		if (err.message.startsWith('STATION_NOT_FOUND:')) {
			return tt.stationNotFound(err.message.slice('STATION_NOT_FOUND:'.length));
		}
		if (err.message === 'EMPTY_STATION') return tt.invalidStation;
	}
	const kind = classifyUpstream(err);
	if (kind === 'blocked') return tt.upstreamBlocked(profileName);
	if (kind === 'ratelimited') return tt.upstreamRateLimited(profileName);
	if (kind === 'forbidden' || kind === 'unavailable' || kind === 'network' || kind === 'hafas') {
		return tt.upstreamError(profileName);
	}
	return err && err.message && err.message !== 'Unknown' ? err.message : tt.upstreamError(profileName);
};

export {
	createDbClient,
	resolveStation,
	localizeError,
	PROFILES,
	TTL,
};
