#!/usr/bin/env node
// dsw21-mcp — HTTP entry: MCP over Streamable HTTP for always-on hosts
// (home server, FreedomBox, VPS) behind a reverse proxy or Cloudflare
// tunnel. The stdio entry stays src/index.js; this file adds a long-lived
// listener so remote clients (e.g. the OmniChat Android app) can connect
// over https://<host>/mcp.
//
//   MCP_HTTP_PORT  listen port  (default 8003; 0 = OS-assigned, printed on ready)
//   MCP_HTTP_HOST  bind address (default 127.0.0.1 — keep localhost when a
//                  reverse proxy/tunnel on the same host fronts the public URL)
//
// Sessions are stateful per the Streamable HTTP spec: `initialize` mints an
// Mcp-Session-Id, later requests carry it back, `DELETE` terminates it.
// Idle sessions are swept after one hour so crashed clients don't leak.

import http from 'node:http';
import {randomUUID} from 'node:crypto';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {createMcpServer} from './server.js';
import {setLocation, currentLocation, LOCATE_PAGE, LOCATE_PAGE_PATH} from './location.js';
import {setClientIp} from './tools/location.js';

const PORT = Number(process.env.MCP_HTTP_PORT ?? 8003);
const HOST = process.env.MCP_HTTP_HOST || '127.0.0.1';
const IDLE_SESSION_TIMEOUT_MS = 60 * 60 * 1000; // 1h
const IDLE_SWEEP_INTERVAL_MS = 10 * 60 * 1000; // 10 min

/** sessionId -> {server, transport, lastSeen} */
const sessions = new Map();

const createSession = async () => {
	const {server} = createMcpServer();
	let transport; // assigned below; callbacks only run on later requests
	transport = new StreamableHTTPServerTransport({
		sessionIdGenerator: () => randomUUID(),
		onsessioninitialized: (sessionId) => {
			sessions.set(sessionId, {server, transport, lastSeen: Date.now()});
			console.error(`[dsw21-mcp] session ${sessionId} opened (${sessions.size} active)`);
		},
		onsessionclosed: (sessionId) => {
			sessions.delete(sessionId);
			transport.close().catch(() => {});
			console.error(`[dsw21-mcp] session ${sessionId} closed (${sessions.size} active)`);
		},
	});
	await server.connect(transport);
	return transport;
};

const readBody = (req) => new Promise((resolve, reject) => {
	const chunks = [];
	req.on('data', (chunk) => chunks.push(chunk));
	req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
	req.on('error', reject);
});

const sendJson = (res, status, payload) => {
	res.writeHead(status, {'Content-Type': 'application/json'}).end(JSON.stringify(payload));
};

const sendRpcError = (res, status, code, message) =>
	sendJson(res, status, {jsonrpc: '2.0', error: {code, message}, id: null});

const httpServer = http.createServer(async (req, res) => {
	const {pathname} = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

	if (pathname === '/health') {
		res.writeHead(200, {'Content-Type': 'text/plain'}).end('ok');
		return;
	}

	// Real client IP: Cloudflare tunnel passes it in Cf-Connecting-Ip; a direct
	// reverse proxy may pass X-Forwarded-For. Used by the IP-geolocation
	// fallback of current_location / nearby_stops / plan_journey.
	const clientIp = req.headers['cf-connecting-ip']
		|| String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()
		|| null;
	setClientIp(clientIp);

	if (pathname === LOCATE_PAGE_PATH) {
		if (req.method === 'GET') {
			res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'}).end(LOCATE_PAGE);
			return;
		}
		if (req.method === 'POST') {
			try {
				const raw = await readBody(req);
				const body = JSON.parse(raw || '{}');
				const lat = Number(body.lat);
				const lon = Number(body.lon);
				if (!Number.isFinite(lat) || !Number.isFinite(lon)
					|| Math.abs(lat) > 90 || Math.abs(lon) > 180) {
					sendJson(res, 400, {ok: false, error: 'invalid coordinates'});
					return;
				}
				const saved = await setLocation({lat, lon, accuracy: body.accuracy});
				console.error(`[dsw21-mcp] location updated via /locate: ${saved.lat.toFixed(5)},${saved.lon.toFixed(5)} (±${saved.accuracy ?? '?'}m)`);
				sendJson(res, 200, {ok: true});
			} catch (err) {
				console.error('[dsw21-mcp] /locate POST failed:', err?.message || err);
				sendJson(res, 500, {ok: false, error: 'storage failure'});
			}
			return;
		}
		res.writeHead(405, {Allow: 'GET, POST'}).end('Method Not Allowed');
		return;
	}

	if (pathname !== '/mcp') {
		res.writeHead(404, {'Content-Type': 'text/plain'}).end(`Not found. MCP endpoint: /mcp · location page: ${LOCATE_PAGE_PATH} · health: /health`);
		return;
	}

	try {
		if (req.method === 'POST') {
			const raw = await readBody(req);
			let body;
			try {
				body = raw ? JSON.parse(raw) : undefined;
			} catch {
				sendRpcError(res, 400, -32700, 'Parse error');
				return;
			}

			const sessionId = req.headers['mcp-session-id'];
			if (sessionId) {
				const session = sessions.get(String(sessionId));
				if (!session) {
					sendRpcError(res, 404, -32001, 'Session not found or expired');
					return;
				}
				session.lastSeen = Date.now();
				await session.transport.handleRequest(req, res, body);
				return;
			}
			// No session id — only `initialize` may open a new session.
			if (body?.method !== 'initialize') {
				sendRpcError(res, 400, -32000, 'Bad Request: no session ID provided (send initialize first)');
				return;
			}
			const transport = await createSession();
			await transport.handleRequest(req, res, body);
			return;
		}

		if (req.method === 'DELETE') {
			const sessionId = req.headers['mcp-session-id'];
			const session = sessionId && sessions.get(String(sessionId));
			if (!session) {
				sendRpcError(res, 404, -32001, 'Session not found or expired');
				return;
			}
			// The transport answers 200/202 and fires onsessionclosed.
			await session.transport.handleRequest(req, res);
			return;
		}

		// GET (standalone SSE) is not used by the supported clients; the spec
		// allows answering 405 so the client does not retry it.
		res.writeHead(405, {Allow: 'POST, DELETE'}).end('Method Not Allowed');
	} catch (err) {
		console.error('[dsw21-mcp] http request failed:', err?.message || err);
		if (!res.headersSent) sendRpcError(res, 500, -32603, 'Internal error');
		else res.end();
	}
});

// Drop sessions whose client vanished without DELETE (network loss, app kill).
setInterval(() => {
	const now = Date.now();
	for (const [id, session] of sessions) {
		if (now - session.lastSeen > IDLE_SESSION_TIMEOUT_MS) {
			console.error(`[dsw21-mcp] sweeping idle session ${id}`);
			sessions.delete(id);
			session.transport.close().catch(() => {});
		}
	}
}, IDLE_SWEEP_INTERVAL_MS).unref();

const shutdown = async (signal) => {
	console.error(`[dsw21-mcp] http received ${signal}, shutting down`);
	httpServer.close();
	for (const [id, session] of sessions) {
		sessions.delete(id);
		await session.transport.close().catch(() => {});
	}
	process.exit(0);
};
process.on('SIGINT', (signal) => shutdown(signal));
process.on('SIGTERM', (signal) => shutdown(signal));

httpServer.listen(PORT, HOST, () => {
	const actualPort = httpServer.address().port;
	console.error(
		`[dsw21-mcp] http ready on http://${HOST}:${actualPort}/mcp ` +
		`(lang: ${process.env.DB_LANG || 'en'})`
	);
});
