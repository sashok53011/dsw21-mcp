# dsw21-mcp

**Öffentlicher-Verkehr-MCP-Server für ganz Deutschland: Echtzeit-Verspätungen, Fahrpläne, Verbindungen und Haltestellen — mit detaillierter Abdeckung des DSW21-Netzes (Dortmund).**

[English](readme.md) · [Deutsch](readme.de.md) · [Русский](readme.ru.md)

Ein MCP-Server ([Model Context Protocol](https://modelcontextprotocol.io)), den jedes MCP-fähige KI-Client (Claude Desktop, hermes-agent, OpenCode, LM Studio, zerotap, …) aufrufen kann, um Fragen wie *„Wann fährt der nächste ICE nach Berlin?"*, *„Wie komme ich von hier zum Flughafen?"*, *„Ist meine Straßenbahn verspätet?"* oder *„Gibt es heute Störungen auf DSW21-Linien?"* zu beantworten.

> *Der Projektname `dsw21-mcp` ist historisch bedingt (ursprünglicher Fokus: DSW21 in Dortmund) — die meisten Tools sind aber deutschlandweit.*

**Abdeckung auf einen Blick:** Verbindungsplanung, Fahrzeugverfolgung und Fahrpläne (`plan_journey`, `trip_status`, `stop_departures`) funktionieren **überall in Deutschland** über die kostenlose **[Transitous](https://transitous.org)**-MOTIS-Instanz (deutschlandweite GTFS/GTFS-RT-Aggregation); `nearby_stops` durchsucht alle 585.000+ Haltestellen des gtfs.de-Nationalfahrplans. Die Echtzeit-Verspätungstools für den Nahverkehr (`dsw21_delays`, `gtfs_rt_delays`, `gtfs_rt_alerts`) verknüpfen den kostenlosen **GTFS-RT-Stream [realtime.gtfs.de](https://gtfs.de/de/realtime/)** (Aktualisierung alle 10 s) mit dem DSW21-Agentur-Index — das ist das **DSW21-Netz (Dortmund) im Detail**: Straßenbahnen, Busse und U-Bahn mit Verspätungen, Ausfällen und Störungen.

## Tools

| Tool | Was es tut | Abdeckung |
|---|---|---|
| `stop_departures` | Nächste Abfahrten an jeder Haltestelle mit Echtzeit: Linie, Verspätung, Gleis. | **Deutschland** |
| `trip_status` | Ein Fahrzeug (Zug/Bus/Straßenbahn) auf der ganzen Strecke: pro Haltestelle Soll-/Ist-Zeiten, Verspätungsausbreitung, Gleisänderungen, Ausfälle. | **Deutschland** |
| `plan_journey` | Verbindungen mit Echtzeit via MOTIS: Ziel per Name oder `"lat,lon"`, `arriveBy` fürs Rückwärtsplanen, `modes`-Filter. Start-Priorität: **zuerst das eigene Standort-Tool des Clients** (z. B. zerotap) — Koordinaten als `from="lat,lon"` übergeben; `current_location` nur als letzte Instanz. | **Deutschland** |
| `nearby_stops` | Haltestellen nahe einem Punkt, nach Entfernung sortiert — liefert `stopId` an die Verspätungs-Tools weiter. Gleiche Start-Priorität wie `plan_journey`. | **Deutschland** (585k Haltestellen) |
| `current_location` | **Letzte Instanz für Clients ohne Standort-Tool**: präzises GPS von der `/locate`-Seite (einmal am Handy öffnen — Koordinaten bleiben auf diesem Server) oder `LOCATION_LAT`/`LOCATION_LON` (Env). Wenn der Client selbst GPS lesen kann (zerotap usw.), dieses verwenden — den Nutzer niemals nach dem Standort fragen. | serverseitig |
| `dsw21_delays` | Echtzeit-Verspätungen an einer DSW21-Haltestelle (Komfort-Wrapper, Standard *Dortmund Hbf*). | **DSW21 (Dortmund)** |
| `gtfs_rt_delays` | Echtzeit-Verspätungen für eine Haltestelle (Name oder numerische ID) aus dem GTFS-RT-Stream, verknüpft mit dem DSW21-Agentur-Index. | **DSW21 (Dortmund)** |
| `gtfs_rt_alerts` | Service-Meldungen / Störungen betreffend DSW21-Züge, mit Klartext. | **DSW21 (Dortmund)** |

Jedes Tool akzeptiert den optionalen Parameter **`language`** (`"en"` oder `"de"`), der Statuswörter (`on time`/`pünktlich`, `delayed`/`Verspätung`, `cancelled`/`fällt aus`) und Fehlermeldungen umschaltet. JSON-Feldnamen bleiben sprachunabhängig stabil. Die Standardsprache kann einmalig über `DB_LANG` gesetzt werden (Abschnitt 3).

---

# 1. Installation & Deployment

Der Server ist eine gewöhnliche Node.js-Anwendung und spricht **MCP über stdio**: Ihr KI-Client startet ihn automatisch bei Bedarf — kein Dämon zum Am-Laufen-Halten. Für immer-auf-Maschinen gibt es einen **HTTP-Modus** (Streamable HTTP, Abschnitt 1.4) für entfernte Clients wie Handy-Apps. Installation einmal pro Maschine.

**Voraussetzungen (alle Plattformen):** Node.js ≥ 18 (getestet mit Node 24), Internetzugang, ~30 MB Festplattenplatz für `node_modules` plus den Cache des statischen GTFS-Index.

<details>
<summary><b>Inhaltsverzeichnis</b></summary>

- [1.1 Windows](#11-windows)
- [1.2 Linux](#12-linux)
- [1.3 Android (Termux)](#13-android-termux)
- [1.4 HTTP-Modus (Streamable HTTP)](#14-http-modus-streamable-http)
- [1.5 Standort-Teilen (/locate-Seite)](#15-standort-teilen-locate-seite)
- [2. MCP-Client-Konfiguration](#2-mcp-client-konfiguration)
  - [2.1 Claude Desktop & Claude Code](#21-claude-desktop--claude-code)
  - [2.2 hermes-agent (NousResearch)](#22-hermes-agent-nousresearch)
  - [2.3 OpenCode](#23-opencode)
  - [2.4 LM Studio](#24-lm-studio)
  - [2.5 Universelle Konfiguration (Cursor, Windsurf, Cline, …)](#25-universelle-konfiguration-cursor-windsurf-cline-)
  - [2.6 Schneller stdio-Selbsttest](#26-schneller-stdio-selbsttest)
  - [2.7 OmniChat Android-App (HTTP)](#27-omnichat-android-app-http)
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

Erwartet: `smoke test passed ✓` mit allen acht Tools.

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
* Kopflose Maschine (VPS/Home-Server): nach z. B. `/opt/dsw21-mcp` klonen, `npm install --omit=dev` ausführen und den HTTP-Modus (Abschnitt 1.4) nutzen, damit entfernte Clients verbinden können.

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

* Die **Claude-/ChatGPT-Handy-Apps können lokale stdio-Server nicht starten** — mobile Cloud-Apps unterstützen nur *remote* (HTTP)-MCP-Server, während der Standardeinstieg von `dsw21-mcp` stdio ist. Auf dem Handy entweder mit Agenten koppeln, die *in Termux* laufen (oder jedem Client, der lokal `node` starten kann), oder den HTTP-Modus (Abschnitt 1.4) auf einem Server deployen und remote verbinden (z. B. über die OmniChat-App, Abschnitt 2.7).
* Empfohlen für die Handynutzung: `dsw21-mcp` im HTTP-Modus (Abschnitt 1.4) auf dem PC/Server laufen lassen (Windows/Linux-Abschnitte oben) und von jeder MCP-App über `https://` verbinden; die Daten sind identisch.
* Termux während langer Sitzungen wach halten: `termux-wake-lock`. Autostart beim Boot: das Add-on [Termux:Boot](https://github.com/termux/termux-boot).
* Der erste GTFS-RT-Aufruf lädt den ~18 MB großen Index; in mobilen Netzwerken kann das einen Moment dauern.

## 1.4 HTTP-Modus (Streamable HTTP)

`src/http.js` serviert dieselben acht Tools über [Streamable HTTP](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#streamable-http) für immer-auf-Maschinen — Home-Server, FreedomBox oder VPS hinter einem Reverse Proxy / Cloudflare-Tunnel. Handy-Apps (z. B. OmniChat für Android) erreichen nur *remote*-MCP-Server, daher ist das der Modus fürs Handy. Zusätzlich serviert es die **`/locate`-Seite** (Abschnitt 1.5) zum Teilen der GPS-Position.

```bash
npm run start:http          # lauscht auf 127.0.0.1:8003, Endpunkt /mcp (+ /health)
```

* `MCP_HTTP_PORT` — Laufport (Standard `8003`; `0` = vom OS zugewiesen).
* `MCP_HTTP_HOST` — Bind-Adresse (Standard `127.0.0.1`; localhost behalten, wenn ein Reverse Proxy oder `cloudflared`-Tunnel auf demselben Host die öffentliche URL publiziert).
* Sitzungen sind gemäß Spezifikation stateful: `initialize` erzeugt eine `Mcp-Session-Id`, spätere Anfragen geben sie zurück, `DELETE` beendet sie; Sitzungen mit über einer Stunde Ruhezeit werden automatisch aufgeräumt (abgestürzte Clients lecken nicht).
* `GET /health` antwortet `ok` fürs Monitoring; der MCP-Endpunkt ist `/mcp`. `GET /mcp` (standalone SSE) wird nicht unterstützt und antwortet `405` — das ist normal, unterstützte Clients nutzen `POST`.

> **Sicherheit — der `/mcp`-Endpunkt hat keine eingebaute Authentifizierung.**
> Jeder, der die URL erreichen kann, kann alle Tools aufrufen und Outbound-Anfragen an gtfs.de auslösen. Deshalb:
> * `MCP_HTTP_HOST=127.0.0.1` behalten und einen Reverse Proxy oder Tunnel auf demselben Host die URL publizieren lassen.
> * Nur hinter **Zugriffskontrolle** veröffentlichen: [Cloudflare Access](https://one.cloudflare.com/access/) vor dem Tunnel, HTTP Basic Auth am Proxy oder ein VPN (WireGuard/Tailscale) statt des öffentlichen Internets.
> * Keinesfalls einen rohen Port mit `MCP_HTTP_HOST=0.0.0.0` ins offene Internet richten.

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

Unter **Windows** in einer Konsole starten (`npm run start:http`) oder einen geplanten Task / [NSSM](https://nssm.cc)-Dienst auf `node.exe D:\mcp5\db\dsw21-mcp\src\http.js` zeigen.

**Öffentlicher Zugang (Beispiel Cloudflare-Tunnel):** einen Hostnamen am lokalen Port publizieren — keine offenen eingehenden Ports, kombiniert mit Cloudflare Access für Authentifizierung (siehe Sicherheitsbox oben):

| Hostname | Dienst |
|---|---|
| `dsw21-mcp.devhorizon.online` | `http://localhost:8003` |

Der MCP-Endpunkt ist dann `https://dsw21-mcp.devhorizon.online/mcp`. Reverse-Proxy-Hinweise: Header `Mcp-Session--Id` sowie Methoden `POST`/`DELETE` durchreichen, Response-Pufferung für `text/event-stream` deaktivieren (nginx: `proxy_buffering off; proxy_read_timeout 110s`), und die 100-Sekunden-Idle-Timeout der Cloudflare-Gratisstufe beachten — den GTFS-Index nach jedem (Neu)Start einmal aufwärmen, damit der erste echte Aufruf schnell bleibt.

## 1.5 Standort-Teilen (`/locate`-Seite)

Die Standort-Tools (`current_location`, `nearby_stops`, `plan_journey`) lösen die Position des Nutzers aus zwei Quellen in dieser Reihenfolge auf:

1. **GPS über die `/locate`-Seite** (nur HTTP-Modus). Einmal `https://<host>/locate` im Handy-Browser öffnen, Geolokalisierung erlauben — die Seite sendet die Position an den Server (`POST /locate`) und hält sie über `watchPosition` aktuell, solange der Tab offen bleibt. Koordinaten werden **auf dem eigenen Server** in `GTFS_INDEX_DIR/location.json` (Rechte 600) gespeichert und überstehen Restarts.
2. **`LOCATION_LAT` / `LOCATION_LON`** (Env-Variablen) — statische Position für Maschinen ohne Browser.

Es gibt bewusst **keine IP-Geolokalisierung**: ihre Genauigkeit (~20 km, oft schlechter) ist für die Verbindungsplanung nutzlos — von einem falschen Punkt zu planen ist schlechter, als den Nutzer zum Öffnen der `/locate`-Seite aufzufordern.

> **Privatsphäre & Zugriff**
> * GPS-Koordinaten verlassen den eigenen Server nie und werden niemals an Dritte gesendet.
> * Die `/locate`-Seite hat **keine Authentifizierung** (wie vereinbart): Wer die URL kennt, kann nichts *lesen*, aber die gespeicherte Position *überschreiben*. Bei geheimem Hostnamen und geschütztem Rest der Installation (Cloudflare Access usw.) ist das für den Privatgebrauch akzeptabel; die `/locate`-URL nicht veröffentlichen.

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
      "env": { "DB_LANG": "de" }
    }
  }
}
```

**Claude Code** (CLI) — Server in einem Befehl:

```bash
claude mcp add dsw21-mcp -e DB_LANG="de" -- node /home/user/dsw21-mcp/src/index.js
```

(Windows: `claude mcp add dsw21-mcp -e DB_LANG="de" -- node D:/mcp5/db/dsw21-mcp/src/index.js`; Verwaltung via `claude mcp list` / `claude mcp remove dsw21-mcp`.)

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
      DB_LANG: "de"
    timeout: 300
```

> `timeout: 300` (Sekunden) wird empfohlen: Der allererste GTFS-RT-Aufruf lädt den ~18 MB großen statischen Index, was eine kurze Standard-Timeout sonst überschreiten kann.

Nützliche Extras:

* **Hot Reload:** nach dem Bearbeiten der YAML `/reload-mcp` in der Sitzung ausführen — kein Neustart nötig.
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
node /home/user/dsw21-mcp/src/index.js
```

Sie sollten `[dsw21-mcp] ready (lang: de)` auf stderr sehen. Der Prozess wartet dann auf MCP-Nachrichten auf stdin (normal — `Ctrl+C` zum Beenden).

## 2.6 Schneller stdio-Selbsttest

Ohne Client beweisen, dass der Server MCP-Anfragen beantwortet, mit einer Pipe aus `initialize` + `tools/list` JSON-RPC:

```bash
(printf '%s\n' \
 '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"probe","version":"0"}}}' \
 '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
 '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'; sleep 2) | node src/index.js
```

Die Antwort enthält alle acht Tools — Beweis, dass die Integration bereit ist.

## 2.7 OmniChat Android-App (HTTP)

Die OmniChat-Android-App spricht MCP über Streamable HTTP und kann dsw21-mcp vollständig remote steuern:

1. Server im HTTP-Modus (Abschnitt 1.4) starten und hinter Zugriffskontrolle veröffentlichen (Reverse Proxy mit Basic Auth / Cloudflare Access — siehe Sicherheitsbox in 1.4).
2. In der App: **MCP-Tab → HTTP →** Name `dsw21-mcp`, URL `https://dsw21-mcp.devhorizon.online/mcp` → hinzufügen → **Connect**.
3. Die App führt `initialize` + `tools/list` aus und synchronisiert alle acht Tools; Tools einzeln aktivieren/deaktivieren und z. B. fragen: *„Ist die Dortmunder Straßenbahn gerade verspätet?“*.

Das Handy braucht keine lokale Laufzeit — alles läuft auf dem Server. Der erste GTFS-RT-Aufruf baut den ~18 MB großen Index serverseitig (nach dem Deploy aufwärmen, siehe 1.4).

---

# 3. Umgebungsvariablen

| Variable | Standard | Bedeutung |
|---|---|---|
| `DB_LANG` | `en` | Standard-Ausgabesprache (`en`/`de`), wenn `language` fehlt. (Name aus Kompatibilitätsgründen beibehalten; keine Deutsche-Bahn-Beteiligung.) |
| `DB_USER_AGENT` | *(unset)* | Optionaler User-Agent für Anfragen an gtfs.de — eine höfliche Art, Ihre Installation zu identifizieren. |
| `GTFS_RT_FEED_URL` | `https://realtime.gtfs.de/realtime-free.pb` | GTFS-RT-Stream, den alle Tools nutzen. |
| `GTFS_INDEX_DIR` | `./.gtfs-index` | Cache-Verzeichnis für den statischen GTFS-Index und die gespeicherte GPS-Position (`location.json`). |
| `LOCATION_LAT` / `LOCATION_LON` | *(unset)* | Statische Ersatzkoordinaten für `current_location` / `nearby_stops` / `plan_journey`, wenn kein GPS-Fix geteilt wurde. |
| `LOCATION_FILE` | `<GTFS_INDEX_DIR>/location.json` | Wohin die GPS-Position der `/locate`-Seite gespeichert wird (Rechte 600). |
| `TRANSITOUS_URL` | `https://api.transitous.org/api` | Basis-URL der MOTIS-Instanz für `plan_journey` / `trip_status` / `stop_departures` (Pfade enthalten die API-Version, z. B. `/v6/plan`). |
| `MCP_HTTP_PORT` | `8003` | Laufport des HTTP-Modus (`npm run start:http`; `0` = vom OS zugewiesen). |
| `MCP_HTTP_HOST` | `127.0.0.1` | Bind-Adresse des HTTP-Modus. |

Setzen pro Client: Claude Desktop / LM Studio / universell → `"env"`-Block in JSON; hermes-agent → `env:` in YAML; OpenCode → `"environment"`; oder im Shell-Export vor dem Start (`export DB_LANG=de`, PowerShell: `$env:DB_LANG="de"`).

---

# 4. Nutzungshilfe: alle Tools mit Beispielen

**Zeitformat:** alle Zeitstempel in Antworten sind ISO 8601 mit **expliziter Europe/Berlin-Verschiebung** (z. B. `2026-10-23T16:00:00.000+02:00` im Sommer, `+01:00` im Winter) — nie ein nacktes UTC-`Z` — damit Clients und Models sie niemals für die falsche Ortszeit halten.

Beispiele zeigen die JSON-**Argumente** eines Tools und eine **repräsentative Antwort**. Die Antworten unten sind echte Aufnahmen vom 2026-10-19 — tatsächliche Werte hängen von der Tageszeit ab.

### 4.1 `dsw21_delays` — DSW21-Verspätungen an einer Dortmunder Haltestelle

Bester Einstieg für Dortmund. Standard ist *Dortmund Hbf*; die Haltestelle wird auf **alle Steige** aufgelöst (der Echtzeit-Feed referenziert Steig-IDs — siehe `stopIdCount`).

**Argumente**

| Arg | Typ | Standard | Beschreibung |
|---|---|---|---|
| `stop` | string | `"Dortmund Hbf"` | Dortmunder Haltestellenname oder numerische GTFS-ID. |
| `minutes` | int 5–180 | `60` | Zeitfenster ab jetzt. |
| `language` | `"en"`/`"de"` | `DB_LANG` | Sprache der Statuswörter. |

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
      "scheduled": "2026-10-19T12:45:35.000+02:00",
      "expected":  "2026-10-19T12:46:10.000+02:00",
      "delayMin": 1, "status": "Verspätung"
    },
    {
      "stopId": "343399", "stopName": "Dortmund Hbf", "tripId": "584030",
      "line": "412", "headsign": null,
      "scheduled": "2026-10-19T12:55:34.000+02:00",
      "expected":  "2026-10-19T12:58:08.000+02:00",
      "delayMin": 3, "status": "Verspätung"
    },
    {
      "stopId": "462694", "stopName": "Dortmund Hbf", "tripId": "1601850",
      "line": "U45", "headsign": null,
      "scheduled": "2026-10-19T12:56:05.000+02:00",
      "expected":  "2026-10-19T12:57:34.000+02:00",
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

### 4.2 `gtfs_rt_delays` — DSW21-Verspätungen an jeder Haltestelle

Echtzeit-Verspätungen für **DSW21-Fahrzeuge** (Straßenbahn/Bus/U-Bahn) an einer frei wählbaren Haltestelle — per Name oder numerischer ID. Die Haltestellensuche selbst funktioniert deutschlandweit über den gtfs.de-Index, die Ergebnisse sind aber auf die **DSW21-Agentur** gefiltert; für andere Betreiber `stop_departures` (Abschnitt 4.8) verwenden.

**Argumente**

| Arg | Typ | Standard | Beschreibung |
|---|---|---|---|
| `stop` | string **erforderlich** | – | Haltestellenname oder numerische GTFS-ID. |
| `minutes` | int 5–180 | `60` | Zeitfenster ab jetzt. |
| `minDelay` | int 0–60 | `1` | Nur Einträge mit ≥ dieser Verspätung; `0` = alles anzeigen. |
| `limit` | int 1–200 | `50` | Maximale Ergebnisse. |
| `language` | `"en"`/`"de"` | `DB_LANG` | Sprache der Statuswörter. |

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
  "feedTimestamp": "2026-10-19T12:42:20.000+02:00",
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
| `language` | `"en"`/`"de"` | `DB_LANG` | Sprache der Labels. |

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

### 4.4 `current_location` — wo bin ich?

**Letzte Instanz für Clients ohne Standort-Tool** — löst die serverseitige Position auf (präzises GPS von `/locate` → statische Env-Variablen). Wenn der Client selbst GPS lesen kann (z. B. zerotap), **dieses** verwenden und die Koordinaten direkt an `plan_journey`/`nearby_stops` übergeben. Es gibt keine IP-Geolokalisierung — ist keine Position bekannt, sagt das Tool es und weist den Nutzer auf die `/locate`-Seite hin.

**Argumente**

| Arg | Typ | Standard | Beschreibung |
|---|---|---|---|
| `language` | `"en"`/`"de"` | `DB_LANG` | Sprache der Labels. |

**Aufruf**

```json
{"name": "current_location", "arguments": {}}
```

**Antwort mit GPS-Fix von der `/locate`-Seite (echt)**

```json
{
  "latitude": 51.51693,
  "longitude": 7.46115,
  "source": "gps",
  "accuracyMeters": 12,
  "ageMinutes": 3
}
```

Positionen älter als 6 h werden mit `"stale": true` und dem Hinweis markiert, `/locate` erneut zu öffnen. **Antwort, wenn kein Standort bekannt ist** (echt):

```json
{
  "location": null,
  "note": "Noch kein Standort bekannt. Die /locate-Seite dieses Servers im Handy-Browser öffnen, um GPS-Koordinaten zu teilen (bleiben auf diesem Server), oder LOCATION_LAT/LOCATION_LON auf dem Server setzen.",
  "howTo": {
    "gps": "POST /locate oder <dieser-server>/locate im Handy-Browser öffnen",
    "env": "LOCATION_LAT und LOCATION_LON auf dem Server setzen"
  }
}
```

### 4.5 `nearby_stops` — welche Haltestellen sind nah?

Nächste Stationen aus dem statischen GTFS-Index, nach Entfernung sortiert, pro Station dedupliziert (Plattformen zusammengeführt). Die `stopId` an `dsw21_delays` / `gtfs_rt_delays` weitergeben.

**Argumente**

| Arg | Typ | Standard | Beschreibung |
|---|---|---|---|
| `latitude` / `longitude` | number | aktuelle Position | Position für die Suche. |
| `radius` | int 50–5000 | `800` | Suchradius in Metern. |
| `limit` | int 1–20 | `8` | Maximale Ergebnisse. |
| `language` | `"en"`/`"de"` | `DB_LANG` | Sprache der Labels. |

**Aufruf** (explizite Koordinaten)

```json
{"name": "nearby_stops", "arguments": {"latitude": 51.5169, "longitude": 7.4609, "radius": 600, "limit": 5}}
```

**Antwort (echt)**

```json
{
  "around": { "latitude": 51.5169, "longitude": 7.4609, "source": "argument" },
  "radiusMeters": 600,
  "count": 5,
  "stops": [
    { "stopId": "577810", "name": "Dortmund Hbf", "distance": 13 },
    { "stopId": "114687", "name": "Dortmund Kampstraße", "distance": 198 },
    { "stopId": "405714", "name": "Dortmund Burgtor", "distance": 305 },
    { "stopId": "477593", "name": "DO Steinwache/DO-Hbf Nord", "distance": 356 },
    { "stopId": "355029", "name": "Dortmund Burgtor", "distance": 393 }
  ]
}
```

### 4.6 `plan_journey` — wie komme ich dahin?

Verbindungsplanung über Transitous (MOTIS, deutschlandweite Abdeckung) mit Echtzeit-Updates. Der Start ist standardmäßig die aktuelle Position — der Nutzer muss nicht nach dem Standort gefragt werden. Das Ziel ist ein Ortsname (geokodiert) oder `"lat,lon"`.

**Argumente**

| Arg | Typ | Standard | Beschreibung |
|---|---|---|---|
| `to` | string **erforderlich** | – | Ziel: Ortsname oder `"lat,lon"`. |
| `from` | string | aktuelle Position | Start: Ortsname oder `"lat,lon"`. |
| `time` | ISO 8601 | jetzt | Abfahrtszeit — oder Ankunftszeit bei `arriveBy=true`. |
| `arriveBy` | boolean | `false` | Rückwärts planen: `time` bedeutet „Ich muss um … ankommen". |
| `maxTransfers` | int 0–10 | – | Maximale Umstiege (`0` = nur direkte Verbindungen). |
| `modes` | string[] | alle | Filter nach Verkehrsmitteln, z. B. `["TRAM","SUBWAY","BUS"]`. |
| `results` | int 1–5 | `3` | Anzahl der Itineraries. |
| `language` | `"en"`/`"de"` | `DB_LANG` | Sprache der Statuswörter. |

**Aufrufe**

```json
{"name": "plan_journey", "arguments": {"to": "Dortmund Flughafen", "from": "Dortmund Hbf", "results": 2}}
{"name": "plan_journey", "arguments": {"to": "51.5231,7.4653", "results": 1}}
{"name": "plan_journey", "arguments": {"to": "Köln Hbf", "time": "2026-10-24T17:00:00+02:00", "arriveBy": true}}
{"name": "plan_journey", "arguments": {"to": "Flughafen Dortmund", "modes": ["TRAM", "SUBWAY", "BUS"]}}
```

**Antwort (echt, gekürzt)**

```json
{
  "source": "Transitous (MOTIS)",
  "from": { "name": "Dortmund Hbf", "latitude": 51.5169, "longitude": 7.4609 },
  "to": { "name": "Dortmund Flughafen", "latitude": 51.5189, "longitude": 7.6123 },
  "count": 2,
  "itineraries": [
    {
      "departAt": "2026-10-23T14:03:00.000+02:00",
      "arriveAt": "2026-10-23T15:05:00.000+02:00",
      "durationMin": 62,
      "transfers": 1,
      "legs": [
        { "mode": "WALK", "from": "START", "to": "Dortmund Kampstraße",
          "depart": "2026-10-23T14:03:00.000+02:00", "arrive": "2026-10-23T14:09:00.000+02:00",
          "distanceMeters": 450 },
        { "mode": "SUBWAY", "line": "U43", "headsign": "Dortmund Westfalenhütte",
          "from": "Dortmund Kampstraße", "to": "…",
          "depart": "2026-10-23T14:14:00.000+02:00", "scheduledDepart": "2026-10-23T14:12:00.000+02:00",
          "delayMin": 2, "status": "delayed", "track": "23", "scheduledTrack": "23" }
      ]
    }
  ]
}
```

Transit-Abschnitte enthalten `line`, `headsign`, `tripId`, `track`/`scheduledTrack`, `cancelled` und `delayMin` (Echtzeit vs. Fahrplan) — dieselben Statuswörter wie bei den Verspätungs-Tools.

### 4.7 `trip_status` — wo ist mein Fahrzeug und wie spät ist es?

Ein Fahrzeug (Zug/Bus/Straßenbahn) auf der **gesamten Strecke, deutschlandweit**, mit Echtzeit: jede Haltestelle mit Soll-/Ist-Zeiten, Verspätungsausbreitung, Gleisänderungen, Ausfällen. Die `tripId` aus einem `plan_journey`-Abschnitt oder einem `stop_departures`-Eintrag holen.

**Argumente**

| Arg | Typ | Standard | Beschreibung |
|---|---|---|---|
| `tripId` | string **erforderlich** | – | Trip-ID aus einem Verbindungsabschnitt oder Abfahrtseintrag. |
| `language` | `"en"`/`"de"` | `DB_LANG` | Sprache der Statuswörter. |

**Aufruf** (tripId aus `stop_departures`)

```json
{"name": "trip_status", "arguments": {"tripId": "20261023_14:48_de-DELFI_3444084535"}}
```

**Antwort (echt, gekürzt)**

```json
{
  "source": "Transitous (MOTIS)",
  "tripId": "20261023_14:48_de-DELFI_3444084535",
  "line": "U41",
  "mode": "SUBWAY",
  "headsign": "Dortmund Clarenberg",
  "from": "Dortmund Brechten Zentrum",
  "to": "Dortmund Clarenberg",
  "depart": "2026-10-23T14:48:00.000+02:00",
  "scheduledDepart": "2026-10-23T14:48:00.000+02:00",
  "arrive": "2026-10-23T15:20:00.000+02:00",
  "scheduledArrive": "2026-10-23T15:19:00.000+02:00",
  "delayMin": 0,
  "status": "pünktlich",
  "stops": 22,
  "delayedStops": 7,
  "stopovers": [
    { "name": "Dortmund Wittichstraße", "stopId": "de-DELFI_de:05913:515:21:21",
      "arrival": "2026-10-23T14:49:00.000+02:00", "scheduledArrival": "2026-10-23T14:49:00.000+02:00",
      "arrivalDelayMin": 0, "departure": "2026-10-23T14:49:00.000+02:00",
      "scheduledDeparture": "2026-10-23T14:49:00.000+02:00", "departureDelayMin": 0,
      "track": "21", "scheduledTrack": "21", "status": "pünktlich" }
  ]
}
```

`delayedStops` beantwortet auf einen Blick „Wie weit breitet sich die Verspätung aus?"; `track`/`scheduledTrack` pro Haltestelle zeigen Gleisänderungen.

### 4.8 `stop_departures` — Fahrplan für jede Haltestelle in Deutschland

Nächste Abfahrten an **jeder Haltestelle in Deutschland** mit Echtzeit (Transitous/MOTIS) — ergänzt `dsw21_delays`/`gtfs_rt_delays`, die nur den gtfs.de-Feed-Bereich abdecken. Nützlich für Fernverkehrshaltestellen (Köln, Frankfurt, München …) und Reisen außerhalb NRW.

**Argumente**

| Arg | Typ | Standard | Beschreibung |
|---|---|---|---|
| `stop` | string **erforderlich** | – | Haltestellenname (geokodiert) oder MOTIS-Stop-ID. |
| `minutes` | int 5–240 | `60` | Zeitfenster in Minuten ab jetzt. |
| `limit` | int 1–50 | `20` | Mindestanzahl Abfahrten. |
| `modes` | string[] | alle | Filter nach Verkehrsmitteln, z. B. `["HIGHSPEED_RAIL"]`. |
| `language` | `"en"`/`"de"` | `DB_LANG` | Sprache der Statuswörter. |

**Aufrufe**

```json
{"name": "stop_departures", "arguments": {"stop": "Dortmund Hbf", "minutes": 45, "limit": 6}}
{"name": "stop_departures", "arguments": {"stop": "Frankfurt (M) Hbf", "modes": ["HIGHSPEED_RAIL", "INTERCITY_TRAIN"], "limit": 10}}
```

**Antwort (echt, gekürzt)**

```json
{
  "source": "Transitous (MOTIS)",
  "stop": "Dortmund Hauptbahnhof",
  "stopId": "at-Railway-Current-Reference-Data-2026_de:05913:131:90:10",
  "count": 80,
  "departures": [
    { "line": "U41", "mode": "SUBWAY", "headsign": "Dortmund Clarenberg",
      "tripId": "20261023_14:48_de-DELFI_3444084535", "destination": "Dortmund Clarenberg",
      "depart": "2026-10-23T15:07:00.000+02:00", "scheduledDepart": "2026-10-23T15:07:00.000+02:00",
      "delayMin": 0, "status": "pünktlich", "track": "21", "scheduledTrack": "21" }
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
| *„Hat Dortmund Kreuzstraße Verspätung?"* | `gtfs_rt_delays {"stop": "Dortmund Kreuzstraße", "minDelay": 1}` |
| *„Wie komme ich zum Flughafen?"* | `plan_journey {"to": "Dortmund Flughafen"}` — Start = aktuelle Position |
| *„Welche Haltestelle ist nah?"* | `nearby_stops {}` → `stopId` an `dsw21_delays` weitergeben |
| *„Wo bin ich?"* (nur wenn der Client kein Standort-Tool hat) | `current_location {}` |
| *„Zug nach Köln fährt 17:00 — plant so, dass ich pünktlich ankomme"* | `plan_journey {"to": "Köln Hbf", "time": "…T17:00:00+02:00", "arriveBy": true}` |
| *„Wie spät ist meine U41 und wo schlägt die Verspätung durch?"* | `stop_departures {"stop": "Dortmund Hbf", "limit": 5}` → `trip_status {"tripId": "…"}` |
| *„Wann fährt der nächste ICE nach Frankfurt?"* | `stop_departures {"stop": "Frankfurt (M) Hbf", "modes": ["HIGHSPEED_RAIL"]}` oder dasselbe für den Startbahnhof |

# 6. Bekannte Einschränkungen

* **Keine Gleis-/Steigänderungen** — das GTFS-RT-Format liefert nur Verspätungen und Ausfälle (`SKIPPED`/`NO_DATA`); Gleise sind Statikdaten.
* **Keine Richtung (`headsign`)** für DSW21 — die gtfs.de-Datei `trips.txt` enthält nur `route_id,service_id,trip_id`.
* **`gtfs_rt_delays` / `gtfs_rt_alerts` beschränken sich auf die DSW21-Agentur** — das GTFS-RT-Join läuft gegen den DSW21-Trip-Index (die Haltestellensuche selbst ist deutschlandweit). Für andere Betreiber `stop_departures` / `trip_status` (Transitous) verwenden.
* **Erster Aufruf baut einen statischen Index** (~18 MB Download via HTTP Range, einige Sekunden, danach 24 h in `GTFS_INDEX_DIR` gecacht).
* gtfs.de nennt **Busse im VRR-Feed unvollständig**; Tram/Schiene (DSW21-U- und Straßenbahnlinien) sind der zuverlässige Teil.
* **HTTP-Modus ohne eingebaute Auth** — siehe Sicherheitsbox in Abschnitt 1.4; immer hinter Zugriffskontrolle veröffentlichen.
* Der HTTP-Modus serviert kein standalone SSE (`GET /mcp` antwortet `405`); unterstützte Clients nutzen `POST` und sind nicht betroffen.
* **Kein Standort → kein automatischer Routenstart**: `plan_journey`/`nearby_stops` ohne explizite Koordinaten brauchen einen GPS-Fix von der `/locate`-Seite (oder Env-Variablen). IP-Geolokalisierung wird bewusst nicht genutzt (~20 km Genauigkeit ist fürs Planen nutzlos).
* Die **`/locate`-Seite ist unauthentifiziert** — wer die URL kennt, kann die gespeicherte Position überschreiben (Abschnitt 1.5). Sie gibt nichts preis, aber die URL privat halten.
* **Verbindungen, Fahrzeuge und Fahrpläne kommen von Transitous** (kostenloser Community-Dienst, deutschlandweite GTFS/GTFS-RT-Aggregation, MOTIS-v6-API) — dessen [Nutzungsrichtlinie](https://transitous.org/api/) beachten; der Server cached Itineraries 10 Minuten und Echtzeit-Tafeln 30 Sekunden. Die Abdeckung folgt den Feeds, daher können einzelne regionale Betreiber fehlen.

# 7. Problemlösung

| Symptom | Ursache / Lösung |
|---|---|
| `Building the static GTFS index for the first time …` | Normal beim allerersten GTFS-RT-Aufruf; in ~30 s erneut versuchen. Spätere Aufrufe nutzen den 24-h-Cache. |
| `No stop found for "…" in the static GTFS index` | Den exakten gtfs.de-Namen nutzen (z. B. `"Dortmund Hbf"`) oder die numerische Stop-ID. |
| `Could not build/load the static GTFS index …` | Kein Internetzugang zu `download.gtfs.de` oder das Archiv-Layout hat sich geändert. Erneut versuchen; `npm run test:gtfsrt` prüfen. |
| Client zeigt keine Tools | Absoluten Pfad in der Konfiguration prüfen, `npm install` erfolgreich?, Client vollständig neu starten. |
| LM Studio ignoriert den Server | **Einstellungen → Server → „Allow calling servers from mcp.json"** aktivieren; Program → Integrations prüfen. |
| Tests schlagen nach `git clone` fehl | Zuerst `npm install` ausführen. |
| HTTP: `Session not found or expired` (404) | Die Sitzung des Clients wurde aufgeräumt (Ruhe > 1 h) oder der Server startete neu. Neu verbinden — Clients führen `initialize` automatisch aus. |
| HTTP: Verbindung bricht nach ~60–100 s ab | Cloudflare Gratisstufe trennt Idle-Verbindungen bei 100 s. Nach jedem Start den GTFS-Index aufwärmen (ein Tool-Aufruf) und/oder Keep-Alive-Pings im Client aktivieren. |
| HTTP: `405 Method Not Allowed` bei `GET /mcp` | Normal — standalone SSE wird nicht unterstützt; Clients nutzen `POST`. |
| HTTP: `connection refused` | Server läuft nicht oder falsches `MCP_HTTP_HOST`/`MCP_HTTP_PORT`. `curl http://127.0.0.1:8003/health` → `ok` prüfen. |
| `current_location` meldet keinen Standort | Noch kein GPS-Fix — `https://<host>/locate` im Handy-Browser öffnen und den Tab offen lassen, oder `LOCATION_LAT`/`LOCATION_LON` setzen. IP-Geolokalisierung wird bewusst nicht genutzt. |
| `current_location` sagt `"stale": true` | Die GPS-Position ist älter als 6 h — `/locate`-Seite erneut öffnen. |
| `plan_journey`/`stop_departures`: `Place "…" not found` | Der Geocoder hat den Namen nicht erkannt — präziseren Namen oder `"lat,lon"` verwenden. |
| `plan_journey`: `MOTIS … 403 Generic user-agent` | Transitous lehnt generische User-Agents ab — `DB_USER_AGENT` auf dem Server setzen (dieser Build sendet bereits einen Default; eigener UA ist höflicher). |
| `trip_status`: `Trip "…" not found` | Der Zug ist bereits durchgelaufen oder die ID ist veraltet — frische `tripId` aus `stop_departures` oder einem `plan_journey`-Abschnitt holen. |
| `nearby_stops` liefert 0 Haltestellen | Radius zu klein oder Position mitten im Nichts — `radius` erhöhen (max. 5000 m). |
| Android: Client-App sieht den Server nicht | Mobile-Cloud-Apps (Claude/ChatGPT) unterstützen nur *remote* MCP; Agenten in Termux laufen lassen oder den HTTP-Modus auf einem Server deployen (Abschnitt 1.4). |

# 8. Entwicklung

```bash
npm test            # offline: GTFS-Unit-Tests + stdio- & HTTP-Smoke-Tests
npm run test:gtfsrt # live: baut Index, fragt echte DSW21-Verspätungen ab (Netzwerk)
npm start           # MCP-Server auf stdio starten
npm run start:http  # MCP-Server über Streamable HTTP starten
```

Struktur:

```
dsw21-mcp/
├── src/
│   ├── index.js          # Einstieg: stdio-Transport + Tool-Registrierung
│   ├── http.js           # Einstieg: Streamable-HTTP-Transport (/mcp, /health, /locate)
│   ├── server.js         # gemeinsame McpServer-Fabrik für beide Einstiege
│   ├── cache.js          # In-Memory-TTL-Cache
│   ├── i18n.js           # en/de-Strings + Sprachauflösung
│   ├── location.js       # Nutzerstandort: /locate-Seite + GPS-Datei-Store (keine IP-Geolokalisierung)
│   ├── nearby.js         # Haversine-Entfernung + Nahstationssuche (reine Logik)
│   ├── gtfs/
│   │   ├── zip.js        # einzelne Dateien aus remote 236-MB-zip via HTTP Range lesen
│   │   ├── csv.js        # GTFS-CSV-Parser
│   │   ├── index.js      # statischer GTFS-Indexaufbau + Disk-Cache (~18 MB, mit Stop-Koordinaten)
│   │   └── feed.js       # GTFS-RT-Feed: laden, dekodieren, joinen
│   └── tools/
│       ├── gtfs-rt.js    # dsw21_delays, gtfs_rt_delays, gtfs_rt_alerts
│       ├── location.js   # current_location, nearby_stops
│       └── journey.js    # plan_journey (Transitous/MOTIS)
└── test/
    ├── gtfs.test.js      # Offline-CSV- + Stop-Auflösungs- + Nahstations-Tests
    ├── gtfsrt-live.js    # Live-GTFS-RT-Pipeline-Test
    ├── loc-live.mjs      # Live-Test der Standort-/Verbindungs-Tools (Netzwerk)
    ├── smoke.js          # MCP-stdio-Tool-Registrierungstest
    └── smoke-http.js     # MCP-Streamable-HTTP-Test (inkl. Session-DELETE)
```

# 9. Datenquellen & Lizenz

* GTFS-RT-Stream & statischer Fahrplan: [gtfs.de](https://gtfs.de/de/realtime/) — CC BY-SA 4.0 / CC BY 4.0, bereitgestellt von DELFI e.V. und regionalen Verbünden; **ohne jegliche Garantie**. Bitte die [Transitous-Nutzungsrichtlinie](https://transitous.org/api/) für alternative Zugriffswege beachten.
* Verbindungsplanung, Fahrzeugstatus & Fahrpläne: [Transitous](https://transitous.org)-MOTIS-Instanz (v6-API) — kostenloser Community-Dienst mit GTFS/GTFS-RT-Feeds für Deutschland; dieser Server sendet einen identifizierenden User-Agent und cached Antworten (Itineraries 10 Minuten, Echtzeit-Tafeln 30 Sekunden).
* Dieser Server: ISC-Lizenz. Repository: https://github.com/sashok53011/dsw21-mcp
