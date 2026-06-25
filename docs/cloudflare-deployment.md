# Deploying Infinite Servers to Cloudflare

This guide walks through deploying the Infinite Servers dashboard to Cloudflare's edge platform using Workers, D1, KV, and Pages.

> **不安装任何本地工具？** 查看 [Dashboard 部署指南](./dashboard-deployment.md)，通过浏览器完成所有操作。

## Prerequisites

- A Cloudflare account (free tier works)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) installed (`npm install -g wrangler`)
- Node.js 18+ and npm
- Authenticated with Wrangler: `wrangler login`

## Step 1: Create D1 Database

```bash
cd worker
wrangler d1 create infinite-servers-db
```

Note the `database_id` from the output.

## Step 2: Initialize D1 Schema

```bash
cd worker
wrangler d1 execute infinite-servers-db --remote --file=../scripts/migrate-to-d1.sql
```

This creates the `server_info`, `server_status`, `history`, `login_logs`, and `ip_bans` tables.

## Step 3: Create KV Namespace

KV stores the server configuration and global settings.

```bash
cd worker
wrangler kv namespace create CONFIG
```

Note the `id` and `preview_id` from the output.

## Step 4: Configure Resource Bindings

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

## Step 5: Upload Initial Config to KV

Create a local config file (e.g., `servers.json`) based on `configs/dummy-servers.json`:

```json
{
  "servers": {
    "My Server": {
      "region": "US",
      "location": "New York",
      "tags": ["Production"],
      "token": "your-secret-token",
      "url": "http://YOUR_AGENT_IP/status.php",
      "ip_mask": "x.x.*.*",
      "expiry": "2025-12-31"
    }
  }
}
```

Upload it to KV:

```bash
cd worker
wrangler kv key put --namespace-id=<your-kv-id> "servers.json" --path=../configs/web-servers.json
```

Optionally, upload a global config:

```bash
wrangler kv key put --namespace-id=<your-kv-id> "config.json" '{"password":"your-password","sse":false,"interval":5,"history-interval":5,"history-days":30}'
```

## Step 6: Set Secrets

Set the dashboard password as a Worker secret (alternative to putting it in KV config):

```bash
cd worker
wrangler secret put PASSWORD
# Enter your password when prompted
```

> **Note:** If you set `PASSWORD` via `wrangler secret put`, it overrides the password in the KV `config.json`. The KV-stored password is read first; the secret acts as a fallback. For simplicity, you can put the password directly in the `config.json` uploaded to KV in Step 5.

## Step 7: Deploy Worker

```bash
cd worker
npm install
npm run deploy
```

Wrangler outputs the deployed URL, e.g.:
```
https://infinite-servers.<your-subdomain>.workers.dev
```

## Step 8: Deploy Frontend to Pages

```bash
cd web
npm ci
VITE_API_BASE="https://your-worker.workers.dev/" VITE_ASSET_BASE=/ npm run build
npx wrangler pages deploy dist --project-name=infinite-server-web
```

The Pages URL will be:
```
https://infinite-server-web.pages.dev
```

> **Note:** The frontend's `web/src/api.js` reads the API base URL from the page's config element. The Worker serves the frontend HTML with the correct API base injected. If deploying frontend separately via Pages, update the API base URL in `web/src/api.js` or configure Pages environment variables.

### Single-Deployment Alternative

If you prefer serving everything from the Worker (frontend + API), build the frontend and copy `dist/` contents into the Worker's static assets. The Worker's routes handle serving the HTML pages with the correct config injected.

## Step 9: Configure Custom Domain (Optional)

1. Go to the [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Navigate to **Workers & Pages** > your Worker project
3. Go to **Settings** > **Triggers** > **Custom Domains**
4. Add your custom domain (e.g., `status.example.com`)
5. Cloudflare automatically provisions an SSL certificate

For Pages:
1. Go to your Pages project > **Custom domains**
2. Add your domain and follow the DNS configuration steps

## Step 10: Update Agent URLs

For each monitored server, update the agent's config to point to the new Worker URL.

If your agents use the **pull method** (Worker fetches from agent):
- Update the `url` field in `configs/web-servers.json` (or KV `servers.json`) to point to the agent's `/status.php` endpoint
- Redeploy KV config: `wrangler kv key put --namespace-id=<id> "servers.json" --path=../configs/web-servers.json`

If your agents use the **push method** (agent pushes to Worker):
- Update the agent config to POST to `https://infinite-servers.<subdomain>.workers.dev/push`

## Verification

1. **Health check:** Visit `https://infinite-servers.<subdomain>.workers.dev/` — should redirect to login if password is set
2. **Login:** Log in with the password you configured
3. **Dashboard:** Verify servers appear (they will show "no data" until agents connect)
4. **Agent connection:** Ensure agents can reach the Worker URL and data appears on the dashboard
5. **API endpoints:** Test directly:
   - `GET /servers` — returns server hardware info
   - `GET /status` — returns live status
   - `GET /history?server=<name>&hours=24` — returns time series data

## Troubleshooting

- **403 on /push:** Check that the agent's token matches the token in `servers.json` in KV
- **No data showing:** Verify the agent URL in KV config is correct and reachable from Cloudflare's edge (not just from your local network)
- **KV config not updating:** Changes to KV take effect immediately — no redeployment needed
- **D1 errors:** Check that the schema was initialized with the correct `--remote` flag
