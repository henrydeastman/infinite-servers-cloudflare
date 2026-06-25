# Cloudflare Dashboard 部署指南

> 本指南帮助你**无需安装任何本地工具**，仅通过浏览器在 Cloudflare Dashboard 中完成 Infinite Servers 的部署。

---

## 前置条件

- 一个 Cloudflare 账号（免费套餐即可）
- 项目的代码文件（可通过 GitHub 仓库获取）

---

## 第一步：创建 D1 数据库

D1 用于存储服务器状态和历史数据。

### 操作路径

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 左侧菜单点击 **Storage & Databases** → **D1 SQL 数据库**
3. 点击 **创建数据库**
4. 填写：
   - **数据库名称**：`infinite-servers-db`
   - **位置**：选择 **Automatic**（推荐）
5. 点击 **创建数据库**

### 记录信息

创建完成后，记下 **Database ID**（格式如 `xxxx-xxxx-xxxx`），后续配置 Worker 绑定时需要。

> 📸 截图位置：D1 数据库详情页右上角

---

## 第二步：初始化数据库表结构

在 D1 中执行 SQL 迁移脚本，创建所需的表。

### 操作路径

1. 进入刚创建的 `infinite-servers-db` 数据库
2. 点击 **控制台**（Console）标签
3. 在查询框中粘贴以下 SQL：

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

4. 点击 **执行**（Execute）

### 验证

执行后应看到 "Query executed successfully" 提示。

---

## 第三步：创建 KV 命名空间

KV 用于存储服务器配置和全局设置。

### 操作路径

1. 左侧菜单点击 **Storage & Databases** → **KV**
2. 点击 **创建命名空间**
3. 填写：
   - **命名空间名称**：`CONFIG`
4. 点击 **添加命名空间**

### 记录信息

创建完成后，记下 **Namespace ID**，后续配置 Worker 绑定时需要。

> 📸 截图位置：KV 命名空间列表中的 ID 列

---

## 第四步：上传配置到 KV

### 4.1 上传全局配置（config.json）

1. 进入 `CONFIG` 命名空间
2. 点击 **查看数据**（View Data）
3. 点击 **添加条目**（Add entry）
4. 填写：
   - **Key**：`config.json`
   - **Value**：粘贴以下 JSON（根据需要修改密码）：

```json
{
  "password": "your-password-here",
  "sse": false,
  "interval": 5,
  "history-interval": 5,
  "history-days": 30
}
```

5. 点击 **保存**

### 4.2 上传服务器列表（servers.json）

1. 点击 **添加条目**
2. 填写：
   - **Key**：`servers.json`
   - **Value**：粘贴以下 JSON（根据实际服务器修改）：

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

3. 点击 **保存**

> **提示**：`token` 是 Agent 推送状态时使用的认证令牌，每个服务器需要唯一的 token。

---

## 第五步：创建 Worker

### 操作路径

1. 左侧菜单点击 **Compute (Workers)** → **Workers & Pages**
2. 点击 **创建应用程序**
3. 点击 **创建 Worker**
4. 填写：
   - **名称**：`infinite-servers`
5. 点击 **部署**

> 📸 截图位置：Workers & Pages 页面右上角

### 重要说明

由于本项目使用 TypeScript + Hono 框架，Dashboard 的 Quick Editor 无法直接部署完整代码。推荐使用以下两种方式之一：

---

## 第六步：部署 Worker 代码

### 方式一：通过 GitHub 集成（推荐）

适合代码已托管在 GitHub 上的用户。

#### 6.1 连接 GitHub 仓库

1. 在 Worker 详情页，点击 **设置**（Settings）
2. 点击 **版本管理**（Triggers & Deployments）或 **连接到 Git**
3. 选择 **GitHub**
4. 授权 Cloudflare 访问你的仓库
5. 选择包含项目的仓库和分支

#### 6.2 配置构建设置

- **构建命令**：`cd worker && npm install && npm run deploy`
- **构建输出目录**：（留空，Wrangler 自动处理）
- **根目录**：`/`

> **注意**：如果使用 GitHub 集成，Cloudflare 会自动在推送时构建和部署 Worker。

---

### 方式二：通过直接上传（无需 GitHub）

适合代码在本地或不想使用 GitHub 的用户。

#### 6.1 一次性构建

在本地计算机上执行以下命令（仅需一次）：

```bash
# 进入 worker 目录
cd worker

# 安装依赖
npm install

# 构建并生成可上传的 JS 文件
npx wrangler deploy --dry-run --outdir=../worker-dist
```

这会在 `worker-dist/` 目录下生成一个 `index.js` 文件。

#### 6.2 上传到 Dashboard

1. 在 Worker 详情页，点击 **编辑代码**（Edit code）
2. 删除 Quick Editor 中的默认代码
3. 点击右上角 **上传** 按钮（或拖拽文件）
4. 选择 `worker-dist/index.js` 文件
5. 点击 **保存并部署**

---

## 第七步：配置 Worker 绑定

### 操作路径

1. 进入 Worker 详情页
2. 点击 **设置**（Settings）
3. 点击左侧 **绑定**（Bindings）

### 7.1 绑定 D1 数据库

1. 点击 **添加** → **D1 数据库**
2. 填写：
   - **变量名称**：`DB`
   - **D1 数据库**：选择 `infinite-servers-db`
3. 点击 **部署**

### 7.2 绑定 KV 命名空间

1. 点击 **添加** → **KV 命名空间**
2. 填写：
   - **变量名称**：`CONFIG`
   - **KV 命名空间**：选择 `CONFIG`
3. 点击 **部署**

---

## 第八步：设置环境变量

### 操作路径

1. 在 Worker 详情页 → **设置** → **变量和机密**（Variables & Secrets）
2. 在 **变量** 部分，逐个添加以下变量：

| 变量名 | 值 | 类型 |
|--------|-----|------|
| `SSE_ENABLED` | `false` | 文本 |
| `INTERVAL` | `5` | 文本 |
| `HISTORY_DAYS` | `30` | 文本 |
| `HISTORY_INTERVAL` | `5` | 文本 |

### 设置密码（可选）

有两种方式设置 Dashboard 访问密码：

**方式 A：在 KV config.json 中设置（推荐）**

已在第四步中完成，密码写在 `config.json` 的 `password` 字段中。

**方式 B：使用 Worker Secret**

1. 在 **变量和机密** 页面，点击 **加密变量**（Encrypt variable）
2. 填写：
   - **变量名称**：`PASSWORD`
   - **值**：你的密码
3. 点击 **保存**

> **注意**：如果同时设置了 KV 中的密码和 Worker Secret，KV 中的密码优先。

---

## 第九步：配置 Cron Trigger（定时任务）

### 操作路径

1. 在 Worker 详情页 → **设置** → **触发器**（Triggers）
2. 找到 **Cron Triggers** 部分
3. 点击 **添加**
4. 填写 Cron 表达式：`0 0 * * *`
5. 点击 **部署**

> 这将每天 UTC 00:00 自动执行：更新 Worker 出口 IP 归属地、检查服务器到期时间、发送 Telegram 提醒。

---

## 第十步：部署前端到 Pages

### 方式一：通过 GitHub 集成（推荐）

1. 左侧菜单点击 **Compute (Workers)** → **Workers & Pages**
2. 点击 **创建应用程序**
3. 点击 **Pages** 标签
4. 点击 **连接到 Git**
5. 选择 GitHub 仓库
6. 配置构建设置：
   - **项目名称**：`infinite-servers-dashboard`
   - **生产分支**：`main`（或你的主分支）
   - **构建命令**：`npm ci && VITE_ASSET_BASE=/ npm run build`
   - **构建输出目录**：`dist`
   - **根目录**：`/`
7. 添加环境变量：
   - **变量名称**：`VITE_API_BASE`
   - **值**：`https://infinite-servers.your-subdomain.workers.dev/`
8. 点击 **保存并部署**

### 方式二：通过直接上传

适合代码在本地的用户。

#### 10.1 一次性构建

在本地计算机上执行：

```bash
# 在项目根目录
npm ci

# 构建前端（替换为你的 Worker URL）
VITE_API_BASE="https://infinite-servers.your-subdomain.workers.dev/" VITE_ASSET_BASE=/ npm run build
```

#### 10.2 上传到 Pages

1. 在 Dashboard 中，进入 **Workers & Pages** → **创建应用程序**
2. 点击 **Pages** 标签
3. 点击 **上传资产**（Upload assets）
4. 填写项目名称：`infinite-servers-dashboard`
5. 上传 `dist/` 目录中的所有文件
6. 点击 **部署站点**

---

## 第十一步：配置自定义域名（可选）

### Worker 自定义域名

1. 进入 Worker 详情页 → **设置** → **触发器** → **自定义域**
2. 点击 **添加自定义域**
3. 输入域名（如 `status.example.com`）
4. 按提示配置 DNS 记录

### Pages 自定义域名

1. 进入 Pages 项目 → **自定义域**
2. 点击 **设置自定义域**
3. 输入域名并按提示配置

---

## 操作核对清单

完成所有步骤后，逐一确认：

- [ ] D1 数据库 `infinite-servers-db` 已创建
- [ ] D1 中已执行 SQL 迁移（5 张表 + 1 个索引）
- [ ] KV 命名空间 `CONFIG` 已创建
- [ ] KV 中已上传 `config.json`（包含密码）
- [ ] KV 中已上传 `servers.json`（包含服务器列表）
- [ ] Worker `infinite-servers` 已创建并部署
- [ ] Worker 已绑定 D1 数据库（变量名 `DB`）
- [ ] Worker 已绑定 KV 命名空间（变量名 `CONFIG`）
- [ ] Worker 环境变量已设置（`SSE_ENABLED`, `INTERVAL`, `HISTORY_DAYS`, `HISTORY_INTERVAL`）
- [ ] Cron Trigger 已配置（`0 0 * * *`）
- [ ] 前端已部署到 Pages
- [ ] 访问 Worker URL 可正常显示登录页面
- [ ] 使用密码可成功登录

---

## 验证部署

1. **健康检查**：访问 `https://infinite-servers.your-subdomain.workers.dev/`，应显示登录页面
2. **登录测试**：使用 `config.json` 中设置的密码登录
3. **仪表盘**：登录后应显示服务器列表（初始为空，等待 Agent 连接）
4. **API 测试**：
   - `GET /servers` — 返回服务器硬件信息
   - `GET /status` — 返回实时状态
   - `GET /history?server=<name>&hours=24` — 返回历史数据

---

## 常见问题

### Q: Dashboard 中找不到 Quick Editor 部署 TypeScript 代码？

A: Quick Editor 仅支持单文件 JavaScript。对于 TypeScript + npm 项目，必须使用 GitHub 集成或先本地构建再上传。

### Q: KV 配置修改后需要重新部署吗？

A: 不需要。KV 变更立即生效，无需重新部署 Worker。

### Q: D1 执行 SQL 报错？

A: 确保 SQL 语句逐条执行，不要一次性粘贴多条语句。D1 控制台一次只支持执行一条 SQL。

### Q: 前端无法连接到后端 API？

A: 检查：
1. `VITE_API_BASE` 环境变量是否正确设置
2. 前端构建时是否使用了正确的 API URL
3. Worker 是否已部署并正常运行

### Q: Agent 推送返回 403？

A: 检查 Agent 的 token 是否与 KV `servers.json` 中对应服务器的 token 一致。

### Q: 如何更新已部署的 Worker？

A: 
- 如果使用 GitHub 集成：推送代码到仓库，Cloudflare 自动重新构建和部署
- 如果使用直接上传：重新构建后在 Dashboard 上传新的 `index.js` 文件

### Q: 如何更新服务器列表？

A: 进入 KV → `CONFIG` 命名空间 → 编辑 `servers.json` 条目。修改后立即生效。

---

## 部署流程对比

| 步骤 | CLI 方式 | Dashboard 方式 |
|------|----------|----------------|
| 创建 D1 | `wrangler d1 create` | Dashboard → D1 → 创建数据库 |
| 初始化 D1 | `wrangler d1 execute --file` | Dashboard → D1 → 控制台执行 SQL |
| 创建 KV | `wrangler kv namespace create` | Dashboard → KV → 创建命名空间 |
| 上传 KV 数据 | `wrangler kv key put` | Dashboard → KV → 添加条目 |
| 部署 Worker | `wrangler deploy` | GitHub 集成或直接上传 |
| 配置绑定 | 写在 `wrangler.toml` | Dashboard → Worker → 设置 → 绑定 |
| 设置变量 | 写在 `wrangler.toml` | Dashboard → Worker → 设置 → 变量 |
| 设置密码 | `wrangler secret put` | Dashboard → Worker → 加密变量 |
| 配置 Cron | 写在 `wrangler.toml` | Dashboard → Worker → 设置 → 触发器 |
| 部署前端 | `wrangler pages deploy` | GitHub 集成或直接上传 |
