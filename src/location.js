// User location: GPS (via the /locate page), env override, IP geolocation.
//
// Priority order for current_location():
//   1. GPS coordinates posted from the /locate page (stored in a JSON file so
//      they survive server restarts; the page keeps them fresh while open),
//   2. LOCATION_LAT / LOCATION_LON env vars,
//   3. IP geolocation of the client IP (via the Cloudflare tunnel's
//      Cf-Connecting-Ip header) — or of this host's public IP in stdio mode.
//
// Privacy: coordinates live on *this* server only (GTFS_INDEX_DIR/location.json).
// The IP fallback asks ipwho.is once per IP per 10 minutes; it never sees GPS.

import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {TtlCache} from './cache.js';

const locationFile = () =>
	process.env.LOCATION_FILE
	|| join(process.env.GTFS_INDEX_DIR || './.gtfs-index', 'location.json');

// ---- storage ---------------------------------------------------------------

let memory = null; // {lat, lon, accuracy, updatedAt}

const loadFile = async () => {
	try {
		const raw = await readFile(locationFile(), 'utf8');
		const data = JSON.parse(raw);
		if (typeof data?.lat === 'number' && typeof data?.lon === 'number') return data;
	} catch { /* missing/corrupt file — treat as no location */ }
	return null;
};

const saveFile = async (loc) => {
	const file = locationFile();
	await mkdir(join(file, '..'), {recursive: true});
	await writeFile(file, JSON.stringify(loc, null, '\t'), {mode: 0o600});
};

/** Store a new GPS fix (from the /locate page). */
const setLocation = async ({lat, lon, accuracy = null}) => {
	const loc = {
		lat: Number(lat),
		lon: Number(lon),
		accuracy: typeof accuracy === 'number' ? Math.round(accuracy) : null,
		source: 'gps',
		updatedAt: new Date().toISOString(),
	};
	memory = loc;
	await saveFile(loc);
	return loc;
};

// ---- IP geolocation --------------------------------------------------------

const ipCache = new TtlCache();
const IP_TTL_MS = 10 * 60 * 1000;

const geolocateIp = async (ip) => {
	const key = 'ipgeo:' + (ip || 'self');
	return ipCache.wrap(key, IP_TTL_MS, async () => {
		const url = ip ? `https://ipwho.is/${encodeURIComponent(ip)}` : 'https://ipwho.is/';
		const res = await fetch(url, {signal: AbortSignal.timeout(8000)});
		if (!res.ok) throw new Error(`ipwho.is HTTP ${res.status}`);
		const data = await res.json();
		if (data.success === false) throw new Error(data.message || 'ipwho.is failure');
		return {
			lat: data.latitude,
			lon: data.longitude,
			city: data.city || null,
			country: data.country || null,
			ip: data.ip || ip || null,
		};
	});
};

// ---- current location ------------------------------------------------------

/**
 * Resolve the current location.
 * @param {string|null} [clientIp] real client IP (Cf-Connecting-Ip), if known
 * @returns {Promise<{lat: number, lon: number, source: string, accuracy: number|null,
 *   ageMinutes: number|null, city?: string|null, updatedAt?: string}|null>}
 */
const currentLocation = async (clientIp = null) => {
	// 1) GPS from the /locate page
	if (memory === null) memory = await loadFile();
	if (memory) {
		const ageMs = Date.now() - new Date(memory.updatedAt).getTime();
		return {
			lat: memory.lat,
			lon: memory.lon,
			accuracy: memory.accuracy ?? null,
			updatedAt: memory.updatedAt,
			ageMinutes: Number.isFinite(ageMs) ? Math.round(ageMs / 60000) : null,
			source: 'gps',
		};
	}

	// 2) static env override
	const lat = parseFloat(process.env.LOCATION_LAT);
	const lon = parseFloat(process.env.LOCATION_LON);
	if (Number.isFinite(lat) && Number.isFinite(lon)) {
		return {lat, lon, accuracy: null, source: 'env', ageMinutes: null};
	}

	// 3) IP geolocation
	try {
		const ipLoc = await geolocateIp(clientIp);
		if (Number.isFinite(ipLoc.lat) && Number.isFinite(ipLoc.lon)) {
			return {
				lat: ipLoc.lat,
				lon: ipLoc.lon,
				city: ipLoc.city,
				country: ipLoc.country,
				ip: ipLoc.ip,
				accuracy: null,
				ageMinutes: 0,
				source: 'ip',
			};
		}
	} catch { /* fall through */ }

	return null;
};

// ---- /locate page ----------------------------------------------------------

// Minimal self-contained page: browser Geolocation API -> POST /locate.
// No external resources, works over the Cloudflare tunnel on any phone.
const LOCATE_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>dsw21-mcp · location</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 2rem auto; max-width: 28rem; padding: 0 1rem; color: #222; }
  h1 { font-size: 1.2rem; }
  #status { margin: 1rem 0; padding: .8rem; background: #f2f2f2; border-radius: .5rem; line-height: 1.5; }
  button { font-size: 1rem; padding: .6rem 1.2rem; border-radius: .5rem; border: 1px solid #888; background: #fff; cursor: pointer; }
  .ok { color: #0a7a2f; } .err { color: #a32020; }
  small { color: #666; display: block; margin-top: 1rem; }
</style>
</head>
<body>
<h1>dsw21-mcp — share your location</h1>
<p id="status">Press the button to share your GPS position with the server. While this page stays open, your position is kept up to date.</p>
<button id="go">Share location</button>
<small>Coordinates are stored on your own server only (location.json). Anyone who can open this page can also set the stored position — do not share the URL publicly.</small>
<script>
const status = document.getElementById('status');
const btn = document.getElementById('go');
let watchId = null;
async function send(pos) {
  const payload = { lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy };
  try {
    const res = await fetch('/locate', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    status.className = 'ok';
    status.innerHTML = 'Sent: <b>' + payload.lat.toFixed(5) + ', ' + payload.lon.toFixed(5) + '</b><br>accuracy ±' + Math.round(payload.accuracy) + ' m<br>updated ' + new Date().toLocaleTimeString();
  } catch (e) {
    status.className = 'err';
    status.textContent = 'Failed to send: ' + e.message;
  }
}
btn.addEventListener('click', () => {
  if (!navigator.geolocation) { status.className = 'err'; status.textContent = 'Geolocation is not supported by this browser.'; return; }
  status.textContent = 'Requesting permission…';
  watchId = navigator.geolocation.watchPosition(send, (err) => {
    status.className = 'err';
    status.textContent = 'Geolocation error: ' + err.message;
  }, { enableHighAccuracy: true, maximumAge: 10000, timeout: 30000 });
  btn.disabled = true;
  btn.textContent = 'Sharing… (page open keeps it fresh)';
});
</script>
</body>
</html>
`;

const LOCATE_PAGE_PATH = '/locate';

export {
	setLocation,
	currentLocation,
	geolocateIp,
	LOCATE_PAGE,
	LOCATE_PAGE_PATH,
	locationFile,
};
