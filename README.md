# Infinite Servers - Cloudflare Edition

基于 Cloudflare 平台重构的服务器集群监控工具。无需自建服务器，全平台部署在 Cloudflare Edge 上。

[English Documentation](./README_EN.md)

## 架构

```
┌─────────────────────────────────────────────────────────┐
│                    Cloudflare Edge                       │
├─────────────────────────────────────────────────────────┤
│  ┌──────────────┐    ┌──────────────────────────────┐  │
│  │   Pages      │    │         Workers               │  │
│  │   (前端)     │◄──►│  API Gateway + 业务逻辑       │  │
│  │   React/Vite │    │  (TypeScript + Hono)         │  │
│  └──────────────┘    └──────────────────────────────┘  │
│         │                       │                       │
│         │              ┌────────────────┐              │
│         │              │   D1 Database  │              │
│         │              │  (SQLite)      │              │
│         │              └────────────────┘              │
│         │              ┌────────────────┐              │
│         │              │   KV Storage   │              │
│         │              │  (配置存储)    │              │
│         │              └────────────────┘              │
└─────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│                    Agent (被监控服务器)                   │
│  PHP 脚本 → 每 15 秒推送状态到 Workers                   │
└─────────────────────────────────────────────────────────┘
```

## 技术栈

- **前端**: React + Vite → Cloudflare Pages
- **后端**: TypeScript + Hono → Cloudflare Workers
- **数据库**: Cloudflare D1 (SQLite)
- **配置**: Cloudflare KV
- **定时任务**: Workers Cron Triggers

---

## 快速开始

本项目支持两种部署方式：

- **[方式一：Dashboard 部署（推荐）](#方式一dashboard-部署无需本地工具)** — 无需安装任何本地工具，通过浏览器完成所有操作
- **[方式二：CLI 部署](#方式二cli-部署需要本地环境)** — 使用 Wrangler 命令行工具

---

### 方式一：Dashboard 部署（无需本地工具）

> 仅需一个 Cloudflare 账号，全程在浏览器中完成。

#### 前置条件

- 一个 Cloudflare 账号（免费套餐即可）
- 项目的代码文件（可通过 GitHub 仓库获取）

#### 1. 创建 D1 数据库

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 左侧菜单：**Storage & Databases** → **D1 SQL 数据库** → **创建数据库**
3. 数据库名称：`infinite-servers-db`，位置选择 **Automatic**
4. 创建后记下 **Database ID**

#### 2. 初始化数据库表结构

进入 D1 数据库 → **控制台** 标签 → 粘贴以下 SQL 并执行：

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

#### 3. 创建 KV 命名空间

1. 左侧菜单：**Storage & Databases** → **KV** → **创建命名空间**
2. 名称：`CONFIG`
3. 创建后记下 **Namespace ID**

#### 4. 上传配置到 KV

进入 `CONFIG` 命名空间 → **查看数据** → **添加条目**：

**条目 1 — 全局配置：**
- Key：`config.json`
- Value：
```json
{
  "password": "your-password-here",
  "sse": false,
  "interval": 5,
  "history-interval": 5,
  "history-days": 30
}
```

**条目 2 — 服务器列表：**
- Key：`servers.json`
- Value：
```json
{
  "servers": {
    "My Server": {
      "region": "CN",
      "location": "Beijing",
      "tags": ["Production"],
      "token": "your-agent-token-here"
    }
  }
}
```

#### 5. 创建 Worker

1. 左侧菜单：**Compute (Workers)** → **Workers & Pages** → **创建应用程序** → **创建 Worker**
2. 名称：`infinite-servers` → **部署**

> Dashboard Quick Editor 仅支持单文件 JS。由于本项目使用 TypeScript + Hono，需要通过 GitHub 集成或本地构建后上传来部署完整代码。

**通过 GitHub 集成（推荐）：**

1. Worker 详情页 → **设置** → **版本管理** → 选择 **GitHub**
2. 授权并选择仓库
3. 构建命令：`cd worker && npm install && npm run deploy`

**通过直接上传：**

1. 本地执行（仅需一次）：
```bash
cd worker && npm install
npx wrangler deploy --dry-run --outdir=../worker-dist
```
2. Dashboard → Worker → **编辑代码** → 上传 `worker-dist/index.js`

#### 6. 配置 Worker 绑定

Worker 详情页 → **设置** → **绑定**：

- **添加 D1 数据库**：变量名称 `DB`，选择 `infinite-servers-db`
- **添加 KV 命名空间**：变量名称 `CONFIG`，选择 `CONFIG`

#### 7. 设置环境变量

Worker 详情页 → **设置** → **变量和机密**：

| 变量名 | 值 |
|--------|-----|
| `SSE_ENABLED` | `false` |
| `INTERVAL` | `5` |
| `HISTORY_DAYS` | `30` |
| `HISTORY_INTERVAL` | `5` |

密码已通过 KV `config.json` 设置。如需使用 Worker Secret 方式，点击 **加密变量** 添加 `PASSWORD`。

#### 8. 配置 Cron Trigger

Worker 详情页 → **设置** → **触发器** → **Cron Triggers** → 添加 `0 0 * * *`

#### 9. 部署前端到 Pages

**通过 GitHub 集成（推荐）：**

1. **Workers & Pages** → **创建应用程序** → **Pages** → **连接到 Git**
2. 构建设置：
   - 项目名称：`infinite-servers-dashboard`
   - 构建命令：`npm ci && npm run build`
   - 构建输出目录：`dist`
   - 根目录：`/`
3. 环境变量：`VITE_API_BASE` = `https://infinite-servers.your-subdomain.workers.dev/`

**通过直接上传：**

```bash
npm ci
VITE_API_BASE="https://infinite-servers.your-subdomain.workers.dev/" npm run build
```
然后在 Dashboard → Pages → **上传资产** → 上传 `dist/` 目录。

#### 10. 验证部署

1. 访问 Worker URL，应显示登录页面
2. 使用 `config.json` 中的密码登录
3. 登录后应显示服务器列表（初始为空，等待 Agent 连接）

#### 操作核对清单

- [ ] D1 数据库已创建并执行 SQL 迁移
- [ ] KV 命名空间已创建并上传配置
- [ ] Worker 已部署，绑定 D1 + KV，环境变量已设置
- [ ] Cron Trigger 已配置
- [ ] 前端已部署到 Pages
- [ ] 可正常登录访问仪表盘

> 详细步骤见 [Dashboard 部署指南](./docs/dashboard-deployment.md)

---

### 方式二：CLI 部署（需要本地环境）

#### 前置条件

- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)（`npm install -g wrangler`）
- Node.js 18+ 和 npm
- 已登录 Wrangler：`wrangler login`

#### 1. 安装依赖

```bash
# 前端
npm ci

# Worker
cd worker && npm install
```

#### 2. 配置 Cloudflare

```bash
cp .env.example .env
# 编辑 .env 填入你的 Cloudflare 凭据
```

#### 3. 创建 D1 数据库

```bash
cd worker
npx wrangler d1 create infinite-servers-db
# 记下输出的 database_id
```

#### 4. 创建 KV 命名空间

```bash
npx wrangler kv namespace create CONFIG
# 记下输出的 id
```

#### 5. 配置资源绑定

编辑 `worker/wrangler.toml`，取消注释并填入你自己的资源 ID：

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

#### 6. 初始化数据库

```bash
npx wrangler d1 execute infinite-servers-db --remote --file=../scripts/migrate-to-d1.sql
```

#### 7. 上传初始配置到 KV

```bash
# 上传全局配置
npx wrangler kv key put --binding=CONFIG config.json < ../configs/config.json

# 上传服务器列表
npx wrangler kv key put --binding=CONFIG servers.json < ../configs/dummy-servers.json
```

#### 8. 部署 Worker

```bash
npx wrangler deploy
```

#### 9. 构建并部署前端

```bash
cd ..
VITE_API_BASE="https://your-worker.workers.dev/" npm run build
npx wrangler pages deploy dist --project-name=infinite-servers-dashboard
```

---

## Agent 部署

在被监控服务器上运行：

```bash
sudo ./scripts/deploy-agent.sh

# 按提示输入：
# - Server name（服务器名称）
# - Dashboard URL（Worker URL）
# - Token（认证令牌）
```

---

## 配置说明

### KV 配置项

| Key | 说明 |
|-----|------|
| `config.json` | 全局配置（密码、间隔、Telegram 等） |
| `servers.json` | 服务器列表（名称、Token、地区等） |
| `worker_geo` | Worker 出口 IP 归属地（自动更新） |

### config.json 示例

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

### servers.json 示例

```json
{
  "servers": {
    "My Server": {
      "region": "CN",
      "location": "Beijing",
      "tags": ["Production"],
      "token": "unique-token-here"
    }
  }
}
```

---

## API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/` | GET | Dashboard 页面 |
| `/login` | POST | 登录认证 |
| `/logout` | GET | 登出 |
| `/servers` | GET | 服务器硬件信息 |
| `/status` | GET | 实时状态 |
| `/history` | GET | 历史数据 |
| `/availability` | GET | 可用性统计 |
| `/push` | POST | Agent 推送状态 |
| `/set-expiry` | POST | 设置到期时间 |
| `/set-purchase-date` | POST | 设置购买时间 |
| `/doodle` | GET | Google Doodle |
| `/geo` | GET | Worker 出口 IP 归属地 |

---

## 定时任务

- **Cron Trigger**: 每天 UTC 00:00 运行
  - 更新 Worker 出口 IP 归属地
  - 检查服务器到期时间
  - 发送 Telegram 到期提醒

---

## 本地开发

```bash
# 前端开发服务器（代理 API 请求到 localhost:8000）
npm run dev

# Worker 开发服务器（单独终端）
cd worker && npx wrangler dev

# Worker 类型检查
cd worker && npm run typecheck
```

---

## 常见问题

**KV 配置修改后需要重新部署吗？**
不需要。KV 变更立即生效，无需重新部署 Worker。

**如何更新服务器列表？**
进入 KV → `CONFIG` → 编辑 `servers.json` 条目，修改后立即生效。

**Agent 推送返回 403？**
检查 Agent 的 token 是否与 KV `servers.json` 中对应服务器的 token 一致。

**前端无法连接后端 API？**
检查 `VITE_API_BASE` 环境变量是否正确设置，以及 Worker 是否正常运行。

**D1 执行 SQL 报错？**
D1 控制台一次只支持执行一条 SQL，需逐条执行。

---

## License

MIT License
