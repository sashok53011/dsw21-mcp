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
		stationNotFound: (q) => `No station found for "${q}". Use the search_stations tool to find the correct name or ID.`,
		tripNotFound: (id) => `Trip "${id}" not found. It may have already completed; get the tripId from station_delays first.`,
		upstreamError: (profile) => `The Deutsche Bahn API (profile "${profile}") did not respond. DB APIs are rate-limited and sometimes block clients. Try again in a moment, or switch the DB_PROFILE environment variable (e.g. to "dbweb" or "db").`,
		upstreamBlocked: (profile) => `Deutsche Bahn is currently blocking requests from this network (profile "${profile}", HTTP 452 "OPS_BLOCKED"). This is a known, intermittent DB-side restriction — it is not a bug in the server. Try again later, switch DB_PROFILE, or run the server from a different network/IP.`,
		upstreamRateLimited: (profile) => `Rate limit reached at Deutsche Bahn (profile "${profile}", HTTP 429). Wait a moment and retry, or lower DB_REQUESTS_PER_MINUTE.`,
		gtfsIndexBuilding: 'Building the static GTFS index for the first time (downloading ~18 MB). This can take a minute — please retry shortly.',
		gtfsIndexFailed: (msg) => `Could not build/load the static GTFS index: ${msg}`,
		gtfsFeedUnavailable: (msg) => `The GTFS-RT feed (realtime.gtfs.de) is currently unavailable: ${msg}`,
		gtfsStopNotFound: (q) => `No stop found for "${q}" in the static GTFS index. Try a different name, or pass the numeric stop id.`,
		gtfsNoDelays: 'No realtime entries matched (no delays/cancellations in this window).',
		gtfsTripNotIndexed: (id) => `Trip "${id}" is not part of the indexed agency (DSW21). It may belong to another operator, or the static schedule is not yet updated.`,
		invalidStation: 'The "station" parameter must be a station name or an EVA number (e.g. 8011160 for Berlin Hbf).',
		summaryDepartures: (n, name) => `${n} departure(s) at ${name}`,
		summaryDelays: (n) => `${n} delayed`,
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
		stationNotFound: (q) => `Keine Station für "${q}" gefunden. Nutze das Tool search_stations, um den richtigen Namen oder die ID zu finden.`,
		tripNotFound: (id) => `Zug "${id}" nicht gefunden. Er ist evtl. bereits abgeschlossen; hole dir zuerst die tripId über station_delays.`,
		upstreamError: (profile) => `Die Deutsche-Bahn-API (Profil "${profile}") antwortet nicht. DB-APIs sind ratenbegrenzt und blockieren Clients bisweise. Versuche es gleich nochmal oder wechsle die Umgebungsvariable DB_PROFILE (z. B. auf "dbweb" oder "db").`,
		upstreamBlocked: (profile) => `Deutsche Bahn blockiert derzeit Anfragen aus diesem Netzwerk (Profil "${profile}", HTTP 452 "OPS_BLOCKED"). Das ist eine bekannte, intermittierende DB-seitige Einschränkung — kein Bug des Servers. Versuche es später erneute, wechsle DB_PROFILE oder starte den Server aus einem anderen Netzwerk/IP.`,
		upstreamRateLimited: (profile) => `Ratenlimit bei Deutsche Bahn erreicht (Profil "${profile}", HTTP 429). Einen Moment warten und erneut versuchen oder DB_REQUESTS_PER_MINUTE senken.`,
		gtfsIndexBuilding: 'Das statische GTFS-Index wird zum ersten Mal aufgebaut (Download ca. 18 MB). Das kann eine Minute dauern — bitte gleich erneut versuchen.',
		gtfsIndexFailed: (msg) => `Statisches GTFS-Index konnte nicht geladen/aufgebaut werden: ${msg}`,
		gtfsFeedUnavailable: (msg) => `Der GTFS-RT-Feed (realtime.gtfs.de) ist derzeit nicht verfügbar: ${msg}`,
		gtfsStopNotFound: (q) => `Kein Haltestellen-Treffer für "${q}" im statischen GTFS-Index. Anderen Namen versuchen oder die numerische stop-id angeben.`,
		gtfsNoDelays: 'Keine Echtzeit-Einträge gefunden (keine Verspätungen/Ausfälle in diesem Zeitfenster).',
		gtfsTripNotIndexed: (id) => `Zug "${id}" gehört nicht zur indexierten Konzern (DSW21). Er gehört evtl. einem anderen Betreiber oder der statische Fahrplan ist noch nicht aktualisiert.`,
		invalidStation: 'Der Parameter "station" muss ein Stationsname oder eine EVA-Nummer sein (z. B. 8011160 für Berlin Hbf).',
		summaryDepartures: (n, name) => `${n} Abfahrt(en) in ${name}`,
		summaryDelays: (n) => `${n} mit Verspätung`,
	},
};

const normalizeLanguage = (lang) => {
	if (lang === 'de') return 'de';
	return 'en';
};

const t = (lang) => messages[normalizeLanguage(lang)];

// Bilingual text for tool descriptions: English first, German second.
const bilingual = (en, de) => `${en}\n${de}`;

export {
	messages,
	normalizeLanguage,
	t,
	bilingual,
};
