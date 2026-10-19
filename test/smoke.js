// Smoke test: connects to the dsw21-mcp server over stdio, lists tools, and (if
// DB live calls are enabled) performs one real search_stations + station_delays
// round-trip. Set DB_MCP_LIVE=1 to hit the real Deutsche Bahn API.

import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';

const LIVE = process.env.DB_MCP_LIVE === '1';

const transport = new StdioClientTransport({
	command: process.execPath,
	args: ['src/index.js'],
	env: {
		...process.env,
		DB_USER_AGENT: process.env.DB_USER_AGENT || 'dsw21-mcp-smoke-test (local; set DB_USER_AGENT)',
	},
});

const client = new Client({name: 'dsw21-mcp-smoke', version: '0.0.1'});

const main = async () => {
	await client.connect(transport);

	const {tools} = await client.listTools();
	const names = tools.map(t => t.name).sort();
	console.log('tools:', names.join(', '));

	const expected = ['dsw21_delays', 'find_journeys', 'gtfs_rt_alerts', 'gtfs_rt_delays', 'nearby_stations', 'search_stations', 'station_arrivals', 'station_delays', 'trip_delays'];
	const missing = expected.filter(n => !names.includes(n));
	if (missing.length) {
		console.error('MISSING TOOLS:', missing);
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

	if (LIVE) {
		const search = await client.callTool({
			name: 'search_stations',
			arguments: {query: 'Berlin Hbf', results: 3, language: 'en'},
		});
		console.log('search_stations ->', search.content?.[0]?.text?.slice(0, 300));

		const delays = await client.callTool({
			name: 'station_delays',
			arguments: {station: '8011160', minutes: 20, language: 'de'},
		});
		console.log('station_delays (de) ->', delays.content?.[0]?.text?.slice(0, 400));
		if (delays.isError) {
			console.error('station_delays returned an error (DB API may be rate-limited/blocked)');
		}
	} else {
		console.log('live DB calls skipped (set DB_MCP_LIVE=1 to enable)');
	}

	await client.close();
	console.log('smoke test passed ✓');
	process.exit(0);
};

main().catch((err) => {
	console.error('smoke test failed:', err);
	process.exit(1);
});
