// Offline unit tests for the GTFS-RT helpers: CSV parsing and station
// resolution (parent + platform child id sets). No network needed.

import assert from 'node:assert/strict';
import {parseCsvLine, forEachCsvRow} from '../src/gtfs/csv.js';
import {resolveGtfsStop} from '../src/tools/gtfs-rt.js';

// --- parseCsvLine -----------------------------------------------------------
assert.deepEqual(parseCsvLine('a,b,c'), ['a', 'b', 'c']);
assert.deepEqual(parseCsvLine('"a,b",c'), ['a,b', 'c']);
assert.deepEqual(parseCsvLine('"say ""hi""",x'), ['say "hi"', 'x']);
assert.deepEqual(parseCsvLine(',,z'), ['', '', 'z']);
console.log('parseCsvLine ✓');

// --- forEachCsvRow ----------------------------------------------------------
const rows = [];
forEachCsvRow('h1,h2\n1,2\n"x,y",4\n', (header, row) => {
	if (header === null) rows.push(['HDR', ...row]);
	else rows.push(row);
});
assert.deepEqual(rows, [
	['HDR', 'h1', 'h2'],
	['1', '2'],
	['x,y', '4'],
]);
console.log('forEachCsvRow ✓');

// --- resolveGtfsStop (parent + platforms) -----------------------------------
// Mimic the real structure: one parent station with platform children.
const index = {
	stops: new Map([
		['199571', {name: 'Dortmund Hbf', parent: null}],
		['221203', {name: 'Dortmund Hbf', parent: '199571'}],
		['547755', {name: 'Dortmund Hbf', parent: '199571'}],
		['343902', {name: 'Dortmund Reinoldikirche', parent: null}],
		['582478', {name: 'Dortmund Reinoldikirche', parent: '343902'}],
	]),
	idsByName: new Map([
		['dortmund hbf', ['199571', '221203', '547755']],
		['dortmund reinoldikirche', ['343902', '582478']],
	]),
	childIds: new Map([
		['199571', ['221203', '547755']],
		['343902', ['582478']],
	]),
};

const byName = resolveGtfsStop(index, 'Dortmund Hbf');
assert.equal(byName.primaryId, '199571');
assert.equal(byName.name, 'Dortmund Hbf');
// Must include the parent AND both platform children.
assert.equal(byName.stopIds.size, 3);
assert.ok(byName.stopIds.has('199571') && byName.stopIds.has('221203') && byName.stopIds.has('547755'));
console.log('resolveGtfsStop by name → parent+platforms ✓');

// Numeric id passthrough: a parent id expands to its children too.
const byId = resolveGtfsStop(index, '199571');
assert.equal(byId.primaryId, '199571');
assert.equal(byId.stopIds.size, 3);
assert.ok(byId.stopIds.has('221203'));

// A platform id passthrough stays itself (no phantom siblings).
const byPlatform = resolveGtfsStop(index, '582478');
assert.equal(byPlatform.primaryId, '582478');
assert.ok(byPlatform.stopIds.has('582478'));
console.log('resolveGtfsStop by id (parent expands, platform stays) ✓');

// Case-insensitive + substring fallback.
assert.ok(resolveGtfsStop(index, 'reinoldikirche'));
assert.equal(resolveGtfsStop(index, 'Nonexistent Stop'), null);
console.log('resolveGtfsStop fuzzy + miss ✓');

console.log('\nall GTFS-RT unit tests passed ✓');
