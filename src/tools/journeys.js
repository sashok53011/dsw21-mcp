// Journey search tool: find_journeys — connections with realtime delays.

import {z} from 'zod';
import {bilingual, t} from '../i18n.js';
import {resolveStation, localizeError} from '../client.js';
import {compactJourney} from '../format.js';

const PRODUCT_IDS = [
	'nationalExpress', 'national', 'regionalExpress', 'regional',
	'suburban', 'bus', 'ferry', 'subway', 'tram', 'taxi',
];

const findJourneys = (server, client) => {
	server.tool(
		'find_journeys',
		bilingual(
			'Find train connections between two stations, including realtime delays per leg (departure/arrival delay, cancellations, platforms, disruption remarks). Stations may be names or EVA numbers.',
			'Zugverbindungen zwischen zwei Stationen suchen, inklusive Echtzeit-Verspätungen pro Abschnitt (Abfahrts-/Ankunftsverspätung, Ausfälle, Gleise, Störungshinweise). Stationen können Namen oder EVA-Nummern sein.',
		),
		{
			from: z.string().min(1).describe(bilingual('Origin station (name or EVA number).', 'Startstation (Name oder EVA-Nummer).')),
			to: z.string().min(1).describe(bilingual('Destination station (name or EVA number).', 'Zielstation (Name oder EVA-Nummer).')),
			via: z.string().optional().describe(bilingual('Optional: station to pass through.', 'Optional: Zwischenstation.')),
			departure: z.string().optional().describe(bilingual('Planned departure time, ISO 8601 (default: now).', 'Geplante Abfahrtszeit, ISO 8601 (Standard: jetzt).')),
			transfers: z.number().int().min(0).max(6).optional().describe(bilingual('Max. number of transfers.', 'Maximale Umstiege.')),
			results: z.number().int().min(1).max(8).optional().describe(bilingual('Number of connections to return (default 3).', 'Anzahl der Verbindungen (Standard 3).')),
			products: z.array(z.enum(PRODUCT_IDS)).optional().describe(bilingual('Filter by transport products.', 'Filter nach Verkehrsmitteln.')),
			language: z.enum(['en', 'de']).optional().describe(bilingual('Output language for status words.', 'Ausgabesprache für Statuswörter.')),
		},
		async ({from, to, via, departure, transfers, results, products, language}) => {
			const lang = language || client.language;
			const tt = t(lang);
			try {
				const fromStop = await resolveStation(client, from);
				const toStop = await resolveStation(client, to);
				const opt = {
					results: results || 3,
					stopovers: false,
					remarks: true,
				};
				if (via) opt.via = via;
				if (departure) opt.departure = departure;
				if (transfers !== undefined) opt.transfers = transfers;
				if (products && products.length) {
					opt.products = Object.fromEntries(PRODUCT_IDS.map(p => [p, products.includes(p)]));
				}
				const res = await client.journeys(fromStop.id, toStop.id, opt);
				const journeys = (res.journeys || []).map(j => compactJourney(j, tt));
				return {
					content: [{
						type: 'text',
						text: JSON.stringify({
							from: fromStop.name || fromStop.id,
							to: toStop.name || toStop.id,
							count: journeys.length,
							journeys,
						}, null, 1),
					}],
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

const registerJourneyTools = (server, client) => {
	findJourneys(server, client);
};

export {
	registerJourneyTools,
};
