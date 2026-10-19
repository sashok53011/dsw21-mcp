// Unit test for the compact output formatters, using mock FPTF data shaped
// like db-vendo-client output. Runs offline (no DB API access needed).

import assert from 'node:assert/strict';
import {compactBoard, compactTrip, compactJourney, delayMinutes} from '../src/format.js';
import {t} from '../src/i18n.js';

const tt = t('en');
const ttDe = t('de');

// --- delayMinutes -----------------------------------------------------------
assert.equal(delayMinutes(0), 0);
assert.equal(delayMinutes(300), 5);
assert.equal(delayMinutes(-120), -2);
assert.equal(delayMinutes(null), null);
assert.equal(delayMinutes(undefined), null);
console.log('delayMinutes ✓');

// --- compactBoard -----------------------------------------------------------
const boardRes = {
	departures: [
		{
			tripId: 'trip-1',
			line: {name: 'ICE 947', product: 'nationalExpress'},
			direction: 'München Hbf',
			plannedWhen: '2026-10-19T12:00:00+02:00',
			when: '2026-10-19T12:07:00+02:00',
			delay: 420,
			platform: '12',
			remarks: [{type: 'warning', text: 'Stellwechsel'}],
		},
		{
			tripId: 'trip-2',
			line: {name: 'S 3', product: 'suburban'},
			direction: 'Erkner',
			plannedWhen: '2026-10-19T12:05:00+02:00',
			when: '2026-10-19T12:05:00+02:00',
			delay: 0,
			platform: '4',
		},
		{
			tripId: 'trip-3',
			line: {name: 'RE 1', product: 'regionalExpress'},
			direction: 'Wittenberg',
			plannedWhen: '2026-10-19T12:10:00+02:00',
			when: null,
			delay: null,
			cancelled: true,
		},
	],
};
const board = compactBoard(boardRes, 'Berlin Hbf', 'departures', tt);
assert.equal(board.station, 'Berlin Hbf');
assert.equal(board.count, 3);
assert.equal(board.delayedCount, 1);
assert.equal(board.cancelledCount, 1);
assert.equal(board.items[0].status, 'delayed');
assert.equal(board.items[0].delayMin, 7);
assert.equal(board.items[0].line, 'ICE 947');
assert.equal(board.items[1].status, 'on time');
assert.equal(board.items[2].status, 'cancelled');
assert.equal(board.items[2].cancelled, true);
assert.equal(board.items[0].remarks[0].text, 'Stellwechsel');
// German status words
const boardDe = compactBoard(boardRes, 'Berlin Hbf', 'departures', ttDe);
assert.equal(boardDe.items[0].status, 'Verspätung');
assert.equal(boardDe.items[1].status, 'pünktlich');
assert.equal(boardDe.items[2].status, 'fällt aus');
console.log('compactBoard ✓');

// --- compactTrip ------------------------------------------------------------
const trip = {
	id: 'trip-1',
	line: {name: 'ICE 947', product: 'nationalExpress'},
	direction: 'München Hbf',
	origin: {id: '8011160', name: 'Berlin Hbf'},
	destination: {id: '8000261', name: 'München Hbf'},
	plannedDeparture: '2026-10-19T12:00:00+02:00',
	departure: '2026-10-19T12:07:00+02:00',
	departureDelay: 420,
	plannedArrival: '2026-10-19T16:00:00+02:00',
	arrival: '2026-10-19T16:25:00+02:00',
	arrivalDelay: 1500,
	stopovers: [
		{
			stop: {id: '8010000', name: 'Halle (Saale) Hbf'},
			plannedArrival: '2026-10-19T13:30:00+02:00',
			arrival: '2026-10-19T13:40:00+02:00',
			arrivalDelay: 600,
			plannedDeparture: '2026-10-19T13:33:00+02:00',
			departure: '2026-10-19T13:43:00+02:00',
			departureDelay: 600,
			platform: '7',
		},
		{
			stop: {id: '8010205', name: 'Erfurt Hbf'},
			plannedArrival: '2026-10-19T14:20:00+02:00',
			arrival: '2026-10-19T14:20:00+02:00',
			arrivalDelay: 0,
			plannedDeparture: '2026-10-19T14:22:00+02:00',
			departure: '2026-10-19T14:22:00+02:00',
			departureDelay: 0,
			platform: '3',
		},
	],
};
const out = compactTrip(trip, tt);
assert.equal(out.line, 'ICE 947');
assert.equal(out.departureDelayMin, 7);
assert.equal(out.arrivalDelayMin, 25);
assert.equal(out.stops, 2);
assert.equal(out.delayedStops, 1);
assert.equal(out.status, 'delayed');
assert.equal(out.stopovers[0].arrivalDelayMin, 10);
assert.equal(out.stopovers[0].status, 'delayed');
assert.equal(out.stopovers[1].status, 'on time');
assert.equal(out.stopovers[0].stop.name, 'Halle (Saale) Hbf');
assert.equal(out.stopovers[0].platform, '7');
console.log('compactTrip ✓');

// --- compactJourney ---------------------------------------------------------
const journey = {
	refreshToken: 'ctx$1',
	legs: [
		{
			walking: true,
			origin: {id: '8011160', name: 'Berlin Hbf'},
			destination: {id: '8011160', name: 'Berlin Hbf'},
			plannedDeparture: '2026-10-19T12:00:00+02:00',
		},
		{
			tripId: 'trip-9',
			line: {name: 'ICE 947', product: 'nationalExpress'},
			direction: 'München Hbf',
			origin: {id: '8011160', name: 'Berlin Hbf'},
			destination: {id: '8000261', name: 'München Hbf'},
			plannedDeparture: '2026-10-19T12:05:00+02:00',
			departure: '2026-10-19T12:15:00+02:00',
			departureDelay: 600,
			departurePlatform: '12',
			plannedArrival: '2026-10-19T16:00:00+02:00',
			arrival: '2026-10-19T16:00:00+02:00',
			arrivalDelay: 0,
			arrivalPlatform: '22',
			remarks: [{type: 'hint', text: 'Wagenreihung geändert'}],
		},
	],
};
const j = compactJourney(journey, tt);
assert.equal(j.legs.length, 2);
assert.equal(j.legs[0].type, 'walking');
assert.equal(j.legs[1].type, 'public');
assert.equal(j.legs[1].departureDelayMin, 10);
assert.equal(j.legs[1].departurePlatform, '12');
assert.equal(j.maxDelayMin, 10);
assert.equal(j.status, 'delayed');
assert.equal(j.cancelled, false);
assert.equal(j.refreshToken, 'ctx$1');
assert.equal(j.legs[1].remarks[0].text, 'Wagenreihung geändert');
console.log('compactJourney ✓');

console.log('\nall formatter tests passed ✓');
