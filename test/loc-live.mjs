// Live check of the new location/journey tools over stdio MCP.
// The GTFS index is rebuilt once (v2 cache: now with stop coordinates).
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
	console.log(text.slice(0, 900));
	return r;
};

await call('current_location', {});
// Dortmund Hbf coords as explicit args (no GPS on this machine).
await call('nearby_stops', {latitude: 51.5169, longitude: 7.4609, radius: 600, limit: 6});
await call('plan_journey', {to: 'Dortmund Flughafen', from: 'Dortmund Hbf', results: 2});
// plan_journey without explicit from — falls back to location (env/IP).
await call('plan_journey', {to: '51.5169,7.4609', from: '51.5136,7.4653', results: 1});

await client.close();
console.log('\nlive location/journey check done');
process.exit(0);
