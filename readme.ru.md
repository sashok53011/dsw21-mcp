# dsw21-mcp

**Информация о задержках в реальном времени для DSW21 (Dortmunder Stadtwerke) в Дортмунде / VRR — и дальних рейсов Deutsche Bahn — как MCP-сервер.**

[English](readme.md) · [Deutsch](readme.de.md) · [Русский](readme.ru.md)

MCP-сервер ([Model Context Protocol](https://modelcontextprotocol.io)), который любой MCP-совместимый ИИ-клиент (Claude Desktop, hermes-agent, OpenCode, LM Studio, …) может вызывать, чтобы ответить на вопросы вроде *«Мой трамвай в Дортмунде опаздывает?»*, *«Какой ICE из Berlin Hbf задерживается?»* или *«Сегодня есть сбои на линиях DSW21?»*.

## Два независимых источника данных

| | **GTFS-RT (DSW21 и местный транспорт)** | **Deutsche Bahn (дальнее сообщение)** |
|---|---|---|
| Инструменты | `dsw21_delays`, `gtfs_rt_delays`, `gtfs_rt_alerts` | `search_stations`, `nearby_stations`, `station_delays`, `station_arrivals`, `trip_delays`, `find_journeys` |
| Источник | бесплатный GTFS-RT поток [realtime.gtfs.de](https://gtfs.de/en/realtime/) (DELFi/gtfs.de, CC BY-SA 4.0) | API DB «vendo»/«movas» через [`db-vendo-client`](https://github.com/public-transport/db-vendo-client) |
| Покрытие | трамваи/автобусы **DSW21**, U-Bahn, региональные — Дортмунд и весь VRR | ICE/IC/EC, RE/RB, S-Bahn — вся Германия |
| Нужен API-ключ | нет | нет (кроме опционального профиля `dbris`) |
| Доступность | стабильно, обновление каждые 10 с | DB периодически блокирует IP (`HTTP 452`) — DB-инструменты деградируют мягко, GTFS-RT продолжает работать |

Поскольку два бэкенда независимы, **запросы о задержках DSW21 работают, даже когда Deutsche Bahn блокирует сервер** — это рекомендуемый способ получить данные по Дортмунду.

## Все инструменты

| Инструмент | Что делает |
|---|---|
| `dsw21_delays` | Задержки DSW21 на остановках Дортмунда (удобная обёртка, по умолчанию *Dortmund Hbf*). |
| `gtfs_rt_delays` | Задержки на **любой** остановке местного транспорта в GTFS-RT потоке (VRR и шире) по имени или числовому ID. |
| `gtfs_rt_alerts` | Служебные сообщения / сбои, затрагивающие рейсы DSW21, с понятными текстами. |
| `search_stations` | Найти станцию DB по имени → EVA-ID, координаты. |
| `nearby_stations` | Станции DB рядом с координатой WGS84, по расстоянию. |
| `station_delays` | Живое **табло отправлений** DB: задержки, отмены, перроны, примечания. |
| `station_arrivals` | Живое **табло прибытий** DB, те же поля. |
| `trip_delays` | Один поезд DB по **всему маршруту**: по каждой станции план/факт, задержка в минутах, смены перронов. |
| `find_journeys` | Соединения DB A→B с **задержками по каждому сегменту**, отменами, перронами, примечаниями. |

Каждый инструмент принимает необязательный параметр **`language`** (`"en"` или `"de"`), который переключает слова статуса (`on time`/`pünktlich`, `delayed`/`Verspätung`, `cancelled`/`fällt aus`) и сообщения об ошибках. Имена JSON-полей остаются стабильными независимо от языка.

---

# 1. Установка и развёртывание

Сервер — обычное Node.js-приложение, работающее по **MCP поверх stdio**: ваш ИИ-клиент запускает его автоматически при необходимости — не нужен демон и открытый порт. Установка выполняется один раз на машину.

**Требования (все платформы):** Node.js ≥ 18 (проверено на Node 24), доступ в интернет, ~50 МБ диска для `node_modules` плюс кэш статического GTFS-индекса.

<details>
<summary><b>Содержание</b></summary>

- [1.1 Windows](#11-windows)
- [1.2 Linux](#12-linux)
- [1.3 Android (Termux)](#13-android-termux)
- [1.4 HTTP-режим (Streamable HTTP)](#14-http-режим-streamable-http)
- [2. Настройка MCP-клиентов](#2-настройка-mcp-клиентов)
  - [2.1 Claude Desktop и Claude Code](#21-claude-desktop-и-claude-code)
  - [2.2 hermes-agent (NousResearch)](#22-hermes-agent-nousresearch)
  - [2.3 OpenCode](#23-opencode)
  - [2.4 LM Studio](#24-lm-studio)
  - [2.5 Универсальная конфигурация (Cursor, Windsurf, Cline, …)](#25-универсальная-конфигурация-cursor-windsurf-cline-)
  - [2.6 Быстрый stdio-самотест](#26-быстрый-stdio-самотест)
  - [2.7 OmniChat Android (HTTP)](#27-omnichat-android-http)
- [3. Переменные окружения](#3-переменные-окружения)
- [4. Примеры использования всех инструментов](#4-примеры-использования-всех-инструментов)
- [5. Типичный вопрос → рецепты инструментов](#5-типичный-вопрос--рецепты-инструментов)
- [6. Известные ограничения](#6-известные-ограничения)
- [7. Решение проблем](#7-решение-проблем)
- [8. Разработка](#8-разработка)
- [9. Источники данных и лицензия](#9-источники-данных-и-лицензия)

</details>

## 1.1 Windows

**Шаг 1 — установка компонентов** (PowerShell):

```powershell
# Git (пропустите, если уже установлен)
winget install --id Git.Git -e

# Node.js LTS (пропустите, если "node --version" выводит v18+)
winget install --id OpenJS.NodeJS.LTS -e
```

Затем откройте новое окно PowerShell, чтобы `git`/`node` попали в `PATH`: `git --version`, `node --version`.

**Шаг 2 — клонирование и установка:**

```powershell
cd D:\mcp5
git clone https://github.com/sashok53011/dsw21-mcp.git
cd dsw21-mcp
npm install
```

**Шаг 3 — проверка:**

```powershell
npm test              # офлайн-тесты + регистрация инструментов
npm run test:gtfsrt   # опционально: живая проверка данных DSW21 (скачивание индекса ~18 МБ)
```

Ожидаемый вывод: `smoke test passed ✓` со всеми девятью инструментами.

**Примечания для Windows**

* В JSON-конфигурациях используйте **прямые слэши** в путях (`D:/mcp5/db/dsw21-mcp/src/index.js`) — они работают везде и избавляют от экранирования обратного слэша.
* Кэш GTFS-индекса создаётся в `D:\mcp5\db\dsw21-mcp\.gtfs-index` (изменяется через `GTFS_INDEX_DIR`).
* Опционально: сделать `dsw21-mcp` глобальной командой — `npm link` — тогда в конфигах клиентов можно писать `"command": "dsw21-mcp"` без путей.

## 1.2 Linux

**Шаг 1 — установка компонентов** (показано для Debian/Ubuntu; Fedora: `dnf install git nodejs`, Arch: `pacman -S git nodejs npm`):

```bash
sudo apt update && sudo apt install -y git nodejs npm
```

Если дистрибутив даёт Node < 18, используйте [NodeSource](https://github.com/nodesource/distributions) или nvm:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs
```

**Шаг 2 — клонирование и установка:**

```bash
git clone https://github.com/sashok53011/dsw21-mcp.git
cd dsw21-mcp
npm install
```

**Шаг 3 — проверка:**

```bash
npm test              # офлайн-тесты + регистрация инструментов
npm run test:gtfsrt   # опционально: живая проверка данных DSW21
```

**Примечания по развёртыванию на Linux**

* stdio MCP-сервер **не работает как служба** — клиент запускает его на сессию и сам останавливает. Ничего добавлять в systemd не нужно.
* Если вы ведёте конфигурации клиентов в dotfiles, используйте абсолютный путь: `/home/<user>/dsw21-mcp/src/index.js`.
* Безголовая машина (VPS/домашний сервер): клонируйте, например, в `/opt/dsw21-mcp`, выполните `npm install --omit=dev` и укажите абсолютный путь в своём удалённо-совместимом MCP-клиенте.

## 1.3 Android (Termux)

На Android сервер работает внутри [**Termux**](https://termux.dev) (устанавливайте из **F-Droid** — сборка в Play Store устарела).

**Шаг 1 — установка Termux и пакетов:**

```bash
pkg update && pkg upgrade
pkg install nodejs git
node --version    # должно быть v18+
```

**Шаг 2 — клонирование и установка:**

```bash
git clone https://github.com/sashok53011/dsw21-mcp.git
cd dsw21-mcp
npm install
npm test
```

Проект окажется в `/data/data/com.termux/files/home/dsw21-mcp`.

**Шаг 3 — запуск / связывание с клиентом:**

```bash
node src/index.js    # MCP stdio-сервер; используется Termux-совместимыми агентами
```

**Примечания и ограничения для Android**

* **Мобильные приложения Claude / ChatGPT не могут запускать локальные stdio-серверы** — облачные мобильные приложения поддерживают только *удалённые* (HTTP) MCP-серверы, а стандартный вход `dsw21-mcp` — stdio. На телефоне связывайте его с агентами, работающими *внутри Termux* (или любым клиентом, способным локально запускать `node`), либо разверните HTTP-режим (раздел 1.4) на сервере и подключайтесь удалённо.
* Рекомендуется для телефона: запускать `dsw21-mcp` в HTTP-режиме (раздел 1.4) на ПК/сервере (разделы Windows/Linux) и подключаться из любого MCP-приложения по `https://`; данные DSW21 те же.
* Не давайте Termux засыпать при длинных сессиях: `termux-wake-lock`. Автозагрузка при старте — аддон [Termux:Boot](https://github.com/termux/termux-boot).
* Первый вызов GTFS-RT скачивает индекс ~18 МБ; в мобильных сетях это может занять время.

## 1.4 HTTP-режим (Streamable HTTP)

`src/http.js` отдаёт те же девять инструментов по протоколу [Streamable HTTP](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#streamable-http) для постоянно включённых хостов — домашнего сервера, FreedomBox или VPS за reverse proxy / Cloudflare-туннелем. Мобильные приложения (например, OmniChat Android) умеют работать только с *удалёнными* MCP-серверами, поэтому для доступа с телефона нужен именно этот режим.

```bash
npm run start:http          # слушает 127.0.0.1:8003, эндпоинт /mcp (+ /health)
```

* `MCP_HTTP_PORT` — порт (по умолчанию `8003`; `0` — назначает ОС).
* `MCP_HTTP_HOST` — адрес привязки (по умолчанию `127.0.0.1`; оставляйте localhost, если публичный URL отдаёт reverse proxy или `cloudflared`-туннель на этом же хосте).
* Сессии — stateful по спецификации: `initialize` создаёт `Mcp-Session-Id`, последующие запросы возвращают его в заголовке, `DELETE` завершает сессию; сессии без активности дольше часа вычищаются автоматически (упавшие клиенты не накапливаются).
* `GET /health` отвечает `ok` для мониторинга; MCP-эндпоинт — `/mcp`.

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

**Публичный доступ (пример с Cloudflare-туннелем):** опубликуйте хостен на локальный порт — входящие порты не нужны:

| Хостен | Сервис |
|---|---|
| `dsw21-mcp.example.com` | `http://localhost:8003` |

MCP-эндпоинт получится `https://dsw21-mcp.example.com/mcp`. Замечания для reverse proxy: пропускайте заголовок `Mcp-Session-Id` и методы `POST`/`DELETE`, отключите буферизацию ответов для `text/event-stream` (nginx: `proxy_buffering off; proxy_read_timeout 110s`), и помните про 100-секундный idle-таймаут бесплатного прокси Cloudflare — постройте GTFS-индекс один раз после каждого (пере)запуска, чтобы первый боевой вызов остался быстрым.

---

# 2. Настройка MCP-клиентов

Понадобятся три вещи: **абсолютный путь** к `src/index.js` на вашей машине, **переменные окружения** и клиентский блок конфигурации. Подставляйте свои пути для своей ОС (разделы выше).

## 2.1 Claude Desktop и Claude Code

Файл конфигурации **Claude Desktop**:

| ОС | Путь |
|---|---|
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Linux | `~/.config/Claude/claude_desktop_config.json` |

Добавьте блок (создайте файл при отсутствии) и **полностью перезапустите Claude Desktop**:

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

Вариант для Linux/macOS:

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

**Claude Code** (CLI) — сервер и окружение одной командой:

```bash
claude mcp add dsw21-mcp -e DB_USER_AGENT="my-app (me@example.org)" -- node /home/user/dsw21-mcp/src/index.js
```

(Windows: `claude mcp add dsw21-mcp -e DB_USER_AGENT="my-app (me@example.org)" -- node D:/mcp5/db/dsw21-mcp/src/index.js`; управление: `claude mcp list`, `claude mcp remove dsw21-mcp`.)

После настройки инструменты появятся под значком молотка/гаечного ключа (Desktop) или через `/mcp` (Code). Спросите, например: *«Трамвай в Дортмунде сейчас опаздывает?»*.

## 2.2 hermes-agent (NousResearch)

hermes-agent читает MCP-серверы из **`config.yaml`**, блок `mcp_servers`. Расположение файла конфигурации:

| ОС | Путь |
|---|---|
| Windows | `%LOCALAPPDATA%\hermes\config.yaml` (например, `C:\Users\alex\AppData\Local\hermes\config.yaml`) |
| Linux / macOS | `~/.hermes/config.yaml` |

Добавьте блок под свою ОС (формат совпадает с реальными записями в конфиге):

**Windows** — используйте полные пути, включая `node.exe` (hermes не всегда наследует ваш `PATH`):

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

> `timeout: 300` (секунд) рекомендуется: самый первый вызов GTFS-RT скачивает статический индекс ~18 МБ, что может превысить короткий стандартный таймаут.

Полезные добавки:

* **Горячая перезагрузка:** после правки YAML выполните `/reload-mcp` в сессии — перезапуск не нужен.
* **Импорт из Claude Code:** `hermes import-agent claude-code` автоматически переносит существующий блок `mcpServers` (плюс скиллы/инструкции).
* **Из терминала:** в hermes-agent есть скилл `mcporter`, например `mcporter call dsw21-mcp.dsw21_delays stop="Dortmund Hbf" --output json`.

## 2.3 OpenCode

Файл проекта `.opencode.json` (или глобальный `~/.config/opencode/opencode.json`):

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

Отличия от формата Claude: `command` — это **массив** (бинарник + аргументы вместе), переменные окружения лежат в `environment`. Либо добавить через CLI:

```bash
opencode mcp add dsw21-mcp -- node D:/mcp5/db/dsw21-mcp/src/index.js
```

## 2.4 LM Studio

LM Studio использует **`mcp.json`** в нотации Cursor:

* Windows: `%USERPROFILE%\.lmstudio\mcp.json`
* Linux / macOS: `~/.lmstudio/mcp.json`

Проще всего редактировать: в LM Studio откройте **вкладку Program (значок `>_`, правая панель) → Install → Edit mcp.json** (встроенный редактор; файл загружается автоматически при сохранении).

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

**Важно:** включите **Settings → Server → «Allow calling servers from mcp.json»**, иначе серверы из файла не выполняются. Инструменты появятся в **Program → Integrations**. Используйте локальную модель с поддержкой function calling (например, Qwen, Llama 3+, Mistral) или удалённую API-модель.

## 2.5 Универсальная конфигурация (Cursor, Windsurf, Cline, …)

Большинство MCP-клиентов используют один и тот же **Claude-совместимый формат `mcpServers`** (`command` + `args` + `env`) — блок из [2.1](#21-claude-desktop-и-claude-code) вставляется без изменений в:

| Клиент | Расположение конфигурации |
|---|---|
| Cursor | `.cursor/mcp.json` (проект) или `~/.cursor/mcp.json` (глобально) |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` |
| Cline (расширение VS Code) | Settings → MCP → *Edit Config* (`cline_mcp_settings.json`) |
| Zed | `~/.config/zed/settings.json` → `"context_servers"` |
| Любой другой stdio-клиент | `{"command": "node", "args": ["/abs/path/src/index.js"], "env": {...}}` |

Универсальная однострочная проверка — любой stdio-клиент в итоге выполняет команду вроде этой, она должна работать в первую очередь:

```bash
DB_USER_AGENT="my-app (me@example.org)" node /home/user/dsw21-mcp/src/index.js
```

Вы должны увидеть на stderr `[dsw21-mcp] ready (DB profile: dbnav, lang: en)`. После этого процесс ждёт MCP-сообщения на stdin (это нормально — выход по `Ctrl+C`).

## 2.6 Быстрый stdio-самотест

Доказать без клиента, что сервер отвечает на MCP-запросы, можно пайпом из `initialize` + `tools/list` JSON-RPC:

```bash
(printf '%s\n' \
 '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"probe","version":"0"}}}' \
 '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
 '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'; sleep 2) | node src/index.js
```

В ответе — все девять инструментов: доказательство, что интеграция готова.

## 2.7 OmniChat Android (HTTP)

Приложение OmniChat Android работает с MCP через Streamable HTTP и может управлять dsw21-mcp полностью удалённо:

1. Запустите сервер в HTTP-режиме (раздел 1.4) и опубликуйте его (reverse proxy / Cloudflare-туннель).
2. В приложении: **вкладка MCP → HTTP →** имя `dsw21-mcp`, URL `https://dsw21-mcp.example.com/mcp` → добавить → **Connect**.
3. Приложение выполнит `initialize` + `tools/list` и синхронизирует все девять инструментов; включайте/выключайте их индивидуально и спрашивайте, например: *«Опаздывает ли сейчас трамвай в Дортмунде?»*.

Телефону не нужен локальный рантайм — всё работает на сервере. Первый вызов GTFS-RT строит индекс ~18 МБ на стороне сервера (прогрейте его после деплоя, см. 1.4).

---

# 3. Переменные окружения

| Переменная | По умолчанию | Значение |
|---|---|---|
| `DB_USER_AGENT` | *(не задана)* | **Рекомендуется.** Deutsche Bahn требует User-Agent, идентифицирующий/контактный, например `my-app (https://example.org; me@example.org)`. Заглушки отклоняются; без него сервер пишет предупреждение и использует значение по умолчанию. |
| `DB_PROFILE` | `dbnav` | Профиль API DB: `dbnav` (самый стабильный), `db`, `dbweb`, `dbris` (нужен `DB_API_KEY`, табло до 12 ч). |
| `DB_API_KEY` | *(не задана)* | Только для `DB_PROFILE=dbris` — ключ из [DB API Marketplace](https://developers.deutschebahn.com/). |
| `DB_LANG` | `en` | Язык вывода по умолчанию (`en`/`de`), если в вызове нет `language`. |
| `DB_REQUESTS_PER_MINUTE` | `30` | Клиентский троттлинг (DB документирует ~60 запросов/мин для `dbnav`). |
| `GTFS_RT_FEED_URL` | `https://realtime.gtfs.de/realtime-free.pb` | GTFS-RT поток для DSW21/инструментов местного транспорта. |
| `GTFS_INDEX_DIR` | `./.gtfs-index` | Каталог кэша статического GTFS-индекса. |
| `MCP_HTTP_PORT` | `8003` | Порт HTTP-режима (`npm run start:http`; `0` — назначает ОС). |
| `MCP_HTTP_HOST` | `127.0.0.1` | Адрес привязки HTTP-режима. |

Как задать их в клиенте: Claude Desktop / LM Studio / универсальные → блок `"env"` в JSON; hermes-agent → `env:` в YAML; OpenCode → `"environment"`; либо экспортировать в шелле перед запуском (`export DB_LANG=de`, PowerShell: `$env:DB_LANG="de"`).

---

# 4. Примеры использования всех инструментов

Примеры показывают JSON-**аргументы** инструмента и **типичный ответ**. Ответы GTFS-RT ниже — реальные снимки от 2026-10-19; ответы DB иллюстративные (поля точные) — фактические значения зависят от времени суток и от того, блокирует ли DB ваш IP.

### 4.1 `dsw21_delays` — задержки DSW21 на остановке Дортмунда

Лучшая точка входа для Дортмунда. По умолчанию *Dortmund Hbf*; остановка разрешается во **все подплатформы** ( realtime-поток ссылается на идентификаторы платформ — см. `stopIdCount`).

**Аргументы**

| Арг | Тип | По умолчанию | Описание |
|---|---|---|---|
| `stop` | string | `"Dortmund Hbf"` | Имя остановки Дортмунда или числовой GTFS-ID. |
| `minutes` | int 5–180 | `60` | Окно времени от текущего момента. |
| `language` | `"en"`/`"de"` | `en` | Язык слов статуса. |

**Вызов**

```json
{"name": "dsw21_delays", "arguments": {"stop": "Dortmund Hbf", "minutes": 90, "language": "de"}}
```

**Ответ (реальный)**

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

Другие вызовы:

```json
{"name": "dsw21_delays", "arguments": {"stop": "Dortmund Reinoldikirche", "language": "en"}}
{"name": "dsw21_delays", "arguments": {"stop": "Dortmund Hörde Bf", "minutes": 30}}
{"name": "dsw21_delays", "arguments": {"stop": "334656"}}
```

> `headsign` (направление) намеренно `null`: расписание gtfs.de для местного транспорта не содержит `trip_headsign`. **Номер линии** берётся из `routes.txt`.

### 4.2 `gtfs_rt_delays` — любая остановка местного транспорта

Те же данные, но для **каждой** остановки в GTFS-RT потоке (весь VRR и шире), с дополнительными фильтрами.

**Аргументы**

| Арг | Тип | По умолчанию | Описание |
|---|---|---|---|
| `stop` | string **обязательный** | – | Имя остановки или числовой GTFS-ID. |
| `minutes` | int 5–180 | `60` | Окно времени от текущего момента. |
| `minDelay` | int 0–60 | `1` | Только записи с задержкой ≥ этой; `0` — показать всё. |
| `limit` | int 1–200 | `50` | Максимум результатов. |
| `language` | `"en"`/`"de"` | `en` | Язык слов статуса. |

**Вызовы**

```json
{"name": "gtfs_rt_delays", "arguments": {"stop": "Dortmund Hbf", "minutes": 60, "minDelay": 0, "language": "en"}}
{"name": "gtfs_rt_delays", "arguments": {"stop": "199571", "limit": 5}}
{"name": "gtfs_rt_delays", "arguments": {"stop": "Dortmund Kreuzstraße", "minDelay": 3, "minutes": 30}}
```

**Формат ответа**

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
  "departures": [ { "...": "тот же формат, что у dsw21_delays" } ]
}
```

### 4.3 `gtfs_rt_alerts` — сбои и служебные сообщения (DSW21)

Текстовые сообщения о рейсах DSW21; обобщённые attribution-записи отфильтровываются.

**Аргументы**

| Арг | Тип | По умолчанию | Описание |
|---|---|---|---|
| `limit` | int 1–100 | `30` | Максимум сообщений. |
| `language` | `"en"`/`"de"` | `en` | Язык подписей. |

**Вызов**

```json
{"name": "gtfs_rt_alerts", "arguments": {"limit": 10, "language": "de"}}
```

**Ответ (реальный, сокращённый)**

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

### 4.4 `search_stations` — найти станцию DB

**Аргументы**

| Арг | Тип | По умолчанию | Описание |
|---|---|---|---|
| `query` | string **обязательный** | – | Имя станции, например `"Berlin Hbf"`. |
| `results` | int 1–20 | `5` | Максимум результатов. |
| `language` | `"en"`/`"de"` | `en` | – |

**Вызов**

```json
{"name": "search_stations", "arguments": {"query": "Berlin Hbf", "results": 3}}
```

**Формат ответа**

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

Возвращённую `id` используйте как `station`/`from`/`to` в DB-инструментах ниже (имена тоже работают — они разрешаются автоматически).

### 4.5 `nearby_stations` — станции DB вокруг координаты

**Аргументы**

| Арг | Тип | По умолчанию | Описание |
|---|---|---|---|
| `latitude` | number **обязательный** | – | Широта WGS84. |
| `longitude` | number **обязательный** | – | Долгота WGS84. |
| `results` | int 1–20 | `8` | Максимум результатов (по расстоянию). |
| `language` | `"en"`/`"de"` | `en` | – |

**Вызов** (центр Дортмунда)

```json
{"name": "nearby_stations", "arguments": {"latitude": 51.5136, "longitude": 7.4653, "results": 5}}
```

**Формат ответа**

```json
{
  "latitude": 51.5136, "longitude": 7.4653,
  "count": 2,
  "stations": [
    { "id": "8010000", "name": "Dortmund Hbf", "distance": 650, "latitude": 51.5169, "longitude": 7.4609 }
  ]
}
```

### 4.6 `station_delays` — живое табло отправлений DB

**Аргументы**

| Арг | Тип | По умолчанию | Описание |
|---|---|---|---|
| `station` | string **обязательный** | – | Имя станции DB или номер EVA (например, `8011160` = Berlin Hbf). |
| `minutes` | int 10–120 | `30` | Окно от текущего момента (профили без API-ключа дают примерно следующий час). |
| `direction` | string | – | Только отправления в направлении этой станции. |
| `products` | string[] | все | Фильтр: `nationalExpress`, `national`, `regionalExpress`, `regional`, `suburban`, `bus`, `ferry`, `subway`, `tram`, `taxi`. |
| `language` | `"en"`/`"de"` | `en` | – |

**Вызовы**

```json
{"name": "station_delays", "arguments": {"station": "Berlin Hbf", "minutes": 60}}
{"name": "station_delays", "arguments": {"station": "8011160", "products": ["nationalExpress", "national"], "language": "de"}}
{"name": "station_delays", "arguments": {"station": "Hamburg Hbf", "direction": "Köln Hbf", "minutes": 20}}
```

**Формат ответа**

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

### 4.7 `station_arrivals` — живое табло прибытий DB

Тот же формат, что у `station_delays` (без `direction`):

```json
{"name": "station_arrivals", "arguments": {"station": "Frankfurt (M) Hbf", "minutes": 45, "language": "de"}}
```

### 4.8 `trip_delays` — один поезд DB, весь маршрут

Возьмите `tripId` из `station_delays`/`station_arrivals`/`find_journeys` и проверьте поезд от конца до конца: план/факт по каждой станции, распространение задержки, смены перронов, отмены.

**Аргументы**

| Арг | Тип | По умолчанию | Описание |
|---|---|---|---|
| `tripId` | string **обязательный** | – | Trip-ID из табло или результата поиска соединений. |
| `language` | `"en"`/`"de"` | `en` | – |

**Вызов**

```json
{"name": "trip_delays", "arguments": {"tripId": "…|80|1052020", "language": "en"}}
```

**Формат ответа**

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

`delayedStops` быстро отвечает на вопрос *«насколько далеко разнесётся задержка?»*.

### 4.9 `find_journeys` — соединения DB с задержками

**Аргументы**

| Арг | Тип | По умолчанию | Описание |
|---|---|---|---|
| `from` | string **обязательный** | – | Начало: имя или EVA-ID. |
| `to` | string **обязательный** | – | Конец: имя или EVA-ID. |
| `via` | string | – | Необязательная промежуточная станция. |
| `departure` | ISO 8601 | сейчас | Планируемое время отправления, например `"2026-10-19T17:00:00+02:00"`. |
| `transfers` | int 0–6 | – | Максимум пересадок. |
| `results` | int 1–8 | `3` | Число соединений. |
| `products` | string[] | все | Те же ID продуктов, что в `station_delays`. |
| `language` | `"en"`/`"de"` | `en` | – |

**Вызовы**

```json
{"name": "find_journeys", "arguments": {"from": "Berlin Hbf", "to": "München Hbf", "results": 2}}
{"name": "find_journeys", "arguments": {"from": "8011160", "to": "8000261", "departure": "2026-10-19T17:00:00+02:00", "transfers": 0}}
{"name": "find_journeys", "arguments": {"from": "Köln Hbf", "to": "Dortmund Hbf", "products": ["nationalExpress", "regionalExpress"], "language": "de"}}
```

**Формат ответа**

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

# 5. Типичный вопрос → рецепты инструментов

| Вопрос пользователя | Вызов инструмента |
|---|---|
| *«Трамвай в Дортмунде сейчас опаздывает?»* | `dsw21_delays {"stop": "Dortmund Hbf", "minutes": 30}` |
| *«Насколько опаздывает U45 от Reinoldikirche?»* | `dsw21_delays {"stop": "Dortmund Reinoldikirche", "minutes": 30}` |
| *«Сегодня есть сбои на DSW21?»* | `gtfs_rt_alerts {"limit": 10}` |
| *«Все опаздывающие отправления Dortmund Hbf в ближайшие 2 ч»* | `gtfs_rt_delays {"stop": "Dortmund Hbf", "minutes": 120, "minDelay": 1}` |
| *«ICE из Берлина в Мюнхен идёт по расписанию?»* | `find_journeys {"from": "Berlin Hbf", "to": "München Hbf"}` → `trip_delays {tripId из сегмента}` |
| *«Как опоздает мой поезд сюда?»* | `station_delays {"station": "Erfurt Hbf", "minutes": 60}` → `trip_delays {tripId}` |
| *«Какие станции рядом со мной?»* | `nearby_stations {"latitude": …, "longitude": …}` |

# 6. Известные ограничения

**GTFS-RT / DSW21**
* **Нет смен перронов/путей** — формат GTFS-RT передаёт только задержки и отмены (`SKIPPED`/`NO_DATA`); перроны — это данные статического расписания.
* **Нет направления (`headsign`)** для DSW21 — файл `trips.txt` gtfs.de для местного транспорта содержит только `route_id,service_id,trip_id`.
* **Первый вызов строит статический индекс** (скачивание ~18 МБ через HTTP Range, несколько секунд, затем 24 ч кэша в `GTFS_INDEX_DIR`).
* gtfs.de отмечает **автобусы в VRR-потоке как неполные**; надёжна трамвайно-железнодорожная часть (U- и трамвайные линии DSW21).

**Deutsche Bahn**
* DB **троттлит и периодически блокирует клиентов** (`HTTP 452 "OPS_BLOCKED"`, иногда `403`). Этот сервер агрессивно кэширует (табло 30 с, соединения 60 с, станции 6 ч), ограничивает частоту запросов и возвращает **понятную локализованную ошибку** вместо падения — но блокировки на стороне DB вне нашего контроля. Инструменты DSW21/GTFS-RT от этого не страдают.
* Без API-ключа табло покрывают примерно **следующий час** (профиль `dbris` + `DB_API_KEY`: до 12 ч).
* Юридически использование API DB формально требует разрешения Deutsche Bahn; задайте идентифицирующий `DB_USER_AGENT`.

# 7. Решение проблем

| Симптом | Причина / решение |
|---|---|
| `Deutsche Bahn is currently blocking requests … HTTP 452` | DB блокирует ваш IP. Подождите, смените `DB_PROFILE`, запустите из другой сети — или используйте GTFS-RT инструменты (они независимы). |
| `[dsw21-mcp] Warning: DB_USER_AGENT is not set …` | Задайте `DB_USER_AGENT` с идентификацией, например `my-app (me@example.org)`. |
| `Building the static GTFS index for the first time …` | Нормально при самом первом вызове GTFS-RT; повторите через ~30 с. Дальнейшие вызовы используют 24-часовой кэш. |
| `No stop found for "…" in the static GTFS index` | Используйте точное имя с gtfs.de (например, `"Dortmund Hbf"`) или числовой stop-id. |
| `Could not build/load the static GTFS index …` | Нет доступа к `download.gtfs.de` или изменилась структура архива. Повторите; проверьте `npm run test:gtfsrt`. |
| Клиент не показывает инструменты | Проверьте абсолютный путь в конфигурации, успешность `npm install` и полностью перезапустите клиент. |
| LM Studio игнорирует сервер | Включите **Settings → Server → «Allow calling servers from mcp.json»**; проверьте Program → Integrations. |
| Тесты падают после `git clone` | Сначала выполните `npm install`. |
| Android: приложение-клиент не видит сервер | Мобильные облачные приложения (Claude/ChatGPT) поддерживают только *удалённый* MCP; запускайте агентов внутри Termux или размещайте сервер на ПК. |

# 8. Разработка

```bash
npm test            # офлайн: форматтеры + GTFS unit-тесты + stdio smoke-тест
npm run test:gtfsrt # онлайн: строит индекс, запрашивает реальные задержки DSW21 (сеть)
npm start           # запуск MCP-сервера на stdio
```

Структура:

```
dsw21-mcp/
├── src/
│   ├── index.js          # точка входа: stdio-транспорт + регистрация инструментов
│   ├── client.js         # обёртка db-vendo-client: профиль, троттлинг, кэш, ошибки
│   ├── cache.js          # in-memory TTL-кэш
│   ├── format.js         # компактный FPTF → удобный для LLM JSON
│   ├── i18n.js           # строки en/de
│   ├── gtfs/
│   │   ├── zip.js        # чтение отдельных файлов из удалённого zip 236 МБ через HTTP Range
│   │   ├── csv.js        # парсер GTFS CSV
│   │   ├── index.js      # построение статического GTFS-индекса + дисковый кэш (~18 МБ)
│   │   └── feed.js       # GTFS-RT поток: загрузка, декодирование, join
│   └── tools/
│       ├── gtfs-rt.js    # dsw21_delays, gtfs_rt_delays, gtfs_rt_alerts
│       ├── stations.js   # search_stations, nearby_stations
│       ├── departures.js # station_delays, station_arrivals
│       ├── trip.js       # trip_delays
│       └── journeys.js   # find_journeys
└── test/
    ├── format.test.js    # офлайн-тесты форматтера
    ├── gtfs.test.js      # офлайн-тесты CSV и разрешения остановок
    ├── gtfsrt-live.js    # онлайн-тест пайплайна GTFS-RT
    └── smoke.js          # stdio-тест регистрации инструментов MCP
```

# 9. Источники данных и лицензия

* GTFS-RT поток и статическое расписание: [gtfs.de](https://gtfs.de/en/realtime/) — CC BY-SA 4.0 / CC BY 4.0, предоставляется DELFI e.V. и региональными объединениями; **без каких-либо гарантий**. Пожалуйста, соблюдайте [политику использования Transitous](https://transitous.org/api/) для альтернативных способов доступа.
* Данные Deutsche Bahn через [db-vendo-client](https://github.com/public-transport/db-vendo-client) (лицензия ISC) — неофициально, оговорки в его readme.
* Этот сервер: лицензия ISC. Репозиторий: https://github.com/sashok53011/dsw21-mcp
