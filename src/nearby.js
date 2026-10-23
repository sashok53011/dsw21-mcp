// Nearest-stop search over the static GTFS index (pure logic, no I/O).
// A station is modelled as a parent stop plus platform children; callers want
// the station, not 14 platform rows, so distances are grouped by the effective
// stop (parent if present) and deduplicated.

const EARTH_RADIUS_M = 6371000;
const toRad = (deg) => (deg * Math.PI) / 180;

// Great-circle distance in meters.
const haversine = (lat1, lon1, lat2, lon2) => {
	const dLat = toRad(lat2 - lat1);
	const dLon = toRad(lon2 - lon1);
	const a = Math.sin(dLat / 2) ** 2
		+ Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
	return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
};

/**
 * Find the stops closest to a point.
 *
 * @param {Map<string, {name: string|null, parent: string|null, lat?: number, lon?: number}>} stops
 * @param {number} lat
 * @param {number} lon
 * @param {object} [opts]
 * @param {number} [opts.radius=800] search radius in meters
 * @param {number} [opts.limit=8] max results
 * @returns {Array<{stopId: string, name: string|null, distance: number}>}
 */
const nearestStops = (stops, lat, lon, {radius = 800, limit = 8} = {}) => {
	// effectiveId -> {stopId, name, distance}: keep the closest platform of
	// each station so parents with many platforms don't flood the result.
	const best = new Map();
	for (const [id, stop] of stops) {
		if (typeof stop?.lat !== 'number' || typeof stop?.lon !== 'number') continue;
		const d = haversine(lat, lon, stop.lat, stop.lon);
		if (d > radius) continue;
		const effectiveId = stop.parent || id;
		const prev = best.get(effectiveId);
		if (!prev || d < prev.distance) {
			best.set(effectiveId, {
				stopId: effectiveId,
				name: (stops.get(effectiveId)?.name) || stop.name,
				distance: Math.round(d),
			});
		}
	}
	return [...best.values()]
		.sort((a, b) => a.distance - b.distance)
		.slice(0, limit);
};

export {haversine, nearestStops};
