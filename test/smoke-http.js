// Smoke test for the HTTP entry (src/http.js): starts the server on an
// ephemeral port, connects with the SDK's Streamable HTTP client, and checks
// the same invariants as the stdio smoke test (three tools, language param).
// Fully offline — no GTFS-RT calls.

import {spawn} from 'node:child_process';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const START_TIMEOUT_MS = 10_000;

const EXPECTED = ['current_location', 'dsw21_delays', 'gtfs_rt_alerts', 'gtfs_rt_delays', 'nearby_stops', 'plan_journey', 'stop_departures', 'trip_status'];

const main = async () => {
	const child = spawn(process.execPath, ['src/http.js'], {
		env: {...process.env, MCP_HTTP_PORT: '0'},
		stdio: ['ignore', 'inherit', 'pipe'],
	});

	try {
		const url = await new Promise((resolve, reject) => {
			const timer = setTimeout(
				() => reject(new Error(`server did not start within ${START_TIMEOUT_MS} ms`)),
				START_TIMEOUT_MS,
			);
			let stderr = '';
			child.stderr.setEncoding('utf8');
			child.stderr.on('data', (chunk) => {
				stderr += chunk;
				const match = stderr.match(/http ready on (http:\/\/\S+\/mcp)/);
				if (match) {
					clearTimeout(timer);
					resolve(match[1]);
				}
			});
			child.on('exit', (code) => {
				clearTimeout(timer);
				reject(new Error(`server exited early (code ${code}):\n${stderr}`));
			});
		});
		console.log('server up:', url);

		const client = new Client({name: 'dsw21-mcp-http-smoke', version: '0.0.1'});
		await client.connect(new StreamableHTTPClientTransport(new URL(url)));

		const {tools} = await client.listTools();
		const names = tools.map((t) => t.name).sort();
		console.log('tools:', names.join(', '));

		const missing = EXPECTED.filter((n) => !names.includes(n));
		if (missing.length) {
			throw new Error(`missing tools: ${missing.join(', ')}`);
		}
		console.log('all expected tools registered ✓');

		// Every tool must declare a language enum (en/de) for bilingual output.
		for (const tool of tools) {
			if (!(tool.inputSchema?.properties || {}).language) {
				throw new Error(`tool ${tool.name} has no language param`);
			}
		}
		console.log('all tools expose a language (en/de) parameter ✓');

		// Closing the client sends DELETE with the Mcp-Session-Id; the server
		// must answer without error (session cleanup path).
		await client.close();
		console.log('session DELETE accepted ✓');
	} finally {
		child.kill();
	}

	console.log('http smoke test passed ✓');
	process.exit(0);
};

main().catch((err) => {
	console.error('http smoke test failed:', err);
	process.exit(1);
});
