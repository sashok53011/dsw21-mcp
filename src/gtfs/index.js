// Build a compact static-GTFS index for one agency (e.g. DSW21) out of the
// big gtfs.de zip, via HTTP Range requests — only ~18 MB is downloaded, the
// 229 MB stop_times.txt is skipped.
//
// The index answers the two joins the GTFS-RT feed needs:
//   stopId  -> {name, isDortmund...}   (RT feed only has numeric stop ids)
//   tripId  -> {routeId, line, headsign} (RT feed has no route/agency info)

import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {listZipEntries, readZipEntryText} from './zip.js';
import {forEachCsvRow} from './csv.js';

const DEFAULT_ZIP_URL = 'https://download.gtfs.de/germany/nv_free/latest.zip';
// Static schedules change every ~2 weeks; re-index daily at most.
const INDEX_TTL_MS = 24 * 60 * 60 * 1000;
// Bump when the cached index shape changes (v2: stop coordinates added) so
// stale caches are rebuilt on next load instead of served without coords.
const INDEX_VERSION = 'v2';

const cacheDir = () => process.env.GTFS_INDEX_DIR || join(process.cwd(), '.gtfs-index');

const cacheFile = (zipUrl, agencyPattern) => {
	const h = createHash('sha256').update(INDEX_VERSION + '|' + zipUrl + '|' + agencyPattern).digest('hex').slice(0, 16);
	return join(cacheDir(), `index-${h}.json`);
};

const parseAgencyId = (text, agencyPattern) => {
	const rx = new RegExp(agencyPattern, 'i');
	const ids = new Set();
	forEachCsvRow(text, (header, row) => {
		if (!header) return;
		const iName = header.indexOf('agency_name');
		const iId = header.indexOf('agency_id');
		if (iName === -1) return;
		if (rx.test(row[iName] || '')) {
			ids.add((row[iId] || '').trim());
		}
	});
	return ids;
};

const buildIndex = async ({zipUrl = DEFAULT_ZIP_URL, agencyPattern = 'DSW21|Dortmunder'} = {}) => {
	const res = await fetch(zipUrl, {method: 'HEAD', signal: AbortSignal.timeout(30_000)});
	if (!res.ok) throw new Error(`GTFS archive HEAD failed: HTTP ${res.status}`);
	const contentLength = parseInt(res.headers.get('content-length'), 10);
	if (!contentLength) throw new Error('GTFS archive: missing content-length');

	const entries = await listZipEntries(zipUrl, contentLength);
	const byName = Object.fromEntries(entries.map(e => [e.name, e]));

	// 1) Which agency_id(s) match?
	const agencyText = await readZipEntryText(zipUrl, byName['agency.txt']);
	const agencyIds = parseAgencyId(agencyText, agencyPattern);
	if (agencyIds.size === 0) {
		throw new Error(`no agency matching /${agencyPattern}/ found in agency.txt`);
	}

	// 2) Their route_ids.
	const routesText = await readZipEntryText(zipUrl, byName['routes.txt']);
	const routeIds = new Set();
	const routes = new Map(); // routeId -> {line, headsign}
	forEachCsvRow(routesText, (header, row) => {
		if (!header) return;
		const iAg = header.indexOf('agency_id');
		const iRoute = header.indexOf('route_id');
		const iShort = header.indexOf('route_short_name');
		const iLong = header.indexOf('route_long_name');
		if (iAg === -1 || iRoute === -1) return;
		if (agencyIds.has((row[iAg] || '').trim())) {
			const routeId = (row[iRoute] || '').trim();
			routeIds.add(routeId);
			routes.set(routeId, {
				line: (row[iShort] || '').trim() || null,
				name: (row[iLong] || '').trim() || null,
			});
		}
	});
	if (routeIds.size === 0) {
		throw new Error(`agency ${[...agencyIds].join(',')} has no routes`);
	}

	// 3) trip_id -> routeId (streamed; trips.txt can be ~28 MB uncompressed).
	const tripsText = await readZipEntryText(zipUrl, byName['trips.txt']);
	const trips = new Map(); // tripId -> {routeId, line, headsign}
	forEachCsvRow(tripsText, (header, row) => {
		if (!header) return;
		const iRoute = header.indexOf('route_id');
		const iTrip = header.indexOf('trip_id');
		const iSign = header.indexOf('trip_headsign');
		if (iRoute === -1 || iTrip === -1) return;
		const routeId = (row[iRoute] || '').trim();
		if (!routeIds.has(routeId)) return;
		const r = routes.get(routeId) || {};
		trips.set((row[iTrip] || '').trim(), {
			routeId,
			line: r.line || null,
			headsign: iSign !== -1 ? ((row[iSign] || '').trim() || null) : null,
		});
	});

	// 4) stop_id -> {name, parent, lat, lon}. Keep every stop referenced by this
	// agency's trips would need stop_times (skipped); instead index *all* stops
	// so a caller can resolve any numeric stopId seen in the RT feed, and so
	// nearby_stops can compute distances (coordinates needed there).
	const stopsText = await readZipEntryText(zipUrl, byName['stops.txt']);
	const stops = new Map(); // stopId -> {name, parent, lat, lon}
	// A station is modelled as a parent stop plus per-platform child stops; the
	// realtime feed references platform ids. Index name -> all stopIds and
	// parent -> childIds so a station name resolves to the whole id set.
	const idsByName = new Map(); // normalizedName -> [stopId]
	const childIds = new Map(); // parentId -> [childStopId]
	forEachCsvRow(stopsText, (header, row) => {
		if (!header) return;
		const iId = header.indexOf('stop_id');
		const iName = header.indexOf('stop_name');
		const iParent = header.indexOf('parent_station');
		const iLat = header.indexOf('stop_lat');
		const iLon = header.indexOf('stop_lon');
		if (iId === -1 || iName === -1) return;
		const id = (row[iId] || '').trim();
		const name = (row[iName] || '').trim() || null;
		const parent = (row[iParent] || '').trim() || null;
		const lat = iLat !== -1 ? parseFloat(row[iLat]) : NaN;
		const lon = iLon !== -1 ? parseFloat(row[iLon]) : NaN;
		stops.set(id, {
			name,
			parent,
			...(Number.isFinite(lat) && Number.isFinite(lon) ? {lat, lon} : {}),
		});
		if (name) {
			const key = name.toLowerCase();
			if (!idsByName.has(key)) idsByName.set(key, []);
			idsByName.get(key).push(id);
		}
		if (parent) {
			if (!childIds.has(parent)) childIds.set(parent, []);
			childIds.get(parent).push(id);
		}
	});

	const index = {
		zipUrl,
		agencyPattern,
		agencyIds: [...agencyIds],
		builtAt: new Date().toISOString(),
		stops, // Map
		trips, // Map
		idsByName, // Map
		childIds, // Map
		routes: Object.fromEntries(routes), // plain object for JSON
	};
	return index;
};

// Process-level memo: the on-disk cache is ~55 MB of JSON; parsing it on every
// tool call took 14–17 s. Keep the deserialized Maps in memory once per
// process (the HTTP server is long-lived, stdio has one process per session).
let memo = null; // {key, index}

const loadIndex = async (opts = {}) => {
	const zipUrl = opts.zipUrl || DEFAULT_ZIP_URL;
	const agencyPattern = opts.agencyPattern || 'DSW21|Dortmunder';
	const file = cacheFile(zipUrl, agencyPattern);
	const key = `${file}:${opts.force ? 'force' : ''}`;

	if (!opts.force && memo && memo.key === key) {
		return {...memo.index, cached: true};
	}

	if (!opts.force && existsSync(file)) {
		try {
			const raw = JSON.parse(await readFile(file, 'utf8'));
			if (Date.now() - new Date(raw.builtAt).getTime() < INDEX_TTL_MS) {
				const index = {
					...raw,
					stops: new Map(Object.entries(raw.stops)),
					trips: new Map(Object.entries(raw.trips)),
					idsByName: new Map(Object.entries(raw.idsByName || {})),
					childIds: new Map(Object.entries(raw.childIds || {})),
				};
				memo = {key, index};
				return {...index, cached: true};
			}
		} catch {
			// fall through to rebuild
		}
	}

	const fresh = await buildIndex({zipUrl, agencyPattern});
	await mkdir(cacheDir(), {recursive: true});
	await writeFile(file, JSON.stringify({
		...fresh,
		stops: Object.fromEntries(fresh.stops),
		trips: Object.fromEntries(fresh.trips),
		idsByName: Object.fromEntries(fresh.idsByName),
		childIds: Object.fromEntries(fresh.childIds),
	}), 'utf8');
	memo = {key, index: fresh};
	return {...fresh, cached: false};
};

export {
	loadIndex,
	buildIndex,
	DEFAULT_ZIP_URL,
};
