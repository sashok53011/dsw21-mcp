// Shared McpServer factory used by every transport entry (src/index.js for
// stdio, src/http.js for Streamable HTTP). Keeps tool registration in one
// place so both transports always expose the same nine tools.

import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {createDbClient} from './client.js';
import {registerStationTools} from './tools/stations.js';
import {registerBoardTools} from './tools/departures.js';
import {registerTripTools} from './tools/trip.js';
import {registerJourneyTools} from './tools/journeys.js';
import {registerGtfsRtTools} from './tools/gtfs-rt.js';

/**
 * Builds a fully wired McpServer (all tools registered).
 *
 * @param {object} [client] Optional pre-built DB client — pass one in to share
 * caches/throttling across several server instances (HTTP mode); defaults to
 * a fresh client per server (stdio mode: one server per process).
 */
const createMcpServer = (client = createDbClient()) => {
	const server = new McpServer({
		name: 'dsw21-mcp',
		version: '0.1.0',
	});

	registerStationTools(server, client);
	registerBoardTools(server, client);
	registerTripTools(server, client);
	registerJourneyTools(server, client);
	registerGtfsRtTools(server);

	return {server, client};
};

export {createMcpServer};
