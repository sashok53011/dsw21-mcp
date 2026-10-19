// Trip tool: trip_delays — realtime delay profile of one train along its route.

import {z} from 'zod';
import {bilingual, t} from '../i18n.js';
import {localizeError} from '../client.js';
import {compactTrip} from '../format.js';

const tripDelays = (server, client) => {
	server.tool(
		'trip_delays',
		bilingual(
			'Get the realtime delay profile of a single train along its whole route: per-stop planned vs. expected arrival/departure, delay in minutes, platform changes and cancellations. Get the tripId from the "tripId" field of station_delays or find_journeys.',
			'Verzoogsprofil eines einzelnen Zuges entlang seiner gesamten Strecke: pro Haltestelle Soll-/Ist-Ankunft/-Abfahrt, Verspätung in Minuten, Gleisänderungen und Ausfälle. Die tripId erhält man aus dem Feld "tripId" von station_delays oder find_journeys.',
		),
		{
			tripId: z.string().min(1).describe(bilingual('Trip ID (HAFAS trip id) of the train.', 'Trip-ID (HAFAS-Trip-ID) des Zuges.')),
			language: z.enum(['en', 'de']).optional().describe(bilingual('Output language for status words.', 'Ausgabesprache für Statuswörter.')),
		},
		async ({tripId, language}) => {
			const lang = language || client.language;
			const tt = t(lang);
			try {
				const res = await client.trip(tripId, {
					stopovers: true,
					remarks: true,
					polyline: false,
				});
				const trip = res.trip || res;
				const out = compactTrip(trip, tt);
				return {
					content: [{type: 'text', text: JSON.stringify(out, null, 1)}],
				};
			} catch (err) {
				// A missing trip usually means the ID is stale — give a targeted hint.
				if (err && (err.statusCode === 404 || /not found|404/i.test(err.message || ''))) {
					return {
						isError: true,
						content: [{type: 'text', text: t(lang).tripNotFound(tripId)}],
					};
				}
				return {
					isError: true,
					content: [{type: 'text', text: localizeError(err, lang, client.profileName)}],
				};
			}
		},
	);
};

const registerTripTools = (server, client) => {
	tripDelays(server, client);
};

export {
	registerTripTools,
};
