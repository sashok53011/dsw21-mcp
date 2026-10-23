// Journey & timetable tools via the Transitous MOTIS API (free, no key).
// Docs: https://transitous.org/api/ — please don't flood it; responses are
// cached (itineraries 10 min, geocoding 6 h, realtime boards 30 s).
//
// Endpoints: routing/timetables use MOTIS v6 (v1-v2 have an off-by-one in
// maxTransfers: maxTransfers=0 returned only non-transit connections);
// geocoding is v1-only.

import {z} from 'zod';
import {bilingual, t, resolveLanguage} from '../i18n.js';
import {currentLocation} from '../location.js';
import {berlinIso} from '../time.js';
import {TtlCache} from '../cache.js';

const MOTIS_API = process.env.TRANSITOUS_URL || 'https://api.transitous.org/api';

// Transitous rejects generic/absent User-Agents (403, usage policy) — every
// request must identify the client.
const userAgent = process.env.DB_USER_AGENT
	|| 'dsw21-mcp/0.5.0 (+https://github.com/sashok53011/dsw21-mcp)';

const cache = new TtlCache();
const GEOCODE_TTL_MS = 6 * 60 * 60 * 1000;
const PLAN_TTL_MS = 10 * 60 * 1000;
const REALTIME_TTL_MS = 30 * 1000;

const motisGet = async (path, params) => {
	const url = new URL(MOTIS_API + path);
	for (const [k, v] of Object.entries(params)) {
		if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
	}
	const res = await fetch(url, {
		signal: AbortSignal.timeout(45_000),
		headers: {'user-agent': userAgent},
	});
	if (!res.ok) {
		const body = await res.text().catch(() => '');
		const err = new Error(`MOTIS ${path} HTTP ${res.status} ${body.slice(0, 200)}`);
		err.statusCode = res.status;
		throw err;
	}
	return res.json();
};

// "lat,lon" passthrough, anything else goes through the geocoder.
// Returns {lat, lon, name, stopId?} — stopId when the geocoder resolved a
// transit stop (MOTIS timetable endpoints accept it directly).
const resolvePlace = async (query, lang) => {
	const coordMatch = String(query).trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
	if (coordMatch) {
		return {lat: parseFloat(coordMatch[1]), lon: parseFloat(coordMatch[2]), name: String(query).trim()};
	}
	const key = 'geocode:' + lang + ':' + query;
	const data = await cache.wrap(key, GEOCODE_TTL_MS, () => motisGet('/v1/geocode', {text: query, language: lang}));
	// Prefer a transit stop over addresses/POIs when several match.
	const hit = (data || []).find(r => r.type === 'STOP' && typeof r.lat === 'number')
		|| (data || []).find(r => typeof r.lat === 'number' && typeof r.lon === 'number');
	if (!hit) {
		const err = new Error('GEOCODE_FAILED:' + query);
		err.statusCode = 404;
		throw err;
	}
	const out = {lat: hit.lat, lon: hit.lon, name: hit.name || query};
	if (hit.type === 'STOP' && hit.id) out.stopId = hit.id;
	return out;
};

// Output timestamps: ISO 8601 with explicit Europe/Berlin offset (LLM clients
// misread trailing "Z" as local time). Note: params.time below stays UTC — that
// is an API *input* for MOTIS, not user-facing output.
const iso = (s) => berlinIso(s);
const delayMin = (actual, scheduled) => {
	if (!actual || !scheduled) return null;
	return Math.round((new Date(actual) - new Date(scheduled)) / 60000);
};
const statusOf = (cancelled, delay, tt) =>
	cancelled ? tt.cancelled : ((delay || 0) > 0 ? tt.delayed : tt.onTime);

// A MOTIS "Place" for a stop event: times + track live here.
const compactStopEvent = (place, tt, {withStatus = true} = {}) => {
	const arrDelay = delayMin(place.arrival, place.scheduledArrival);
	const depDelay = delayMin(place.departure, place.scheduledDeparture);
	const out = {
		name: place.name || null,
		stopId: place.stopId || null,
		arrival: iso(place.arrival),
		scheduledArrival: iso(place.scheduledArrival),
		arrivalDelayMin: arrDelay,
		departure: iso(place.departure),
		scheduledDeparture: iso(place.scheduledDeparture),
		departureDelayMin: depDelay,
		track: place.track || null,
		scheduledTrack: place.scheduledTrack || null,
	};
	if (withStatus) out.status = statusOf(place.cancelled, arrDelay ?? depDelay, tt);
	if (place.cancelled) out.cancelled = true;
	return out;
};

// A plan/trip leg (WALK or transit).
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
		line: leg.routeShortName || leg.displayName || leg.routeLongName || null,
		headsign: leg.headsign || null,
		tripId: leg.tripId || null,
		scheduledDepart: iso(leg.scheduledStartTime),
		scheduledArrive: iso(leg.scheduledEndTime),
		delayMin: d,
		status: statusOf(leg.cancelled, d, tt),
		track: leg.from?.track || null,
		scheduledTrack: leg.from?.scheduledTrack || null,
		cancelled: leg.cancelled || undefined,
	};
};

const MODES_FIELD = z.array(z.string().min(1).max(20)).optional()
	.describe(bilingual(
		'Filter by transport modes, e.g. ["TRAM","SUBWAY","BUS","SUBURBAN","REGIONAL_RAIL","HIGH_SPEED_RAIL"].',
		'Filter nach Verkehrsmitteln, z. B. ["TRAM","SUBWAY","BUS","SUBURBAN","REGIONAL_RAIL","HIGH_SPEED_RAIL"].',
	));

const planJourney = (server) => {
	server.tool(
		'plan_journey',
		bilingual(
			'Plan a public-transport journey (Transitous/Germany-wide coverage) with realtime updates. ORIGIN PRIORITY: if the MCP client has its own location tool (e.g. zerotap’s location/coordinates tool), call it FIRST and pass those coordinates here as from="lat,lon" — that is the most reliable origin. Do not ask the user where they are, and do not use current_location when a client location tool exists. Destination: place name or "lat,lon". Use arriveBy=true with "time" to plan backwards ("I must arrive by 17:00"). Returns itineraries with legs, transfers, delays and platforms.',
			'Öffentliche Verbindung planen (Transitous, deutschlandweite Abdeckung) mit Echtzeit-Updates. START-PRIORITÄT: wenn der MCP-Client ein eigenes Standort-Tool hat (z. B. das Standort-/Koordinaten-Tool von zerotap), dies ZUERST aufrufen und die Koordinaten hier als from="lat,lon" übergeben — das ist die zuverlässigste Quelle. Den Nutzer nicht nach dem Standort fragen und current_location nicht nutzen, wenn ein Client-Standort-Tool existiert. Ziel: Ortsname oder "lat,lon". Mit arriveBy=true und "time" rückwärts planen ("Ich muss um 17:00 ankommen"). Gibt Itineraries mit Abschnitten, Umstiegen, Verspätungen und Gleisen zurück.',
		),
		{
			to: z.string().min(1).describe(bilingual('Destination: place name (e.g. "Köln Hbf") or "lat,lon".', 'Ziel: Ortsname (z. B. "Köln Hbf") oder "lat,lon".')),
			from: z.string().min(1).optional().describe(bilingual('Origin: place name or "lat,lon". Omit to use the current location.', 'Start: Ortsname oder "lat,lon". Weglassen, um die aktuelle Position zu nutzen.')),
			time: z.string().optional().describe(bilingual('ISO 8601 time. Departure time, or arrival time when arriveBy=true (default: now).', 'ISO-8601-Zeit. Abfahrtszeit, oder Ankunftszeit bei arriveBy=true (Standard: jetzt).')),
			arriveBy: z.boolean().optional().describe(bilingual('Interpret "time" as arrival time (plan backwards).', '"time" als Ankunftszeit interpretieren (rückwärts planen).')),
			maxTransfers: z.number().int().min(0).max(10).optional().describe(bilingual('Maximum number of transfers (0 = direct connections only).', 'Maximale Anzahl Umstiege (0 = nur direkte Verbindungen).')),
			modes: MODES_FIELD,
			results: z.number().int().min(1).max(5).optional().describe(bilingual('Number of itineraries to return (default 3).', 'Anzahl der Itineraries (Standard 3).')),
			language: z.enum(['en', 'de']).optional().describe(bilingual('Output language for status words.', 'Ausgabesprache für Statuswörter.')),
		},
		async ({to, from, time, arriveBy, maxTransfers, modes, results, language}) => {
			const lang = resolveLanguage(language);
			const tt = t(lang);
			try {
				// Origin: explicit or the user's current location.
				let fromPlace;
				if (from) {
					fromPlace = await resolvePlace(from, lang);
				} else {
					const use = await currentLocation().catch(() => null);
					if (!use) {
						return {
							isError: true,
							content: [{type: 'text', text: tt.locationUnknownForJourney}],
						};
					}
					fromPlace = {lat: use.lat, lon: use.lon, name: 'current location'};
				}
				const toPlace = await resolvePlace(to, lang);

				const params = {
					fromPlace: `${fromPlace.lat},${fromPlace.lon}`,
					toPlace: `${toPlace.lat},${toPlace.lon}`,
					numItineraries: results || 3,
					language: lang,
				};
				if (time) {
					const d = new Date(time);
					if (Number.isNaN(d.getTime())) {
						return {isError: true, content: [{type: 'text', text: tt.invalidDeparture(time)}]};
					}
					params.time = d.toISOString();
					params.arriveBy = Boolean(arriveBy);
				}
				if (maxTransfers !== undefined) params.maxTransfers = maxTransfers;
				if (modes && modes.length) params.transitModes = modes.join(',');

				const key = 'plan:' + JSON.stringify(params);
				const data = await cache.wrap(key, PLAN_TTL_MS, () => motisGet('/v6/plan', params));

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

// One vehicle along its route: per-stop realtime vs schedule (Germany-wide).
const tripStatus = (server) => {
	server.tool(
		'trip_status',
		bilingual(
			'Get one vehicle (train/bus/tram) along its whole route with realtime data: every stop with planned vs. expected arrival/departure, delay in minutes, platform changes and cancellations. Get the tripId from plan_journey legs or stop_departures. Works anywhere in Germany.',
			'Ein Fahrzeug (Zug/Bus/Straßenbahn) auf der gesamten Strecke mit Echtzeitdaten: jede Haltestelle mit Soll-/Ist-Ankunft/-Abfahrt, Verspätung in Minuten, Gleisänderungen und Ausfällen. Die tripId aus plan_journey-Abschnitten oder stop_departures holen. Funktioniert deutschlandweit.',
		),
		{
			tripId: z.string().min(1).describe(bilingual('Trip ID (from a plan_journey leg or a stop_departures entry).', 'Trip-ID (aus einem plan_journey-Abschnitt oder einem stop_departures-Eintrag).')),
			language: z.enum(['en', 'de']).optional().describe(bilingual('Output language for status words.', 'Ausgabesprache für Statuswörter.')),
		},
		async ({tripId, language}) => {
			const lang = resolveLanguage(language);
			const tt = t(lang);
			try {
				const key = 'trip:' + tripId;
				const itinerary = await cache.wrap(key, REALTIME_TTL_MS, () =>
					motisGet('/v6/trip', {tripId, language: lang, detailedLegs: false}));

				// A trip is returned as an itinerary; with interlined (stay-seated)
				// services it may have several transit legs — concatenate their stops.
				const transitLegs = (itinerary.legs || []).filter(l => l.mode !== 'WALK');
				if (!transitLegs.length) {
					return {isError: true, content: [{type: 'text', text: tt.tripNotFound(tripId)}]};
				}
				const first = transitLegs[0];
				const stops = transitLegs.flatMap(l => l.intermediateStops || [])
					.map(s => compactStopEvent(s, tt));
				const delayedStops = stops.filter(s =>
					(s.arrivalDelayMin || 0) > 0 || (s.departureDelayMin || 0) > 0).length;
				const d = delayMin(first.startTime, first.scheduledStartTime);

				return {
					content: [{
						type: 'text',
						text: JSON.stringify({
							source: 'Transitous (MOTIS)',
							tripId,
							line: first.routeShortName || first.displayName || first.routeLongName || null,
							mode: first.mode,
							headsign: first.headsign || null,
							from: first.from?.name || null,
							to: first.to?.name || null,
							depart: iso(first.startTime),
							scheduledDepart: iso(first.scheduledStartTime),
							arrive: iso(first.endTime),
							scheduledArrive: iso(first.scheduledEndTime),
							delayMin: d,
							status: statusOf(first.cancelled, d, tt),
							cancelled: first.cancelled || undefined,
							stops: stops.length,
							delayedStops,
							stopovers: stops,
						}, null, 1),
					}],
				};
			} catch (err) {
				const msg = err?.message || String(err);
				if (err?.statusCode === 404) {
					return {isError: true, content: [{type: 'text', text: tt.tripNotFound(tripId)}]};
				}
				return {isError: true, content: [{type: 'text', text: tt.journeyFailed(msg)}]};
			}
		},
	);
};

// Departures board for any stop in Germany (Transitous realtime), complementing
// the GTFS-RT feed tools that only cover the gtfs.de region.
const stopDepartures = (server) => {
	server.tool(
		'stop_departures',
		bilingual(
			'Next departures at any stop in Germany with realtime updates (Transitous/MOTIS). The stop may be a place name (geocoded) or a MOTIS stop id. Complements dsw21_delays/gtfs_rt_delays, which only cover the gtfs.de feed region.',
			'Nächste Abfahrten an jeder Haltestelle in Deutschland mit Echtzeit-Updates (Transitous/MOTIS). Die Haltestelle kann ein Ortsname (geokodiert) oder eine MOTIS-Stop-ID sein. Ergänzt dsw21_delays/gtfs_rt_delays, die nur den gtfs.de-Feed-Bereich abdecken.',
		),
		{
			stop: z.string().min(1).describe(bilingual('Stop name (e.g. "Frankfurt Hbf") or MOTIS stop id.', 'Haltestellenname (z. B. "Frankfurt Hbf") oder MOTIS-Stop-ID.')),
			minutes: z.number().int().min(5).max(240).optional().describe(bilingual('Time window in minutes from now (default 60).', 'Zeitfenster in Minuten ab jetzt (Standard 60).')),
			limit: z.number().int().min(1).max(50).optional().describe(bilingual('Minimum number of departures to return (default 20).', 'Mindestanzahl zurückgegebener Abfahrten (Standard 20).')),
			modes: MODES_FIELD,
			language: z.enum(['en', 'de']).optional().describe(bilingual('Output language for status words.', 'Ausgabesprache für Statuswörter.')),
		},
		async ({stop, minutes, limit, modes, language}) => {
			const lang = resolveLanguage(language);
			const tt = t(lang);
			try {
				const place = await resolvePlace(stop, lang);
				// MOTIS stoptimes accepts a stopId directly; with bare coordinates
				// it needs center + radius instead.
				const params = {
					stopId: place.stopId,
					center: place.stopId ? undefined : `${place.lat},${place.lon}`,
					radius: place.stopId ? undefined : 500,
					n: limit || 20,
					window: (minutes || 60) * 60,
					language: lang,
				};
				const key = 'stoptimes:' + JSON.stringify(params);
				const data = await cache.wrap(key, REALTIME_TTL_MS, () => motisGet('/v6/stoptimes', params));

				const departures = (data.stopTimes || []).map(st => {
					const p = st.place || {};
					const d = delayMin(p.departure, p.scheduledDeparture);
					return {
						line: st.routeShortName || st.displayName || st.routeLongName || null,
						mode: st.mode,
						headsign: st.headsign || null,
						tripId: st.tripId || null,
						destination: st.tripTo?.name || null,
						depart: iso(p.departure),
						scheduledDepart: iso(p.scheduledDeparture),
						delayMin: d,
						status: statusOf(st.cancelled || st.tripCancelled, d, tt),
						track: p.track || null,
						scheduledTrack: p.scheduledTrack || null,
						cancelled: st.cancelled || st.tripCancelled || undefined,
					};
				});
				if (!departures.length) {
					return {
						content: [{type: 'text', text: JSON.stringify({stop: data.place?.name || stop, count: 0, note: tt.stopTimesNone}, null, 1)}],
					};
				}
				return {
					content: [{
						type: 'text',
						text: JSON.stringify({
							source: 'Transitous (MOTIS)',
							stop: data.place?.name || stop,
							stopId: data.place?.stopId || null,
							count: departures.length,
							departures,
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
	tripStatus(server);
	stopDepartures(server);
};

export {registerJourneyTools};
