// Station-search tools: search_stations, nearby_stations.

import {z} from 'zod';
import {bilingual, t} from '../i18n.js';
import {resolveStation, localizeError} from '../client.js';

const languageField = z.enum(['en', 'de'])
	.optional()
	.describe(bilingual('Output language for status words.', 'Ausgabesprache für Statuswörter.'));

const searchStations = (server, client) => {
	server.tool(
		'search_stations',
		bilingual(
			'Find Deutsche Bahn stations/stops by name. Returns station ID (EVA number), name and coordinates. Use the returned id as the "station" argument for other tools.',
			'Deutsche-Bahn-Stationen/Haltestellen per Name suchen. Gibt Stations-ID (EVA-Nummer), Namen und Koordinaten zurück. Die returned id als Argument "station" für andere Tools verwenden.',
		),
		{
			query: z.string().min(1).describe(bilingual('Station name to search, e.g. "Berlin Hbf" or "München Flughafen".', 'Stationssuche, z. B. "Berlin Hbf" oder "München Flughafen".')),
			results: z.number().int().min(1).max(20).optional().describe(bilingual('Max. number of results (default 5).', 'Maximale Anzahl Ergebnisse (Standard 5).')),
			language: languageField,
		},
		async ({query, results, language}) => {
			const lang = language || client.language;
			const tt = t(lang);
			try {
				const res = await client.locations(query, {
					results: results || 5,
					fuzzy: true,
					stops: true,
					addresses: false,
					poi: false,
				});
				const stations = (res || []).map(s => ({
					id: s.id || null,
					name: s.name || null,
					type: s.type || 'station',
					latitude: s.location?.latitude ?? s.latitude ?? null,
					longitude: s.location?.longitude ?? s.longitude ?? null,
				}));
				return {
					content: [{type: 'text', text: JSON.stringify({query, count: stations.length, stations}, null, 1)}],
				};
			} catch (err) {
				return {
					isError: true,
					content: [{type: 'text', text: localizeError(err, lang, client.profileName)}],
				};
			}
		},
	);
};

const nearbyStations = (server, client) => {
	server.tool(
		'nearby_stations',
		bilingual(
			'List stations/stops near a geographic coordinate (WGS84 lat/lon), sorted by distance.',
			'Stationen/Haltestellen in der Nähe einer geographischen Koordinate (WGS84 lat/lon), nach Entfernung sortiert.',
		),
		{
			latitude: z.number().min(-90).max(90).describe(bilingual('Latitude in degrees.', 'Breitengrad in Grad.')),
			longitude: z.number().min(-180).max(180).describe(bilingual('Longitude in degrees.', 'Längengrad in Grad.')),
			results: z.number().int().min(1).max(20).optional().describe(bilingual('Max. number of results (default 8).', 'Maximale Anzahl Ergebnisse (Standard 8).')),
			language: languageField,
		},
		async ({latitude, longitude, results, language}) => {
			const lang = language || client.language;
			try {
				const res = await client.nearby({latitude, longitude}, {
					results: results || 8,
					stops: true,
					poi: false,
				});
				const stations = (res || []).map(s => ({
					id: s.id || null,
					name: s.name || null,
					distance: s.distance ?? null,
					latitude: s.location?.latitude ?? s.latitude ?? null,
					longitude: s.location?.longitude ?? s.longitude ?? null,
				}));
				return {
					content: [{type: 'text', text: JSON.stringify({latitude, longitude, count: stations.length, stations}, null, 1)}],
				};
			} catch (err) {
				return {
					isError: true,
					content: [{type: 'text', text: localizeError(err, lang, client.profileName)}],
				};
			}
		},
	);
};

const registerStationTools = (server, client) => {
	searchStations(server, client);
	nearbyStations(server, client);
	// resolveStation is used by other tool modules; re-exported here for tests.
	void resolveStation;
};

export {
	registerStationTools,
};
