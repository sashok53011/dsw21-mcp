// GTFS-RT delay tools for local transit (e.g. DSW21 in Dortmund / VRR).
//
// These read the free gtfs.de realtime stream (TripUpdates + ServiceAlerts) and
// join it with a static-GTFS index to resolve numeric stop/trip ids to names
// and lines.

import {z} from 'zod';
import {bilingual, t, resolveLanguage} from '../i18n.js';
import {loadIndex, DEFAULT_ZIP_URL} from '../gtfs/index.js';
import {queryDelays, queryAlerts, DEFAULT_FEED_URL} from '../gtfs/feed.js';
import {berlinIso} from '../time.js';

const languageField = z.enum(['en', 'de'])
	.optional()
	.describe(bilingual('Output language for status words.', 'Ausgabesprache für Statuswörter.'));

// Resolve a stop by name against the static index (numeric id passthrough).
// A station is modelled as a parent stop plus per-platform child stops, and the
// realtime feed references the platform ids — so resolve to the whole id set:
// the parent (if any), all its children, and any same-named stop.
const resolveGtfsStop = (index, query) => {
	const q = String(query).trim();
	if (!q) return null;
	if (/^\d+$/.test(q)) {
		const s = index.stops.get(q);
		// Numeric id: if it is a parent, expand to its platform children too.
		const ids = new Set([q]);
		for (const child of (index.childIds.get(q) || [])) ids.add(child);
		return {stopIds: ids, primaryId: q, name: s ? s.name : q};
	}
	const lower = q.toLowerCase();
	const pick = (key) => {
		const list = index.idsByName.get(key);
		if (!list || !list.length) return null;
		const ids = new Set(list);
		for (const id of list) {
			for (const child of (index.childIds.get(id) || [])) ids.add(child);
		}
		const name = index.stops.get(list[0])?.name || q;
		return {stopIds: ids, primaryId: list[0], name};
	};
	// Prefer an exact name match, then a substring match.
	const exact = pick(lower);
	if (exact) return exact;
	for (const [key] of index.idsByName) {
		if (key.includes(lower)) {
			const r = pick(key);
			if (r) return r;
		}
	}
	return null;
};

const formatRecord = (rec, tt) => {
	// epoch (seconds) -> ISO 8601 with explicit Europe/Berlin offset.
	const iso = (epoch) => epoch ? berlinIso(epoch * 1000) : null;
	return {
		stopId: rec.stopId,
		stopName: null, // filled by caller when known
		tripId: rec.tripId,
		line: rec.line,
		headsign: rec.headsign,
		scheduled: iso(rec.scheduledEpoch),
		expected: iso(rec.expectedEpoch),
		delayMin: rec.delayMin,
		status: rec.cancelled ? tt.cancelled : (rec.delayMin > 0 ? tt.delayed : (rec.noData ? tt.unknown : tt.onTime)),
		cancelled: rec.cancelled || undefined,
		noData: rec.noData || undefined,
	};
};

const gtfsDelays = (server) => {
	server.tool(
		'gtfs_rt_delays',
		bilingual(
			'Realtime delays/cancellations for local transit (trams, buses, S-/U-Bahn, regional) from the free GTFS-RT stream (realtime.gtfs.de). Unlike the DB tools, this covers non-DB operators such as DSW21 in Dortmund (VRR). Query by a stop name (resolved via static GTFS) or a numeric stop id. Requires a one-time static-GTFS index build (~18 MB, cached).',
			'Echtzeit-Verspätungen/Ausfälle für den Nahverkehr (Straßenbahn, Bus, S-/U-Bahn, Regional) aus dem kostenlosen GTFS-RT-Stream (realtime.gtfs.de). Anders als die DB-Tools deckt das auch Nicht-DB-Betreuer wie DSW21 in Dortmund (VRR) ab. Abfrage per Haltestellenname (via statischem GTFS aufgelöst) oder numerischer stop-id. Erfordert einmaligen Aufbau des statischen GTFS-Index (~18 MB, gecacht).',
		),
		{
			stop: z.string().min(1).describe(bilingual('Stop name (e.g. "Dortmund Hbf") or numeric stop id.', 'Haltestellenname (z. B. "Dortmund Hbf") oder numerische stop-id.')),
			minutes: z.number().int().min(5).max(180).optional().describe(bilingual('Time window in minutes from now (default 60).', 'Zeitfenster in Minuten ab jetzt (Standard 60).')),
			minDelay: z.number().int().min(0).max(60).optional().describe(bilingual('Only show entries with at least this delay in minutes (0 = show everything, default 1).', 'Nur Einträge mit mind. dieser Verspätung in Minuten anzeigen (0 = alles, Standard 1).')),
			limit: z.number().int().min(1).max(200).optional().describe(bilingual('Max. number of results (default 50).', 'Maximale Anzahl Ergebnisse (Standard 50).')),
			language: languageField,
		},
		async ({stop, minutes, minDelay, limit, language}) => {
			const lang = resolveLanguage(language);
			const tt = t(lang);
			try {
				const index = await loadIndex({});
				const resolved = resolveGtfsStop(index, stop);
				if (!resolved) {
					return {isError: true, content: [{type: 'text', text: tt.gtfsStopNotFound(stop)}]};
				}
				const res = await queryDelays({
					feedUrl: process.env.GTFS_RT_FEED_URL || DEFAULT_FEED_URL,
					index,
					stopIds: resolved.stopIds,
					windowMinutes: minutes || 60,
					minDelayMinutes: (minDelay === undefined ? 1 : minDelay),
				});
				let records = res.records
					.map(r => formatRecord(r, tt))
					.sort((a, b) => (a.scheduled || '').localeCompare(b.scheduled || ''))
					.slice(0, limit || 50);
				for (const r of records) r.stopName = resolved.name;
				if (!records.length) {
					return {content: [{type: 'text', text: JSON.stringify({stop: resolved.name, stopId: resolved.primaryId, count: 0, note: tt.gtfsNoDelays}, null, 1)}]};
				}
				return {
					content: [{
						type: 'text',
						text: JSON.stringify({
							source: 'GTFS-RT (realtime.gtfs.de)',
							feedTimestamp: res.feedTimestamp ? berlinIso(res.feedTimestamp * 1000) : null,
							stop: resolved.name,
							stopId: resolved.primaryId,
							stopIdCount: resolved.stopIds.size,
							count: records.length,
							delayedCount: records.filter(r => r.delayMin > 0).length,
							cancelledCount: records.filter(r => r.cancelled).length,
							departures: records,
						}, null, 1),
					}],
				};
			} catch (err) {
				const msg = err && err.message ? err.message : String(err);
				const text = /index|ENOENT|agency|zip/i.test(msg) ? tt.gtfsIndexFailed(msg) : tt.gtfsFeedUnavailable(msg);
				return {isError: true, content: [{type: 'text', text}]};
			}
		},
	);
};

const dsw21Delays = (server) => {
	server.tool(
		'dsw21_delays',
		bilingual(
			'Realtime delays for DSW21 (Dortmunder Stadtwerke) trams/buses in Dortmund, via the free GTFS-RT stream. Convenience wrapper around gtfs_rt_delays with a Dortmund stop.',
			'Echtzeit-Verspätungen für DSW21-Straßenbahnen/Busses in Dortmund aus dem kostenlosen GTFS-RT-Stream. Komfort-Wrapper um gtfs_rt_delays mit Dortmunder Haltestelle.',
		),
		{
			stop: z.string().min(1).optional().describe(bilingual('Dortmund stop name or numeric id (default "Dortmund Hbf").', 'Dortmunder Haltestellenname oder -id (Standard "Dortmund Hbf").')),
			minutes: z.number().int().min(5).max(180).optional().describe(bilingual('Time window in minutes from now (default 60).', 'Zeitfenster in Minuten ab jetzt (Standard 60).')),
			language: languageField,
		},
		async ({stop, minutes, language}) => {
			// Reuse gtfs_rt_delays' handler logic via the same underlying calls.
			const lang = resolveLanguage(language);
			const tt = t(lang);
			try {
				const index = await loadIndex({});
				const resolved = resolveGtfsStop(index, stop || 'Dortmund Hbf');
				if (!resolved) {
					return {isError: true, content: [{type: 'text', text: tt.gtfsStopNotFound(stop || 'Dortmund Hbf')}]};
				}
				const res = await queryDelays({
					feedUrl: process.env.GTFS_RT_FEED_URL || DEFAULT_FEED_URL,
					index,
					stopIds: resolved.stopIds,
					windowMinutes: minutes || 60,
					minDelayMinutes: 1,
				});
				const records = res.records
					.map(r => formatRecord(r, tt))
					.sort((a, b) => (a.scheduled || '').localeCompare(b.scheduled || ''))
					.slice(0, 60);
				for (const r of records) r.stopName = resolved.name;
				return {
					content: [{
						type: 'text',
						text: JSON.stringify({
							source: 'GTFS-RT (realtime.gtfs.de)',
							operator: 'DSW21 (Dortmunder Stadtwerke)',
							stop: resolved.name,
							stopId: resolved.primaryId,
							stopIdCount: resolved.stopIds.size,
							count: records.length,
							departures: records,
						}, null, 1),
					}],
				};
			} catch (err) {
				const msg = err && err.message ? err.message : String(err);
				const text = /index|ENOENT|agency|zip/i.test(msg) ? tt.gtfsIndexFailed(msg) : tt.gtfsFeedUnavailable(msg);
				return {isError: true, content: [{type: 'text', text}]};
			}
		},
	);
};

// Service alerts affecting the indexed agency's trips. The free feed's alerts
// mostly reference trips (not stops), so we filter by DSW21 trip ids and drop
// the pure attribution notices ("Echtzeitdaten aufbereitet von …").
const gtfsAlerts = (server) => {
	server.tool(
		'gtfs_rt_alerts',
		bilingual(
			'Service alerts / disruptions from the GTFS-RT stream (realtime.gtfs.de), filtered to the indexed agency (DSW21). Each alert has a cause, effect and a human-readable text.',
			'Service-Meldungen/Störungen aus dem GTFS-RT-Stream (realtime.gtfs.de), gefiltert auf die indexierte Konzern (DSW21). Jede Meldung hat Ursache, Wirkung und einen Klartext.',
		),
		{
			limit: z.number().int().min(1).max(100).optional().describe(bilingual('Max. number of alerts (default 30).', 'Maximale Anzahl Meldungen (Standard 30).')),
			language: languageField,
		},
		async ({limit, language}) => {
			const lang = resolveLanguage(language);
			try {
				const index = await loadIndex({});
				// Restrict to DSW21 trips.
				const dswTripIds = [...index.trips.keys()];
				const all = await queryAlerts({
					feedUrl: process.env.GTFS_RT_FEED_URL || DEFAULT_FEED_URL,
					index,
					tripIds: dswTripIds,
					limit: 500,
				});
				// Drop attribution-only notices (no header, generic description).
				const noise = /echtzeitdaten aufbereitet|bereitgestellt von/i;
				const alerts = all
					.filter(a => !(a.header === null && a.description && noise.test(a.description)))
					.slice(0, limit || 30);
				return {
					content: [{
						type: 'text',
						text: JSON.stringify({
							source: 'GTFS-RT (realtime.gtfs.de)',
							operator: 'DSW21 (Dortmunder Stadtwerke)',
							count: alerts.length,
							alerts: alerts.map(a => ({
								cause: a.cause,
								effect: a.effect,
								header: a.header,
								description: a.description,
								informedTrips: a.informedTrips,
								informedStops: a.informedStops,
							})),
						}, null, 1),
					}],
				};
			} catch (err) {
				const msg = err && err.message ? err.message : String(err);
				const text = /index|ENOENT|agency|zip/i.test(msg) ? t(lang).gtfsIndexFailed(msg) : t(lang).gtfsFeedUnavailable(msg);
				return {isError: true, content: [{type: 'text', text}]};
			}
		},
	);
};

const registerGtfsRtTools = (server) => {
	gtfsDelays(server);
	dsw21Delays(server);
	gtfsAlerts(server);
};

export {
	registerGtfsRtTools,
	resolveGtfsStop,
	DEFAULT_ZIP_URL,
	queryAlerts,
};
