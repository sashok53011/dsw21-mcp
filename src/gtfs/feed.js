// GTFS-RT feed client: fetch + protobuf-decode the gtfs.de realtime stream,
// with a short TTL cache, and join it against the static-GTFS index.
//
// The free stream (https://realtime.gtfs.de/realtime-free.pb) carries
// TripUpdates + ServiceAlerts. Important quirks found in production:
//   * trip descriptors have NO route_id / agency_id — only tripId/startDate;
//   * stopId is numeric (matches static stops.txt stop_id);
//   * delays are per stopTimeUpdate as `delay` (seconds) + `time` (epoch).

import pkg from 'gtfs-realtime-bindings';
import {TtlCache} from '../cache.js';

const {transit_realtime} = pkg;

const DEFAULT_FEED_URL = 'https://realtime.gtfs.de/realtime-free.pb';
const DEFAULT_FEED_TTL_MS = 12 * 1000; // stream updates every 10s

const cache = new TtlCache();

const fetchFeed = async (url) => {
	const res = await fetch(url, {
		signal: AbortSignal.timeout(60_000),
		headers: {'user-agent': process.env.DB_USER_AGENT || 'dsw21-mcp-gtfs-rt (set DB_USER_AGENT)'},
	});
	if (!res.ok) throw new Error(`GTFS-RT feed HTTP ${res.status}`);
	const buf = Buffer.from(await res.arrayBuffer());
	return transit_realtime.FeedMessage.decode(buf);
};

// Cached decode. Returns the decoded FeedMessage.
const loadFeed = (url = DEFAULT_FEED_URL, ttlMs = DEFAULT_FEED_TTL_MS) => {
	return cache.wrap('feed:' + url, ttlMs, () => fetchFeed(url));
};

const SCH_REL = transit_realtime.TripDescriptor.ScheduleRelationship;
const STU_REL = transit_realtime.TripUpdate.StopTimeUpdate.ScheduleRelationship;

const ts = (e) => (e && Number(e.time)) || null;
const delaySec = (e) => (e && e.delay !== undefined && e.delay !== null) ? Number(e.delay) : null;

// Extract a compact delay record for one stopTimeUpdate.
const stuToRecord = (stu, trip, tripMeta) => {
	const cancelled = stu.scheduleRelationship === STU_REL.SKIPPED
		|| trip.scheduleRelationship === SCH_REL.CANCELED;
	const schedArr = ts(stu.arrival);
	const schedDep = ts(stu.departure);
	const arrDelay = delaySec(stu.arrival);
	const depDelay = delaySec(stu.departure);
	const delay = (arrDelay !== null) ? arrDelay : depDelay;
	return {
		stopId: stu.stopId || null,
		tripId: trip.tripId || null,
		line: tripMeta?.line || null,
		routeId: tripMeta?.routeId || null,
		headsign: tripMeta?.headsign || trip.headsign || null,
		scheduledEpoch: schedArr ?? schedDep,
		expectedEpoch: (schedArr ?? schedDep) !== null ? (schedArr ?? schedDep) + (delay || 0) : null,
		delayMin: delay !== null ? Math.round(delay / 60) : null,
		cancelled,
		noData: stu.scheduleRelationship === STU_REL.NO_DATA,
		stopSequence: stu.stopSequence ?? null,
	};
};

// Filter the feed down to one agency's trips (via static index) and, optionally,
// one stop. Returns {records, feedTimestamp, totalEntities}.
const queryDelays = async ({
	feedUrl = DEFAULT_FEED_URL,
	index,
	stopId = null,
	stopIds = null,
	windowMinutes = null,
	minDelayMinutes = 0,
	nowEpoch = Math.floor(Date.now() / 1000),
} = {}) => {
	const feed = await loadFeed(feedUrl);
	// A station is often modelled as a parent stop plus per-platform child
	// stops; the RT feed references the platform ids. Accept either one id or
	// a set of ids (parent + platforms).
	let stopSet = null;
	if (stopIds && stopIds.size !== undefined) {
		stopSet = stopIds;
	} else if (stopId !== null) {
		stopSet = new Set([String(stopId)]);
	}
	const tripIndex = index ? index.trips : null;
	const out = [];
	let considered = 0;

	for (const entity of feed.entity) {
		const tu = entity.tripUpdate;
		if (!tu || !tu.trip) continue;
		considered++;
		const tripId = tu.trip.tripId;
		// Agency filter: only trips known to belong to the target agency.
		const meta = tripIndex ? tripIndex.get(String(tripId)) : {};
		if (tripIndex && !meta) continue;

		for (const stu of (tu.stopTimeUpdate || [])) {
			if (stopSet && !stopSet.has(String(stu.stopId))) continue;
			const rec = stuToRecord(stu, tu.trip, meta);
			if (rec.scheduledEpoch !== null) {
				if (windowMinutes !== null) {
					const diff = rec.scheduledEpoch - nowEpoch;
					if (diff < -60 || diff > windowMinutes * 60) continue;
				}
			}
			if (minDelayMinutes > 0) {
				if (rec.delayMin === null || rec.delayMin < minDelayMinutes) continue;
			}
			// Keep only interesting rows: delayed, cancelled or (when no filter)
			// everything within the window.
			out.push(rec);
		}
	}

	return {
		feedTimestamp: feed.header && feed.header.timestamp ? Number(feed.header.timestamp) : null,
		totalEntities: considered,
		records: out,
	};
};

// ServiceAlerts relevant to given stop/trip ids (best-effort: the free feed's
// alerts mostly reference trips, with almost no stopIds).
const queryAlerts = async ({
	feedUrl = DEFAULT_FEED_URL,
	index = null,
	tripIds = [],
	stopIds = [],
	limit = 20,
} = {}) => {
	const feed = await loadFeed(feedUrl);
	const wantTrips = new Set(tripIds.map(String));
	const wantStops = new Set(stopIds.map(String));
	const out = [];
	for (const entity of feed.entity) {
		if (!entity.alert) continue;
		const informed = entity.alert.informedEntity || [];
		const matches = informed.some(ie => {
			if (ie.trip && ie.trip.tripId && wantTrips.has(String(ie.trip.tripId))) return true;
			if (ie.stopId && wantStops.has(String(ie.stopId))) return true;
			return false;
		});
		if (!matches && (wantTrips.size || wantStops.size)) continue;
		const tr = (f) => (f && f.translation && f.translation[0] && f.translation[0].text) || null;
		out.push({
			cause: entity.alert.cause ?? null,
			effect: entity.alert.effect ?? null,
			header: tr(entity.alert.headerText),
			description: tr(entity.alert.descriptionText),
			informedTrips: informed.filter(ie => ie.trip).length,
			informedStops: informed.filter(ie => ie.stopId).map(ie => String(ie.stopId)),
		});
		if (out.length >= limit) break;
	}
	return out;
};

export {
	DEFAULT_FEED_URL,
	DEFAULT_FEED_TTL_MS,
	loadFeed,
	queryDelays,
	queryAlerts,
};
