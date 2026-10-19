// Shared McpServer factory used by every transport entry (src/index.js for
// stdio, src/http.js for Streamable HTTP). Keeps tool registration in one
// place so both transports always expose the same three tools.

import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {registerGtfsRtTools} from './tools/gtfs-rt.js';

/**
 * Builds a fully wired McpServer (all tools registered).
 */
const createMcpServer = () => {
	const server = new McpServer({
		name: 'dsw21-mcp',
		version: '0.2.0',
	});

	registerGtfsRtTools(server);

	return {server};
};

export {createMcpServer};
