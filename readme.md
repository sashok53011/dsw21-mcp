# dsw21-mcp

**Realtime delay information for DSW21 (Dortmunder Stadtwerke) in Dortmund / VRR — as an MCP server.**

[English](readme.md) · [Deutsch](readme.de.md) · [Русский](readme.ru.md)

An MCP ([Model Context Protocol](https://modelcontextprotocol.io)) server that any MCP-capable AI client (Claude Desktop, hermes-agent, OpenCode, LM Studio, …) can call to answer questions like *"Is my tram to Dortmund delayed?"*, *"How late is the U45?"* or *"Are there disruptions on DSW21 lines today?"*.

Data comes from the **free GTFS-RT stream [realtime.gtfs.de](https://gtfs.de/en/realtime/)** (DELFi/gtfs.de, CC BY-SA 4.0), updated every 10 s, joined against the static gtfs.de schedule to resolve line numbers and station names. It covers DSW21 trams/buses, U-Bahn and regional transit in Dortmund and the whole VRR.

## Tools

| Tool | What it does |
|---|---|
| `dsw21_delays` | Realtime delays for DSW21 stops in Dortmund (convenience wrapper, defaults to *Dortmund Hbf*). |
| `gtfs_rt_delays` | Realtime delays for **any** local-transit stop in the GTFS-RT feed (VRR and beyond) by name or numeric id. |
| `gtfs_rt_alerts` | Service alerts / disruptions affecting DSW21 trips, with human-readable texts. |

Every tool accepts an optional **`language`** parameter (`"en"` or `"de"`) that switches status words (`on time`/`pünktlich`, `delayed`/`Verspätung`, `cancelled`/`fällt aus`) and error messages. JSON field names stay stable across languages. The default language can be set once via `DB_LANG` (see section 3).

---

# 1. Installation & deployment

The server is a plain Node.js application speaking **MCP over stdio** — your AI client launches it automatically when needed, no daemon to keep running. For always-on hosts there is an **HTTP mode** (Streamable HTTP, section 1.4) for remote clients like phone apps. You install it once per machine.

**Requirements (all platforms):** Node.js ≥ 18 (tested on Node 24), internet access, ~30 MB disk for `node_modules` plus the static GTFS index cache.

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

Expected: `smoke test passed ✓` listing all three tools.

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
* Headless machine (VPS/home server): clone to e.g. `/opt/dsw21-mcp`, run `npm install --omit=dev`, and use the HTTP mode (section 1.4) so remote clients can connect.

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

* The **Claude / ChatGPT phone apps cannot launch local stdio servers** — mobile cloud apps only support *remote* (HTTP) MCP servers, while the default entry of `dsw21-mcp` is stdio. On a phone, either pair it with agents that run *inside Termux* (or any client that can spawn `node` locally), or deploy the HTTP mode (section 1.4) on a server and connect remotely (e.g. via the OmniChat app, section 2.7).
* Recommended for phone use: run `dsw21-mcp` in HTTP mode (section 1.4) on your PC/server (Windows/Linux sections above) and connect from any MCP app over `https://`; the data itself is identical.
* Keep Termux alive during long sessions: `termux-wake-lock`. Autostart on boot: the [Termux:Boot](https://github.com/termux/termux-boot) add-on.
* First GTFS-RT call downloads the ~18 MB index; on mobile networks this may take a moment.

## 1.4 HTTP mode (Streamable HTTP)

`src/http.js` serves the same three tools over [Streamable HTTP](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#streamable-http) for always-on hosts — a home server, FreedomBox or VPS behind a reverse proxy / Cloudflare tunnel. Mobile apps (e.g. the OmniChat Android app) can only reach *remote* MCP servers, so this is the mode to use from a phone.

```bash
npm run start:http          # listens on 127.0.0.1:8003, endpoint /mcp (+ /health)
```

* `MCP_HTTP_PORT` — listen port (default `8003`; `0` = OS-assigned).
* `MCP_HTTP_HOST` — bind address (default `127.0.0.1`; keep localhost when a reverse proxy or `cloudflared` tunnel on the same host publishes the public URL).
* Sessions are stateful per spec: `initialize` mints an `Mcp-Session-Id`, later requests carry it back, `DELETE` terminates it; sessions idle for over an hour are swept automatically (crashed clients don't leak).
* `GET /health` answers `ok` for monitoring; the MCP endpoint is `/mcp`. `GET /mcp` (standalone SSE) is not supported and answers `405` — that is normal, supported clients use `POST`.

> **Security — the `/mcp` endpoint has no built-in authentication.**
> Anyone who can reach the URL can call all tools and trigger outbound requests to gtfs.de. Therefore:
> * Keep `MCP_HTTP_HOST=127.0.0.1` and let a reverse proxy or tunnel on the same host publish the URL.
> * Publish it only behind **access control**: [Cloudflare Access](https://one.cloudflare.com/access/) in front of the tunnel, HTTP Basic Auth on the proxy, or a VPN (WireGuard/Tailscale) instead of the public internet.
> * Do **not** point a raw port with `MCP_HTTP_HOST=0.0.0.0` at the open internet.

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
Environment=DB_LANG=de
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now dsw21-mcp
curl http://127.0.0.1:8003/health    # → ok
```

On **Windows**, run it in a console (`npm run start:http`) or register a scheduled task / [NSSM](https://nssm.cc) service pointing at `node.exe D:\mcp5\db\dsw21-mcp\src\http.js`.

**Public access (Cloudflare tunnel example):** publish a hostname at the local port — no open inbound ports, and pair it with Cloudflare Access for authentication (see the security box above):

| Hostname | Service |
|---|---|
| `dsw21-mcp.devhorizon.online` | `http://localhost:8003` |

The MCP endpoint then is `https://dsw21-mcp.devhorizon.online/mcp`. Reverse-proxy notes: pass the `Mcp-Session-Id` header and `POST`/`DELETE` methods through, disable response buffering for `text/event-stream` (nginx: `proxy_buffering off; proxy_read_timeout 110s`), and mind Cloudflare's free-tier 100 s idle timeout — build the GTFS index once after every (re)start so the first real call stays fast.

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
      "env": { "DB_LANG": "en" }
    }
  }
}
```

**Claude Code** (CLI) — add the server in one command:

```bash
claude mcp add dsw21-mcp -e DB_LANG="en" -- node /home/user/dsw21-mcp/src/index.js
```

(Windows: `claude mcp add dsw21-mcp -e DB_LANG="en" -- node D:/mcp5/db/dsw21-mcp/src/index.js`; manage with `claude mcp list` / `claude mcp remove dsw21-mcp`.)

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
      DB_LANG: "de"
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
      DB_LANG: "en"
    timeout: 300
```

> `timeout: 300` (seconds) is recommended: the very first GTFS-RT call downloads the ~18 MB static index, which can otherwise exceed a short default timeout.

Useful extras:

* **Hot reload:** after editing the YAML, run `/reload-mcp` in the session — no restart needed.
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
        "DB_LANG": "de"
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
node /home/user/dsw21-mcp/src/index.js
```

You should see `[dsw21-mcp] ready (lang: en)` on stderr. The process then waits for MCP messages on stdin (that is normal — `Ctrl+C` to exit).

## 2.6 Quick stdio self-test

To prove the server answers MCP requests without any client, pipe an `initialize` + `tools/list` JSON-RPC sequence:

```bash
(printf '%s\n' \
 '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"probe","version":"0"}}}' \
 '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
 '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'; sleep 2) | node src/index.js
```

The response contains all three tools — proof the integration is ready.

## 2.7 OmniChat Android app (HTTP)

The OmniChat Android app speaks MCP over Streamable HTTP and can drive dsw21-mcp fully remotely:

1. Run the server in HTTP mode (section 1.4) and publish it behind access control (reverse proxy with Basic Auth / Cloudflare Access — see the security box in 1.4).
2. In the app: **MCP tab → HTTP →** name `dsw21-mcp`, URL `https://dsw21-mcp.devhorizon.online/mcp` → add → **Connect**.
3. The app performs `initialize` + `tools/list` and syncs all three tools; enable/disable tools individually and ask e.g. *"Is the Dortmund tram delayed right now?"*.

The phone needs no local runtime — everything runs on the server. The first GTFS-RT call builds the ~18 MB index server-side (pre-warm it after deploy, see 1.4).

---

# 3. Environment variables

| Variable | Default | Meaning |
|---|---|---|
| `DB_LANG` | `en` | Default output language (`en`/`de`) when a call omits `language`. (Name kept for backward compatibility; no Deutsche Bahn involvement.) |
| `DB_USER_AGENT` | *(unset)* | Optional User-Agent sent with requests to gtfs.de — a polite way to identify your deployment. |
| `GTFS_RT_FEED_URL` | `https://realtime.gtfs.de/realtime-free.pb` | GTFS-RT stream used by all tools. |
| `GTFS_INDEX_DIR` | `./.gtfs-index` | Cache directory for the static-GTFS index. |
| `MCP_HTTP_PORT` | `8003` | Listen port of the HTTP mode (`npm run start:http`; `0` = OS-assigned). |
| `MCP_HTTP_HOST` | `127.0.0.1` | Bind address of the HTTP mode. |

How to set them per client: Claude Desktop / LM Studio / universal → `"env"` block in JSON; hermes-agent → `env:` in YAML; OpenCode → `"environment"`; or export in the shell before launching (`export DB_LANG=de`, PowerShell: `$env:DB_LANG="de"`).

---

# 4. Usage examples for every tool

Examples show the tool's JSON **arguments** and a **representative response**. The responses below are real captures from 2026-10-19 — actual values depend on the time of day.

### 4.1 `dsw21_delays` — DSW21 delays at a Dortmund stop

Best starting point for Dortmund. Defaults to *Dortmund Hbf*; resolves the station to **all its platforms** (the realtime feed references platform-level ids — see `stopIdCount`).

**Arguments**

| Arg | Type | Default | Description |
|---|---|---|---|
| `stop` | string | `"Dortmund Hbf"` | Dortmund stop name or numeric GTFS id. |
| `minutes` | int 5–180 | `60` | Time window from now. |
| `language` | `"en"`/`"de"` | `DB_LANG` | Status word language. |

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
| `language` | `"en"`/`"de"` | `DB_LANG` | Status word language. |

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
| `language` | `"en"`/`"de"` | `DB_LANG` | Label language. |

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

---

# 5. Typical question → tool recipes

| User question | Tool call |
|---|---|
| *"Is the Dortmund tram delayed right now?"* | `dsw21_delays {"stop": "Dortmund Hbf", "minutes": 30}` |
| *"How late is the U45 from Reinoldikirche?"* | `dsw21_delays {"stop": "Dortmund Reinoldikirche", "minutes": 30}` |
| *"Any disruptions on DSW21 today?"* | `gtfs_rt_alerts {"limit": 10}` |
| *"All delayed departures at Dortmund Hbf in the next 2 h"* | `gtfs_rt_delays {"stop": "Dortmund Hbf", "minutes": 120, "minDelay": 1}` |
| *"Is anything delayed at Dortmund Kreuzstraße?"* | `gtfs_rt_delays {"stop": "Dortmund Kreuzstraße", "minDelay": 1}` |

# 6. Known limitations

* **No platform/track changes** — the GTFS-RT format carries delays and cancellations (`SKIPPED`/`NO_DATA`) only; platforms are static-schedule data.
* **No direction (`headsign`)** for DSW21 — the gtfs.de local-transit `trips.txt` ships only `route_id,service_id,trip_id`.
* **First call builds a static index** (~18 MB download via HTTP Range, a few seconds, then cached 24 h in `GTFS_INDEX_DIR`).
* gtfs.de notes **buses in the VRR feed as incomplete**; tram/rail (DSW21 U- and tram lines) are the reliable part.
* **HTTP mode has no built-in auth** — see the security box in section 1.4; always publish it behind access control.
* The HTTP mode does not serve standalone SSE (`GET /mcp` answers `405`); supported clients use `POST` and are unaffected.

# 7. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `Building the static GTFS index for the first time …` | Normal on the very first GTFS-RT call; retry in ~30 s. Later calls hit the 24 h cache. |
| `No stop found for "…" in the static GTFS index` | Use the exact gtfs.de name (e.g. `"Dortmund Hbf"`) or the numeric stop id. |
| `Could not build/load the static GTFS index …` | No internet access to `download.gtfs.de`, or the archive layout changed. Retry; check `npm run test:gtfsrt`. |
| Client shows no tools | Check the absolute path in the config, that `npm install` succeeded, and restart the client fully. |
| LM Studio ignores the server | Enable **Settings → Server → "Allow calling servers from mcp.json"**; check Program → Integrations. |
| Tests fail after `git clone` | Run `npm install` first. |
| HTTP: `Session not found or expired` (404) | The client's session was swept (idle > 1 h) or the server restarted. Reconnect — clients re-run `initialize` automatically. |
| HTTP: connection drops after ~60–100 s | Cloudflare free tier cuts idle connections at 100 s. Pre-warm the GTFS index after each restart (one tool call) and/or enable keep-alive pings in the client. |
| HTTP: `405 Method Not Allowed` on `GET /mcp` | Normal — standalone SSE is not supported; clients use `POST`. |
| HTTP: `connection refused` | Server not running, or wrong `MCP_HTTP_HOST`/`MCP_HTTP_PORT`. Check `curl http://127.0.0.1:8003/health` → `ok`. |
| On Android: client app cannot see the server | Mobile cloud apps (Claude/ChatGPT) only support *remote* MCP; run agents inside Termux or deploy the HTTP mode on a server (section 1.4). |

# 8. Development

```bash
npm test            # offline: GTFS unit tests + stdio & HTTP smoke tests
npm run test:gtfsrt # live: builds index, queries real DSW21 delays (network)
npm start           # run the MCP server on stdio
npm run start:http  # run the MCP server over Streamable HTTP
```

Layout:

```
dsw21-mcp/
├── src/
│   ├── index.js          # entry: stdio transport + tool registration
│   ├── http.js           # entry: Streamable HTTP transport (/mcp, /health)
│   ├── server.js         # shared McpServer factory used by both entries
│   ├── cache.js          # in-memory TTL cache
│   ├── i18n.js           # en/de strings + language resolution
│   ├── gtfs/
│   │   ├── zip.js        # read single files out of a remote 236 MB zip via HTTP Range
│   │   ├── csv.js        # GTFS CSV parser
│   │   ├── index.js      # static-GTFS index build + disk cache (~18 MB)
│   │   └── feed.js       # GTFS-RT feed: fetch, decode, join
│   └── tools/
│       └── gtfs-rt.js    # dsw21_delays, gtfs_rt_delays, gtfs_rt_alerts
└── test/
    ├── gtfs.test.js      # offline CSV + stop-resolution tests
    ├── gtfsrt-live.js    # live GTFS-RT pipeline test
    ├── smoke.js          # MCP stdio tool-registration test
    └── smoke-http.js     # MCP Streamable HTTP test (incl. session DELETE)
```

# 9. Data sources & license

* GTFS-RT stream & static schedule: [gtfs.de](https://gtfs.de/en/realtime/) — CC BY-SA 4.0 / CC BY 4.0, provided by DELFI e.V. and regional agencies; **without any guarantee**. Please respect the [Transitous usage policy](https://transitous.org/api/) for alternative access paths.
* This server: ISC license. Repository: https://github.com/sashok53011/dsw21-mcp
