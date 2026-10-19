# dsw21-mcp

**Echtzeit-Verspätungsinformationen für DSW21 (Dortmunder Stadtwerke) in Dortmund / VRR — und Fernverkehr der Deutschen Bahn — als MCP-Server.**

[English](readme.md) · [Deutsch](readme.de.md) · [Русский](readme.ru.md)

Ein MCP-Server ([Model Context Protocol](https://modelcontextprotocol.io)), den jedes MCP-fähige KI-Client (Claude Desktop, hermes-agent, OpenCode, LM Studio, …) aufrufen kann, um Fragen wie *„Ist meine Straßenbahn nach Dortmund verspätet?"*, *„Welcher ICE ab Berlin Hbf hat Verspätung?"* oder *„Gibt es heute Störungen auf DSW21-Linien?"* zu beantworten.

## Zwei unabhängige Datenquellen

| | **GTFS-RT (DSW21 & Nahverkehr)** | **Deutsche Bahn (Fernverkehr)** |
|---|---|---|
| Tools | `dsw21_delays`, `gtfs_rt_delays`, `gtfs_rt_alerts` | `search_stations`, `nearby_stations`, `station_delays`, `station_arrivals`, `trip_delays`, `find_journeys` |
| Quelle | kostenloser GTFS-RT-Stream [realtime.gtfs.de](https://gtfs.de/de/realtime/) (DELFi/gtfs.de, CC BY-SA 4.0) | DB-APIs „vendo"/„movas" via [`db-vendo-client`](https://github.com/public-transport/db-vendo-client) |
| Abdeckung | **DSW21** Straßenbahn/Bus, U-Bahn, Regional — Dortmund & gesamter VRR | ICE/IC/EC, RE/RB, S-Bahn — ganz Deutschland |
| API-Key nötig | nein | nein (außer optionales `dbris`-Profil) |
| Verfügbarkeit | stabil, Aktualisierung alle 10 s | DB blockiert IPs mitunter (`HTTP 452`) — DB-Tools degradeieren gnädig, GTFS-RT-Tools funktionieren weiter |

Da die beiden Backends unabhängig sind, **bleiben DSW21-Abfragen funktionieren, selbst wenn Deutsche Bahn den Server blockiert** — das ist der empfohlene Weg für Dortmunder Daten.

## Alle Tools im Überblick

| Tool | Was es tut |
|---|---|
| `dsw21_delays` | Echtzeit-Verspätungen an DSW21-Haltestellen in Dortmund (Komfort-Wrapper, Standard *Dortmund Hbf*). |
| `gtfs_rt_delays` | Echtzeit-Verspätungen an **jeder** Nahverkehrshaltestelle im GTFS-RT-Feed (VRR und darüber hinaus) per Name oder numerischer ID. |
| `gtfs_rt_alerts` | Service-Meldungen / Störungen betreffend DSW21-Züge, mit Klartext. |
| `search_stations` | DB-Station per Name finden → EVA-ID, Koordinaten. |
| `nearby_stations` | DB-Stationen nahe einer WGS84-Koordinate, nach Entfernung sortiert. |
| `station_delays` | Live-DB-**Abfahrtstafel**: Verspätungen, Ausfälle, Gleise, Hinweise. |
| `station_arrivals` | Live-DB-**Ankunftstafel**, gleiche Felder. |
| `trip_delays` | Ein DB-Zug auf der **ganzen Strecke**: pro Haltestelle Soll vs. Ist, Verspätung in Minuten, Gleisänderungen. |
| `find_journeys` | DB-Verbindungen A→B mit **Verspätungen pro Abschnitt**, Ausfällen, Gleisen, Hinweisen. |

Jedes Tool akzeptiert den optionalen Parameter **`language`** (`"en"` oder `"de"`), der Statuswörter (`on time`/`pünktlich`, `delayed`/`Verspätung`, `cancelled`/`fällt aus`) und Fehlermeldungen umschaltet. JSON-Feldnamen bleiben sprachunabhängig stabil.

---

# 1. Installation & Deployment

Der Server ist eine gewöhnliche Node.js-Anwendung und spricht **MCP über stdio**: Ihr KI-Client startet ihn automatisch bei Bedarf — kein Dämon zum Am-Laufen-Halten, kein offener Port. Einmal pro Maschine installieren.

**Voraussetzungen (alle Plattformen):** Node.js ≥ 18 (getestet mit Node 24), Internetzugang, ~50 MB Festplattenplatz für `node_modules` plus den Cache des statischen GTFS-Index.

<details>
<summary><b>Inhaltsverzeichnis</b></summary>

- [1.1 Windows](#11-windows)
- [1.2 Linux](#12-linux)
- [1.3 Android (Termux)](#13-android-termux)
- [2. MCP-Client-Konfiguration](#2-mcp-client-konfiguration)
  - [2.1 Claude Desktop & Claude Code](#21-claude-desktop--claude-code)
  - [2.2 hermes-agent (NousResearch)](#22-hermes-agent-nousresearch)
  - [2.3 OpenCode](#23-opencode)
  - [2.4 LM Studio](#24-lm-studio)
  - [2.5 Universelle Konfiguration (Cursor, Windsurf, Cline, …)](#25-universelle-konfiguration-cursor-windsurf-cline-)
  - [2.6 Schneller stdio-Selbsttest](#26-schneller-stdio-selbsttest)
- [3. Umgebungsvariablen](#3-umgebungsvariablen)
- [4. Nutzungshilfe: alle Tools mit Beispielen](#4-nutzungshilfe-alle-tools-mit-beispielen)
- [5. Typische Frage → Tool-Rezepte](#5-typische-frage--tool-rezepte)
- [6. Bekannte Einschränkungen](#6-bekannte-einschränkungen)
- [7. Problemlösung](#7-problemlösung)
- [8. Entwicklung](#8-entwicklung)
- [9. Datenquellen & Lizenz](#9-datenquellen--lizenz)

</details>

## 1.1 Windows

**Schritt 1 — Voraussetzungen installieren** (PowerShell):

```powershell
# Git (überspringen, falls bereits installiert)
winget install --id Git.Git -e

# Node.js LTS (überspringen, falls "node --version" v18+ ausgibt)
winget install --id OpenJS.NodeJS.LTS -e
```

Danach das PowerShell-Fenster neu öffnen, damit `git`/`node` auf `PATH` liegen: `git --version`, `node --version`.

**Schritt 2 — Klonen und Installieren:**

```powershell
cd D:\mcp5
git clone https://github.com/sashok53011/dsw21-mcp.git
cd dsw21-mcp
npm install
```

**Schritt 3 — Prüfen:**

```powershell
npm test              # Offline-Tests + Tool-Registrierung
npm run test:gtfsrt   # optional: Live-DSW21-Datencheck (~18 MB Index-Download)
```

Erwartet: `smoke test passed ✓` mit allen neun Tools.

**Windows-Hinweise**

* In JSON-Konfigurationen **Schrägstriche** in Pfaden verwenden (`D:/mcp5/db/dsw21-mcp/src/index.js`) — funktionieren überall und vermeiden Backslash-Escaping.
* Der GTFS-Index-Cache entsteht in `D:\mcp5\db\dsw21-mcp\.gtfs-index` (änderbar mit `GTFS_INDEX_DIR`).
* Optional: `dsw21-mcp` als globaler Befehl — `npm link` — dann `"command": "dsw21-mcp"` in Client-Konfigurationen ohne Pfade nutzen.

## 1.2 Linux

**Schritt 1 — Voraussetzungen installieren** (Debian/Ubuntu; Fedora: `dnf install git nodejs`, Arch: `pacman -S git nodejs npm`):

```bash
sudo apt update && sudo apt install -y git nodejs npm
```

Falls Ihre Distribution Node < 18 liefert, stattdessen [NodeSource](https://github.com/nodesource/distributions) oder nvm:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs
```

**Schritt 2 — Klonen und Installieren:**

```bash
git clone https://github.com/sashok53011/dsw21-mcp.git
cd dsw21-mcp
npm install
```

**Schritt 3 — Prüfen:**

```bash
npm test              # Offline-Tests + Tool-Registrierung
npm run test:gtfsrt   # optional: Live-DSW21-Datencheck
```

**Linux-Deployment-Hinweise**

* Ein stdio-MCP-Server läuft **nicht als Dienst** — der Client startet ihn pro Sitzung und stoppt ihn automatisch. Nichts für systemd nötig.
* Wenn Sie Client-Konfigurationen in Dotfiles verwalten, absoluten Server-Pfad verwenden: `/home/<user>/dsw21-mcp/src/index.js`.
* Kopflose Maschine (VPS/Home-Server): nach z. B. `/opt/dsw21-mcp` klonen, `npm install --omit=dev` ausführen und den entfernungsfähigen MCP-Client auf den absoluten Pfad zeigen.

## 1.3 Android (Termux)

Unter Android läuft der Server in [**Termux**](https://termux.dev) (aus **F-Droid** installieren — der Play-Store-Build ist veraltet).

**Schritt 1 — Termux und Pakete installieren:**

```bash
pkg update && pkg upgrade
pkg install nodejs git
node --version    # muss v18+ ausgeben
```

**Schritt 2 — Klonen und Installieren:**

```bash
git clone https://github.com/sashok53011/dsw21-mcp.git
cd dsw21-mcp
npm install
npm test
```

Das Projekt liegt danach unter `/data/data/com.termux/files/home/dsw21-mcp`.

**Schritt 3 — Starten / mit Client koppeln:**

```bash
node src/index.js    # MCP-stdio-Server; genutzt von Termux-kompatiblen Agenten
```

**Android-Hinweise & Grenzen**

* Die **Claude-/ChatGPT-Handy-Apps können lokale stdio-Server nicht starten** — mobile Cloud-Apps unterstützen nur *remote* (HTTP)-MCP-Server, und `dsw21-mcp` ist stdio-only. Auf dem Handy mit Agenten koppeln, die *in Termux* laufen (oder jeden Client, der lokal `node` starten kann).
* Alternative für die Handynutzung: `dsw21-mcp` auf dem PC/Server laufen lassen (Abschnitte Windows/Linux) und von Desktop-Clients nutzen; die DSW21-Daten sind identisch.
* Termux während langer Sitzungen wach halten: `termux-wake-lock`. Autostart beim Boot: das Add-on [Termux:Boot](https://github.com/termux/termux-boot).
* Der erste GTFS-RT-Aufruf lädt den ~18 MB großen Index; in mobilen Netzwerken kann das einen Moment dauern.

---

# 2. MCP-Client-Konfiguration

Sie brauchen drei Dinge: den **absoluten Pfad** zu `src/index.js` auf Ihrem Rechner, die **Umgebungsvariablen** und den clientspezifischen Konfigurationsblock. Alle Beispielpfade an Ihr OS anpassen (siehe Abschnitte oben).

## 2.1 Claude Desktop & Claude Code

**Claude Desktop** Konfigurationsdatei:

| OS | Pfad |
|---|---|
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Linux | `~/.config/Claude/claude_desktop_config.json` |

Einfügen (falls nicht vorhanden anlegen) und **Claude Desktop vollständig neu starten**:

```json
{
  "mcpServers": {
    "dsw21-mcp": {
      "command": "node",
      "args": ["D:/mcp5/db/dsw21-mcp/src/index.js"],
      "env": {
        "DB_USER_AGENT": "my-app (https://example.org; me@example.org)",
        "DB_LANG": "de"
      }
    }
  }
}
```

Linux/macOS-Variante:

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

**Claude Code** (CLI) — Server und Umgebung in einem Befehl:

```bash
claude mcp add dsw21-mcp -e DB_USER_AGENT="my-app (me@example.org)" -e DB_LANG="de" -- node /home/user/dsw21-mcp/src/index.js
```

(Windows: `claude mcp add dsw21-mcp -e DB_USER_AGENT="my-app (me@example.org)" -- node D:/mcp5/db/dsw21-mcp/src/index.js`; Verwaltung via `claude mcp list` / `claude mcp remove dsw21-mcp`.)

Danach erscheinen die Tools unter dem Hammer/Schraubenschlüssel-Symbol (Desktop) oder via `/mcp` (Code). Zum Beispiel fragen: *„Ist die Dortmunder Straßenbahn gerade verspätet?"*.

## 2.2 hermes-agent (NousResearch)

hermes-agent liest MCP-Server aus **`config.yaml`**, Block `mcp_servers`. Speicherort der Konfigurationsdatei:

| OS | Pfad |
|---|---|
| Windows | `%LOCALAPPDATA%\hermes\config.yaml` (z. B. `C:\Users\alex\AppData\Local\hermes\config.yaml`) |
| Linux / macOS | `~/.hermes/config.yaml` |

Block passend zum OS ergänzen (entspricht dem Format realer Einträge):

**Windows** — vollständige Pfade inklusive `node.exe` verwenden (hermes erbt nicht immer Ihr `PATH`):

```yaml
mcp_servers:
  dsw21-mcp:
    command: C:/Users/alex/AppData/Local/Programs/nodejs/node.exe
    args:
      - D:/mcp5/db/dsw21-mcp/src/index.js
    env:
      DB_USER_AGENT: "my-app (https://example.org; me@example.org)"
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
      DB_USER_AGENT: "my-app (https://example.org; me@example.org)"
      DB_LANG: "de"
    timeout: 300
```

> `timeout: 300` (Sekunden) wird empfohlen: Der allererste GTFS-RT-Aufruf lädt den ~18 MB großen statischen Index, was eine kurze Standard-Timeout sonst überschreiten kann.

Nützliche Extras:

* **Hot Reload:** nach dem Bearbeiten der YAML `/reload-mcp` in der Sitzung ausführen — kein Neustart nötig.
* **Import aus Claude Code:** `hermes import-agent claude-code` migriert einen bestehenden `mcpServers`-Block (plus Skills/Anweisungen) automatisch.
* **Aus dem Terminal:** hermes-agent bringt den `mcporter`-Skill mit, z. B. `mcporter call dsw21-mcp.dsw21_delays stop="Dortmund Hbf" --output json`.

## 2.3 OpenCode

Projektdatei `.opencode.json` (oder global `~/.config/opencode/opencode.json`):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "dsw21-mcp": {
      "type": "local",
      "command": ["node", "D:/mcp5/db/dsw21-mcp/src/index.js"],
      "environment": {
        "DB_USER_AGENT": "my-app (https://example.org; me@example.org)",
        "DB_LANG": "de"
      },
      "enabled": true
    }
  }
}
```

Unterschiede zu Claudes Format: `command` ist ein **Array** (Binary + Args zusammen), Umgebungsvariablen stehen unter `environment`. Oder per CLI hinzufügen:

```bash
opencode mcp add dsw21-mcp -- node D:/mcp5/db/dsw21-mcp/src/index.js
```

## 2.4 LM Studio

LM Studio nutzt **`mcp.json`** in Cursor-Notation:

* Windows: `%USERPROFILE%\.lmstudio\mcp.json`
* Linux / macOS: `~/.lmstudio/mcp.json`

Am einfachsten bearbeiten: in LM Studio **Program-Tab (`>_`-Symbol, rechte Seitenleiste) → Install → Edit mcp.json** öffnen (In-App-Editor; die Datei wird beim Speichern automatisch geladen).

```json
{
  "mcpServers": {
    "dsw21-mcp": {
      "command": "node",
      "args": ["/home/user/dsw21-mcp/src/index.js"],
      "env": {
        "DB_USER_AGENT": "my-app (https://example.org; me@example.org)",
        "DB_LANG": "de"
      }
    }
  }
}
```

**Wichtig:** **Einstellungen → Server → „Allow calling servers from mcp.json" aktivieren**, sonst werden Server aus der Datei nicht ausgeführt. Die Tools erscheinen dann unter **Program → Integrations**. Ein tool-fähiges lokales Modell verwenden (z. B. Qwen, Llama 3+, Mistral) oder ein Remote-API-Modell.

## 2.5 Universelle Konfiguration (Cursor, Windsurf, Cline, …)

Die meisten MCP-Clients verwenden dieselbe **Claude-kompatible `mcpServers`-Form** (`command` + `args` + `env`) — der Block aus [2.1](#21-claude-desktop--claude-code) fügt sich unverändert ein in:

| Client | Konfigurationsort |
|---|---|
| Cursor | `.cursor/mcp.json` (Projekt) oder `~/.cursor/mcp.json` (global) |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` |
| Cline (VS-Code-Erweiterung) | Settings → MCP → *Edit Config* (`cline_mcp_settings.json`) |
| Zed | `~/.config/zed/settings.json` → `"context_servers"` |
| Jeder andere stdio-Client | `{"command": "node", "args": ["/abs/path/src/index.js"], "env": {...}}` |

Universeller Einzeilen-Check — jeder stdio-Client führt am Ende einen Befehl wie diesen aus, er muss zuerst funktionieren:

```bash
DB_USER_AGENT="my-app (me@example.org)" node /home/user/dsw21-mcp/src/index.js
```

Sie sollten `[dsw21-mcp] ready (DB profile: dbnav, lang: de)` auf stderr sehen. Der Prozess wartet dann auf MCP-Nachrichten auf stdin (normal — `Ctrl+C` zum Beenden).

## 2.6 Schneller stdio-Selbsttest

Ohne Client beweisen, dass der Server MCP-Anfragen beantwortet, mit einer Pipe aus `initialize` + `tools/list` JSON-RPC:

```bash
(printf '%s\n' \
 '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"probe","version":"0"}}}' \
 '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
 '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'; sleep 2) | node src/index.js
```

Die Antwort enthält alle neun Tools — Beweis, dass die Integration bereit ist.

---

# 3. Umgebungsvariablen

| Variable | Standard | Bedeutung |
|---|---|---|
| `DB_USER_AGENT` | *(unset)* | **Empfohlen.** Deutsche Bahn verlangt einen User-Agent, der Sie identifiziert/kontaktiert, z. B. `my-app (https://example.org; me@example.org)`. Platzhalter werden abgelehnt; ohne ihn protokolliert der Server eine Warnung und nutzt einen Fallback. |
| `DB_PROFILE` | `dbnav` | DB-API-Profil: `dbnav` (am stabilsten), `db`, `dbweb`, `dbris` (braucht `DB_API_KEY`, Tafeln bis 12 h). |
| `DB_API_KEY` | *(unset)* | Nur für `DB_PROFILE=dbris` — Schlüssel aus dem [DB API Marketplace](https://developers.deutschebahn.com/). |
| `DB_LANG` | `en` | Standard-Ausgabesprache (`en`/`de`), wenn `language` fehlt. |
| `DB_REQUESTS_PER_MINUTE` | `30` | Clientseitige Drosselung (DB dokumentiert ~60 Anfragen/Min. für `dbnav`). |
| `GTFS_RT_FEED_URL` | `https://realtime.gtfs.de/realtime-free.pb` | GTFS-RT-Stream für die DSW21-/Nahverkehrs-Tools. |
| `GTFS_INDEX_DIR` | `./.gtfs-index` | Cache-Verzeichnis für den statischen GTFS-Index. |

Setzen pro Client: Claude Desktop / LM Studio / universell → `"env"`-Block in JSON; hermes-agent → `env:` in YAML; OpenCode → `"environment"`; oder im Shell-Export vor dem Start (`export DB_LANG=de`, PowerShell: `$env:DB_LANG="de"`).

---

# 4. Nutzungshilfe: alle Tools mit Beispielen

Beispiele zeigen die JSON-**Argumente** eines Tools und eine **repräsentative Antwort**. GTFS-RT-Antworten unten sind echte Aufnahmen vom 2026-10-19; DB-Antworten sind illustrativ (feldgenau) — tatsächliche Werte hängen von Tageszeit und IP-Blockierung durch DB ab.

### 4.1 `dsw21_delays` — DSW21-Verspätungen an einer Dortmunder Haltestelle

Bester Einstieg für Dortmund. Standard ist *Dortmund Hbf*; die Haltestelle wird auf **alle Gleise/Steige** aufgelöst (der Echtzeit-Feed referenziert Steig-IDs — siehe `stopIdCount`).

**Argumente**

| Arg | Typ | Standard | Beschreibung |
|---|---|---|---|
| `stop` | string | `"Dortmund Hbf"` | Dortmunder Haltestellenname oder numerische GTFS-ID. |
| `minutes` | int 5–180 | `60` | Zeitfenster ab jetzt. |
| `language` | `"en"`/`"de"` | `en` | Sprache der Statuswörter. |

**Aufruf**

```json
{"name": "dsw21_delays", "arguments": {"stop": "Dortmund Hbf", "minutes": 90, "language": "de"}}
```

**Antwort (echt)**

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

Weitere Aufrufe:

```json
{"name": "dsw21_delays", "arguments": {"stop": "Dortmund Reinoldikirche", "language": "en"}}
{"name": "dsw21_delays", "arguments": {"stop": "Dortmund Hörde Bf", "minutes": 30}}
{"name": "dsw21_delays", "arguments": {"stop": "334656"}}
```

> `headsign` (Richtung) ist per Design `null`: der gtfs.de-Nahverkehrsplan liefert kein `trip_headsign`. Die **Liniennummer** kommt aus `routes.txt`.

### 4.2 `gtfs_rt_delays` — jede Nahverkehrshaltestelle

Gleiche Daten, aber für **jede** Haltestelle im GTFS-RT-Feed (gesamter VRR und darüber hinaus), mit mehr Filtern.

**Argumente**

| Arg | Typ | Standard | Beschreibung |
|---|---|---|---|
| `stop` | string **erforderlich** | – | Haltestellenname oder numerische GTFS-ID. |
| `minutes` | int 5–180 | `60` | Zeitfenster ab jetzt. |
| `minDelay` | int 0–60 | `1` | Nur Einträge mit ≥ dieser Verspätung; `0` = alles anzeigen. |
| `limit` | int 1–200 | `50` | Maximale Ergebnisse. |
| `language` | `"en"`/`"de"` | `en` | Sprache der Statuswörter. |

**Aufrufe**

```json
{"name": "gtfs_rt_delays", "arguments": {"stop": "Dortmund Hbf", "minutes": 60, "minDelay": 0, "language": "en"}}
{"name": "gtfs_rt_delays", "arguments": {"stop": "199571", "limit": 5}}
{"name": "gtfs_rt_delays", "arguments": {"stop": "Dortmund Kreuzstraße", "minDelay": 3, "minutes": 30}}
```

**Antwortformat**

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
  "departures": [ { "...": "gleiches Format wie dsw21_delays" } ]
}
```

### 4.3 `gtfs_rt_alerts` — Störungen & Service-Meldungen (DSW21)

Textliche Service-Meldungen zu DSW21-Zügen; generische Attribution-Hinweise werden herausgefiltert.

**Argumente**

| Arg | Typ | Standard | Beschreibung |
|---|---|---|---|
| `limit` | int 1–100 | `30` | Maximale Anzahl Meldungen. |
| `language` | `"en"`/`"de"` | `en` | Sprache der Labels. |

**Aufruf**

```json
{"name": "gtfs_rt_alerts", "arguments": {"limit": 10, "language": "de"}}
```

**Antwort (echt, gekürzt)**

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

### 4.4 `search_stations` — DB-Station finden

**Argumente**

| Arg | Typ | Standard | Beschreibung |
|---|---|---|---|
| `query` | string **erforderlich** | – | Stationsname, z. B. `"Berlin Hbf"`. |
| `results` | int 1–20 | `5` | Maximale Ergebnisse. |
| `language` | `"en"`/`"de"` | `en` | – |

**Aufruf**

```json
{"name": "search_stations", "arguments": {"query": "Berlin Hbf", "results": 3}}
```

**Antwortformat**

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

Die zurückgegebene `id` als `station`/`from`/`to` in den DB-Tools unten verwenden (Namen funktionieren auch — sie werden automatisch aufgelöst).

### 4.5 `nearby_stations` — DB-Stationen um eine Koordinate

**Argumente**

| Arg | Typ | Standard | Beschreibung |
|---|---|---|---|
| `latitude` | number **erforderlich** | – | WGS84-Breitengrad. |
| `longitude` | number **erforderlich** | – | WGS84-Längengrad. |
| `results` | int 1–20 | `8` | Maximale Ergebnisse (nach Entfernung sortiert). |
| `language` | `"en"`/`"de"` | `en` | – |

**Aufruf** (Dortmunder Innenstadt)

```json
{"name": "nearby_stations", "arguments": {"latitude": 51.5136, "longitude": 7.4653, "results": 5}}
```

**Antwortformat**

```json
{
  "latitude": 51.5136, "longitude": 7.4653,
  "count": 2,
  "stations": [
    { "id": "8010000", "name": "Dortmund Hbf", "distance": 650, "latitude": 51.5169, "longitude": 7.4609 }
  ]
}
```

### 4.6 `station_delays` — Live-DB-Abfahrtstafel

**Argumente**

| Arg | Typ | Standard | Beschreibung |
|---|---|---|---|
| `station` | string **erforderlich** | – | DB-Name oder EVA-Nummer (z. B. `8011160` = Berlin Hbf). |
| `minutes` | int 10–120 | `30` | Fenster ab jetzt (Profile ohne API-Key liefern roughly die nächste Stunde). |
| `direction` | string | – | Nur Abfahrten in Richtung dieser Station. |
| `products` | string[] | alle | Filter: `nationalExpress`, `national`, `regionalExpress`, `regional`, `suburban`, `bus`, `ferry`, `subway`, `tram`, `taxi`. |
| `language` | `"en"`/`"de"` | `en` | – |

**Aufrufe**

```json
{"name": "station_delays", "arguments": {"station": "Berlin Hbf", "minutes": 60}}
{"name": "station_delays", "arguments": {"station": "8011160", "products": ["nationalExpress", "national"], "language": "de"}}
{"name": "station_delays", "arguments": {"station": "Hamburg Hbf", "direction": "Köln Hbf", "minutes": 20}}
```

**Antwortformat**

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
      "delayMin": 7, "status": "Verspätung", "platform": "12",
      "remarks": [ { "type": "warning", "text": "Stellwechsel" } ]
    },
    {
      "line": "S 3", "product": "suburban", "direction": "Erkner",
      "planned": "2026-10-19T12:05:00.000Z", "expected": "2026-10-19T12:05:00.000Z",
      "delayMin": 0, "status": "pünktlich", "platform": "4"
    },
    {
      "line": "RE 1", "product": "regionalExpress", "direction": "Wittenberg",
      "planned": "2026-10-19T12:10:00.000Z", "expected": null,
      "delayMin": null, "status": "fällt aus", "platform": null, "cancelled": true
    }
  ]
}
```

### 4.7 `station_arrivals` — Live-DB-Ankunftstafel

Gleiches Format wie `station_delays` (ohne `direction`):

```json
{"name": "station_arrivals", "arguments": {"station": "Frankfurt (M) Hbf", "minutes": 45, "language": "de"}}
```

### 4.8 `trip_delays` — ein DB-Zug, ganze Strecke

`tripId` aus `station_delays`/`station_arrivals`/`find_journeys` holen und den Zug dann End-zu-Ende prüfen: Soll-/Ist-Zeiten pro Haltestelle, Verspätungsausbreitung, Gleisänderungen, Ausfälle.

**Argumente**

| Arg | Typ | Standard | Beschreibung |
|---|---|---|---|
| `tripId` | string **erforderlich** | – | Trip-ID aus Tafel- oder Verbindungsergebnis. |
| `language` | `"en"`/`"de"` | `en` | – |

**Aufruf**

```json
{"name": "trip_delays", "arguments": {"tripId": "…|80|1052020", "language": "de"}}
```

**Antwortformat**

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
  "cancelled": false, "status": "Verspätung",
  "stops": 12, "delayedStops": 3,
  "stopovers": [
    {
      "stop": { "id": "8010000", "name": "Halle (Saale) Hbf" },
      "plannedArrival": "2026-10-19T13:30:00.000Z", "expectedArrival": "2026-10-19T13:40:00.000Z",
      "arrivalDelayMin": 10,
      "plannedDeparture": "2026-10-19T13:33:00.000Z", "expectedDeparture": "2026-10-19T13:43:00.000Z",
      "departureDelayMin": 10,
      "platform": "7", "status": "Verspätung"
    }
  ],
  "remarks": []
}
```

`delayedStops` beantwortet schnell die Frage *„Wie weit breitet sich die Verspätung aus?"*.

### 4.9 `find_journeys` — DB-Verbindungen mit Verspätungen

**Argumente**

| Arg | Typ | Standard | Beschreibung |
|---|---|---|---|
| `from` | string **erforderlich** | – | Start: Name oder EVA-ID. |
| `to` | string **erforderlich** | – | Ziel: Name oder EVA-ID. |
| `via` | string | – | Optionale Zwischenstation. |
| `departure` | ISO 8601 | jetzt | Geplante Abfahrtszeit, z. B. `"2026-10-19T17:00:00+02:00"`. |
| `transfers` | int 0–6 | – | Maximale Umstiege. |
| `results` | int 1–8 | `3` | Anzahl der Verbindungen. |
| `products` | string[] | alle | Gleiche Produkt-IDs wie `station_delays`. |
| `language` | `"en"`/`"de"` | `en` | – |

**Aufrufe**

```json
{"name": "find_journeys", "arguments": {"from": "Berlin Hbf", "to": "München Hbf", "results": 2}}
{"name": "find_journeys", "arguments": {"from": "8011160", "to": "8000261", "departure": "2026-10-19T17:00:00+02:00", "transfers": 0}}
{"name": "find_journeys", "arguments": {"from": "Köln Hbf", "to": "Dortmund Hbf", "products": ["nationalExpress", "regionalExpress"], "language": "de"}}
```

**Antwortformat**

```json
{
  "from": "Berlin Hbf", "to": "München Hbf", "count": 1,
  "journeys": [
    {
      "status": "Verspätung",
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
          "cancelled": false, "status": "Verspätung",
          "remarks": []
        }
      ],
      "refreshToken": "…"
    }
  ]
}
```

---

# 5. Typische Frage → Tool-Rezepte

| Nutzerfrage | Tool-Aufruf |
|---|---|
| *„Ist die Dortmunder Straßenbahn gerade verspätet?"* | `dsw21_delays {"stop": "Dortmund Hbf", "minutes": 30}` |
| *„Wie spät ist die U45 ab Reinoldikirche?"* | `dsw21_delays {"stop": "Dortmund Reinoldikirche", "minutes": 30}` |
| *„Gibt es heute Störungen auf DSW21?"* | `gtfs_rt_alerts {"limit": 10}` |
| *„Alle verspäteten Abfahrten in Dortmund Hbf in den nächsten 2 h"* | `gtfs_rt_delays {"stop": "Dortmund Hbf", "minutes": 120, "minDelay": 1}` |
| *„Fährt der ICE von Berlin nach München pünktlich?"* | `find_journeys {"from": "Berlin Hbf", "to": "München Hbf"}` → `trip_delays {tripId aus dem Abschnitt}` |
| *„Wie spät kommt mein Zug hier an?"* | `station_delays {"station": "Erfurt Hbf", "minutes": 60}` → `trip_delays {tripId}` |
| *„Welche Stationen sind in meiner Nähe?"* | `nearby_stations {"latitude": …, "longitude": …}` |

# 6. Bekannte Einschränkungen

**GTFS-RT / DSW21**
* **Keine Gleis-/Steigänderungen** — das GTFS-RT-Format liefert nur Verspätungen und Ausfälle (`SKIPPED`/`NO_DATA`); Gleise sind Statikdaten.
* **Keine Richtung (`headsign`)** für DSW21 — die gtfs.de-Datei `trips.txt` enthält nur `route_id,service_id,trip_id`.
* **Erster Aufruf baut einen statischen Index** (~18 MB Download via HTTP Range, einige Sekunden, danach 24 h in `GTFS_INDEX_DIR` gecacht).
* gtfs.de nennt **Busse im VRR-Feed unvollständig**; Tram/Schiene (DSW21-U- und Straßenbahnlinien) sind der zuverlässige Teil.

**Deutsche Bahn**
* DB **drosselt und blockiert Clients mitunter** (`HTTP 452 "OPS_BLOCKED"`, manchmal `403`). Dieser Server cacht aggressiv (Tafeln 30 s, Verbindungen 60 s, Standorte 6 h), drosselt Anfragen und liefert einen **klaren lokalisierten Fehler** statt abzustürzen — aber upstream-Blockierungen sind nicht kontrollierbar. Die DSW21-/GTFS-RT-Tools sind nicht betroffen.
* Tafeln ohne API-Key decken grob die **nächste Stunde** ab (`dbris`-Profil + `DB_API_KEY`: bis 12 h).
* Rechtlich erfordert die Nutzung der DB-APIs formal die Erlaubnis der Deutschen Bahn; setzen Sie einen identifizierenden `DB_USER_AGENT`.

# 7. Problemlösung

| Symptom | Ursache / Lösung |
|---|---|
| `Deutsche Bahn is currently blocking requests … HTTP 452` | DB blockiert Ihre IP. Warten, `DB_PROFILE` wechseln, aus anderem Netz starten — oder die GTFS-RT-Tools nutzen (unabhängig). |
| `[dsw21-mcp] Warning: DB_USER_AGENT is not set …` | `DB_USER_AGENT` auf etwas Identifizierendes setzen, z. B. `my-app (me@example.org)`. |
| `Building the static GTFS index for the first time …` | Normal beim allerersten GTFS-RT-Aufruf; in ~30 s erneut versuchen. Spätere Aufrufe nutzen den 24-h-Cache. |
| `No stop found for "…" in the static GTFS index` | Den exakten gtfs.de-Namen nutzen (z. B. `"Dortmund Hbf"`) oder die numerische Stop-ID. |
| `Could not build/load the static GTFS index …` | Kein Internetzugang zu `download.gtfs.de` oder das Archiv-Layout hat sich geändert. Erneut versuchen; `npm run test:gtfsrt` prüfen. |
| Client zeigt keine Tools | Absoluten Pfad in der Konfiguration prüfen, `npm install` erfolgreich?, Client vollständig neu starten. |
| LM Studio ignoriert den Server | **Einstellungen → Server → „Allow calling servers from mcp.json"** aktivieren; Program → Integrations prüfen. |
| Tests schlagen nach `git clone` fehl | Zuerst `npm install` ausführen. |
| Android: Client-App sieht den Server nicht | Mobile-Cloud-Apps (Claude/ChatGPT) unterstützen nur *remote* MCP; Agenten in Termux laufen lassen oder den Server auf einem PC hosten. |

# 8. Entwicklung

```bash
npm test            # offline: Formatter + GTFS-Unit-Tests + stdio-Smoke-Test
npm run test:gtfsrt # live: baut Index, fragt echte DSW21-Verspätungen ab (Netzwerk)
npm start           # MCP-Server auf stdio starten
```

Struktur:

```
dsw21-mcp/
├── src/
│   ├── index.js          # Einstieg: stdio-Transport + Tool-Registrierung
│   ├── client.js         # db-vendo-client-Wrapper: Profil, Drossel, Cache, Fehler
│   ├── cache.js          # In-Memory-TTL-Cache
│   ├── format.js         # kompaktes FPTF → LLM-freundliches JSON
│   ├── i18n.js           # en/de-Strings
│   ├── gtfs/
│   │   ├── zip.js        # einzelne Dateien aus remote 236-MB-zip via HTTP Range lesen
│   │   ├── csv.js        # GTFS-CSV-Parser
│   │   ├── index.js      # statischer GTFS-Indexaufbau + Disk-Cache (~18 MB)
│   │   └── feed.js       # GTFS-RT-Feed: laden, dekodieren, joinen
│   └── tools/
│       ├── gtfs-rt.js    # dsw21_delays, gtfs_rt_delays, gtfs_rt_alerts
│       ├── stations.js   # search_stations, nearby_stations
│       ├── departures.js # station_delays, station_arrivals
│       ├── trip.js       # trip_delays
│       └── journeys.js   # find_journeys
└── test/
    ├── format.test.js    # Offline-Formatter-Tests
    ├── gtfs.test.js      # Offline-CSV- + Stop-Auflösungs-Tests
    ├── gtfsrt-live.js    # Live-GTFS-RT-Pipeline-Test
    └── smoke.js          # MCP-stdio-Tool-Registrierungstest
```

# 9. Datenquellen & Lizenz

* GTFS-RT-Stream & statischer Fahrplan: [gtfs.de](https://gtfs.de/de/realtime/) — CC BY-SA 4.0 / CC BY 4.0, bereitgestellt von DELFI e.V. und regionalen Verbünden; **ohne jegliche Garantie**. Bitte die [Transitous-Nutzungsrichtlinie](https://transitous.org/api/) für alternative Zugriffswege beachten.
* Deutsche-Bahn-Daten via [db-vendo-client](https://github.com/public-transport/db-vendo-client) (ISC-Lizenz) — inoffiziell, Caveats im readme.
* Dieser Server: ISC-Lizenz. Repository: https://github.com/sashok53011/dsw21-mcp
