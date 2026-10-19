# dsw21-mcp

An MCP (Model Context Protocol) server for **realtime delay information for DSW21 (Dortmunder Stadtwerke) in Dortmund / VRR** — trams, buses, S-/U-Bahn — plus Deutsche Bahn long-distance data.

The DSW21 data comes from the free **GTFS-RT stream [realtime.gtfs.de](https://gtfs.de/en/realtime/)** (TripUpdates + ServiceAlerts, updated every 10 s), joined against the static gtfs.de schedule to resolve line numbers and station names. This is a **completely separate data source** from Deutsche Bahn, so the DSW21 tools keep working even when DB's APIs block or rate-limit the server.

The DB tools are built **directly on [`db-vendo-client`](../db-vendo-client)**, with in-memory caching, request throttling and localized (English/German) output.

## Tools

| Tool | Description |
| --- | --- |
| `search_stations` | Find stations/stops by name → returns EVA id, name, coordinates. |
| `nearby_stations` | Stations near a WGS84 coordinate, sorted by distance. |
| `station_delays` | Live **departure** board with realtime delays, cancellations, platforms, disruption remarks. |
| `station_arrivals` | Live **arrival** board, same fields. |
| `trip_delays` | Delay profile of one train along its **whole route**: per-stop planned vs. expected times, delay in minutes, platform changes, cancellations. |
| `find_journeys` | Connections between two stations with **per-leg delays**, cancellations, platforms and remarks. |
| `gtfs_rt_delays` | **Local transit (non-DB)** realtime delays from the free GTFS-RT stream (realtime.gtfs.de): trams, buses, S-/U-Bahn, regional. Query by stop name or numeric id. |
| `dsw21_delays` | Convenience wrapper for **DSW21 (Dortmunder Stadtwerke)** in Dortmund/VRR. Defaults to Dortmund Hbf. |

The first six tools use the Deutsche Bahn APIs (subject to DB's rate limits and intermittent IP blocking). The two GTFS-RT tools use a **completely separate data source** (gtfs.de / DELFI) and keep working even when DB blocks the server — this is what covers non-DB operators like DSW21.

Every tool accepts an optional `language` parameter (`en` | `de`) that switches the localized status words (`on time` / `pünktlich`, `delayed` / `Verspätung`, `cancelled` / `fällt aus`) and error messages. JSON field names stay stable across languages.

Station arguments (`station`, `from`, `to`) accept either a **name** ("Berlin Hbf") or an **EVA number** (8011160). Names are resolved via `search_stations` internally.

## Installation

```bash
cd dsw21-mcp
npm install
```

Requires Node.js ≥ 18.

## Running

The server communicates over **stdio**:

```bash
npm start
# or: node src/index.js
```

### Registration example (Claude Desktop / other MCP clients)

```json
{
  "mcpServers": {
    "dsw21-mcp": {
      "command": "node",
      "args": ["D:/mcp5/db/dsw21-mcp/src/index.js"],
      "env": {
        "DB_USER_AGENT": "my-app (https://example.org; me@example.org)",
        "DB_PROFILE": "dbnav",
        "DB_LANG": "en"
      }
    }
  }
}
```

## Configuration (environment variables)

| Variable | Default | Meaning |
| --- | --- | --- |
| `DB_USER_AGENT` | *(unset)* | **Recommended.** Deutsche Bahn asks for a User-Agent that identifies/contact you. Placeholder values are rejected by the client. |
| `DB_PROFILE` | `dbnav` | API profile: `dbnav`, `db`, `dbweb`, `dbris`. See the `db-vendo-client` readme for the trade-offs (stability, board window, remarks, API key). |
| `DB_API_KEY` | *(unset)* | Required only for the `dbris` profile (DB API Marketplace key). |
| `DB_LANG` | `en` | Default output language (`en`/`de`) when a tool call omits `language`. |
| `DB_REQUESTS_PER_MINUTE` | `30` | Client-side throttle. DB documents ~60 req/min for `dbnav`; we stay below it. |
| `GTFS_RT_FEED_URL` | `https://realtime.gtfs.de/realtime-free.pb` | GTFS-RT stream for the local-transit tools. |
| `GTFS_INDEX_DIR` | `./.gtfs-index` | Where the static-GTFS index cache is stored. |

## Data-sourcing caveats (important)

Deutsche Bahn's APIs are **rate-limited and intermittently block clients** (the `db-vendo-client` readme warns about this explicitly). This server mitigates it with:

- **In-memory TTL cache** — locations 6h, nearby 1h, boards 30s, trip 15s, journeys 60s. Repeated queries within the TTL do not hit the DB API.
- **Throttling** — capped at `DB_REQUESTS_PER_MINUTE` (default 30/min, below DB's ~60).
- **Localized, actionable errors** — when DB answers `HTTP 452 "OPS_BLOCKED"` or `429`, the tool returns a clear message (in the requested language) explaining the block and suggesting a retry or profile switch, instead of a raw error.

Even so, upstream blocks are outside this server's control. If you need reliable bulk/realtime delay data, consider the alternatives recommended by `db-vendo-client`: **GTFS/GTFS-RT feeds** (DELFI), **Transitous** (transitous.org), or a self-hosted **MOTIS** instance.

Note that the board window is profile-dependent: `dbnav`/`db`/`dbweb` return roughly the next hour, `dbris` (with API key) up to 12 hours.

## GTFS-RT backend (local transit: DSW21 & others)

The `gtfs_rt_delays` and `dsw21_delays` tools use a **separate data source** from the DB tools, so they keep working when Deutsche Bahn blocks the server:

- **Realtime:** the free GTFS-RT stream [realtime.gtfs.de](https://gtfs.de/en/realtime/) (TripUpdates + ServiceAlerts, updated every 10 s, CC BY-SA 4.0). It covers the VRR — including **DSW21 (Dortmunder Stadtwerke)** in Dortmund — plus VVO, VRS, VBN, NVBW and others.
- **Static schedule:** the gtfs.de "Local Transit Germany" archive ([`de_nv`](https://gtfs.de/en/feeds/de_nv/), ~236 MB, CC BY 4.0), used **only to resolve IDs**.

The realtime stream carries **no route/agency names and numeric stop IDs only**, so a join against the static schedule is required to (a) know which trips belong to DSW21 and (b) turn stop IDs into station names. To avoid downloading 236 MB, the index is built from just four files via HTTP Range requests (~18 MB total): `agency.txt`, `routes.txt`, `trips.txt`, `stops.txt` — the 229 MB `stop_times.txt` is skipped, because delays already live in the RT feed. The resulting index (agency_id → route_ids → trip_ids, plus stop_id → name) is cached in `GTFS_INDEX_DIR` for 24 h.

**A station is resolved to a whole ID set** (parent stop + all per-platform child stops), because the realtime feed references platform-level IDs while users search by station name. This is why `stopIdCount` (e.g. 14 for Dortmund Hbf) appears in responses.

### Known limitations

- **No platform/track changes in GTFS-RT.** The format exposes delays and cancellations (`SKIPPED`/`NO_DATA`), not platform changes; platforms are static-schedule data, and textual mentions arrive only via ServiceAlerts.
- **No direction/headsign** for DSW21: the gtfs.de `de_nv` `trips.txt` ships only `route_id,service_id,trip_id` (no `trip_headsign`), so `headsign` is `null`. The line number comes from `routes.txt`.
- **First call builds the index** (~18 MB download, a few seconds); a concurrent-caller hint is returned if it is still in progress.
- **Buses in the VRR feed are noted as incomplete** upstream by gtfs.de; rail/tram (DSW21 U-/tram lines) are the reliable part.

## Output format

Responses are compact JSON. Example `station_delays` item:

```json
{
  "station": "Berlin Hbf",
  "kind": "departures",
  "count": 3,
  "delayedCount": 1,
  "cancelledCount": 1,
  "items": [
    {
      "line": "ICE 947",
      "product": "nationalExpress",
      "direction": "München Hbf",
      "tripId": "…",
      "planned": "2026-10-19T12:00:00.000Z",
      "expected": "2026-10-19T12:07:00.000Z",
      "delayMin": 7,
      "status": "delayed",
      "platform": "12",
      "remarks": [{"type": "warning", "text": "…"}]
    }
  ]
}
```

`delayMin` is the delay in minutes (`null` if no realtime data), `status` is the localized one-word summary. `trip_delays` returns per-stop `arrivalDelayMin`/`departureDelayMin` plus a `delayedStops` count; `find_journeys` returns `legs` with per-leg delays and an overall `maxDelayMin`.

## Testing

```bash
npm test          # offline: formatter unit tests + MCP tool-registration smoke test
```

To also perform one real DB round-trip (subject to upstream blocking):

```bash
DB_MCP_LIVE=1 DB_USER_AGENT="my-app (me@example.org)" npm run smoke
```

## Layout

```
dsw21-mcp/
├── src/
│   ├── index.js          # entry point: stdio transport + tool registration
│   ├── client.js         # db-vendo-client wrapper: profile, throttle, cache, error mapping
│   ├── cache.js          # in-memory TTL cache
│   ├── format.js         # compact FPTF → LLM-friendly JSON
│   ├── i18n.js           # en/de strings
│   └── tools/
│       ├── stations.js   # search_stations, nearby_stations
│       ├── departures.js # station_delays, station_arrivals
│       ├── trip.js       # trip_delays
│       └── journeys.js   # find_journeys
└── test/
    ├── format.test.js    # offline formatter tests
    └── smoke.js          # MCP stdio tool-registration test (+ optional live call)
```
