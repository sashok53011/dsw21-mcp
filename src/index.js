#!/usr/bin/env node
// dsw21-mcp — MCP server exposing realtime delay information for DSW21
// (Dortmunder Stadtwerke, Dortmund/VRR) via GTFS-RT, plus Deutsche Bahn
// long-distance data via db-vendo-client.
// Transport: stdio. Built directly on db-vendo-client (no HTTP proxy layer).

import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {createDbClient} from './client.js';
import {registerStationTools} from './tools/stations.js';
import {registerBoardTools} from './tools/departures.js';
import {registerTripTools} from './tools/trip.js';
import {registerJourneyTools} from './tools/journeys.js';
import {registerGtfsRtTools} from './tools/gtfs-rt.js';

const main = async () => {
	const client = createDbClient();

	const server = new McpServer({
		name: 'dsw21-mcp',
		version: '0.1.0',
	});

	registerStationTools(server, client);
	registerBoardTools(server, client);
	registerTripTools(server, client);
	registerJourneyTools(server, client);
	registerGtfsRtTools(server);

	const transport = new StdioServerTransport();
	await server.connect(transport);
	console.error(`[dsw21-mcp] ready (DB profile: ${client.profileName}, lang: ${client.language})`);
};

main().catch((err) => {
	console.error('[dsw21-mcp] fatal:', err);
	process.exit(1);
});
