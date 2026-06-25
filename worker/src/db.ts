import { Env, ServerConfig, ServersFile, HistoryRow } from "./types";

function stripSecrets(data: Record<string, unknown>): Record<string, unknown> {
  const { token: _, name: __, ...rest } = data;
  return rest;
}

function getIntervalSeconds(env: Env): number {
  return Math.max(1, parseInt(env.HISTORY_INTERVAL ?? "5", 10)) * 60;
}

function getHistoryDays(env: Env): number {
  return Math.max(1, parseInt(env.HISTORY_DAYS ?? "30", 10));
}

async function getServersConfig(env: Env): Promise<ServersFile> {
  const raw = await env.CONFIG.get("servers.json", "json");
  return (raw as ServersFile) ?? { servers: {} };
}

async function batchFirstSeen(
  env: Env,
  names: string[],
): Promise<Record<string, string | null>> {
  if (names.length === 0) return {};
  const placeholders = names.map(() => "?").join(",");
  const { results } = await env.DB.prepare(
    `SELECT server, MIN(ts) AS first FROM history WHERE server IN (${placeholders}) GROUP BY server`,
  )
    .bind(...names)
    .all<{ server: string; first: number | null }>();
  const map: Record<string, string | null> = {};
  for (const row of results) {
    map[row.server] = row.first
      ? new Date(row.first * 1000).toISOString().split("T")[0]
      : null;
  }
  return map;
}

async function batchDbFetch(
  env: Env,
  table: string,
  names: string[],
): Promise<Record<string, { data: string }>> {
  if (names.length === 0) return {};
  const placeholders = names.map(() => "?").join(",");
  const { results } = await env.DB.prepare(
    `SELECT server, data FROM ${table} WHERE server IN (${placeholders})`,
  )
    .bind(...names)
    .all<{ server: string; data: string }>();
  const map: Record<string, { data: string }> = {};
  for (const row of results) {
    map[row.server] = row;
  }
  return map;
}

function buildServerEntry(
  data: Record<string, unknown>,
  name: string,
  cfg: ServerConfig,
  firstSeen: string | null | undefined,
): Record<string, unknown> {
  const entry: Record<string, unknown> = { ...data };
  if (firstSeen) entry.first_seen = firstSeen;
  for (const [k, v] of Object.entries(cfg)) {
    if (k !== "url" && k !== "token") entry[k] = v;
  }
  return stripSecrets(entry);
}

export async function getServerInfo(
  env: Env,
): Promise<Record<string, Record<string, unknown>>> {
  const { servers } = await getServersConfig(env);
  const info: Record<string, Record<string, unknown>> = {};

  const names = Object.keys(servers).filter((n) => servers[n].token);

  const firstSeenMap = await batchFirstSeen(env, names);

  const fetchResults = await Promise.allSettled(
    names.map(async (name) => {
      const cfg = servers[name];
      if (!cfg.url) return null;
      const resp = await fetch(`${cfg.url}?k=s`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!resp.ok) return null;
      return { name, data: (await resp.json()) as Record<string, unknown> };
    }),
  );

  const fetchedNames = new Set<string>();
  for (const result of fetchResults) {
    if (result.status !== "fulfilled" || !result.value) continue;
    const { name, data } = result.value;
    fetchedNames.add(name);
    const ts = Math.floor(Date.now() / 1000);
    await env.DB.prepare(
      "INSERT OR REPLACE INTO server_info (server, data, updated) VALUES (?, ?, ?)"
    )
      .bind(name, JSON.stringify(stripSecrets(data)), ts)
      .run();
    info[name] = buildServerEntry(data, name, servers[name], firstSeenMap[name]);
  }

  const dbNames = names.filter((n) => !fetchedNames.has(n));
  const dbRows = await batchDbFetch(env, "server_info", dbNames);

  for (const name of dbNames) {
    const row = dbRows[name];
    if (row) {
      const parsed = JSON.parse(row.data);
      info[name] = buildServerEntry(parsed, name, servers[name], firstSeenMap[name]);
    } else {
      // Server configured but no data yet — include with config-only info
      info[name] = buildServerEntry({}, name, servers[name], firstSeenMap[name]);
    }
  }

  return info;
}

export async function getServerStatus(
  env: Env,
): Promise<Record<string, Record<string, unknown>>> {
  const { servers } = await getServersConfig(env);
  const status: Record<string, Record<string, unknown>> = {};

  const names = Object.keys(servers).filter((n) => servers[n].token);

  const fetchResults = await Promise.allSettled(
    names.map(async (name) => {
      const cfg = servers[name];
      if (!cfg.url) return null;
      const resp = await fetch(`${cfg.url}?k=r`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!resp.ok) return null;
      return { name, data: (await resp.json()) as Record<string, unknown> };
    }),
  );

  const fetchedNames = new Set<string>();
  const inserts: ReturnType<typeof env.DB.prepare>[] = [];
  for (const result of fetchResults) {
    if (result.status !== "fulfilled" || !result.value) continue;
    const { name, data } = result.value;
    fetchedNames.add(name);
    status[name] = stripSecrets(data);
    const ts = Math.floor(Date.now() / 1000);
    inserts.push(
      env.DB.prepare(
        "INSERT OR REPLACE INTO server_status (server, data, updated) VALUES (?, ?, ?)"
      ).bind(name, JSON.stringify(stripSecrets(data)), ts),
    );
  }
  if (inserts.length > 0) {
    await env.DB.batch(inserts);
  }

  const dbNames = names.filter((n) => !fetchedNames.has(n));
  const dbRows = await batchDbFetch(env, "server_status", dbNames);
  for (const name of dbNames) {
    const row = dbRows[name];
    if (row) {
      status[name] = stripSecrets(JSON.parse(row.data));
    } else {
      // Server configured but no status data yet — include empty entry
      status[name] = {};
    }
  }

  return status;
}

export async function saveServerInfo(
  env: Env,
  name: string,
  info: Record<string, unknown>,
): Promise<void> {
  const ts = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    "INSERT OR REPLACE INTO server_info (server, data, updated) VALUES (?, ?, ?)"
  )
    .bind(name, JSON.stringify(stripSecrets(info)), ts)
    .run();
}

export async function saveServerStatus(
  env: Env,
  name: string,
  status: Record<string, unknown>,
): Promise<void> {
  const interval = getIntervalSeconds(env);
  const time = parseInt(String(status.time ?? 0), 10);
  const ts = Math.floor(time / interval) * interval;

  const loadavg = (status.loadavg as number[]) ?? [];
  const meminfo = (status.meminfo as Record<string, unknown>) ?? {};
  const diskinfo = (status.diskinfo as Record<string, unknown>) ?? {};
  const netdev = (status.netdev as Record<string, unknown>) ?? {};

  const load1 = parseFloat(String(loadavg[0] ?? 0));
  const memPct = parseFloat(String(meminfo.memUsedPercent ?? 0));
  const diskPct = parseFloat(String(diskinfo.diskPercent ?? 0));
  const netRx = parseInt(String(netdev.rx ?? 0), 10);
  const netTx = parseInt(String(netdev.tx ?? 0), 10);
  const cpuPct = status.cpu_percent != null ? parseFloat(String(status.cpu_percent)) : null;
  const swapPct = parseFloat(String(meminfo.swapPercent ?? 0));

  await env.DB.batch([
    env.DB.prepare(
      "INSERT OR IGNORE INTO history (server, ts, load1, mem_pct, disk_pct, net_rx, net_tx, cpu_pct, swap_pct) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(name, ts, load1, memPct, diskPct, netRx, netTx, cpuPct, swapPct),
    env.DB.prepare(
      "INSERT OR REPLACE INTO server_status (server, data, updated) VALUES (?, ?, ?)"
    ).bind(name, JSON.stringify(stripSecrets(status)), Math.floor(Date.now() / 1000)),
  ]);

  if (Math.random() < 0.01) {
    const days = getHistoryDays(env);
    const expire = Math.floor(Date.now() / 1000) - days * 86400;
    await env.DB.prepare("DELETE FROM history WHERE ts < ?").bind(expire).run();
  }
}

export async function getServerHistory(
  env: Env,
  name: string,
  hours: number,
): Promise<HistoryRow[]> {
  const since = Math.floor(Date.now() / 1000) - hours * 3600;
  const { results } = await env.DB.prepare(
    "SELECT ts, load1, mem_pct, disk_pct, net_rx, net_tx, cpu_pct, swap_pct FROM history WHERE server = ? AND ts >= ? ORDER BY ts ASC"
  )
    .bind(name, since)
    .all<HistoryRow>();
  return results;
}

export async function getServerIncidents(
  env: Env,
  name: string,
  days: number,
): Promise<
  { kind: string; startTs: number; endTs: number | null; downMin: number }[]
> {
  const interval = getIntervalSeconds(env);
  const since = Math.floor(Date.now() / 1000) - days * 86400;
  const gapThreshold = interval * 3;

  const { results } = await env.DB.prepare(
    "SELECT ts FROM history WHERE server = ? AND ts >= ? ORDER BY ts ASC"
  )
    .bind(name, since)
    .all<{ ts: number }>();

  if (results.length < 2) return [];

  const tsList = results.map((r) => r.ts);
  const incidents: {
    kind: string;
    startTs: number;
    endTs: number | null;
    downMin: number;
  }[] = [];
  let gapStart: number | null = null;

  for (let i = 1; i < tsList.length; i++) {
    const gap = tsList[i] - tsList[i - 1];
    if (gap > gapThreshold) {
      if (gapStart === null) gapStart = tsList[i - 1];
    } else {
      if (gapStart !== null) {
        const downMin = Math.floor((tsList[i] - gapStart) / 60);
        incidents.push({ kind: "outage", startTs: gapStart, endTs: tsList[i], downMin });
        gapStart = null;
      }
    }
  }

  if (gapStart !== null) {
    const now = Math.floor(Date.now() / 1000);
    const downMin = Math.floor((now - gapStart) / 60);
    incidents.push({ kind: "outage", startTs: gapStart, endTs: null, downMin });
  }

  return incidents.reverse().slice(0, 10);
}

export async function getServerAvailability(
  env: Env,
  name: string,
  days: number,
): Promise<{
  overall: number;
  days: { date: number; pct: number | null; status: string }[];
  incidents: { kind: string; at: number; downMin: number }[];
}> {
  const interval = getIntervalSeconds(env);
  const now = Math.floor(Date.now() / 1000);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayStartSec = Math.floor(todayStart.getTime() / 1000);
  const winStart = todayStartSec - (days - 1) * 86400;

  const firstSeenRow = await env.DB.prepare(
    "SELECT MIN(ts) AS first FROM history WHERE server = ?"
  )
    .bind(name)
    .first<{ first: number | null }>();
  const firstSeen = firstSeenRow?.first ?? null;

  const { results: countResults } = await env.DB.prepare(
    "SELECT CAST((ts - ?) / 86400 AS INTEGER) AS bucket, COUNT(*) AS c FROM history WHERE server = ? AND ts >= ? GROUP BY bucket"
  )
    .bind(winStart, name, winStart)
    .all<{ bucket: number; c: number }>();

  const counts: Record<number, number> = {};
  for (const row of countResults) {
    counts[row.bucket] = row.c;
  }

  const dayList: { date: number; pct: number | null; status: string }[] = [];
  const incidents: { kind: string; at: number; downMin: number }[] = [];
  let sumPct = 0;
  let counted = 0;

  for (let i = 0; i < days; i++) {
    const start = winStart + i * 86400;
    const end = start + 86400;
    const expected = Math.max(1, Math.floor((Math.min(end, now) - start) / interval));
    const present = counts[i] ?? 0;
    const pct = Math.min(100, (present / expected) * 100);

    if (firstSeen === null || end <= firstSeen) {
      dayList.push({ date: start, pct: null, status: "nodata" });
      continue;
    }

    let status: string;
    if (pct >= 99) status = "up";
    else if (pct >= 90) status = "partial";
    else status = "down";

    const pctRound = Math.round(pct * 10) / 10;
    dayList.push({ date: start, pct: pctRound, status });
    sumPct += pctRound;
    counted++;

    if (status !== "up") {
      const downMin = Math.floor(((100 - pct) / 100) * 24 * 60);
      incidents.push({
        kind: status === "down" ? "outage" : "degraded",
        at: start,
        downMin,
      });
    }
  }

  const overall = counted > 0 ? Math.round((sumPct / counted) * 1000) / 1000 : 0;

  return {
    overall,
    days: dayList,
    incidents: incidents.reverse().slice(0, 5),
  };
}

export async function saveServerExpiry(
  env: Env,
  name: string,
  expiry: string | null,
): Promise<boolean> {
  const data = (await env.CONFIG.get("servers.json", "json")) as ServersFile | null;
  if (!data?.servers?.[name]) return false;
  if (!expiry) {
    delete data.servers[name].expiry;
  } else {
    data.servers[name].expiry = expiry;
  }
  await env.CONFIG.put("servers.json", JSON.stringify(data, null, 2));
  return true;
}

export async function saveServerPurchaseDate(
  env: Env,
  name: string,
  purchaseDate: string | null,
): Promise<boolean> {
  const data = (await env.CONFIG.get("servers.json", "json")) as ServersFile | null;
  if (!data?.servers?.[name]) return false;
  if (!purchaseDate) {
    delete data.servers[name].purchase_date;
  } else {
    data.servers[name].purchase_date = purchaseDate;
  }
  await env.CONFIG.put("servers.json", JSON.stringify(data, null, 2));
  return true;
}
