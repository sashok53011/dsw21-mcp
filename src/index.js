#!/usr/bin/env node
// dsw21-mcp — MCP server for public transport across Germany: realtime
// delays, timetables and journeys (Transitous/MOTIS + gtfs.de GTFS-RT),
// with the DSW21 network (Dortmund) in detail.
// Transport: stdio. For Streamable HTTP (always-on hosts) see src/http.js.

import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {createMcpServer} from './server.js';

const main = async () => {
	const {server} = createMcpServer();

	const transport = new StdioServerTransport();
	await server.connect(transport);
	console.error(`[dsw21-mcp] ready (lang: ${process.env.DB_LANG || 'en'})`);
};

main().catch((err) => {
	console.error('[dsw21-mcp] fatal:', err);
	process.exit(1);
});
