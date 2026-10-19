// Departure/arrival board tool with delays: station_delays.

import {z} from 'zod';
import {bilingual, t} from '../i18n.js';
import {resolveStation, localizeError} from '../client.js';
import {compactBoard} from '../format.js';

const PRODUCT_IDS = [
	'nationalExpress', 'national', 'regionalExpress', 'regional',
	'suburban', 'bus', 'ferry', 'subway', 'tram', 'taxi',
];

const languageField = z.enum(['en', 'de'])
	.optional()
	.describe(bilingual('Output language for status words.', 'Ausgabesprache für Statuswörter.'));

const productsField = z.array(z.enum(PRODUCT_IDS))
	.optional()
	.describe(bilingual(
		`Filter by transport products. Any of: ${PRODUCT_IDS.join(', ')}. Default: all.`,
		`Filter nach Verkehrsmitteln. Beliebig aus: ${PRODUCT_IDS.join(', ')}. Standard: alle.`,
	));

const stationDelays = (server, client) => {
	server.tool(
		'station_delays',
		bilingual(
			'Live departure board for a station with realtime delays, cancellations, platforms and disruption remarks. The station may be given as a name or an EVA number (e.g. 8011160 = Berlin Hbf).',
			'Live-Abfahrtstafel einer Station mit Echtzeit-Verspätungen, Ausfällen, Gleisen und Störungshinweisen. Die Station kann als Name oder EVA-Nummer angegeben werden (z. B. 8011160 = Berlin Hbf).',
		),
		{
			station: z.string().min(1).describe(bilingual('Station name or EVA number.', 'Stationsname oder EVA-Nummer.')),
			minutes: z.number().int().min(10).max(120).optional().describe(bilingual('Time window in minutes from now (default 30). Note: some DB profiles only return ~60 minutes.', 'Zeitfenster in Minuten ab jetzt (Standard 30). Hinweis: Manche DB-Profile liefern nur ca. 60 Minuten.')),
			direction: z.string().optional().describe(bilingual('Only show departures travelling towards this station.', 'Nur Abfahrten in Richtung dieser Station anzeigen.')),
			products: productsField,
			language: languageField,
		},
		async ({station, minutes, direction, products, language}) => {
			const lang = language || client.language;
			const tt = t(lang);
			try {
				const stop = await resolveStation(client, station);
				const opt = {
					duration: minutes || 30,
					remarks: true,
					stopovers: false,
					results: null,
				};
				if (products && products.length) {
					opt.products = Object.fromEntries(PRODUCT_IDS.map(p => [p, products.includes(p)]));
				}
				if (direction) opt.direction = direction;
				const res = await client.departures(stop.id, opt);
				const board = compactBoard(res, stop.name || stop.id, 'departures', tt);
				return {
					content: [{type: 'text', text: JSON.stringify(board, null, 1)}],
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

const stationArrivals = (server, client) => {
	server.tool(
		'station_arrivals',
		bilingual(
			'Live arrival board for a station with realtime delays, cancellations, platforms and disruption remarks.',
			'Live-Ankunftstafel einer Station mit Echtzeit-Verspätungen, Ausfällen, Gleisen und Störungshinweisen.',
		),
		{
			station: z.string().min(1).describe(bilingual('Station name or EVA number.', 'Stationsname oder EVA-Nummer.')),
			minutes: z.number().int().min(10).max(120).optional().describe(bilingual('Time window in minutes from now (default 30).', 'Zeitfenster in Minuten ab jetzt (Standard 30).')),
			products: productsField,
			language: languageField,
		},
		async ({station, minutes, products, language}) => {
			const lang = language || client.language;
			const tt = t(lang);
			try {
				const stop = await resolveStation(client, station);
				const opt = {
					duration: minutes || 30,
					remarks: true,
					stopovers: false,
					results: null,
				};
				if (products && products.length) {
					opt.products = Object.fromEntries(PRODUCT_IDS.map(p => [p, products.includes(p)]));
				}
				const res = await client.arrivals(stop.id, opt);
				const board = compactBoard(res, stop.name || stop.id, 'arrivals', tt);
				return {
					content: [{type: 'text', text: JSON.stringify(board, null, 1)}],
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

const registerBoardTools = (server, client) => {
	stationDelays(server, client);
	stationArrivals(server, client);
};

export {
	registerBoardTools,
	PRODUCT_IDS,
};
