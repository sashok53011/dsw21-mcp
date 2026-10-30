// Live check of the location/journey tools over stdio MCP (network required).
// Covers v0.6.0: GPS-only location removed, MOTIS v6 plan (arriveBy), trip_status,
// stop_departures, nearby_stops.
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
	command: process.execPath,
	args: ['src/index.js'],
	env: {...process.env, DB_LANG: 'en'},
});
const client = new Client({name: 'loc-live', version: '0.0.1'});
await client.connect(transport);

const call = async (name, args) => {
	const t0 = Date.now();
	const r = await client.callTool({name, arguments: args});
	const ms = Date.now() - t0;
	const text = r.content?.[0]?.text || '';
	console.log(`\n=== ${name} (${ms} ms)${r.isError ? ' [ERROR]' : ''} ===`);
	console.log(text.slice(0, 1100));
	return {isError: !!r.isError, text};
};

// 1) nearby_stops with explicit coordinates (no server-side location anymore).
await call('nearby_stops', {latitude: 51.5169, longitude: 7.4609, radius: 600, limit: 5});

// 2) stop_departures: geocodes "Dortmund Hbf" -> MOTIS stoptimes (v6).
const dep = await call('stop_departures', {stop: 'Dortmund Hbf', minutes: 45, limit: 6});

// 3) trip_status with a tripId from the departures above (v6/trip).
let tripId = null;
try {
	const j = JSON.parse(dep.text);
	tripId = j.departures?.find(d => d.tripId)?.tripId || null;
} catch { /* keep null */ }
if (tripId) {
	await call('trip_status', {tripId});
} else {
	console.log('\n(trip_status skipped — no tripId in departures)');
}

// 4) plan_journey: v6 plan, backwards search (arriveBy), maxTransfers=0 must
//    now return DIRECT transit connections (the v1 off-by-one bug).
await call('plan_journey', {to: 'Köln Hbf', from: 'Dortmund Hbf', results: 1, maxTransfers: 0});

await client.close();
console.log('\nlive location/journey check done');
process.exit(0);

