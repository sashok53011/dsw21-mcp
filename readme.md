# dsw21-mcp

**Realtime delay information for DSW21 (Dortmunder Stadtwerke) in Dortmund / VRR — and Deutsche Bahn long-distance trains — as an MCP server.**

[English](readme.md) · [Deutsch](readme.de.md) · [Русский](readme.ru.md)

An MCP ([Model Context Protocol](https://modelcontextprotocol.io)) server that any MCP-capable AI client (Claude Desktop, hermes-agent, OpenCode, LM Studio, …) can call to answer questions like *"Is my tram to Dortmund delayed?"*, *"Which ICE from Berlin Hbf is late?"* or *"Are there disruptions on DSW21 lines today?"*.

## Two independent data sources

| | **GTFS-RT (DSW21 & local transit)** | **Deutsche Bahn (long distance)** |
|---|---|---|
| Tools | `dsw21_delays`, `gtfs_rt_delays`, `gtfs_rt_alerts` | `search_stations`, `nearby_stations`, `station_delays`, `station_arrivals`, `trip_delays`, `find_journeys` |
| Source | free GTFS-RT stream [realtime.gtfs.de](https://gtfs.de/en/realtime/) (DELFi/gtfs.de, CC BY-SA 4.0) | DB "vendo"/"movas" APIs via [`db-vendo-client`](https://github.com/public-transport/db-vendo-client) |
| Covers | **DSW21** trams/buses, U-Bahn, regional — Dortmund & whole VRR | ICE/IC/EC, RE/RB, S-Bahn — all of Germany |
| Needs API key | no | no (except optional `dbris` profile) |
| Availability | stable, updates every 10 s | DB sometimes blocks IPs (`HTTP 452`) — DB tools degrade gracefully, GTFS-RT tools keep working |

Because the two backends are independent, **DSW21 delay queries keep working even when Deutsche Bahn blocks the server** — that is the recommended way to get Dortmund data.

## All tools at a glance

| Tool | What it does |
|---|---|
| `dsw21_delays` | Realtime delays for DSW21 stops in Dortmund (convenience wrapper, defaults to *Dortmund Hbf*). |
| `gtfs_rt_delays` | Realtime delays for **any** local-transit stop in the GTFS-RT feed (VRR and beyond) by name or numeric id. |
| `gtfs_rt_alerts` | Service alerts / disruptions affecting DSW21 trips, with human-readable texts. |
| `search_stations` | Find a DB station by name → EVA id, coordinates. |
| `nearby_stations` | DB stations near a WGS84 coordinate, sorted by distance. |
| `station_delays` | Live DB **departure** board: delays, cancellations, platforms, remarks. |
| `station_arrivals` | Live DB **arrival** board, same fields. |
| `trip_delays` | One DB train along its **whole route**: per-stop planned vs expected, delay in minutes, platform changes. |
| `find_journeys` | DB connections A→B with **per-leg delays**, cancellations, platforms, remarks. |

Every tool accepts an optional **`language`** parameter (`"en"` or `"de"`) that switches status words (`on time`/`pünktlich`, `delayed`/`Verspätung`, `cancelled`/`fällt aus`) and error messages. JSON field names stay stable across languages.

---

# 1. Installation & deployment

The server is a plain Node.js application speaking **MCP over stdio** — your AI client launches it automatically when needed, no daemon to keep running. For always-on hosts there is an **HTTP mode** (Streamable HTTP, section 1.4) for remote clients like phone apps. You install it once per machine.

**Requirements (all platforms):** Node.js ≥ 18 (tested on Node 24), internet access, ~50 MB disk for `node_modules` plus the static GTFS index cache.

<details>
<summary><b>Table of contents</b></summary>

- [1.1 Windows](#11-windows)
- [1.2 Linux](#12-linux)
- [1.3 Android (Termux)](#13-android-termux)
- [1.4 HTTP mode (Streamable HTTP)](#14-http-mode-streamable-http)
- [2. MCP client configuration](#2-mcp-client-configuration)
  - [2.1 Claude Desktop & Claude Code](#21-claude-desktop--claude-code)
  - [2.2 hermes-agent (NousResearch)](#22-hermes-agent-nousresearch)
  - [2.3 OpenCode](#23-opencode)
  - [2.4 LM Studio](#24-lm-studio)
  - [2.5 Universal config (Cursor, Windsurf, Cline, …)](#25-universal-config-cursor-windsurf-cline-)
  - [2.6 Quick stdio self-test](#26-quick-stdio-self-test)
  - [2.7 OmniChat Android app (HTTP)](#27-omnichat-android-app-http)
- [3. Environment variables](#3-environment-variables)
- [4. Usage examples for every tool](#4-usage-examples-for-every-tool)
- [5. Typical question → tool recipes](#5-typical-question--tool-recipes)
- [6. Known limitations](#6-known-limitations)
- [7. Troubleshooting](#7-troubleshooting)
- [8. Development](#8-development)
- [9. Data sources & license](#9-data-sources--license)

</details>

## 1.1 Windows

**Step 1 — install prerequisites** (PowerShell, as administrator not required):

```powershell
# Git (skip if already installed)
winget install --id Git.Git -e

# Node.js LTS (skip if "node --version" already prints v18+)
winget install --id OpenJS.NodeJS.LTS -e
```

Restart the PowerShell window afterwards so `git`/`node` are on `PATH`, then verify: `git --version`, `node --version`.

**Step 2 — clone and install:**

```powershell
cd D:\mcp5
git clone https://github.com/sashok53011/dsw21-mcp.git
cd dsw21-mcp
npm install
```

**Step 3 — verify:**

```powershell
npm test        # offline tests + tool registration
npm run test:gtfsrt   # optional: live DSW21 data check (~18 MB index download)
```

Expected: `smoke test passed ✓` listing all nine tools.

**Windows notes**

* In JSON configs use **forward slashes** in paths (`D:/mcp5/db/dsw21-mcp/src/index.js`) — they work everywhere and avoid backslash escaping.
* The GTFS index cache is created in `D:\mcp5\db\dsw21-mcp\.gtfs-index` (change with `GTFS_INDEX_DIR`).
* Optional: make `dsw21-mcp` a global command — `npm link` — then you can use `"command": "dsw21-mcp"` in client configs without paths.

## 1.2 Linux

**Step 1 — install prerequisites** (Debian/Ubuntu shown; for Fedora `dnf install git nodejs`, for Arch `pacman -S git nodejs npm`):

```bash
sudo apt update && sudo apt install -y git nodejs npm
```

If your distro ships Node < 18, use [NodeSource](https://github.com/nodesource/distributions) or nvm instead:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs
```

**Step 2 — clone and install:**

```bash
git clone https://github.com/sashok53011/dsw21-mcp.git
cd dsw21-mcp
npm install
```

**Step 3 — verify:**

```bash
npm test                # offline tests + tool registration
npm run test:gtfsrt     # optional: live DSW21 data check
```

**Linux deployment notes**

* A stdio MCP server does **not** run as a service — the client starts it per session and stops it automatically. Nothing to add to systemd.
* If you manage your client's config in dotfiles, keep the server path absolute: `/home/<user>/dsw21-mcp/src/index.js`.
* Headless machine (VPS/home server): clone to e.g. `/opt/dsw21-mcp`, run `npm install --omit=dev`, and point your remote-capable MCP client at the absolute path.

## 1.3 Android (Termux)

On Android the server runs inside [**Termux**](https://termux.dev) (install from **F-Droid** — the Play Store build is outdated).

**Step 1 — install Termux and packages:**

```bash
pkg update && pkg upgrade
pkg install nodejs git
node --version    # must print v18+
```

**Step 2 — clone and install:**

```bash
git clone https://github.com/sashok53011/dsw21-mcp.git
cd dsw21-mcp
npm install
npm test
```

The project then lives at `/data/data/com.termux/files/home/dsw21-mcp`.

**Step 3 — run / pair with a client:**

```bash
node src/index.js    # MCP stdio server; used by Termux-compatible agents
```

**Android notes & limits**

* The **Claude / ChatGPT phone apps cannot launch local stdio servers** — mobile cloud apps only support *remote* (HTTP) MCP servers, while the default entry of `dsw21-mcp` is stdio. On a phone, either pair it with agents that run *inside Termux* (or any client that can spawn `node` locally), or deploy the HTTP mode (section 1.4) on a server and connect remotely.
* Recommended for phone use: run `dsw21-mcp` in HTTP mode (section 1.4) on your PC/server (Windows/Linux sections above) and connect from any MCP app over `https://`; the DSW21 data itself is identical.
* Keep Termux alive during long sessions: `termux-wake-lock`. Autostart on boot: the [Termux:Boot](https://github.com/termux/termux-boot) add-on.
* First GTFS-RT call downloads the ~18 MB index; on mobile networks this may take a moment.

## 1.4 HTTP mode (Streamable HTTP)

`src/http.js` serves the same nine tools over [Streamable HTTP](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#streamable-http) for always-on hosts — a home server, FreedomBox or VPS behind a reverse proxy / Cloudflare tunnel. Mobile apps (e.g. the OmniChat Android app) can only reach *remote* MCP servers, so this is the mode to use from a phone.

```bash
npm run start:http          # listens on 127.0.0.1:8003, endpoint /mcp (+ /health)
```

* `MCP_HTTP_PORT` — listen port (default `8003`; `0` = OS-assigned).
* `MCP_HTTP_HOST` — bind address (default `127.0.0.1`; keep localhost when a reverse proxy or `cloudflared` tunnel on the same host publishes the public URL).
* Sessions are stateful per spec: `initialize` mints an `Mcp-Session-Id`, later requests carry it back, `DELETE` terminates it; sessions idle for over an hour are swept automatically (crashed clients don't leak).
* `GET /health` answers `ok` for monitoring; the MCP endpoint is `/mcp`.

**systemd (Linux / FreedomBox / NAS):**

```ini
# /etc/systemd/system/dsw21-mcp.service
[Unit]
Description=dsw21-mcp (MCP over Streamable HTTP)
After=network.target

[Service]
WorkingDirectory=/opt/dsw21-mcp
ExecStart=/usr/bin/node src/http.js
Environment=MCP_HTTP_PORT=8003
Environment=DB_USER_AGENT=my-app (https://example.org; me@example.org)
Environment=DB_LANG=de
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now dsw21-mcp
curl http://127.0.0.1:8003/health    # → ok
```

**Public access (Cloudflare tunnel example):** publish a hostname at the local port — no open inbound ports:

| Hostname | Service |
|---|---|
| `dsw21-mcp.example.com` | `http://localhost:8003` |

The MCP endpoint then is `https://dsw21-mcp.example.com/mcp`. Reverse-proxy notes: pass the `Mcp-Session-Id` header and `POST`/`DELETE` methods through, disable response buffering for `text/event-stream` (nginx: `proxy_buffering off; proxy_read_timeout 110s`), and mind Cloudflare's free-tier 100 s idle timeout — build the GTFS index once after every (re)start so the first real call stays fast.

---

# 2. MCP client configuration

You need three things: the **absolute path** to `src/index.js` on your machine, the **environment variables**, and the client-specific config block. Adjust all example paths to your OS (see the per-OS sections above).

## 2.1 Claude Desktop & Claude Code

**Claude Desktop** config file:

| OS | Path |
|---|---|
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Linux | `~/.config/Claude/claude_desktop_config.json` |

Merge (create if missing) and **fully restart Claude Desktop**:

```json
{
  "mcpServers": {
    "dsw21-mcp": {
      "command": "node",
      "args": ["D:/mcp5/db/dsw21-mcp/src/index.js"],
      "env": {
        "DB_USER_AGENT": "my-app (https://example.org; me@example.org)",
        "DB_LANG": "en"
      }
    }
  }
}
```

Linux/macOS variant:

```json
{
  "mcpServers": {
    "dsw21-mcp": {
      "command": "node",
      "args": ["/home/user/dsw21-mcp/src/index.js"],
      "env": { "DB_USER_AGENT": "my-app (https://example.org; me@example.org)" }
    }
  }
}
```

**Claude Code** (CLI) — add server and environment in one command:

```bash
claude mcp add dsw21-mcp -e DB_USER_AGENT="my-app (me@example.org)" -- node /home/user/dsw21-mcp/src/index.js
```

(Windows: `claude mcp add dsw21-mcp -e DB_USER_AGENT="my-app (me@example.org)" -- node D:/mcp5/db/dsw21-mcp/src/index.js`; manage with `claude mcp list` / `claude mcp remove dsw21-mcp`.)

After setup the tools appear under the hammer/wrench icon (Desktop) or via `/mcp` (Code). Ask e.g. *"Is the Dortmund tram delayed right now?"*.

## 2.2 hermes-agent (NousResearch)

hermes-agent reads MCP servers from **`config.yaml`**, block `mcp_servers`. Config file location:

| OS | Path |
|---|---|
| Windows | `%LOCALAPPDATA%\hermes\config.yaml` (e.g. `C:\Users\alex\AppData\Local\hermes\config.yaml`) |
| Linux / macOS | `~/.hermes/config.yaml` |

Add a block matching your OS (this mirrors the format of existing entries in a real config):

**Windows** — use full paths, including `node.exe` (hermes does not always inherit your `PATH`):

```yaml
mcp_servers:
  dsw21-mcp:
    command: C:/Users/alex/AppData/Local/Programs/nodejs/node.exe
    args:
      - D:/mcp5/db/dsw21-mcp/src/index.js
    env:
      DB_USER_AGENT: "my-app (https://example.org; me@example.org)"
      DB_LANG: "en"
    timeout: 300
```

**Linux / macOS:**

```yaml
mcp_servers:
  dsw21-mcp:
    command: node
    args:
      - /home/user/dsw21-mcp/src/index.js
    env:
      DB_USER_AGENT: "my-app (https://example.org; me@example.org)"
      DB_LANG: "en"
    timeout: 300
```

> `timeout: 300` (seconds) is recommended: the very first GTFS-RT call downloads the ~18 MB static index, which can otherwise exceed a short default timeout.

Useful extras:

* **Hot reload:** after editing the YAML, run `/reload-mcp` in the session — no restart needed.
* **Import from Claude Code:** `hermes import-agent claude-code` migrates an existing `mcpServers` block (plus skills/instructions) automatically.
* **From the terminal:** hermes-agent ships the `mcporter` skill, e.g. `mcporter call dsw21-mcp.dsw21_delays stop="Dortmund Hbf" --output json`.

## 2.3 OpenCode

Project file `.opencode.json` (or global `~/.config/opencode/opencode.json`):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "dsw21-mcp": {
      "type": "local",
      "command": ["node", "D:/mcp5/db/dsw21-mcp/src/index.js"],
      "environment": {
        "DB_USER_AGENT": "my-app (https://example.org; me@example.org)",
        "DB_LANG": "en"
      },
      "enabled": true
    }
  }
}
```

Note the differences to Claude's format: `command` is an **array** (binary + args together) and env vars live under `environment`. Or add it from the CLI:

```bash
opencode mcp add dsw21-mcp -- node D:/mcp5/db/dsw21-mcp/src/index.js
```

## 2.4 LM Studio

LM Studio uses **`mcp.json`** in Cursor notation:

* Windows: `%USERPROFILE%\.lmstudio\mcp.json`
* Linux / macOS: `~/.lmstudio/mcp.json`

Easiest way to edit: in LM Studio open the **Program tab (`>_` icon, right sidebar) → Install → Edit mcp.json** (in-app editor; the file is loaded automatically on save).

```json
{
  "mcpServers": {
    "dsw21-mcp": {
      "command": "node",
      "args": ["/home/user/dsw21-mcp/src/index.js"],
      "env": {
        "DB_USER_AGENT": "my-app (https://example.org; me@example.org)",
        "DB_LANG": "en"
      }
    }
  }
}
```

**Important:** enable **Settings → Server → "Allow calling servers from mcp.json"**, otherwise servers from the file are not executed. The tools then appear under **Program → Integrations**. Use a function-calling-capable local model (e.g. Qwen, Llama 3+, Mistral) or a remote API model for reliable tool use.

## 2.5 Universal config (Cursor, Windsurf, Cline, …)

Most MCP clients use the same **Claude-compatible `mcpServers` shape** (`command` + `args` + `env`) — the block from [2.1](#21-claude-desktop--claude-code) pastes unchanged into:

| Client | Config location |
|---|---|
| Cursor | `.cursor/mcp.json` (project) or `~/.cursor/mcp.json` (global) |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` |
| Cline (VS Code extension) | Settings → MCP → *Edit Config* (`cline_mcp_settings.json`) |
| Zed | `~/.config/zed/settings.json` → `"context_servers"` |
| Any other stdio client | `{"command": "node", "args": ["/abs/path/src/index.js"], "env": {...}}` |

Universal single-line check — every stdio client ultimately runs a command like this, so it must work first:

```bash
DB_USER_AGENT="my-app (me@example.org)" node /home/user/dsw21-mcp/src/index.js
```

You should see `[dsw21-mcp] ready (DB profile: dbnav, lang: en)` on stderr. The process then waits for MCP messages on stdin (that is normal — `Ctrl+C` to exit).

## 2.6 Quick stdio self-test

To prove the server answers MCP requests without any client, pipe an `initialize` + `tools/list` JSON-RPC sequence:

```bash
(printf '%s\n' \
 '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"probe","version":"0"}}}' \
 '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
 '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'; sleep 2) | node src/index.js
```

The response contains all nine tools — proof the integration is ready.

## 2.7 OmniChat Android app (HTTP)

The OmniChat Android app speaks MCP over Streamable HTTP and can drive dsw21-mcp fully remotely:

1. Run the server in HTTP mode (section 1.4) and publish it (reverse proxy / Cloudflare tunnel).
2. In the app: **MCP tab → HTTP →** name `dsw21-mcp`, URL `https://dsw21-mcp.example.com/mcp` → add → **Connect**.
3. The app performs `initialize` + `tools/list` and syncs all nine tools; enable/disable tools individually and ask e.g. *"Is the Dortmund tram delayed right now?"*.

The phone needs no local runtime — everything runs on the server. The first GTFS-RT call builds the ~18 MB index server-side (pre-warm it after deploy, see 1.4).

---

# 3. Environment variables

| Variable | Default | Meaning |
|---|---|---|
| `DB_USER_AGENT` | *(unset)* | **Recommended.** Deutsche Bahn asks for a User-Agent identifying/contacting you, e.g. `my-app (https://example.org; me@example.org)`. Placeholder values are rejected; without it the server logs a warning and uses a fallback. |
| `DB_PROFILE` | `dbnav` | DB API profile: `dbnav` (most stable), `db`, `dbweb`, `dbris` (needs `DB_API_KEY`, boards up to 12 h). |
| `DB_API_KEY` | *(unset)* | Only for `DB_PROFILE=dbris` — key from the [DB API Marketplace](https://developers.deutschebahn.com/). |
| `DB_LANG` | `en` | Default output language (`en`/`de`) when a call omits `language`. |
| `DB_REQUESTS_PER_MINUTE` | `30` | Client-side throttle (DB documents ~60 req/min for `dbnav`). |
| `GTFS_RT_FEED_URL` | `https://realtime.gtfs.de/realtime-free.pb` | GTFS-RT stream for the DSW21/local-transit tools. |
| `GTFS_INDEX_DIR` | `./.gtfs-index` | Cache directory for the static-GTFS index. |
| `MCP_HTTP_PORT` | `8003` | Listen port of the HTTP mode (`npm run start:http`; `0` = OS-assigned). |
| `MCP_HTTP_HOST` | `127.0.0.1` | Bind address of the HTTP mode. |

How to set them per client: Claude Desktop / LM Studio / universal → `"env"` block in JSON; hermes-agent → `env:` in YAML; OpenCode → `"environment"`; or export in the shell before launching (`export DB_LANG=de`, PowerShell: `$env:DB_LANG="de"`).

---

# 4. Usage examples for every tool

Examples show the tool's JSON **arguments** and a **representative response**. GTFS-RT responses below are real captures from 2026-10-19; DB responses are illustrative (field-accurate) — actual values depend on time of day, and availability depends on whether DB blocks your IP.

### 4.1 `dsw21_delays` — DSW21 delays at a Dortmund stop

Best starting point for Dortmund. Defaults to *Dortmund Hbf*; resolves the station to **all its platforms** (the realtime feed references platform-level ids — see `stopIdCount`).

**Arguments**

| Arg | Type | Default | Description |
|---|---|---|---|
| `stop` | string | `"Dortmund Hbf"` | Dortmund stop name or numeric GTFS id. |
| `minutes` | int 5–180 | `60` | Time window from now. |
| `language` | `"en"`/`"de"` | `en` | Status word language. |

**Call**

```json
{"name": "dsw21_delays", "arguments": {"stop": "Dortmund Hbf", "minutes": 90, "language": "de"}}
```

**Response (real)**

```json
{
  "source": "GTFS-RT (realtime.gtfs.de)",
  "operator": "DSW21 (Dortmunder Stadtwerke)",
  "stop": "Dortmund Hbf",
  "stopId": "199571",
  "stopIdCount": 14,
  "count": 6,
  "departures": [
    {
      "stopId": "547755", "stopName": "Dortmund Hbf", "tripId": "694037",
      "line": "400", "headsign": null,
      "scheduled": "2026-10-19T10:45:35.000Z",
      "expected":  "2026-10-19T10:46:10.000Z",
      "delayMin": 1, "status": "Verspätung"
    },
    {
      "stopId": "343399", "stopName": "Dortmund Hbf", "tripId": "584030",
      "line": "412", "headsign": null,
      "scheduled": "2026-10-19T10:55:34.000Z",
      "expected":  "2026-10-19T10:58:08.000Z",
      "delayMin": 3, "status": "Verspätung"
    },
    {
      "stopId": "462694", "stopName": "Dortmund Hbf", "tripId": "1601850",
      "line": "U45", "headsign": null,
      "scheduled": "2026-10-19T10:56:05.000Z",
      "expected":  "2026-10-19T10:57:34.000Z",
      "delayMin": 1, "status": "Verspätung"
    }
  ]
}
```

More calls:

```json
{"name": "dsw21_delays", "arguments": {"stop": "Dortmund Reinoldikirche", "language": "en"}}
{"name": "dsw21_delays", "arguments": {"stop": "Dortmund Hörde Bf", "minutes": 30}}
{"name": "dsw21_delays", "arguments": {"stop": "334656"}}
```

> `headsign` (direction) is `null` by design: the gtfs.de local-transit schedule ships no `trip_headsign`. The **line number** comes from `routes.txt`.

### 4.2 `gtfs_rt_delays` — any local-transit stop

Same data, but works for **every** stop in the GTFS-RT feed (whole VRR, and other regions too), with more filters.

**Arguments**

| Arg | Type | Default | Description |
|---|---|---|---|
| `stop` | string **required** | – | Stop name or numeric GTFS id. |
| `minutes` | int 5–180 | `60` | Time window from now. |
| `minDelay` | int 0–60 | `1` | Only entries with ≥ this delay; `0` = show everything. |
| `limit` | int 1–200 | `50` | Max results. |
| `language` | `"en"`/`"de"` | `en` | Status word language. |

**Calls**

```json
{"name": "gtfs_rt_delays", "arguments": {"stop": "Dortmund Hbf", "minutes": 60, "minDelay": 0, "language": "en"}}
{"name": "gtfs_rt_delays", "arguments": {"stop": "199571", "limit": 5}}
{"name": "gtfs_rt_delays", "arguments": {"stop": "Dortmund Kreuzstraße", "minDelay": 3, "minutes": 30}}
```

**Response shape**

```json
{
  "source": "GTFS-RT (realtime.gtfs.de)",
  "feedTimestamp": "2026-10-19T10:42:20.000Z",
  "stop": "Dortmund Hbf",
  "stopId": "199571",
  "stopIdCount": 14,
  "count": 5,
  "delayedCount": 5,
  "cancelledCount": 0,
  "departures": [ { "...": "same shape as dsw21_delays" } ]
}
```

### 4.3 `gtfs_rt_alerts` — disruptions & service messages (DSW21)

Free-text service alerts affecting DSW21 trips; generic attribution notices are filtered out.

**Arguments**

| Arg | Type | Default | Description |
|---|---|---|---|
| `limit` | int 1–100 | `30` | Max alerts. |
| `language` | `"en"`/`"de"` | `en` | Label language. |

**Call**

```json
{"name": "gtfs_rt_alerts", "arguments": {"limit": 10, "language": "de"}}
```

**Response (real, truncated)**

```json
{
  "source": "GTFS-RT (realtime.gtfs.de)",
  "operator": "DSW21 (Dortmunder Stadtwerke)",
  "count": 1,
  "alerts": [
    {
      "cause": 1,
      "effect": 8,
      "header": "Linien 400, 401: Sperrung Kronprinzenstraße wegen Arbeiten an Versorgungsleitungen",
      "description": "In der Zeit von Dienstag, dem 7. April – Frühjahr 2027 muss die Kronprinzenstraße … gesperrt werden. Folgende Haltestellen entfallen: Heiliger Weg, Moltkestraße, Bismarckstraße …",
      "informedTrips": 14,
      "informedStops": []
    }
  ]
}
```

### 4.4 `search_stations` — find a DB station

**Arguments**

| Arg | Type | Default | Description |
|---|---|---|---|
| `query` | string **required** | – | Station name, e.g. `"Berlin Hbf"`. |
| `results` | int 1–20 | `5` | Max results. |
| `language` | `"en"`/`"de"` | `en` | – |

**Call**

```json
{"name": "search_stations", "arguments": {"query": "Berlin Hbf", "results": 3}}
```

**Response shape**

```json
{
  "query": "Berlin Hbf",
  "count": 1,
  "stations": [
    { "id": "8011160", "name": "Berlin Hbf", "type": "station",
      "latitude": 52.525589, "longitude": 13.369548 }
  ]
}
```

Use the returned `id` as `station`/`from`/`to` in the DB tools below (names work too — they are resolved automatically).

### 4.5 `nearby_stations` — DB stations around a coordinate

**Arguments**

| Arg | Type | Default | Description |
|---|---|---|---|
| `latitude` | number **required** | – | WGS84 latitude. |
| `longitude` | number **required** | – | WGS84 longitude. |
| `results` | int 1–20 | `8` | Max results (sorted by distance). |
| `language` | `"en"`/`"de"` | `en` | – |

**Call** (Dortmund city centre)

```json
{"name": "nearby_stations", "arguments": {"latitude": 51.5136, "longitude": 7.4653, "results": 5}}
```

**Response shape**

```json
{
  "latitude": 51.5136, "longitude": 7.4653,
  "count": 2,
  "stations": [
    { "id": "8010000", "name": "Dortmund Hbf", "distance": 650, "latitude": 51.5169, "longitude": 7.4609 }
  ]
}
```

### 4.6 `station_delays` — live DB departure board

**Arguments**

| Arg | Type | Default | Description |
|---|---|---|---|
| `station` | string **required** | – | DB station name or EVA number (e.g. `8011160` = Berlin Hbf). |
| `minutes` | int 10–120 | `30` | Window from now (profiles without API key return roughly the next hour). |
| `direction` | string | – | Only departures towards this station. |
| `products` | string[] | all | Filter: `nationalExpress`, `national`, `regionalExpress`, `regional`, `suburban`, `bus`, `ferry`, `subway`, `tram`, `taxi`. |
| `language` | `"en"`/`"de"` | `en` | – |

**Calls**

```json
{"name": "station_delays", "arguments": {"station": "Berlin Hbf", "minutes": 60}}
{"name": "station_delays", "arguments": {"station": "8011160", "products": ["nationalExpress", "national"], "language": "de"}}
{"name": "station_delays", "arguments": {"station": "Hamburg Hbf", "direction": "Köln Hbf", "minutes": 20}}
```

**Response shape**

```json
{
  "station": "Berlin Hbf",
  "kind": "departures",
  "count": 3,
  "delayedCount": 1,
  "cancelledCount": 1,
  "items": [
    {
      "line": "ICE 947", "product": "nationalExpress", "direction": "München Hbf",
      "tripId": "…|80|1052020",
      "planned": "2026-10-19T12:00:00.000Z",
      "expected": "2026-10-19T12:07:00.000Z",
      "prognosed": "2026-10-19T12:07:00.000Z",
      "delayMin": 7, "status": "delayed", "platform": "12",
      "remarks": [ { "type": "warning", "text": "Stellwechsel" } ]
    },
    {
      "line": "S 3", "product": "suburban", "direction": "Erkner",
      "planned": "2026-10-19T12:05:00.000Z", "expected": "2026-10-19T12:05:00.000Z",
      "delayMin": 0, "status": "on time", "platform": "4"
    },
    {
      "line": "RE 1", "product": "regionalExpress", "direction": "Wittenberg",
      "planned": "2026-10-19T12:10:00.000Z", "expected": null,
      "delayMin": null, "status": "cancelled", "platform": null, "cancelled": true
    }
  ]
}
```

### 4.7 `station_arrivals` — live DB arrival board

Same shape as `station_delays` (without `direction`):

```json
{"name": "station_arrivals", "arguments": {"station": "Frankfurt (M) Hbf", "minutes": 45, "language": "de"}}
```

### 4.8 `trip_delays` — one DB train, whole route

Get the `tripId` from `station_delays`/`station_arrivals`/`find_journeys`, then inspect the train end-to-end: per-stop planned vs expected times, delay propagation, platform changes, cancellations.

**Arguments**

| Arg | Type | Default | Description |
|---|---|---|---|
| `tripId` | string **required** | – | Trip id from a board or journey result. |
| `language` | `"en"`/`"de"` | `en` | – |

**Call**

```json
{"name": "trip_delays", "arguments": {"tripId": "…|80|1052020", "language": "en"}}
```

**Response shape**

```json
{
  "tripId": "…|80|1052020",
  "line": "ICE 947", "product": "nationalExpress", "direction": null,
  "origin": { "id": "8011160", "name": "Berlin Hbf" },
  "destination": { "id": "8000261", "name": "München Hbf" },
  "plannedDeparture": "2026-10-19T12:00:00.000Z",
  "expectedDeparture": "2026-10-19T12:07:00.000Z",
  "departureDelayMin": 7,
  "plannedArrival": "2026-10-19T16:00:00.000Z",
  "expectedArrival": "2026-10-19T16:25:00.000Z",
  "arrivalDelayMin": 25,
  "cancelled": false, "status": "delayed",
  "stops": 12, "delayedStops": 3,
  "stopovers": [
    {
      "stop": { "id": "8010000", "name": "Halle (Saale) Hbf" },
      "plannedArrival": "2026-10-19T13:30:00.000Z", "expectedArrival": "2026-10-19T13:40:00.000Z",
      "arrivalDelayMin": 10,
      "plannedDeparture": "2026-10-19T13:33:00.000Z", "expectedDeparture": "2026-10-19T13:43:00.000Z",
      "departureDelayMin": 10,
      "platform": "7", "status": "delayed"
    }
  ],
  "remarks": []
}
```

`delayedStops` is a quick answer to *"how far will the delay spread?"*.

### 4.9 `find_journeys` — DB connections with delays

**Arguments**

| Arg | Type | Default | Description |
|---|---|---|---|
| `from` | string **required** | – | Origin: name or EVA id. |
| `to` | string **required** | – | Destination: name or EVA id. |
| `via` | string | – | Optional intermediate station. |
| `departure` | ISO 8601 | now | Planned departure time, e.g. `"2026-10-19T17:00:00+02:00"`. |
| `transfers` | int 0–6 | – | Max transfers. |
| `results` | int 1–8 | `3` | Number of connections. |
| `products` | string[] | all | Same product ids as `station_delays`. |
| `language` | `"en"`/`"de"` | `en` | – |

**Calls**

```json
{"name": "find_journeys", "arguments": {"from": "Berlin Hbf", "to": "München Hbf", "results": 2}}
{"name": "find_journeys", "arguments": {"from": "8011160", "to": "8000261", "departure": "2026-10-19T17:00:00+02:00", "transfers": 0}}
{"name": "find_journeys", "arguments": {"from": "Köln Hbf", "to": "Dortmund Hbf", "products": ["nationalExpress", "regionalExpress"], "language": "de"}}
```

**Response shape**

```json
{
  "from": "Berlin Hbf", "to": "München Hbf", "count": 1,
  "journeys": [
    {
      "status": "delayed",
      "maxDelayMin": 10,
      "cancelled": false,
      "legs": [
        { "type": "walking", "from": { "id": "8011160", "name": "Berlin Hbf" },
          "to": { "id": "8011160", "name": "Berlin Hbf" },
          "plannedDeparture": "2026-10-19T12:00:00.000Z" },
        {
          "type": "public", "line": "ICE 947", "product": "nationalExpress",
          "tripId": "…|80|1052020",
          "from": { "id": "8011160", "name": "Berlin Hbf" },
          "to":   { "id": "8000261", "name": "München Hbf" },
          "plannedDeparture": "2026-10-19T12:05:00.000Z",
          "expectedDeparture": "2026-10-19T12:15:00.000Z",
          "departureDelayMin": 10, "departurePlatform": "12",
          "plannedArrival": "2026-10-19T16:00:00.000Z",
          "expectedArrival": "2026-10-19T16:00:00.000Z",
          "arrivalDelayMin": 0, "arrivalPlatform": "22",
          "cancelled": false, "status": "delayed",
          "remarks": []
        }
      ],
      "refreshToken": "…"
    }
  ]
}
```

---

# 5. Typical question → tool recipes

| User question | Tool call |
|---|---|
| *"Is the Dortmund tram delayed right now?"* | `dsw21_delays {"stop": "Dortmund Hbf", "minutes": 30}` |
| *"How late is the U45 from Reinoldikirche?"* | `dsw21_delays {"stop": "Dortmund Reinoldikirche", "minutes": 30}` |
| *"Any disruptions on DSW21 today?"* | `gtfs_rt_alerts {"limit": 10}` |
| *"All delayed departures at Dortmund Hbf in the next 2 h"* | `gtfs_rt_delays {"stop": "Dortmund Hbf", "minutes": 120, "minDelay": 1}` |
| *"Is the ICE from Berlin to Munich on time?"* | `find_journeys {"from": "Berlin Hbf", "to": "München Hbf"}` → `trip_delays {tripId from the leg}` |
| *"How late will my train arrive here?"* | `station_delays {"station": "Erfurt Hbf", "minutes": 60}` → `trip_delays {tripId}` |
| *"Which stations are near me?"* | `nearby_stations {"latitude": …, "longitude": …}` |

# 6. Known limitations

**GTFS-RT / DSW21**
* **No platform/track changes** — the GTFS-RT format carries delays and cancellations (`SKIPPED`/`NO_DATA`) only; platforms are static-schedule data.
* **No direction (`headsign`)** for DSW21 — the gtfs.de local-transit `trips.txt` ships only `route_id,service_id,trip_id`.
* **First call builds a static index** (~18 MB download via HTTP Range, a few seconds, then cached 24 h in `GTFS_INDEX_DIR`).
* gtfs.de notes **buses in the VRR feed as incomplete**; tram/rail (DSW21 U- and tram lines) are the reliable part.

**Deutsche Bahn**
* DB **rate-limits and intermittently blocks clients** (`HTTP 452 "OPS_BLOCKED"`, sometimes `403`). This server caches aggressively (boards 30 s, journeys 60 s, locations 6 h), throttles requests and returns a **clear localized error** instead of crashing — but upstream blocking is outside its control. The DSW21/GTFS-RT tools are unaffected.
* Boards cover roughly the **next hour** without an API key (`dbris` profile + `DB_API_KEY`: up to 12 h).
* Legally, using the DB APIs formally requires permission from Deutsche Bahn; set a `DB_USER_AGENT` identifying you.

# 7. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `Deutsche Bahn is currently blocking requests … HTTP 452` | DB blocks your IP. Wait, switch `DB_PROFILE`, run from another network — or use the GTFS-RT tools (they are independent). |
| `[dsw21-mcp] Warning: DB_USER_AGENT is not set …` | Set `DB_USER_AGENT` to something identifying, e.g. `my-app (me@example.org)`. |
| `Building the static GTFS index for the first time …` | Normal on the very first GTFS-RT call; retry in ~30 s. Later calls hit the 24 h cache. |
| `No stop found for "…" in the static GTFS index` | Use the exact gtfs.de name (e.g. `"Dortmund Hbf"`) or the numeric stop id. |
| `Could not build/load the static GTFS index …` | No internet access to `download.gtfs.de`, or the archive layout changed. Retry; check `npm run test:gtfsrt`. |
| Client shows no tools | Check the absolute path in the config, that `npm install` succeeded, and restart the client fully. |
| LM Studio ignores the server | Enable **Settings → Server → "Allow calling servers from mcp.json"**; check Program → Integrations. |
| Tests fail after `git clone` | Run `npm install` first. |
| On Android: client app cannot see the server | Mobile cloud apps (Claude/ChatGPT) only support *remote* MCP; run agents inside Termux or host the server on a PC. |

# 8. Development

```bash
npm test            # offline: formatter + GTFS unit tests + stdio smoke test
npm run test:gtfsrt # live: builds index, queries real DSW21 delays (network)
npm start           # run the MCP server on stdio
```

Layout:

```
dsw21-mcp/
├── src/
│   ├── index.js          # entry: stdio transport + tool registration
│   ├── client.js         # db-vendo-client wrapper: profile, throttle, cache, errors
│   ├── cache.js          # in-memory TTL cache
│   ├── format.js         # compact FPTF → LLM-friendly JSON
│   ├── i18n.js           # en/de strings
│   ├── gtfs/
│   │   ├── zip.js        # read single files out of a remote 236 MB zip via HTTP Range
│   │   ├── csv.js        # GTFS CSV parser
│   │   ├── index.js      # static-GTFS index build + disk cache (~18 MB)
│   │   └── feed.js       # GTFS-RT feed: fetch, decode, join
│   └── tools/
│       ├── gtfs-rt.js    # dsw21_delays, gtfs_rt_delays, gtfs_rt_alerts
│       ├── stations.js   # search_stations, nearby_stations
│       ├── departures.js # station_delays, station_arrivals
│       ├── trip.js       # trip_delays
│       └── journeys.js   # find_journeys
└── test/
    ├── format.test.js    # offline formatter tests
    ├── gtfs.test.js      # offline CSV + stop-resolution tests
    ├── gtfsrt-live.js    # live GTFS-RT pipeline test
    └── smoke.js          # MCP stdio tool-registration test
```

# 9. Data sources & license

* GTFS-RT stream & static schedule: [gtfs.de](https://gtfs.de/en/realtime/) — CC BY-SA 4.0 / CC BY 4.0, provided by DELFI e.V. and regional agencies; **without any guarantee**. Please respect the [Transitous usage policy](https://transitous.org/api/) for alternative access paths.
* Deutsche Bahn data via [db-vendo-client](https://github.com/public-transport/db-vendo-client) (ISC license) — unofficial, see its readme for caveats.
* This server: ISC license. Repository: https://github.com/sashok53011/dsw21-mcp
