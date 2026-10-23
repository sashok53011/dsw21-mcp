// Location tools: current_location, nearby_stops.

import {z} from 'zod';
import {bilingual, t, resolveLanguage} from '../i18n.js';
import {currentLocation, LOCATE_PAGE_PATH} from '../location.js';
import {loadIndex} from '../gtfs/index.js';
import {nearestStops} from '../nearby.js';

const languageField = z.enum(['en', 'de'])
	.optional()
	.describe(bilingual('Output language for status words.', 'Ausgabesprache für Statuswörter.'));

const currentLocationTool = (server) => {
	server.tool(
		'current_location',
		bilingual(
			'LAST-RESORT location of the user (server-side). Use this ONLY if the MCP client has no location tool of its own. If the client can read GPS itself (e.g. zerotap’s location tool), call THAT instead and pass the resulting coordinates to plan_journey/nearby_stops as from / latitude+longitude — never ask the user where they are. Server-side sources: precise GPS from the /locate page (open it once on the phone — coordinates stay on this server) or LOCATION_LAT/LOCATION_LON env vars; no IP geolocation. If nothing is known, tell the user to open the /locate page — do not guess.',
			'LETZTE-INSTANZ-Standort des Nutzers (serverseitig). NUR nutzen, wenn der MCP-Client kein eigenes Standort-Tool hat. Wenn der Client selbst GPS lesen kann (z. B. das Standort-Tool von zerotap), DIESSES aufrufen und die Koordinaten an plan_journey/nearby_stops als from bzw. latitude+longitude übergeben — den Nutzer niemals nach dem Standort fragen. Serverseitige Quellen: präzises GPS von der /locate-Seite (einmal am Handy öffnen — Koordinaten bleiben auf diesem Server) oder LOCATION_LAT/LOCATION_LON; keine IP-Geolokalisierung. Ist nichts bekannt, dem Nutzer sagen, die /locate-Seite zu öffnen — nicht raten.',
		),
		{
			language: languageField,
		},
		async ({language}) => {
			const lang = resolveLanguage(language);
			const tt = t(lang);
			try {
				const loc = await currentLocation();
				if (!loc) {
					return {
						content: [{
							type: 'text',
							text: JSON.stringify({
								location: null,
								note: tt.locationUnknown,
								howTo: {
									gps: `POST /locate or open <this-server>${LOCATE_PAGE_PATH} in a phone browser`,
									env: 'set LOCATION_LAT and LOCATION_LON on the server',
								},
							}, null, 1),
						}],
					};
				}
				const out = {
					latitude: loc.lat,
					longitude: loc.lon,
					source: loc.source,
					accuracyMeters: loc.accuracy ?? null,
					ageMinutes: loc.ageMinutes ?? null,
				};
				// GPS older than 6 h is probably stale — tell the model so it can
				// mention a refresh instead of routing from an outdated position.
				if (loc.source === 'gps' && loc.ageMinutes !== null && loc.ageMinutes > 360) {
					out.stale = true;
					out.note = tt.locationStale(loc.ageMinutes);
				}
				return {content: [{type: 'text', text: JSON.stringify(out, null, 1)}]};
			} catch (err) {
				return {
					isError: true,
					content: [{type: 'text', text: localize(err, lang)}],
				};
			}
		},
	);
};

const nearbyStopsTool = (server) => {
	server.tool(
		'nearby_stops',
		bilingual(
			'Stops/stations near a point, sorted by distance, deduplicated per station. ORIGIN PRIORITY: if the MCP client has its own location tool (e.g. zerotap’s location tool), call it FIRST and pass the coordinates as latitude/longitude here — do not ask the user where they are. If latitude/longitude are omitted, the server-side current_location is used as a fallback (needs the /locate page). Use the returned stopId with dsw21_delays / gtfs_rt_delays.',
			'Haltestellen/Stationen nahe einem Punkt, nach Entfernung sortiert, pro Station dedupliziert. START-PRIORITÄT: wenn der MCP-Client ein eigenes Standort-Tool hat (z. B. das Standort-Tool von zerotap), dies ZUERST aufrufen und die Koordinaten als latitude/longitude hier übergeben — den Nutzer nicht nach dem Standort fragen. Werden latitude/longitude weggelassen, dient der serverseitige current_location als Fallback (braucht die /locate-Seite). Die zurückgegebene stopId mit dsw21_delays / gtfs_rt_delays verwenden.',
		),
		{
			latitude: z.number().min(-90).max(90).optional()
				.describe(bilingual('Latitude; omit to use the current location.', 'Breitengrad; weglassen, um die aktuelle Position zu nutzen.')),
			longitude: z.number().min(-180).max(180).optional()
				.describe(bilingual('Longitude; omit to use the current location.', 'Längengrad; weglassen, um die aktuelle Position zu nutzen.')),
			radius: z.number().int().min(50).max(5000).optional()
				.describe(bilingual('Search radius in meters (default 800, max 5000).', 'Suchradius in Metern (Standard 800, max 5000).')),
			limit: z.number().int().min(1).max(20).optional()
				.describe(bilingual('Max. number of results (default 8).', 'Maximale Anzahl Ergebnisse (Standard 8).')),
			language: languageField,
		},
		async ({latitude, longitude, radius, limit, language}) => {
			const lang = resolveLanguage(language);
			const tt = t(lang);
			try {
				let lat = latitude;
				let lon = longitude;
				let source = 'argument';
				if (lat === undefined || lon === undefined) {
					const loc = await currentLocation();
					if (!loc) {
						return {
							isError: true,
							content: [{type: 'text', text: tt.locationUnknown}],
						};
					}
					lat = loc.lat;
					lon = loc.lon;
					source = loc.source;
				}
				// Index build/download may take a while on first use — surface a
				// clear message instead of a tool timeout.
				let index;
				try {
					index = await loadIndex();
				} catch (err) {
					return {
						isError: true,
						content: [{type: 'text', text: t(lang).gtfsIndexFailed(err.message)}],
					};
				}
				const stops = nearestStops(index.stops, lat, lon, {
					radius: radius || 800,
					limit: limit || 8,
				});
				return {
					content: [{
						type: 'text',
						text: JSON.stringify({
							around: {latitude: lat, longitude: lon, source},
							radiusMeters: radius || 800,
							count: stops.length,
							stops,
						}, null, 1),
					}],
				};
			} catch (err) {
				return {
					isError: true,
					content: [{type: 'text', text: localize(err, lang)}],
				};
			}
		},
	);
};

// Localized error passthrough (errors from index/location are already text).
const localize = (err, lang) => {
	const msg = err?.message || String(err);
	if (/LOCATION/i.test(msg)) return t(lang).locationUnknown;
	return msg;
};

const registerLocationTools = (server) => {
	currentLocationTool(server);
	nearbyStopsTool(server);
};

export {registerLocationTools};
