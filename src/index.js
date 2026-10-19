#!/usr/bin/env node
// dsw21-mcp — MCP server exposing realtime delay information for DSW21
// (Dortmunder Stadtwerke, Dortmund/VRR) via GTFS-RT, plus Deutsche Bahn
// long-distance data via db-vendo-client.
// Transport: stdio. Built directly on db-vendo-client (no HTTP proxy layer).
// For Streamable HTTP (always-on hosts) see src/http.js.

import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {createMcpServer} from './server.js';

const main = async () => {
	const {server, client} = createMcpServer();

	const transport = new StdioServerTransport();
	await server.connect(transport);
	console.error(`[dsw21-mcp] ready (DB profile: ${client.profileName}, lang: ${client.language})`);
};

main().catch((err) => {
	console.error('[dsw21-mcp] fatal:', err);
	process.exit(1);
});
