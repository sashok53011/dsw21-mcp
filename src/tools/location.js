// Location tools: current_location, nearby_stops.

import {z} from 'zod';
import {bilingual, t, resolveLanguage} from '../i18n.js';
import {currentLocation, LOCATE_PAGE_PATH} from '../location.js';
import {loadIndex} from '../gtfs/index.js';
import {nearestStops} from '../nearby.js';

const languageField = z.enum(['en', 'de'])
	.optional()
	.describe(bilingual('Output language for status words.', 'Ausgabesprache für Statuswörter.'));

// The HTTP layer stores the real client IP (Cf-Connecting-Ip) here on every
// /mcp request so the IP-geolocation fallback can see it; stdio leaves it null.
let activeClientIp = null;
const setClientIp = (ip) => {
	activeClientIp = ip || null;
};
const getClientIp = () => activeClientIp;

const currentLocationTool = (server) => {
	server.tool(
		'current_location',
		bilingual(
			'Where the user currently is. Sources in order of preference: GPS shared via the /locate page (open it once on the phone — coordinates stay on this server), then LOCATION_LAT/LOCATION_LON env vars, then IP geolocation (city-level accuracy). Use this instead of asking the user where they are.',
			'Wo sich der Nutzer gerade befindet. Quellen in Präferenzreihenfolge: GPS über die /locate-Seite (einmal im Handy öffnen — Koordinaten bleiben auf diesem Server), dann LOCATION_LAT/LOCATION_LON (Env-Variablen), dann IP-Geolokalisierung (Genauigkeit auf StadtEbene). Dies verwenden, statt den Nutzer nach dem Standort zu fragen.',
		),
		{
			language: languageField,
		},
		async ({language}) => {
			const lang = resolveLanguage(language);
			const tt = t(lang);
			try {
				const loc = await currentLocation(activeClientIp);
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
				if (loc.city) out.city = loc.city;
				if (loc.country) out.country = loc.country;
				// GPS older than 6 h is probably stale — tell the model so it can
				// mention a refresh instead of routing from an outdated position.
				if (loc.source === 'gps' && loc.ageMinutes !== null && loc.ageMinutes > 360) {
					out.stale = true;
					out.note = tt.locationStale(loc.ageMinutes);
				} else if (loc.source === 'ip') {
					out.note = tt.locationIpAccuracy;
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
			'Stops/stations near a location (default: the current location from current_location), sorted by distance, deduplicated per station. Use the returned stopId with dsw21_delays / gtfs_rt_delays.',
			'Haltestellen/Stationen nahe einer Position (Standard: die aktuelle Position aus current_location), nach Entfernung sortiert, pro Station dedupliziert. Die zurückgegebene stopId mit dsw21_delays / gtfs_rt_delays verwenden.',
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
					const loc = await currentLocation(activeClientIp);
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

export {registerLocationTools, setClientIp, getClientIp};
