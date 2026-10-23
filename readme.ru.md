# dsw21-mcp

**Информация о задержках в реальном времени для DSW21 (Dortmunder Stadtwerke) в Дортмунде / VRR — как MCP-сервер.**

[English](readme.md) · [Deutsch](readme.de.md) · [Русский](readme.ru.md)

MCP-сервер ([Model Context Protocol](https://modelcontextprotocol.io)), который любой MCP-совместимый ИИ-клиент (Claude Desktop, hermes-agent, OpenCode, LM Studio, …) может вызывать, чтобы ответить на вопросы вроде *«Мой трамвай в Дортмунде опаздывает?»*, *«Насколько опаздывает U45?»* или *«Сегодня есть сбои на линиях DSW21?»*.

Данные берутся из **бесплатного GTFS-RT потока [realtime.gtfs.de](https://gtfs.de/en/realtime/)** (DELFi/gtfs.de, CC BY-SA 4.0), обновление каждые 10 с, с join к статическому расписанию gtfs.de для номеров линий и названий остановок. Покрываются трамваи/автобусы DSW21, U-Bahn и региональный транспорт Дортмунда и всего VRR. Планирование маршрутов (`plan_journey`), статус поезда (`trip_status`) и расписания (`stop_departures`) используют бесплатный инстанс **[Transitous](https://transitous.org)** MOTIS (v6 API, агрегация GTFS/GTFS-RT по всей Германии).

## Инструменты

| Инструмент | Что делает |
|---|---|
| `dsw21_delays` | Задержки DSW21 на остановках Дортмунда (удобная обёртка, по умолчанию *Dortmund Hbf*). |
| `gtfs_rt_delays` | Задержки на **любой** остановке местного транспорта в GTFS-RT потоке (VRR и шире) по имени или числовому ID. |
| `gtfs_rt_alerts` | Служебные сообщения / сбои, затрагивающие рейсы DSW21, с понятными текстами. |
| `current_location` | Где находится пользователь: точный GPS через страницу `/locate` (однократно открыть на телефоне — координаты остаются на сервере). Используйте вместо вопросов «где вы?». |
| `nearby_stops` | Остановки рядом с позицией (по умолчанию — текущая), по расстоянию — возвращает `stopId` для инструментов задержек. |
| `plan_journey` | Планирование маршрута с realtime-обновлениями через [Transitous](https://transitous.org) (MOTIS v6): начало по умолчанию — текущая позиция, цель по имени или координатам, `arriveBy` для планирования «назад». |
| `trip_status` | Один поезд/автобус/трамвай по **всему маршруту, вся Германия**: по каждой станции план/факт, задержки, смены перронов, отмены. |
| `stop_departures` | Ближайшие отправления с **любой остановки Германии** с realtime — дополняет gtfs.de-инструменты, которые покрывают только регион gtfs.de/VRR. |

Каждый инструмент принимает необязательный параметр **`language`** (`"en"` или `"de"`), который переключает слова статуса (`on time`/`pünktlich`, `delayed`/`Verspätung`, `cancelled`/`fällt aus`) и сообщения об ошибках. Имена JSON-полей остаются стабильными независимо от языка. Язык по умолчанию задаётся один раз через `DB_LANG` (раздел 3).

---

# 1. Установка и развёртывание

Сервер — обычное Node.js-приложение, работающее по **MCP поверх stdio**: ваш ИИ-клиент запускает его автоматически при необходимости — не нужен демон и открытый порт. Для постоянно работающих машин есть **HTTP-режим** (Streamable HTTP, раздел 1.4) для удалённых клиентов, например мобильных приложений. Установка выполняется один раз на машину.

**Требования (все платформы):** Node.js ≥ 18 (проверено на Node 24), доступ в интернет, ~30 МБ диска для `node_modules` плюс кэш статического GTFS-индекса.

<details>
<summary><b>Содержание</b></summary>

- [1.1 Windows](#11-windows)
- [1.2 Linux](#12-linux)
- [1.3 Android (Termux)](#13-android-termux)
- [1.4 HTTP-режим (Streamable HTTP)](#14-http-режим-streamable-http)
- [1.5 Передача местоположения (страница /locate)](#15-передача-местоположения-страница-locate)
- [2. Настройка MCP-клиентов](#2-настройка-mcp-клиентов)
  - [2.1 Claude Desktop и Claude Code](#21-claude-desktop-и-claude-code)
  - [2.2 hermes-agent (NousResearch)](#22-hermes-agent-nousresearch)
  - [2.3 OpenCode](#23-opencode)
  - [2.4 LM Studio](#24-lm-studio)
  - [2.5 Универсальная конфигурация (Cursor, Windsurf, Cline, …)](#25-универсальная-конфигурация-cursor-windsurf-cline-)
  - [2.6 Быстрый stdio-самотест](#26-быстрый-stdio-самотест)
  - [2.7 Приложение OmniChat для Android (HTTP)](#27-приложение-omnichat-для-android-http)
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

Ожидаемый вывод: `smoke test passed ✓` со всеми восемью инструментами.

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
* Безголовая машина (VPS/домашний сервер): клонируйте, например, в `/opt/dsw21-mcp`, выполните `npm install --omit=dev` и используйте HTTP-режим (раздел 1.4), чтобы удалённые клиенты могли подключаться.

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

* **Мобильные приложения Claude / ChatGPT не могут запускать локальные stdio-серверы** — облачные мобильные приложения поддерживают только *удалённые* (HTTP) MCP-серверы, а стандартный вход dsw21-mcp — stdio. На телефоне либо связывайте с агентами, работающими *внутри Termux* (или любым клиентом, способным локально запускать `node`), либо разворачивайте HTTP-режим (раздел 1.4) на сервере и подключайтесь удалённо (например, через приложение OmniChat, раздел 2.7).
* Рекомендуется для телефона: запускать dsw21-mcp в HTTP-режиме (раздел 1.4) на ПК/сервере (разделы Windows/Linux выше) и подключаться из любого MCP-приложения по `https://`; данные те же.
* Не давайте Termux засыпать при длинных сессиях: `termux-wake-lock`. Автозагрузка при старте — аддон [Termux:Boot](https://github.com/termux/termux-boot).
* Первый вызов GTFS-RT скачивает индекс ~18 МБ; в мобильных сетях это может занять время.

## 1.4 HTTP-режим (Streamable HTTP)

`src/http.js` отдаёт те же восемь инструментов по [Streamable HTTP](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#streamable-http) для постоянно работающих машин — домашний сервер, FreedomBox или VPS за reverse proxy / Cloudflare-туннелем. Мобильные приложения (например, OmniChat для Android) умеют работать только с *удалёнными* MCP-серверами, поэтому это режим для телефона. Дополнительно сервер отдаёт **страницу `/locate`** (раздел 1.5) для передачи GPS-позиции.

```bash
npm run start:http          # слушает 127.0.0.1:8003, эндпоинт /mcp (+ /health)
```

* `MCP_HTTP_PORT` — порт (по умолчанию `8003`; `0` — назначает ОС).
* `MCP_HTTP_HOST` — адрес привязки (по умолчанию `127.0.0.1`; оставляйте localhost, если reverse proxy или туннель `cloudflared` на том же хосте публикует публичный URL).
* Сессии stateful по спецификации: `initialize` создаёт `Mcp-Session-Id`, последующие запросы возвращают её обратно, `DELETE` завершает сессию; сессии, простоявшие больше часа, вычищаются автоматически (упавшие клиенты не текут в память).
* `GET /health` отвечает `ok` для мониторинга; MCP-эндпоинт — `/mcp`. `GET /mcp` (standalone SSE) не поддерживается и отвечает `405` — это нормально, поддерживаемые клиенты используют `POST`.

> **Безопасность — у эндпоинта `/mcp` нет встроенной аутентификации.**
> Любой, кто достигает URL, может вызвать все инструменты и запустить исходящие запросы к gtfs.de. Поэтому:
> * Держите `MCP_HTTP_HOST=127.0.0.1` и публикуйте URL через reverse proxy или туннель на том же хосте.
> * Публикуйте только за **контролем доступа**: [Cloudflare Access](https://one.cloudflare.com/access/) перед туннелем, HTTP Basic Auth на прокси или VPN (WireGuard/Tailscale) вместо открытого интернета.
> * Ни в коем случае не направляйте голый порт с `MCP_HTTP_HOST=0.0.0.0` в открытый интернет.

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

В **Windows** запускайте в консоли (`npm run start:http`) или зарегистрируйте запланированную задачу / службу [NSSM](https://nssm.cc) на `node.exe D:\mcp5\db\dsw21-mcp\src\http.js`.

**Публичный доступ (пример Cloudflare-туннеля):** опубликуйте имя хоста на локальный порт — без открытых входящих портов, в связке с Cloudflare Access для аутентификации (см. блок безопасности выше):

| Имя хоста | Сервис |
|---|---|
| `dsw21-mcp.devhorizon.online` | `http://localhost:8003` |

MCP-эндпоинт становится `https://dsw21-mcp.devhorizon.online/mcp`. Примечания для reverse proxy: пропускайте заголовок `Mcp-Session-Id` и методы `POST`/`DELETE`, отключайте буферизацию ответов для `text/event-stream` (nginx: `proxy_buffering off; proxy_read_timeout 110s`) и учитывайте 100-секундный idle-таймаут бесплатного тира Cloudflare — прогрейте GTFS-индекс один раз после каждого (пере)запуска, чтобы первый реальный вызов остался быстрым.

## 1.5 Передача местоположения (страница `/locate`)

Инструменты геолокации (`current_location`, `nearby_stops`, `plan_journey`) определяют позицию пользователя из двух источников в таком порядке:

1. **GPS через страницу `/locate`** (только HTTP-режим). Однократно откройте `https://<ваш-хост>/locate` в браузере телефона и разрешите геолокацию — страница отправит позицию на сервер (`POST /locate`) и поддерживает её через `watchPosition`, пока открыта вкладка. Координаты хранятся **на вашем собственном сервере** в `GTFS_INDEX_DIR/location.json` (права 600) и переживают перезапуски.
2. **`LOCATION_LAT` / `LOCATION_LON`** (переменные окружения) — статичная позиция для машин без браузера.

**IP-геолокации сознательно нет**: её точность (~20 км, часто хуже) бесполезна для планирования маршрутов — строить маршрут от неверной точки хуже, чем попросить пользователя открыть `/locate`.

> **Приватность и доступ**
> * GPS-координаты никогда не покидают ваш сервер и никуда не отправляются.
> * У страницы `/locate` **нет аутентификации** (по договорённости): зная URL, кто угодно не *прочитает*, но может *перезаписать* сохранённую позицию. При секретном имени хоста и защищённом остальном контуре (Cloudflare Access и т. п.) это допустимо для личного использования; URL `/locate` не публикуйте.

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
      "env": { "DB_LANG": "en" }
    }
  }
}
```

**Claude Code** (CLI) — сервер одной командой:

```bash
claude mcp add dsw21-mcp -e DB_LANG="en" -- node /home/user/dsw21-mcp/src/index.js
```

(Windows: `claude mcp add dsw21-mcp -e DB_LANG="en" -- node D:/mcp5/db/dsw21-mcp/src/index.js`; управление: `claude mcp list`, `claude mcp remove dsw21-mcp`.)

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

> `timeout: 300` (секунд) рекомендуется: самый первый вызов GTFS-RT скачивает статический индекс ~18 МБ, что может превысить короткий стандартный таймаут.

Полезные добавки:

* **Горячая перезагрузка:** после правки YAML выполните `/reload-mcp` в сессии — перезапуск не нужен.
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
        "DB_LANG": "de"
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
node /home/user/dsw21-mcp/src/index.js
```

Вы должны увидеть на stderr `[dsw21-mcp] ready (lang: en)`. После этого процесс ждёт MCP-сообщения на stdin (это нормально — выход по `Ctrl+C`).

## 2.6 Быстрый stdio-самотест

Доказать без клиента, что сервер отвечает на MCP-запросы, можно пайпом из `initialize` + `tools/list` JSON-RPC:

```bash
(printf '%s\n' \
 '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"probe","version":"0"}}}' \
 '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
 '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'; sleep 2) | node src/index.js
```

В ответе — все восемь инструментов: доказательство, что интеграция готова.

## 2.7 Приложение OmniChat для Android (HTTP)

Приложение OmniChat для Android работает с MCP по Streamable HTTP и может полностью удалённо управлять dsw21-mcp:

1. Запустите сервер в HTTP-режиме (раздел 1.4) и опубликуйте за контролем доступа (reverse proxy с Basic Auth / Cloudflare Access — см. блок безопасности в 1.4).
2. В приложении: **вкладка MCP → HTTP →** имя `dsw21-mcp`, URL `https://dsw21-mcp.devhorizon.online/mcp` → добавить → **Connect**.
3. Приложение выполнит `initialize` + `tools/list` и синхронизирует все восемь инструментов; включайте/отключайте их по отдельности и спрашивайте, например: *«Трамвай в Дортмунде сейчас опаздывает?»*.

Телефону не нужна локальная среда выполнения — всё работает на сервере. Первый вызов GTFS-RT строит индекс ~18 МБ на стороне сервера (прогрейте его после деплоя, см. 1.4).

---

# 3. Переменные окружения

| Переменная | По умолчанию | Значение |
|---|---|---|
| `DB_LANG` | `en` | Язык вывода по умолчанию (`en`/`de`), если в вызове нет `language`. (Имя сохранено ради обратной совместимости; к Deutsche Bahn отношения не имеет.) |
| `DB_USER_AGENT` | *(не задана)* | Необязательный User-Agent для запросов к gtfs.de — вежливый способ идентифицировать своё развертывание. |
| `GTFS_RT_FEED_URL` | `https://realtime.gtfs.de/realtime-free.pb` | GTFS-RT поток, который используют все инструменты. |
| `GTFS_INDEX_DIR` | `./.gtfs-index` | Каталог кэша статического GTFS-индекса и сохранённой GPS-позиции (`location.json`). |
| `LOCATION_LAT` / `LOCATION_LON` | *(не заданы)* | Статичные резервные координаты для `current_location` / `nearby_stops` / `plan_journey`, если GPS не передавался. |
| `LOCATION_FILE` | `<GTFS_INDEX_DIR>/location.json` | Куда сохраняется GPS-позиция со страницы `/locate` (права 600). |
| `TRANSITOUS_URL` | `https://api.transitous.org/api` | Базовый URL инстанса MOTIS для `plan_journey` / `trip_status` / `stop_departures` (пути содержат версию API, например `/v6/plan`). |
| `MCP_HTTP_PORT` | `8003` | Порт HTTP-режима (`npm run start:http`; `0` — назначает ОС). |
| `MCP_HTTP_HOST` | `127.0.0.1` | Адрес привязки HTTP-режима. |

Как задать их в клиенте: Claude Desktop / LM Studio / универсальные → блок `"env"` в JSON; hermes-agent → `env:` в YAML; OpenCode → `"environment"`; либо экспортировать в шелле перед запуском (`export DB_LANG=de`, PowerShell: `$env:DB_LANG="de"`).

---

# 4. Примеры использования всех инструментов

**Формат времени:** все метки времени в ответах — ISO 8601 с **явным смещением Europe/Berlin** (например, `2026-10-23T16:00:00.000+02:00` летом, `+01:00` зимой) — никогда не голый UTC `Z` — чтобы клиенты и модели никогда не приняли их за неверные настенные часы.

Примеры показывают JSON-**аргументы** инструмента и **типичный ответ**. Ответы ниже — реальные снимки от 2026-10-19 — фактические значения зависят от времени суток.

### 4.1 `dsw21_delays` — задержки DSW21 на остановке Дортмунда

Лучшая точка входа для Дортмунда. По умолчанию *Dortmund Hbf*; остановка разрешается во **все подплатформы** (realtime-поток ссылается на идентификаторы платформ — см. `stopIdCount`).

**Аргументы**

| Арг | Тип | По умолчанию | Описание |
|---|---|---|---|
| `stop` | string | `"Dortmund Hbf"` | Имя остановки Дортмунда или числовой GTFS-ID. |
| `minutes` | int 5–180 | `60` | Окно времени от текущего момента. |
| `language` | `"en"`/`"de"` | `DB_LANG` | Язык слов статуса. |

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
| `language` | `"en"`/`"de"` | `DB_LANG` | Язык слов статуса. |

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
  "feedTimestamp": "2026-10-19T12:42:20.000+02:00",
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
| `language` | `"en"`/`"de"` | `DB_LANG` | Язык подписей. |

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

### 4.4 `current_location` — где я нахожусь?

Определяет позицию пользователя (точный GPS из `/locate` → статичные переменные окружения). Используйте вместо вопросов «где вы?». IP-геолокации нет — если позиция неизвестна, инструмент сообщает об этом и предлагает открыть страницу `/locate`.

**Аргументы**

| Арг | Тип | По умолчанию | Описание |
|---|---|---|---|
| `language` | `"en"`/`"de"` | `DB_LANG` | Язык подписей. |

**Вызов**

```json
{"name": "current_location", "arguments": {}}
```

**Ответ с GPS-фиксо со страницы `/locate` (реальный)**

```json
{
  "latitude": 51.51693,
  "longitude": 7.46115,
  "source": "gps",
  "accuracyMeters": 12,
  "ageMinutes": 3
}
```

Позиции старше 6 часов помечаются `"stale": true` с подсказкой заново открыть `/locate`. **Ответ, когда позиция неизвестна** (реальный):

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

### 4.5 `nearby_stops` — какие остановки рядом?

Ближайшие станции из статического GTFS-индекса, по расстоянию, с дедупликацией по станции (платформы слиты). Возвращённый `stopId` подставляется в `dsw21_delays` / `gtfs_rt_delays`.

**Аргументы**

| Арг | Тип | По умолчанию | Описание |
|---|---|---|---|
| `latitude` / `longitude` | number | текущая позиция | Точка поиска. |
| `radius` | int 50–5000 | `800` | Радиус поиска в метрах. |
| `limit` | int 1–20 | `8` | Максимум результатов. |
| `language` | `"en"`/`"de"` | `DB_LANG` | Язык подписей. |

**Вызов** (явные координаты)

```json
{"name": "nearby_stops", "arguments": {"latitude": 51.5169, "longitude": 7.4609, "radius": 600, "limit": 5}}
```

**Ответ (реальный)**

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

### 4.6 `plan_journey` — как добраться?

Планирование маршрута через Transitous (MOTIS, покрытие всей Германии) с realtime-обновлениями. Начало по умолчанию — текущая позиция; пользователя спрашивать «где вы?» не нужно. Цель — название места (геокодер) или `"lat,lon"`.

**Аргументы**

| Арг | Тип | По умолчанию | Описание |
|---|---|---|---|
| `to` | string **обязательный** | – | Цель: название места или `"lat,lon"`. |
| `from` | string | текущая позиция | Начало: название места или `"lat,lon"`. |
| `time` | ISO 8601 | сейчас | Время отправления — или прибытия при `arriveBy=true`. |
| `arriveBy` | boolean | `false` | Планирование «назад»: `time` означает «я должен прибыть к …». |
| `maxTransfers` | int 0–10 | – | Максимум пересадок (`0` — только прямые рейсы). |
| `modes` | string[] | все | Фильтр по видам транспорта, например `["TRAM","SUBWAY","BUS"]`. |
| `results` | int 1–5 | `3` | Число маршрутов. |
| `language` | `"en"`/`"de"` | `DB_LANG` | Язык слов статуса. |

**Вызовы**

```json
{"name": "plan_journey", "arguments": {"to": "Dortmund Flughafen", "from": "Dortmund Hbf", "results": 2}}
{"name": "plan_journey", "arguments": {"to": "51.5231,7.4653", "results": 1}}
{"name": "plan_journey", "arguments": {"to": "Köln Hbf", "time": "2026-10-24T17:00:00+02:00", "arriveBy": true}}
{"name": "plan_journey", "arguments": {"to": "Flughafen Dortmund", "modes": ["TRAM", "SUBWAY", "BUS"]}}
```

**Ответ (реальный, сокращённый)**

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

Транзитные сегменты содержат `line`, `headsign`, `tripId`, `track`/`scheduledTrack`, `cancelled` и `delayMin` (realtime против расписания) — те же слова статуса, что и в инструментах задержек.

### 4.7 `trip_status` — где мой поезд и насколько он опаздывает?

Один поезд/автобус/трамвай по **всему маршруту, вся Германия**, с realtime: по каждой станции план/факт, распространение задержки, смены перронов, отмены. `tripId` берётся из сегмента `plan_journey` или из записи `stop_departures`.

**Аргументы**

| Арг | Тип | По умолчанию | Описание |
|---|---|---|---|
| `tripId` | string **обязательный** | – | Trip-ID из сегмента маршрута или записи отправления. |
| `language` | `"en"`/`"de"` | `DB_LANG` | Язык слов статуса. |

**Вызов** (tripId из `stop_departures`)

```json
{"name": "trip_status", "arguments": {"tripId": "20261023_14:48_de-DELFI_3444084535"}}
```

**Ответ (реальный, сокращённый)**

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
  "status": "on time",
  "stops": 22,
  "delayedStops": 7,
  "stopovers": [
    { "name": "Dortmund Wittichstraße", "stopId": "de-DELFI_de:05913:515:21:21",
      "arrival": "2026-10-23T14:49:00.000+02:00", "scheduledArrival": "2026-10-23T14:49:00.000+02:00",
      "arrivalDelayMin": 0, "departure": "2026-10-23T14:49:00.000+02:00",
      "scheduledDeparture": "2026-10-23T14:49:00.000+02:00", "departureDelayMin": 0,
      "track": "21", "scheduledTrack": "21", "status": "on time" }
  ]
}
```

`delayedStops` мгновенно отвечает на вопрос «насколько далеко разнесётся задержка?»; `track`/`scheduledTrack` по каждой станции показывают смены перронов.

### 4.8 `stop_departures` — расписание любой остановки Германии

Ближайшие отправления с **любой остановки Германии** с realtime (Transitous/MOTIS) — дополняет `dsw21_delays`/`gtfs_rt_delays`, которые покрывают только регион gtfs.de. Полезно для станций дальнего сообщения (Кёльн, Франкфурт, Мюнхен…) и поездок за пределы NRW.

**Аргументы**

| Арг | Тип | По умолчанию | Описание |
|---|---|---|---|
| `stop` | string **обязательный** | – | Название остановки (геокодируется) или MOTIS stop-id. |
| `minutes` | int 5–240 | `60` | Окно времени в минутах от текущего момента. |
| `limit` | int 1–50 | `20` | Минимум отправлений. |
| `modes` | string[] | все | Фильтр по видам транспорта, например `["HIGHSPEED_RAIL"]`. |
| `language` | `"en"`/`"de"` | `DB_LANG` | Язык слов статуса. |

**Вызовы**

```json
{"name": "stop_departures", "arguments": {"stop": "Dortmund Hbf", "minutes": 45, "limit": 6}}
{"name": "stop_departures", "arguments": {"stop": "Frankfurt (M) Hbf", "modes": ["HIGHSPEED_RAIL", "INTERCITY_TRAIN"], "limit": 10}}
```

**Ответ (реальный, сокращённый)**

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
      "delayMin": 0, "status": "on time", "track": "21", "scheduledTrack": "21" }
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
| *«Есть ли задержки на Dortmund Kreuzstraße?»* | `gtfs_rt_delays {"stop": "Dortmund Kreuzstraße", "minDelay": 1}` |
| *«Как добраться до аэропорта?»* | `plan_journey {"to": "Dortmund Flughafen"}` — начало = текущая позиция |
| *«Какая остановка рядом со мной?»* | `nearby_stops {}` → `stopId` в `dsw21_delays` |
| *«Где я?»* | `current_location {}` |
| *«Поезд в Кёльн в 17:00 — построй маршрут, чтобы успеть»* | `plan_journey {"to": "Köln Hbf", "time": "…T17:00:00+02:00", "arriveBy": true}` |
| *«Насколько опаздывает моя U41 и где задержка догонит?»* | `stop_departures {"stop": "Dortmund Hbf", "limit": 5}` → `trip_status {"tripId": "…"}` |
| *«Когда следующий ICE во Франкфурт?»* | `stop_departures {"stop": "Frankfurt (M) Hbf", "modes": ["HIGHSPEED_RAIL"]}` или то же для станции отправления |

# 6. Известные ограничения

* **Нет смен перронов/путей** — формат GTFS-RT передаёт только задержки и отмены (`SKIPPED`/`NO_DATA`); перроны — это данные статического расписания.
* **Нет направления (`headsign`)** для DSW21 — файл `trips.txt` gtfs.de для местного транспорта содержит только `route_id,service_id,trip_id`.
* **Первый вызов строит статический индекс** (скачивание ~18 МБ через HTTP Range, несколько секунд, затем 24 ч кэша в `GTFS_INDEX_DIR`).
* gtfs.de отмечает **автобусы в VRR-потоке как неполные**; надёжна трамвайно-железнодорожная часть (U- и трамвайные линии DSW21).
* **HTTP-режим без встроенной аутентификации** — см. блок безопасности в разделе 1.4; публикуйте только за контролем доступа.
* HTTP-режим не отдаёт standalone SSE (`GET /mcp` отвечает `405`); поддерживаемые клиенты используют `POST` и не затронуты.
* **Нет позиции → нет автоматического начала маршрута**: `plan_journey`/`nearby_stops` без явных координат требуют GPS-фикс со страницы `/locate` (или переменных окружения). IP-геолокация сознательно не используется (~20 км точности бесполезны для планирования).
* Страница **`/locate` без аутентификации** — зная URL, кто угодно может *перезаписать* сохранённую позицию (раздел 1.5). Она ничего не раскрывает, но держите URL в секрете.
* **Маршруты, поезда и расписания приходят из Transitous** (бесплатный общественный сервис, агрегация GTFS/GTFS-RT по Германии, API MOTIS v6) — соблюдайте его [политику использования](https://transitous.org/api/); сервер кэширует маршруты на 10 минут, табло — на 30 секунд. Покрытие следует фидам, поэтому отдельные региональные перевозчики могут отсутствовать.

# 7. Решение проблем

| Симптом | Причина / решение |
|---|---|
| `Building the static GTFS index for the first time …` | Нормально при самом первом вызове GTFS-RT; повторите через ~30 с. Дальнейшие вызовы используют 24-часовой кэш. |
| `No stop found for "…" in the static GTFS index` | Используйте точное имя с gtfs.de (например, `"Dortmund Hbf"`) или числовой stop-id. |
| `Could not build/load the static GTFS index …` | Нет доступа к `download.gtfs.de` или изменилась структура архива. Повторите; проверьте `npm run test:gtfsrt`. |
| Клиент не показывает инструменты | Проверьте абсолютный путь в конфигурации, успешность `npm install` и полностью перезапустите клиент. |
| LM Studio игнорирует сервер | Включите **Settings → Server → «Allow calling servers from mcp.json»**; проверьте Program → Integrations. |
| Тесты падают после `git clone` | Сначала выполните `npm install`. |
| HTTP: `Session not found or expired` (404) | Сессия клиента вычищена (простой > 1 ч) или сервер перезапустился. Переподключитесь — клиенты автоматически повторяют `initialize`. |
| HTTP: соединение обрывается через ~60–100 с | Бесплатный тир Cloudflare рвёт idle-соединения на 100 с. Прогревайте GTFS-индекс после каждого перезапуска (один вызов инструмента) и/или включите keep-alive пинги в клиенте. |
| HTTP: `405 Method Not Allowed` на `GET /mcp` | Нормально — standalone SSE не поддерживается; клиенты используют `POST`. |
| HTTP: `connection refused` | Сервер не запущен или неверные `MCP_HTTP_HOST`/`MCP_HTTP_PORT`. Проверьте `curl http://127.0.0.1:8003/health` → `ok`. |
| `current_location` сообщает, что позиция неизвестна | GPS ещё не передавался — откройте `https://<хост>/locate` в браузере телефона и держите вкладку открытой, либо задайте `LOCATION_LAT`/`LOCATION_LON`. IP-геолокация сознательно не используется. |
| `current_location` сообщает `"stale": true` | GPS-позиция старше 6 часов — снова откройте страницу `/locate`. |
| `plan_journey`/`stop_departures`: `Place "…" not found` | Геокодер не узнал название — используйте более точное имя или `"lat,lon"`. |
| `plan_journey`: `MOTIS … 403 Generic user-agent` | Transitous отклоняет обобщённые User-Agent — задайте `DB_USER_AGENT` на сервере (в этой сборке уже есть значение по умолчанию; собственный UA вежливее). |
| `trip_status`: `Trip "…" not found` | Поезд уже прошёл маршрут или ID устарел — возьмите свежую `tripId` из `stop_departures` или из сегмента `plan_journey`. |
| `nearby_stops` возвращает 0 остановок | Слишком мал радиус или позиция в глуши — увеличьте `radius` (макс. 5000 м). |
| Android: приложение-клиент не видит сервер | Мобильные облачные приложения (Claude/ChatGPT) поддерживают только *удалённый* MCP; запускайте агентов внутри Termux или разворачивайте HTTP-режим на сервере (раздел 1.4). |

# 8. Разработка

```bash
npm test            # офлайн: GTFS unit-тесты + stdio- и HTTP-smoke-тесты
npm run test:gtfsrt # онлайн: строит индекс, запрашивает реальные задержки DSW21 (сеть)
npm start           # запуск MCP-сервера на stdio
npm run start:http  # запуск MCP-сервера по Streamable HTTP
```

Структура:

```
dsw21-mcp/
├── src/
│   ├── index.js          # точка входа: stdio-транспорт + регистрация инструментов
│   ├── http.js           # точка входа: Streamable-HTTP-транспорт (/mcp, /health, /locate)
│   ├── server.js         # общая фабрика McpServer для обеих точек входа
│   ├── cache.js          # in-memory TTL-кэш
│   ├── i18n.js           # строки en/de + разрешение языка
│   ├── location.js       # позиция пользователя: страница /locate + файл GPS (без IP-геолокации)
│   ├── nearby.js         # расстояние гаверсинуса + поиск ближайших остановок (чистая логика)
│   ├── gtfs/
│   │   ├── zip.js        # чтение отдельных файлов из удалённого zip 236 МБ через HTTP Range
│   │   ├── csv.js        # парсер GTFS CSV
│   │   ├── index.js      # построение статического GTFS-индекса + дисковый кэш (~18 МБ, с координатами остановок)
│   │   └── feed.js       # GTFS-RT поток: загрузка, декодирование, join
│   └── tools/
│       ├── gtfs-rt.js    # dsw21_delays, gtfs_rt_delays, gtfs_rt_alerts
│       ├── location.js   # current_location, nearby_stops
│       └── journey.js    # plan_journey (Transitous/MOTIS)
└── test/
    ├── gtfs.test.js      # офлайн-тесты CSV, разрешения остановок и ближайших станций
    ├── gtfsrt-live.js    # онлайн-тест пайплайна GTFS-RT
    ├── loc-live.mjs      # онлайн-тест инструментов локации/маршрутов (сеть)
    ├── smoke.js          # stdio-тест регистрации инструментов MCP
    └── smoke-http.js     # тест MCP Streamable HTTP (включая DELETE сессии)
```

# 9. Источники данных и лицензия

* GTFS-RT поток и статическое расписание: [gtfs.de](https://gtfs.de/en/realtime/) — CC BY-SA 4.0 / CC BY 4.0, предоставляется DELFI e.V. и региональными объединениями; **без каких-либо гарантий**. Пожалуйста, соблюдайте [политику использования Transitous](https://transitous.org/api/) для альтернативных способов доступа.
* Планирование маршрутов, статус поездов и расписания: инстанс [Transitous](https://transitous.org) MOTIS (v6 API) — бесплатный общественный сервис с фидами GTFS/GTFS-RT по Германии; этот сервер отправляет идентифицирующий User-Agent и кэширует ответы (маршруты 10 минут, табло 30 секунд).
* Этот сервер: лицензия ISC. Репозиторий: https://github.com/sashok53011/dsw21-mcp
