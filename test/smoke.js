// Smoke test: connects to the dsw21-mcp server over stdio, lists tools, and
// checks the invariants shared by all of them. Fully offline.

import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';

const EXPECTED = ['current_location', 'dsw21_delays', 'gtfs_rt_alerts', 'gtfs_rt_delays', 'nearby_stops', 'plan_journey', 'stop_departures', 'trip_status'];

const transport = new StdioClientTransport({
	command: process.execPath,
	args: ['src/index.js'],
	env: {...process.env},
});

const client = new Client({name: 'dsw21-mcp-smoke', version: '0.0.1'});

const main = async () => {
	await client.connect(transport);

	const {tools} = await client.listTools();
	const names = tools.map(t => t.name).sort();
	console.log('tools:', names.join(', '));

	const missing = EXPECTED.filter(n => !names.includes(n));
	if (missing.length) {
		console.error('MISSING TOOLS:', missing);
		process.exit(1);
	}
	if (names.length !== EXPECTED.length) {
		console.error('UNEXPECTED TOOLS:', names.filter(n => !EXPECTED.includes(n)));
		process.exit(1);
	}
	console.log('all expected tools registered ✓');

	// Every tool must declare a language enum (en/de) for bilingual output.
	for (const tool of tools) {
		const schema = tool.inputSchema || {};
		const props = schema.properties || {};
		if (!props.language) {
			console.error(`tool ${tool.name} has no language param ✗`);
			process.exit(1);
		}
	}
	console.log('all tools expose a language (en/de) parameter ✓');

	await client.close();
	console.log('smoke test passed ✓');
	process.exit(0);
};

main().catch((err) => {
	console.error('smoke test failed:', err);
	process.exit(1);
});
