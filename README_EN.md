# Infinite Servers - Cloudflare Edition

Server fleet monitoring tool built on the Cloudflare platform. Deploy entirely on Cloudflare Edge — no self-hosted servers required.

[中文文档](./README.md)

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Cloudflare Edge                       │
├─────────────────────────────────────────────────────────┤
│  ┌──────────────┐    ┌──────────────────────────────┐  │
│  │   Pages      │    │         Workers               │  │
│  │  (Frontend)  │◄──►│  API Gateway + Business Logic │  │
│  │  React/Vite  │    │  (TypeScript + Hono)         │  │
│  └──────────────┘    └──────────────────────────────┘  │
│         │                       │                       │
│         │              ┌────────────────┐              │
│         │              │   D1 Database  │              │
│         │              │  (SQLite)      │              │
│         │              └────────────────┘              │
│         │              ┌────────────────┐              │
│         │              │   KV Storage   │              │
│         │              │  (Config)      │              │
│         │              └────────────────┘              │
└─────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│              Agent (Monitored Server)                    │
│  PHP script → pushes status to Workers every 15s        │
└─────────────────────────────────────────────────────────┘
```

## Tech Stack

- **Frontend**: React + Vite → Cloudflare Pages
- **Backend**: TypeScript + Hono → Cloudflare Workers
- **Database**: Cloudflare D1 (SQLite)
- **Config**: Cloudflare KV
- **Scheduling**: Workers Cron Triggers

---

## Quick Start

Two deployment options:

- **[Option 1: Dashboard Deployment (Recommended)](#option-1-dashboard-deployment-no-local-tools)** — No local tools required, everything via browser
- **[Option 2: CLI Deployment](#option-2-cli-deployment-requires-local-env)** — Using Wrangler CLI

---

### Option 1: Dashboard Deployment (No Local Tools)

> Only requires a Cloudflare account. All operations done in the browser.

#### Prerequisites

- A Cloudflare account (free tier works)
- Project source code (available via GitHub repository)

#### 1. Create D1 Database

1. Log in to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Left menu: **Storage & Databases** → **D1 SQL Databases** → **Create database**
3. Database name: `infinite-servers-db`, location: **Automatic**
4. Note down the **Database ID** after creation

#### 2. Initialize Database Schema

Go to D1 database → **Console** tab → paste and execute the following SQL:

```sql
CREATE TABLE IF NOT EXISTS server_info (
  server  TEXT PRIMARY KEY,
  data    TEXT    NOT NULL,
  updated INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS server_status (
  server  TEXT PRIMARY KEY,
  data    TEXT    NOT NULL,
  updated INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS history (
  server   TEXT    NOT NULL,
  ts       INTEGER NOT NULL,
  load1    REAL,
  mem_pct  REAL,
  disk_pct REAL,
  net_rx   INTEGER,
  net_tx   INTEGER,
  cpu_pct  REAL,
  swap_pct REAL,
  PRIMARY KEY (server, ts)
);

CREATE TABLE IF NOT EXISTS login_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip TEXT NOT NULL,
  ts INTEGER NOT NULL,
  success INTEGER NOT NULL DEFAULT 0,
  password_hash TEXT
);

CREATE INDEX IF NOT EXISTS idx_login_logs_ip_ts ON login_logs(ip, ts);

CREATE TABLE IF NOT EXISTS ip_bans (
  ip TEXT PRIMARY KEY,
  banned_until INTEGER NOT NULL
);
```

#### 3. Create KV Namespace

1. Left menu: **Storage & Databases** → **KV** → **Create namespace**
2. Name: `CONFIG`
3. Note down the **Namespace ID** after creation

#### 4. Upload Config to KV

Go to `CONFIG` namespace → **View Data** → **Add entry**:

**Entry 1 — Global Config:**
- Key: `config.json`
- Value:
```json
{
  "password": "your-password-here",
  "sse": false,
  "interval": 5,
  "history-interval": 5,
  "history-days": 30
}
```

**Entry 2 — Server List:**
- Key: `servers.json`
- Value:
```json
{
  "servers": {
    "My Server": {
      "region": "US",
      "location": "New York",
      "tags": ["Production"],
      "token": "your-agent-token-here"
    }
  }
}
```

#### 5. Create Worker

1. Left menu: **Compute (Workers)** → **Workers & Pages** → **Create application** → **Create Worker**
2. Name: `infinite-servers` → **Deploy**

> Dashboard Quick Editor only supports single-file JS. Since this project uses TypeScript + Hono, deploy via GitHub integration or local build + upload.

**Via GitHub Integration (Recommended):**

1. Worker detail page → **Settings** → **Triggers & Deployments** → select **GitHub**
2. Authorize and select repository
3. Build command: `cd worker && npm install && npm run deploy`

**Via Direct Upload:**

1. Run locally (one-time only):
```bash
cd worker && npm install
npx wrangler deploy --dry-run --outdir=../worker-dist
```
2. Dashboard → Worker → **Edit code** → upload `worker-dist/index.js`

#### 6. Configure Worker Bindings

Worker detail page → **Settings** → **Bindings**:

- **Add D1 Database**: variable name `DB`, select `infinite-servers-db`
- **Add KV Namespace**: variable name `CONFIG`, select `CONFIG`

#### 7. Set Environment Variables

Worker detail page → **Settings** → **Variables & Secrets**:

| Variable | Value |
|----------|-------|
| `SSE_ENABLED` | `false` |
| `INTERVAL` | `5` |
| `HISTORY_DAYS` | `30` |
| `HISTORY_INTERVAL` | `5` |

Password is set via KV `config.json`. To use Worker Secret instead, click **Encrypt variable** and add `PASSWORD`.

#### 8. Configure Cron Trigger

Worker detail page → **Settings** → **Triggers** → **Cron Triggers** → add `0 0 * * *`

#### 9. Deploy Frontend to Pages

**Via GitHub Integration (Recommended):**

1. **Workers & Pages** → **Create application** → **Pages** → **Connect to Git**
2. Build settings:
   - Project name: `infinite-servers-dashboard`
   - Build command: `npm ci && VITE_ASSET_BASE=/ npm run build`
   - Build output directory: `dist`
   - Root directory: `/`
3. Environment variable: `VITE_API_BASE` = `https://infinite-servers.your-subdomain.workers.dev/`

**Via Direct Upload:**

```bash
npm ci
VITE_API_BASE="https://infinite-servers.your-subdomain.workers.dev/" VITE_ASSET_BASE=/ npm run build
```
Then in Dashboard → Pages → **Upload assets** → upload the `dist/` directory.

#### 10. Verify Deployment

1. Visit Worker URL — should show login page
2. Log in with the password from `config.json`
3. Dashboard should display server list (empty initially, waiting for Agent connection)

#### Checklist

- [ ] D1 database created and SQL migration executed
- [ ] KV namespace created and config uploaded
- [ ] Worker deployed with D1 + KV bindings, env vars set
- [ ] Cron Trigger configured
- [ ] Frontend deployed to Pages
- [ ] Can log in and access dashboard

> See [Dashboard Deployment Guide](./docs/dashboard-deployment.md) for detailed steps.

---

### Option 2: CLI Deployment (Requires Local Env)

#### Prerequisites

- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) (`npm install -g wrangler`)
- Node.js 18+ and npm
- Authenticated with Wrangler: `wrangler login`

#### 1. Install Dependencies

```bash
# Frontend
npm ci

# Worker
cd worker && npm install
```

#### 2. Configure Cloudflare

```bash
cp .env.example .env
# Edit .env with your Cloudflare credentials
```

#### 3. Create D1 Database

```bash
cd worker
npx wrangler d1 create infinite-servers-db
# Note the database_id from output
```

#### 4. Create KV Namespace

```bash
npx wrangler kv namespace create CONFIG
# Note the id from output
```

#### 5. Configure Resource Bindings

Edit `worker/wrangler.toml`, uncomment and fill in your resource IDs:

```toml
[[d1_databases]]
binding = "DB"
database_name = "infinite-servers-db"
database_id = "<your-database-id>"

[[kv_namespaces]]
binding = "CONFIG"
id = "<your-kv-namespace-id>"
preview_id = "<your-kv-namespace-id>"
```

#### 6. Initialize Database

```bash
npx wrangler d1 execute infinite-servers-db --remote --file=../scripts/migrate-to-d1.sql
```

#### 7. Upload Initial Config to KV

```bash
npx wrangler kv key put --binding=CONFIG config.json < ../configs/config.json
npx wrangler kv key put --binding=CONFIG servers.json < ../configs/dummy-servers.json
```

#### 8. Deploy Worker

```bash
npx wrangler deploy
```

#### 9. Build & Deploy Frontend

```bash
cd ..
VITE_API_BASE="https://your-worker.workers.dev/" VITE_ASSET_BASE=/ npm run build
npx wrangler pages deploy dist --project-name=infinite-servers-dashboard
```

---

## Agent Deployment

One-line install on each monitored server:

```bash
curl -fsSL https://raw.githubusercontent.com/zhojielun/infinite-servers-cloudflare/master/scripts/install-agent.sh | sudo bash
```

Follow the prompts:
- **Server name** — must match the name configured in Dashboard
- **Dashboard URL** — Worker URL, e.g. `https://infinite-servers.xxx.workers.dev`
- **Token** — auth token (leave blank to auto-generate)
- **Push interval** — reporting interval in seconds (default 15)

Or skip prompts with environment variables:

```bash
sudo AGENT_NAME="My Server" \
     DASHBOARD_URL="https://infinite-servers.xxx.workers.dev" \
     AGENT_TOKEN="your-token" \
     AGENT_INTERVAL=15 \
     curl -fsSL https://raw.githubusercontent.com/zhojielun/infinite-servers-cloudflare/master/scripts/install-agent.sh | bash
```

After installation:
- Agent runs as a systemd service named `infinite-agent-{server-name}`
- Automatically collects CPU, memory, disk, network, load metrics and reports to Dashboard

Manage the service:

```bash
sudo systemctl status infinite-agent-MyServer    # check status
sudo systemctl restart infinite-agent-MyServer   # restart
sudo journalctl -u infinite-agent-MyServer -f    # follow logs
```

---

## Configuration

### KV Config Keys

| Key | Purpose |
|-----|---------|
| `config.json` | Global config (password, interval, Telegram, etc.) |
| `servers.json` | Server list (name, token, region, etc.) |
| `worker_geo` | Worker exit IP geolocation (auto-updated) |

### config.json Example

```json
{
  "password": "your-password",
  "sse": false,
  "interval": 5,
  "history-interval": 5,
  "history-days": 30,
  "telegram": {
    "enabled": true,
    "bot_token": "your-bot-token",
    "chat_id": "your-chat-id"
  }
}
```

### servers.json Example

```json
{
  "servers": {
    "My Server": {
      "region": "US",
      "location": "New York",
      "tags": ["Production"],
      "token": "unique-token-here"
    }
  }
}
```

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Dashboard page |
| `/login` | POST | Login authentication |
| `/logout` | GET | Logout |
| `/servers` | GET | Server hardware info |
| `/status` | GET | Real-time status |
| `/history` | GET | Historical data |
| `/availability` | GET | Availability stats |
| `/push` | POST | Agent status push |
| `/set-expiry` | POST | Set expiry date |
| `/set-purchase-date` | POST | Set purchase date |
| `/doodle` | GET | Google Doodle |
| `/geo` | GET | Worker exit IP geolocation |

---

## Scheduled Tasks

- **Cron Trigger**: Runs daily at UTC 00:00
  - Updates Worker exit IP geolocation
  - Checks server expiry dates
  - Sends Telegram expiry reminders

---

## Local Development

```bash
# Frontend dev server (proxies API to localhost:8000)
npm run dev

# Worker dev server (separate terminal)
cd worker && npx wrangler dev

# Worker typecheck
cd worker && npm run typecheck
```

---

## FAQ

**Do I need to redeploy after changing KV config?**
No. KV changes take effect immediately — no Worker redeployment needed.

**How to update the server list?**
Go to KV → `CONFIG` → edit the `servers.json` entry. Changes take effect immediately.

**Agent push returns 403?**
Check that the Agent's token matches the token in KV `servers.json` for that server.

**Frontend can't connect to backend API?**
Verify the `VITE_API_BASE` environment variable is set correctly and the Worker is running.

**D1 SQL execution error?**
D1 console only supports executing one SQL statement at a time. Execute statements individually.

---

## License

MIT License
