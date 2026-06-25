/* ============================================================
   Data layer — talks to the PHP backend and reshapes its
   payloads into the structure the UI components expect.

   Backend endpoints (see api/index.php):
     GET ./servers                     → per-server hardware info
     GET ./status  (or SSE stream)     → per-server live status
     GET ./history?server=&hours=      → time series rows
     GET ./availability?server=&days=  → daily uptime + incidents
   ============================================================ */

export const API_BASE = import.meta.env.VITE_API_BASE || "./";
const STALE_MS = 120 * 1000; // a node is "offline" if its last sample is older than this
const DEGRADED_AT = 90; // % usage on any core metric flips an online node to "degraded"

/* ---------- runtime config (injected by PHP into #is-config) ---------- */
export function getConfig() {
  const def = { sse: false, interval: 5 };
  try {
    const el = document.getElementById("is-config");
    if (!el) return def;
    const cfg = JSON.parse(el.textContent);
    return { sse: !!cfg.sse, interval: Math.max(1, parseInt(cfg.interval) || 5) };
  } catch (e) {
    return def;
  }
}

/* ---------- formatting helpers ---------- */
export function fmtRate(bytesPerSec) {
  const b = Math.max(0, bytesPerSec || 0);
  if (b >= 1073741824) return (b / 1073741824).toFixed(1) + " GB/s";
  if (b >= 1048576) return (b / 1048576).toFixed(1) + " MB/s";
  if (b >= 1024) return Math.round(b / 1024) + " KB/s";
  return Math.round(b) + " B/s";
}

const COUNTRY_NAMES = {
  US: "United States", CN: "China", HK: "Hong Kong", SG: "Singapore",
  JP: "Japan", KR: "South Korea", DE: "Germany", FR: "France",
  GB: "United Kingdom", UK: "United Kingdom", CA: "Canada", AU: "Australia",
  NL: "Netherlands", IN: "India", RU: "Russia", TW: "Taiwan",
};

export function flagEmoji(code) {
  if (!code || code.length !== 2) return "🏳️";
  const cc = code.toUpperCase() === "UK" ? "GB" : code.toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return "🏳️";
  return String.fromCodePoint(...[...cc].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

function regionLabel(info) {
  if (info.location) return info.location;
  const code = (info.region || "").toUpperCase();
  return COUNTRY_NAMES[code] || code || "—";
}

function seenText(time, now) {
  if (!time) return "never";
  const s = Math.max(0, Math.floor(now / 1000 - time));
  if (s < 8) return "just now";
  if (s < 60) return s + "s ago";
  const m = Math.floor(s / 60);
  if (m < 60) return m + "m ago";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "h " + (m % 60) + "m ago";
  return Math.floor(h / 24) + "d ago";
}

const clampPct = (v) => Math.max(0, Math.min(100, v));

/* ---------- CPU model cleanup ----------
   Raw /proc/cpuinfo strings are noisy, e.g.
   "Intel(R) Xeon(R) CPU E5-2680 v4 @ 2.40GHz" → "Intel Xeon E5-2680 v4",
   "AMD EPYC 7763 64-Core Processor"           → "AMD EPYC 7763". */
function cleanCpuModel(cpuinfo) {
  const m = cpuinfo && cpuinfo.model;
  if (!m || typeof m !== "string") return "";
  return m
    .replace(/\(R\)|\(TM\)|\(tm\)|®|™/g, "")
    .replace(/@.*$/, "")          // drop trailing clock speed
    .replace(/\b\d+-Core\b/gi, "")
    .replace(/\b(CPU|Processor)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/* ---------- IP masking ----------
   mask is a 4-part dot-separated string; '*' in a position hides that octet.
   e.g. applyIpMask("1.2.3.4", "x.x.*.*") → "1.2.*.*" */
function applyIpMask(ip, mask) {
  if (!ip) return null;
  if (!mask) return ip;
  const parts = ip.split(".");
  const mparts = mask.split(".");
  if (parts.length !== 4 || mparts.length !== 4) return ip;
  return parts.map((p, i) => mparts[i] === "*" ? "*" : p).join(".");
}

/* ---------- GPU reshape (per-model) ---------- */
function gpuModels(gpuinfo) {
  if (!gpuinfo) return null;
  if (Array.isArray(gpuinfo.models) && gpuinfo.models.length) {
    return gpuinfo.models
      .map((m) => ({ model: m.model || "GPU", count: +m.count || 0, used: +m.used || 0 }))
      .filter((m) => m.count > 0);
  }
  // fall back to a single aggregate entry if the collector only reports totals
  const total = +gpuinfo.gpuTotal || 0;
  if (total > 0) return [{ model: "GPU", count: total, used: +gpuinfo.gpuUsed || 0 }];
  return null;
}

/* ---------- merge info + status into the UI server shape ---------- */
export function buildServers(info, statusMap, prevNet, now = Date.now()) {
  const out = [];
  const names = new Set([...Object.keys(info || {}), ...Object.keys(statusMap || {})]);

  for (const name of names) {
    const i = (info && info[name]) || {};
    const s = (statusMap && statusMap[name]) || {};
    const cores = i.cpuinfo && i.cpuinfo.num ? +i.cpuinfo.num : 1;

    const time = s.time ? +s.time : 0;
    const online = time > 0 && now / 1000 - time < STALE_MS / 1000;

    const load = s.loadavg ? clampPct((parseFloat(s.loadavg[0]) / cores) * 100) : 0;
    const cpu = s.cpu_percent != null ? clampPct(+s.cpu_percent) : load;
    const mem = s.meminfo ? clampPct(+s.meminfo.memUsedPercent || 0) : 0;
    const swap = s.meminfo ? clampPct(+s.meminfo.swapPercent || 0) : 0;
    const dsk = s.diskinfo ? clampPct(+s.diskinfo.diskPercent || 0) : 0;

    let status = "offline";
    if (online) status = (mem >= DEGRADED_AT || dsk >= DEGRADED_AT || load >= DEGRADED_AT) ? "warning" : "online";

    // network rate from the delta between successive cumulative counters
    let up = 0, down = 0;
    const nd = s.netdev;
    const prev = prevNet[name];
    if (nd && prev && nd.ts > prev.ts) {
      const dt = (nd.ts - prev.ts) / 1000;
      down = Math.max(0, (nd.rx - prev.rx) / dt);
      up = Math.max(0, (nd.tx - prev.tx) / dt);
    }
    if (nd) prevNet[name] = { ts: nd.ts, rx: +nd.rx, tx: +nd.tx };

    out.push({
      name,
      flag: flagEmoji(i.region),
      ip: s.ip || null,
      region: regionLabel(i),
      regionCode: (i.region || "").toUpperCase(),
      status,
      online,
      seen: seenText(time, now),
      time,
      cores,
      cpuModel: cleanCpuModel(i.cpuinfo),
      ram: (s.meminfo && s.meminfo.memTotal) || "—",
      disk: (s.diskinfo && s.diskinfo.diskTotal) || "—",
      os: i.distname || "Unknown",
      uptimeSec: online && s.uptime != null ? +s.uptime : null,
      load: Math.round(load),
      cpu: Math.round(cpu),
      mem: Math.round(mem),
      swap: Math.round(swap),
      dsk: Math.round(dsk),
      netUp: online ? fmtRate(up) : "0 B/s",
      netDown: online ? fmtRate(down) : "0 B/s",
      tags: Array.isArray(i.tags) ? i.tags : [],
      ip: applyIpMask(s.ip || null, i.ip_mask || null),
      gpu: online ? gpuModels(s.gpuinfo) : gpuModels(s.gpuinfo) && gpuModels(s.gpuinfo).map((g) => ({ ...g, used: 0 })),
      expiry: i.expiry || null,
      purchase_date: i.purchase_date || null,
    });
  }

  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

/* ---------- auth token management ---------- */
const TOKEN_KEY = "is_auth_token";

export function getAuthToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAuthToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearAuthToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export function isLoggedIn() {
  return !!getAuthToken();
}

export async function login(password) {
  const body = new URLSearchParams({ password });
  const r = await fetch(API_BASE + "login", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await r.json();
  if (data.token) {
    setAuthToken(data.token);
    return { ok: true };
  }
  return { ok: false, error: data.error };
}

export function logout() {
  clearAuthToken();
}

/* ---------- fetchers ---------- */
function getAuthHeaders() {
  const token = getAuthToken();
  const headers = { Accept: "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

async function getJSON(path) {
  const r = await fetch(API_BASE + path, { headers: getAuthHeaders() });
  if (r.status === 401) {
    clearAuthToken();
    throw new Error("unauthorized");
  }
  if (!r.ok) throw new Error(path + " → " + r.status);
  return r.json();
}

export const fetchInfo = () => getJSON("servers");
export const fetchStatus = () => getJSON("status?json=1");

export async function setExpiry(name, expiry) {
  const body = new URLSearchParams({ name, expiry });
  const r = await fetch(API_BASE + "set-expiry", {
    method: "POST",
    headers: { ...getAuthHeaders(), "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!r.ok) throw new Error("set-expiry → " + r.status);
  return r.json();
}

export async function setPurchaseDate(name, purchaseDate) {
  const body = new URLSearchParams({ name, purchase_date: purchaseDate });
  const r = await fetch(API_BASE + "set-purchase-date", {
    method: "POST",
    headers: { ...getAuthHeaders(), "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!r.ok) throw new Error("set-purchase-date → " + r.status);
  return r.json();
}

/**
 * Subscribe to live status. Uses SSE when the backend advertises it,
 * otherwise polls. Calls onStatus(statusMap) on every update.
 * Returns an unsubscribe function.
 *
 * Includes exponential backoff on consecutive failures and a circuit
 * breaker that stops polling after MAX_FAILURES to avoid flooding the
 * console/network when the Worker is unreachable.
 */
const POLL_BASE_MS = 5000;
const POLL_MAX_MS = 60000;
const MAX_FAILURES = 10;

export function subscribeStatus(onStatus, onError) {
  let stopped = false;
  let failures = 0;
  let timer = null;

  const scheduleNext = (delayMs) => {
    if (stopped) return;
    timer = setTimeout(tick, delayMs);
  };

  const tick = async () => {
    if (stopped) return;
    try {
      const st = await fetchStatus();
      if (stopped) return;
      failures = 0;
      onStatus(st);
      scheduleNext(POLL_BASE_MS);
    } catch (e) {
      if (stopped) return;
      failures++;
      onError && onError(e);
      if (failures >= MAX_FAILURES) {
        onError && onError(new Error("connection_lost"));
        return;
      }
      const delay = Math.min(POLL_BASE_MS * Math.pow(2, failures - 1), POLL_MAX_MS);
      scheduleNext(delay);
    }
  };

  tick();
  return () => {
    stopped = true;
    if (timer) { clearTimeout(timer); timer = null; }
  };
}

/* ---------- detail: history time series ---------- */
const RANGE_HOURS = { "1H": 1, "24H": 24, "7D": 168, "30D": 720 };

function timeLabel(ms, range) {
  const d = new Date(ms);
  const p2 = (x) => String(x).padStart(2, "0");
  if (range === "1H" || range === "24H") return p2(d.getHours()) + ":" + p2(d.getMinutes());
  const mo = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getMonth()];
  return mo + " " + d.getDate();
}

export async function fetchHistory(name, range) {
  const hours = RANGE_HOURS[range] || 24;
  const rows = await getJSON(`history?server=${encodeURIComponent(name)}&hours=${hours}`);
  return Array.isArray(rows) ? rows : [];
}

/** Convert raw history rows into a metric series: [{ t, label, v }]. */
export function toSeries(rows, metric, range, cores = 1) {
  const pts = [];
  const isNet = metric === "netUp" || metric === "netDown";
  const netKey = metric === "netUp" ? "net_tx" : "net_rx";
  // running baseline for the cumulative byte counter (net rates only)
  let base = null, baseTs = 0;
  for (let k = 0; k < rows.length; k++) {
    const row = rows[k];
    const ms = row.ts * 1000;
    let v = 0;
    if (isNet) {
      const cur = +row[netKey];
      if (base === null) {
        base = cur; baseTs = row.ts;          // first sample: no rate yet
      } else if (cur >= base) {
        const dt = row.ts - baseTs;
        v = dt > 0 ? (cur - base) / dt / 1048576 : 0; // MB/s
        base = cur; baseTs = row.ts;
      } else {
        // counter went backwards. A genuine reset (reboot) stays low, so the
        // next reading is also below the baseline -> re-baseline. A one-off bad
        // sample snaps back up next reading -> ignore it so it can't produce a
        // huge fake spike on recovery.
        const next = k + 1 < rows.length ? +rows[k + 1][netKey] : null;
        if (next !== null && next < base) { base = cur; baseTs = row.ts; }
      }
    } else {
      switch (metric) {
        case "cpu":  v = row.cpu_pct  != null ? +row.cpu_pct  : 0; break;
        case "mem":  v = +row.mem_pct  || 0; break;
        case "swap": v = row.swap_pct != null ? +row.swap_pct : 0; break;
        case "disk": v = +row.disk_pct || 0; break;
        case "load": v = clampPct((+row.load1 || 0) / cores * 100); break;
        default: v = 0;
      }
    }
    pts.push({ t: ms, label: timeLabel(ms, range), v: Math.round(v * 100) / 100 });
  }
  return pts;
}

export async function fetchAvailability(name, days = 30) {
  try {
    const a = await getJSON(`availability?server=${encodeURIComponent(name)}&days=${days}`);
    return {
      overall: +a.overall || 0,
      days: (a.days || []).map((d) => ({ date: new Date(d.date * 1000), pct: d.pct != null ? +d.pct : null, status: d.status })),
      incidents: (a.incidents || []).map((e) => ({ kind: e.kind, downMin: +e.downMin || 0, startTs: +e.startTs || 0, endTs: e.endTs != null ? +e.endTs : null })),
    };
  } catch (e) {
    return { overall: 0, days: [], incidents: [] };
  }
}
