// Location tools: nearby_stops (coordinates come from the client, e.g. a
// phone's location tool — see plan_journey for the same convention).
//
// The server does NOT collect location itself: no /locate page, no stored GPS
// fix, no IP geolocation. The phone's agent is the only source of coordinates.

import {z} from 'zod';
import {bilingual, t, resolveLanguage} from '../i18n.js';
import {loadIndex} from '../gtfs/index.js';
import {nearestStops} from '../nearby.js';

const languageField = z.enum(['en', 'de'])
	.optional()
	.describe(bilingual('Output language for status words.', 'Ausgabesprache für Statuswörter.'));

const nearbyStopsTool = (server) => {
	server.tool(
		'nearby_stops',
		bilingual(
			'Stops/stations near a point, sorted by distance, deduplicated per station (platforms merged). Pass the latitude/longitude from the client\'s own location tool (e.g. a phone location tool) as arguments. Use the returned stopId with dsw21_delays / gtfs_rt_delays.',
			'Haltestellen/Stationen nahe einem Punkt, nach Entfernung sortiert, pro Station dedupliziert (Plattformen zusammengeführt). Breiten- und Längengrad aus dem eigenen Standort-Tool des Clients (z. B. Handy-Standort-Tool) als Argumente übergeben. Die zurückgegebene stopId mit dsw21_delays / gtfs_rt_delays verwenden.',
		),
		{
			latitude: z.number().min(-90).max(90)
				.describe(bilingual('Latitude in degrees (e.g. from your location tool).', 'Breitengrad in Grad (z. B. aus dem eigenen Standort-Tool).')),
			longitude: z.number().min(-180).max(180)
				.describe(bilingual('Longitude in degrees (e.g. from your location tool).', 'Längengrad in Grad (z. B. aus dem eigenen Standort-Tool).')),
			radius: z.number().int().min(50).max(5000).optional()
				.describe(bilingual('Search radius in meters (default 800, max 5000).', 'Suchradius in Metern (Standard 800, max 5000).')),
			limit: z.number().int().min(1).max(20).optional()
				.describe(bilingual('Max. number of results (default 8).', 'Maximale Anzahl Ergebnisse (Standard 8).')),
			language: languageField,
		},
		async ({latitude, longitude, radius, limit, language}) => {
			const lang = language || 'en';
			const tt = t(lang);
			try {
				let index;
				try {
					index = await loadIndex();
				} catch (err) {
					return {
						isError: true,
						content: [{type: 'text', text: t(lang).gtfsIndexFailed(err.message)}],
					};
				}
				const stops = nearestStops(index.stops, latitude, longitude, {
					radius: radius || 800,
					limit: limit || 8,
				});
				return {
					content: [{
						type: 'text',
						text: JSON.stringify({
							around: {latitude, longitude},
							radiusMeters: radius || 800,
							count: stops.length,
							stops,
						}, null, 1),
					}],
				};
			} catch (err) {
				return {
					isError: true,
					content: [{type: 'text', text: err?.message || String(err)}],
				};
			}
		},
	);
};

const registerLocationTools = (server) => {
	nearbyStopsTool(server);
};

export {registerLocationTools};
