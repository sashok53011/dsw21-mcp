// Compact, LLM-friendly formatting of db-vendo-client (FPTF) results.
// Field names stay stable across languages; only human-readable status words
// are localized.

import {t} from './i18n.js';

const iso = (d) => {
	if (!d) return null;
	const date = new Date(d);
	if (Number.isNaN(date.getTime())) return String(d);
	return date.toISOString();
};

const delayMinutes = (delaySec) => {
	if (delaySec === null || delaySec === undefined) return null;
	return Math.round(delaySec / 60);
};

const statusOf = (item, tt) => {
	if (item.cancelled) return tt.cancelled;
	const d = delayMinutes(item.delay);
	if (d === null) return tt.unknown;
	if (d > 0) return tt.delayed;
	return tt.onTime;
};

const compactRemarks = (remarks, max = 4) => {
	if (!Array.isArray(remarks)) return [];
	return remarks
		.filter(r => r && (r.text || r.summary))
		.slice(0, max)
		.map(r => ({type: r.type || 'hint', text: r.text || r.summary}));
};

const compactStop = (s) => {
	if (!s) return null;
	return {id: s.id || null, name: s.name || null};
};

const compactStation = (stop, tt) => {
	// FPTF departure/arrival object
	const out = {
		line: stop.line?.name || null,
		product: stop.line?.product || stop.line?.mode || null,
		direction: stop.direction || stop.destination?.name || null,
		tripId: stop.tripId || null,
		planned: iso(stop.plannedWhen),
		expected: iso(stop.when),
		prognosed: iso(stop.prognosedWhen),
		delayMin: delayMinutes(stop.delay),
		status: statusOf(stop, tt),
		platform: stop.platform || stop.plannedPlatform || null,
	};
	if (stop.cancelled) out.cancelled = true;
	const remarks = compactRemarks(stop.remarks);
	if (remarks.length) out.remarks = remarks;
	return out;
};

const compactBoard = (res, stationName, kind, tt) => {
	const list = kind === 'arrivals' ? res.arrivals : res.departures;
	const items = (list || []).map(d => compactStation(d, tt));
	const delayed = items.filter(i => i.delayMin > 0).length;
	const cancelled = items.filter(i => i.cancelled).length;
	return {
		station: stationName,
		kind,
		count: items.length,
		delayedCount: delayed,
		cancelledCount: cancelled,
		items,
	};
};

const compactStopover = (st, tt) => {
	const out = {
		stop: compactStop(st.stop),
		plannedArrival: iso(st.plannedArrival),
		expectedArrival: iso(st.arrival),
		arrivalDelayMin: delayMinutes(st.arrivalDelay),
		plannedDeparture: iso(st.plannedDeparture),
		expectedDeparture: iso(st.departure),
		departureDelayMin: delayMinutes(st.departureDelay),
	};
	const platform = st.platform || st.plannedPlatform || st.arrivalPlatform || null;
	if (platform) out.platform = platform;
	if (st.cancelled) out.cancelled = true;
	// Localized per-stop status for quick scanning.
	out.status = st.cancelled ? tt.cancelled
		: ((delayMinutes(st.arrivalDelay) ?? delayMinutes(st.departureDelay) ?? 0) > 0 ? tt.delayed : tt.onTime);
	return out;
};

const compactTrip = (trip, tt) => {
	const stopovers = (trip.stopovers || []).map(s => compactStopover(s, tt));
	const delayedStops = stopovers.filter(s => (s.arrivalDelayMin > 0) || (s.departureDelayMin > 0)).length;
	// Trip-level status is derived from arrival/departure delays (a trip object
	// has no single `delay` field, unlike a board item).
	const tripStatus = trip.cancelled
		? tt.cancelled
		: ((delayMinutes(trip.departureDelay) > 0) || (delayMinutes(trip.arrivalDelay) > 0) ? tt.delayed : tt.onTime);
	return {
		tripId: trip.id || null,
		line: trip.line?.name || null,
		product: trip.line?.product || null,
		direction: trip.direction || null,
		origin: compactStop(trip.origin),
		destination: compactStop(trip.destination),
		plannedDeparture: iso(trip.plannedDeparture),
		expectedDeparture: iso(trip.departure),
		departureDelayMin: delayMinutes(trip.departureDelay),
		plannedArrival: iso(trip.plannedArrival),
		expectedArrival: iso(trip.arrival),
		arrivalDelayMin: delayMinutes(trip.arrivalDelay),
		cancelled: Boolean(trip.cancelled),
		status: tripStatus,
		stops: stopovers.length,
		delayedStops,
		stopovers,
		remarks: compactRemarks(trip.remarks, 6),
	};
};

const compactLeg = (leg, tt) => {
	if (leg.walking) {
		return {
			type: 'walking',
			from: compactStop(leg.origin),
			to: compactStop(leg.destination),
			plannedDeparture: iso(leg.plannedDeparture),
		};
	}
	return {
		type: 'public',
		line: leg.line?.name || null,
		product: leg.line?.product || null,
		direction: leg.direction || null,
		tripId: leg.tripId || null,
		from: compactStop(leg.origin),
		to: compactStop(leg.destination),
		plannedDeparture: iso(leg.plannedDeparture),
		expectedDeparture: iso(leg.departure),
		departureDelayMin: delayMinutes(leg.departureDelay),
		departurePlatform: leg.departurePlatform || leg.plannedDeparturePlatform || null,
		plannedArrival: iso(leg.plannedArrival),
		expectedArrival: iso(leg.arrival),
		arrivalDelayMin: delayMinutes(leg.arrivalDelay),
		arrivalPlatform: leg.arrivalPlatform || leg.plannedArrivalPlatform || null,
		cancelled: Boolean(leg.cancelled),
		status: statusOf(leg, tt),
		remarks: compactRemarks(leg.remarks, 4),
	};
};

const compactJourney = (j, tt) => {
	const legs = (j.legs || []).map(l => compactLeg(l, tt));
	// Overall delay = max delay across public-transport legs.
	const pubLegs = legs.filter(l => l.type === 'public');
	const delays = pubLegs
		.flatMap(l => [l.departureDelayMin, l.arrivalDelayMin])
		.filter(d => typeof d === 'number');
	const maxDelay = delays.length ? Math.max(...delays) : null;
	const cancelled = pubLegs.some(l => l.cancelled);
	return {
		status: cancelled ? tt.cancelled : (maxDelay > 0 ? tt.delayed : tt.onTime),
		maxDelayMin: maxDelay,
		cancelled,
		legs,
		refreshToken: j.refreshToken || null,
	};
};

export {
	iso,
	delayMinutes,
	compactStation,
	compactBoard,
	compactStopover,
	compactTrip,
	compactLeg,
	compactJourney,
	compactStop,
	compactRemarks,
	statusOf,
};
