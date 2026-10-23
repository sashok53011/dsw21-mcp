// Journey planning via the Transitous MOTIS API (free, no key).
// Docs: https://transitous.org/api/ — please don't flood it; responses are
// cached (itineraries 10 min, geocoding 6 h).

import {z} from 'zod';
import {bilingual, t, resolveLanguage} from '../i18n.js';
import {currentLocation} from '../location.js';
import {getClientIp} from './location.js';
import {TtlCache} from '../cache.js';

const MOTIS_BASE = process.env.TRANSITOUS_URL || 'https://api.transitous.org/api/v1';

// Transitous rejects generic/absent User-Agents (403, usage policy) — every
// request must identify the client.
const userAgent = process.env.DB_USER_AGENT
	|| 'dsw21-mcp/0.3.0 (+https://github.com/sashok53011/dsw21-mcp)';

const cache = new TtlCache();
const GEOCODE_TTL_MS = 6 * 60 * 60 * 1000;
const PLAN_TTL_MS = 10 * 60 * 1000;

const motisGet = async (path, params) => {
	const url = new URL(MOTIS_BASE + path);
	for (const [k, v] of Object.entries(params)) {
		if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
	}
	const res = await fetch(url, {
		signal: AbortSignal.timeout(45_000),
		headers: {'user-agent': userAgent},
	});
	if (!res.ok) {
		const body = await res.text().catch(() => '');
		throw new Error(`MOTIS ${path} HTTP ${res.status} ${body.slice(0, 200)}`);
	}
	return res.json();
};

// "lat,lon" passthrough, anything else goes through the geocoder.
const resolvePlace = async (query, lang) => {
	const coordMatch = String(query).trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
	if (coordMatch) {
		return {lat: parseFloat(coordMatch[1]), lon: parseFloat(coordMatch[2]), name: String(query).trim(), raw: true};
	}
	const key = 'geocode:' + lang + ':' + query;
	const data = await cache.wrap(key, GEOCODE_TTL_MS, () => motisGet('/geocode', {text: query, language: lang}));
	const hit = (data || []).find(r => typeof r.lat === 'number' && typeof r.lon === 'number');
	if (!hit) {
		const err = new Error('GEOCODE_FAILED:' + query);
		err.statusCode = 404;
		throw err;
	}
	return {lat: hit.lat, lon: hit.lon, name: hit.name || query};
};

const iso = (s) => (s ? new Date(s).toISOString() : null);
const delayMin = (actual, scheduled) => {
	if (!actual || !scheduled) return null;
	const d = Math.round((new Date(actual) - new Date(scheduled)) / 60000);
	return d === 0 ? 0 : d;
};

const compactLeg = (leg, tt) => {
	const base = {
		mode: leg.mode,
		from: leg.from?.name || null,
		to: leg.to?.name || null,
		depart: iso(leg.startTime),
		arrive: iso(leg.endTime),
	};
	if (leg.mode === 'WALK') {
		if (typeof leg.distance === 'number') base.distanceMeters = Math.round(leg.distance);
		return base;
	}
	const d = delayMin(leg.startTime, leg.scheduledStartTime);
	return {
		...base,
		line: leg.routeShortName || leg.routeLongName || null,
		headsign: leg.headsign || null,
		tripId: leg.tripId || null,
		scheduledDepart: iso(leg.scheduledStartTime),
		scheduledArrive: iso(leg.scheduledEndTime),
		delayMin: d,
		status: leg.cancelled ? tt.cancelled : (d > 0 ? tt.delayed : tt.onTime),
		track: leg.from?.track || null,
		scheduledTrack: leg.from?.scheduledTrack || null,
		cancelled: leg.cancelled || undefined,
	};
};

const planJourney = (server) => {
	server.tool(
		'plan_journey',
		bilingual(
			'Plan a public-transport journey (Transitous/Germany-wide coverage) with realtime updates. The destination may be a place name or "lat,lon"; the origin defaults to the current location (current_location) — do not ask the user where they are. Returns itineraries with legs, transfers, delays and platforms.',
			'Öffentliche Verbindung planen (Transitous, deutschlandweite Abdeckung) mit Echtzeit-Updates. Das Ziel kann ein Ortsname oder "lat,lon" sein; der Start ist standardmäßig die aktuelle Position (current_location) — nicht den Nutzer nach dem Standort fragen. Gibt Itineraries mit Abschnitten, Umstiegen, Verspätungen und Gleisen zurück.',
		),
		{
			to: z.string().min(1).describe(bilingual('Destination: place name (e.g. "Köln Hbf") or "lat,lon".', 'Ziel: Ortsname (z. B. "Köln Hbf") oder "lat,lon".')),
			from: z.string().min(1).optional().describe(bilingual('Origin: place name or "lat,lon". Omit to use the current location.', 'Start: Ortsname oder "lat,lon". Weglassen, um die aktuelle Position zu nutzen.')),
			departure: z.string().optional().describe(bilingual('Planned departure time, ISO 8601 (default: now).', 'Geplante Abfahrtszeit, ISO 8601 (Standard: jetzt).')),
			maxTransfers: z.number().int().min(0).max(10).optional().describe(bilingual('Maximum number of transfers.', 'Maximale Anzahl Umstiege.')),
			results: z.number().int().min(1).max(5).optional().describe(bilingual('Number of itineraries to return (default 3).', 'Anzahl der Itineraries (Standard 3).')),
			language: z.enum(['en', 'de']).optional().describe(bilingual('Output language for status words.', 'Ausgabesprache für Statuswörter.')),
		},
		async ({to, from, departure, maxTransfers, results, language}) => {
			const lang = resolveLanguage(language);
			const tt = t(lang);
			try {
				// Origin: explicit or the user's current location.
				let fromPlace;
				if (from) {
					fromPlace = await resolvePlace(from, lang);
				} else {
					const use = await currentLocation(getClientIp()).catch(() => null);
					if (!use) {
						return {
							isError: true,
							content: [{type: 'text', text: tt.locationUnknownForJourney}],
						};
					}
					fromPlace = {lat: use.lat, lon: use.lon, name: use.city || 'current location'};
				}
				const toPlace = await resolvePlace(to, lang);

				const params = {
					fromPlace: `${fromPlace.lat},${fromPlace.lon}`,
					toPlace: `${toPlace.lat},${toPlace.lon}`,
					numItineraries: results || 3,
					language: lang,
				};
				if (departure) {
					const d = new Date(departure);
					if (Number.isNaN(d.getTime())) {
						return {isError: true, content: [{type: 'text', text: tt.invalidDeparture(departure)}]};
					}
					params.departureTime = d.toISOString();
				}
				if (maxTransfers !== undefined) params.maxTransfers = maxTransfers;

				const key = 'plan:' + JSON.stringify(params);
				const data = await cache.wrap(key, PLAN_TTL_MS, () => motisGet('/plan', params));

				const itineraries = (data.itineraries || []).map(it => ({
					departAt: iso(it.startTime),
					arriveAt: iso(it.endTime),
					durationMin: Math.round(it.duration / 60),
					transfers: it.transfers,
					legs: (it.legs || []).map(l => compactLeg(l, tt)),
				}));
				if (!itineraries.length) {
					return {
						content: [{type: 'text', text: JSON.stringify({from: fromPlace.name, to: toPlace.name, count: 0, note: tt.journeyNone}, null, 1)}],
					};
				}
				return {
					content: [{
						type: 'text',
						text: JSON.stringify({
							source: 'Transitous (MOTIS)',
							from: {name: fromPlace.name, latitude: fromPlace.lat, longitude: fromPlace.lon},
							to: {name: toPlace.name, latitude: toPlace.lat, longitude: toPlace.lon},
							count: itineraries.length,
							itineraries,
						}, null, 1),
					}],
				};
			} catch (err) {
				const msg = err?.message || String(err);
				if (msg.startsWith('GEOCODE_FAILED:')) {
					return {isError: true, content: [{type: 'text', text: tt.placeNotFound(msg.slice('GEOCODE_FAILED:'.length))}]};
				}
				return {isError: true, content: [{type: 'text', text: tt.journeyFailed(msg)}]};
			}
		},
	);
};

const registerJourneyTools = (server) => {
	planJourney(server);
};

export {registerJourneyTools};
