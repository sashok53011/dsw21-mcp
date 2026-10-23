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
		locationUnknown: 'No location known yet. Open the /locate page of this server in a phone browser to share GPS coordinates (they stay on this server), or set LOCATION_LAT/LOCATION_LON on the server.',
		locationStale: (min) => `The stored GPS position is ${Math.round(min / 60)} h old — re-open the /locate page for a fresh fix.`,
		locationUnknownForJourney: 'No location available to start from. Pass "from" explicitly, or open the /locate page of this server in a phone browser to share GPS coordinates.',
		journeyNone: 'No connections found for this query — try a later departure or fewer transfers.',
		journeyFailed: (msg) => `Journey planning failed (Transitous/MOTIS): ${msg}`,
		placeNotFound: (q) => `Place "${q}" not found by the geocoder — try a more specific name or "lat,lon".`,
		invalidDeparture: (v) => `"time" is not a valid ISO 8601 timestamp: ${v}`,
		tripNotFound: (id) => `Trip "${id}" not found — it may have already finished. Get a fresh tripId from plan_journey or stop_departures.`,
		stopTimesNone: 'No departures in this time window.',
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
		locationUnknown: 'Noch kein Standort bekannt. Die /locate-Seite dieses Servers im Handy-Browser öffnen, um GPS-Koordinaten zu teilen (bleiben auf diesem Server), oder LOCATION_LAT/LOCATION_LON auf dem Server setzen.',
		locationStale: (min) => `Die gespeicherte GPS-Position ist ${Math.round(min / 60)} h alt — /locate-Seite erneut öffnen für einen aktuellen Fix.`,
		locationUnknownForJourney: 'Kein Standort als Start verfügbar. "from" explizit übergeben oder die /locate-Seite dieses Servers im Handy-Browser öffnen, um GPS-Koordinaten zu teilen.',
		journeyNone: 'Keine Verbindungen für diese Anfrage gefunden — späteren Abfahrt versuchen oder weniger Umstiege.',
		journeyFailed: (msg) => `Verbindungsplanung fehlgeschlagen (Transitous/MOTIS): ${msg}`,
		placeNotFound: (q) => `Ort "${q}" vom Geocoder nicht gefunden — präziseren Namen oder "lat,lon" versuchen.`,
		invalidDeparture: (v) => `"time" ist keine gültige ISO-8601-Zeitangabe: ${v}`,
		tripNotFound: (id) => `Zug "${id}" nicht gefunden — er ist evtl. bereits durchgelaufen. Frische tripId aus plan_journey oder stop_departures holen.`,
		stopTimesNone: 'Keine Abfahrten in diesem Zeitfenster.',
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
