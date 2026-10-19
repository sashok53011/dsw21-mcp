// Localized strings (English / German) used in tool descriptions and output.

const messages = {
	en: {
		langName: 'en',
		onTime: 'on time',
		delayed: 'delayed',
		cancelled: 'cancelled',
		unknown: 'unknown',
		min: 'min',
		delayLabel: 'delay',
		platformLabel: 'platform',
		noData: 'no realtime data',
		gtfsIndexBuilding: 'Building the static GTFS index for the first time (downloading ~18 MB). This can take a minute — please retry shortly.',
		gtfsIndexFailed: (msg) => `Could not build/load the static GTFS index: ${msg}`,
		gtfsFeedUnavailable: (msg) => `The GTFS-RT feed (realtime.gtfs.de) is currently unavailable: ${msg}`,
		gtfsStopNotFound: (q) => `No stop found for "${q}" in the static GTFS index. Try a different name, or pass the numeric stop id.`,
		gtfsNoDelays: 'No realtime entries matched (no delays/cancellations in this window).',
		gtfsTripNotIndexed: (id) => `Trip "${id}" is not part of the indexed agency (DSW21). It may belong to another operator, or the static schedule is not yet updated.`,
	},
	de: {
		langName: 'de',
		onTime: 'pünktlich',
		delayed: 'Verspätung',
		cancelled: 'fällt aus',
		unknown: 'unbekannt',
		min: 'Min.',
		delayLabel: 'Verspätung',
		platformLabel: 'Gleis',
		noData: 'keine Echtzeitdaten',
		gtfsIndexBuilding: 'Das statische GTFS-Index wird zum ersten Mal aufgebaut (Download ca. 18 MB). Das kann eine Minute dauern — bitte gleich erneut versuchen.',
		gtfsIndexFailed: (msg) => `Statisches GTFS-Index konnte nicht geladen/aufgebaut werden: ${msg}`,
		gtfsFeedUnavailable: (msg) => `Der GTFS-RT-Feed (realtime.gtfs.de) ist derzeit nicht verfügbar: ${msg}`,
		gtfsStopNotFound: (q) => `Kein Haltestellen-Treffer für "${q}" im statischen GTFS-Index. Anderen Namen versuchen oder die numerische stop-id angeben.`,
		gtfsNoDelays: 'Keine Echtzeit-Einträge gefunden (keine Verspätungen/Ausfälle in diesem Zeitfenster).',
		gtfsTripNotIndexed: (id) => `Zug "${id}" gehört nicht zur indexierten Konzern (DSW21). Er gehört evtl. einem anderen Betreiber oder der statische Fahrplan ist noch nicht aktualisiert.`,
	},
};

const normalizeLanguage = (lang) => {
	if (lang === 'de') return 'de';
	return 'en';
};

// Default output language: `language` argument wins, then DB_LANG (kept under
// this name for backward compatibility with existing client configs), then en.
const resolveLanguage = (lang) => normalizeLanguage(lang || process.env.DB_LANG);

const t = (lang) => messages[normalizeLanguage(lang)];

// Bilingual text for tool descriptions: English first, German second.
const bilingual = (en, de) => `${en}\n${de}`;

export {
	messages,
	normalizeLanguage,
	resolveLanguage,
	t,
	bilingual,
};
