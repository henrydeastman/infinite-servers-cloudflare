import React, { useState, useMemo, useEffect } from "react";
import { createRoot } from "react-dom/client";
import "./fonts.js";
import "./styles/dashboard.css";
import logo from "./assets/logo.png";
import { API_BASE, fetchInfo, subscribeStatus, buildServers, isLoggedIn, login, logout } from "./api.js";
import { I18nProvider, useI18n } from "./i18n.jsx";
import { AppBar, SiteFooter } from "./chrome.jsx";

/* ---------- tiny inline icons (simple shapes only) ---------- */
const Icon = {
  cpu: (p) => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" {...p}>
      <rect x="7" y="7" width="10" height="10" rx="1.5" />
      <path d="M9 2v3M12 2v3M15 2v3M9 19v3M12 19v3M15 19v3M2 9h3M2 12h3M2 15h3M19 9h3M19 12h3M19 15h3" />
    </svg>
  ),
  ram: (p) => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" {...p}>
      <rect x="2" y="7" width="20" height="10" rx="1.5" />
      <path d="M6 17v2M10 17v2M14 17v2M18 17v2M7 10v4M12 10v4M17 10v4" />
    </svg>
  ),
  disk: (p) => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" {...p}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  ),
  gpu: (p) => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" {...p}>
      <rect x="2" y="7" width="20" height="11" rx="2" />
      <circle cx="8" cy="12.5" r="2.2" />
      <circle cx="15" cy="12.5" r="2.2" />
      <path d="M19 9.5v6" />
    </svg>
  ),
  up: (p) => (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" {...p}>
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  ),
  down: (p) => (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" {...p}>
      <path d="M12 5v14M5 12l7 7 7-7" />
    </svg>
  ),
  tag: (p) => (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M3 7.5V4a1 1 0 0 1 1-1h3.5a2 2 0 0 1 1.4.6l10 10a2 2 0 0 1 0 2.8l-4.1 4.1a2 2 0 0 1-2.8 0l-10-10A2 2 0 0 1 3 9.3z" />
      <circle cx="7" cy="7" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  ),
  close: (p) => (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...p}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  ),
};

/* ---------- helpers ---------- */
const STATUS = {
  online:  { color: "var(--ok)" },
  warning: { color: "var(--warn)" },
  offline: { color: "var(--down)" },
};

const detailHref = (name) => `detail?id=${encodeURIComponent(name)}`;

// trim vendor/marketing words so a model fits in a card chip, e.g.
// "NVIDIA GeForce RTX 4090" -> "RTX 4090"
function shortGpu(m) {
  return (m || "GPU").replace(/\bNVIDIA\b/gi, "").replace(/\bGeForce\b/gi, "").replace(/\s+/g, " ").trim() || "GPU";
}

// aggregate server.gpu ([{model, count, used}]) into a single card summary
function gpuSummary(gpu) {
  if (!gpu || !gpu.length) return null;
  const count = gpu.reduce((a, g) => a + (g.count || 0), 0);
  const used = gpu.reduce((a, g) => a + (g.used || 0), 0);
  if (count <= 0) return null;
  const model = gpu.length === 1 ? shortGpu(gpu[0].model) : "GPUs";
  return { count, used, model, pct: Math.round((used / count) * 100) };
}

// expiry label: returns { text, color } or null if no expiry set
function expiryInfo(expiry, t) {
  if (!expiry) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const exp = new Date(expiry + "T00:00:00");
  const diffMs = exp.getTime() - now.getTime();
  const diffDays = Math.round(diffMs / 86400000);
  if (diffDays > 30) return { text: t("expiry.daysLeft", { n: diffDays }), color: "var(--ok)" };
  if (diffDays > 7)  return { text: t("expiry.daysLeft", { n: diffDays }), color: "#e2b714" };
  if (diffDays > 1)  return { text: t("expiry.daysLeft", { n: diffDays }), color: "#f0883e" };
  if (diffDays === 1) return { text: t("expiry.daysLeft", { n: 1 }), color: "#f0883e" };
  if (diffDays === 0) return { text: t("expiry.today"), color: "var(--down)" };
  return { text: t("expiry.expired", { n: Math.abs(diffDays) }), color: "var(--down)" };
}

function Bar({ value, offline }) {
  const crit = value >= 85;
  return (
    <div className="bar">
      <span
        className={"bar-fill" + (crit ? " crit" : "")}
        style={{ width: (offline ? 0 : value) + "%" }}
      />
    </div>
  );
}

function Metric({ label, value, offline }) {
  return (
    <div className="metric">
      <span className="metric-label">{label}</span>
      <Bar value={value} offline={offline} />
      <span className="metric-val">{offline ? "—" : value + "%"}</span>
    </div>
  );
}

function Spec({ icon, children }) {
  return (
    <span className="spec">
      <span className="spec-ico">{icon}</span>
      {children}
    </span>
  );
}

function ServerCard({ s, idx }) {
  const { t, relTime, fmtUptime } = useI18n();
  const st = STATUS[s.status];
  const offline = s.status === "offline";
  const gpu = gpuSummary(s.gpu);
  const exp = expiryInfo(s.expiry, t);
  return (
    <a className={"card anim-rise" + (offline ? " is-offline" : "")} style={{ animationDelay: Math.min(idx || 0, 16) * 28 + "ms" }} href={detailHref(s.name)}>
      <header className="card-top">
        <span className="status">
          <span className="dot" style={{ background: st.color }}>
            {s.status === "online" && <span className="ping" style={{ background: st.color }} />}
          </span>
          <span className="status-label" style={{ color: st.color }}>{t("status." + s.status)}</span>
        </span>
        {exp && <span className="expiry-label" style={{ color: exp.color }}>{exp.text}</span>}
        <span className="seen">{relTime(s.time)}</span>
      </header>

      <div className="card-id">
        <span className="flag">{s.flag}</span>
        <span className="name">{s.name}</span>
        <span className="region">{s.region}</span>
        {s.ip && <span className="ip">{s.ip}</span>}
      </div>

      <div className="specs">
        <Spec icon={<Icon.cpu />}>{s.cores}<i>{t(s.cores > 1 ? "spec.cores" : "spec.core")}</i></Spec>
        <Spec icon={<Icon.ram />}>{s.ram}<i>{t("spec.ram")}</i></Spec>
        <Spec icon={<Icon.disk />}>{s.disk}<i>{t("spec.disk")}</i></Spec>
      </div>

      <div className="card-meta">
        <span>{s.os}</span>
        <span className="dotsep">•</span>
        <span>{t("card.up", { v: fmtUptime(s.uptimeSec) })}</span>
      </div>

      {s.tags && s.tags.length > 0 && (
        <div className="card-tags">
          {s.tags.map((t) => <span className="card-tag" key={t}>{t}</span>)}
        </div>
      )}

      <div className="metrics">
        <Metric label={t("metric.load")} value={s.load} offline={offline} />
        <Metric label={t("metric.mem")}  value={s.mem}  offline={offline} />
        <Metric label={t("metric.swap")} value={s.swap} offline={offline} />
        <Metric label={t("metric.disk")} value={s.dsk}  offline={offline} />
        {gpu && <Metric label={t("metric.gpu")} value={gpu.pct} offline={offline} />}
      </div>

      <footer className="card-net">
        <span className={"net" + (offline ? " off" : " up")}><Icon.up />{s.netUp}</span>
        <span className={"net" + (offline ? " off" : " down")}><Icon.down />{s.netDown}</span>
      </footer>
    </a>
  );
}

/* ---------- compact horizontal row card ---------- */
function RowMetric({ label, value, offline, className }) {
  const crit = value >= 85;
  return (
    <div className={"rc-col" + (className ? " " + className : "")}>
      <span className="rc-label">{label}</span>
      <span className="rc-val">{offline ? "—" : value + "%"}</span>
      <span className="rc-bar">
        <i className={"rc-fill" + (crit ? " crit" : "")} style={{ width: (offline ? 0 : value) + "%" }} />
      </span>
    </div>
  );
}

function RowNet({ label, value, offline }) {
  return (
    <div className="rc-col rc-col-net">
      <span className="rc-label">{label}</span>
      <span className="rc-val">{offline ? "—" : value}</span>
    </div>
  );
}

function RowCard({ s, idx, showGpu }) {
  const { t } = useI18n();
  const offline = s.status === "offline";
  const st = STATUS[s.status];
  const gpu = gpuSummary(s.gpu);
  const exp = expiryInfo(s.expiry, t);
  return (
    <a className={"rowcard anim-rise" + (offline ? " is-offline" : "")} style={{ animationDelay: Math.min(idx || 0, 16) * 28 + "ms" }} href={detailHref(s.name)} title={`${s.name} · ${s.region} · ${s.os}`}>
      <div className="rc-ident">
        <span className="dot" style={{ background: st.color }}>
          {s.status === "online" && <span className="ping" style={{ background: st.color }} />}
        </span>
        <span className="flag">{s.flag}</span>
        <span className="rc-name">{s.name}</span>
        {exp && <span className="expiry-badge" style={{ color: exp.color, borderColor: exp.color }}>{exp.text}</span>}
      </div>
      <div className="rc-usage">
        <RowMetric label={t("metric.cpu")} value={s.cpu} offline={offline} />
        <RowMetric label={t("metric.mem")} value={s.mem} offline={offline} />
        <RowMetric label={t("metric.stg")} value={s.dsk} offline={offline} />
        {/* keep a GPU column on every row (empty placeholder when absent) so all
            cards share identical column widths once any server has a GPU */}
        {showGpu && (gpu
          ? <RowMetric label={t("metric.gpu")} value={gpu.pct} offline={offline} className="rc-gpu" />
          : <span className="rc-col rc-gpu" aria-hidden="true" />)}
      </div>
      <div className="rc-net">
        <RowNet label={t("net.upload")} value={s.netUp} offline={offline} />
        <RowNet label={t("net.download")} value={s.netDown} offline={offline} />
      </div>
    </a>
  );
}

function Summary({ servers }) {
  const online = servers.filter((s) => s.status === "online").length;
  const warn = servers.filter((s) => s.status === "warning").length;
  const off = servers.filter((s) => s.status === "offline").length;
  const items = [
    { k: "Nodes", v: servers.length, sub: "monitored" },
    { k: "Online", v: online, sub: "healthy", tone: "ok" },
    { k: "Degraded", v: warn, sub: "high usage", tone: "warn" },
    { k: "Offline", v: off, sub: "unreachable", tone: "down" },
  ];
  return (
    <div className="summary">
      {items.map((it) => (
        <div className="sum" key={it.k}>
          <div className={"sum-v" + (it.tone ? " t-" + it.tone : "")}>{it.v}</div>
          <div className="sum-k">{it.k}</div>
          <div className="sum-sub">{it.sub}</div>
        </div>
      ))}
    </div>
  );
}

/* ---------- expiry alert panel ---------- */
function ExpiryAlert({ servers }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const expiring = useMemo(() => {
    if (!servers) return [];
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return servers
      .filter((s) => {
        if (!s.expiry) return false;
        const exp = new Date(s.expiry + "T00:00:00");
        const diffDays = Math.round((exp.getTime() - now.getTime()) / 86400000);
        return diffDays <= 7;
      })
      .sort((a, b) => (a.expiry || "").localeCompare(b.expiry || ""));
  }, [servers]);

  if (expiring.length === 0) return null;

  return (
    <div className="expiry-alert">
      <button className="expiry-alert-head" onClick={() => setOpen((o) => !o)}>
        <span className="expiry-alert-title">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          {t("expiry.alert.title") || "即将到期"}<span className="expiry-alert-count">{expiring.length}</span>
        </span>
      </button>
      {open && (
        <div className="expiry-alert-list">
          {expiring.map((s, i) => {
            const now2 = new Date(); now2.setHours(0, 0, 0, 0);
            const exp = new Date(s.expiry + "T00:00:00");
            const diffDays = Math.round((exp.getTime() - now2.getTime()) / 86400000);
            const expired = diffDays < 0;
            const color = expired ? "var(--down)" : diffDays <= 1 ? "#f0883e" : "#e2b714";
            const label = expired
              ? (t("expiry.expired", { n: Math.abs(diffDays) }) || `已过期${Math.abs(diffDays)}天`)
              : diffDays === 0
                ? (t("expiry.today") || "今天到期")
                : (t("expiry.daysLeft", { n: diffDays }) || `还有${diffDays}天到期`);
            return (
              <a key={s.name} className="expiry-alert-item" href={detailHref(s.name)}>
                <span className="dot" style={{ background: STATUS[s.status]?.color || "var(--faint)" }} />
                <span className="flag">{s.flag}</span>
                <span className="expiry-alert-name">{s.name}</span>
                <span className="expiry-alert-exp" style={{ color }}>{label}</span>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}

function usePref(key, def) {
  const [v, setV] = useState(() => {
    try { const s = localStorage.getItem(key); return s === null ? def : JSON.parse(s); }
    catch (e) { return def; }
  });
  const set = (nv) => { setV(nv); try { localStorage.setItem(key, JSON.stringify(nv)); } catch (e) {} };
  return [v, set];
}

/* ---------- live data hook ---------- */
function useFleet(authed) {
  const [servers, setServers] = useState(null);
  const [connError, setConnError] = useState(false);
  useEffect(() => {
    if (!authed) { setServers(null); setConnError(false); return; }
    let info = {};
    let statusMap = {};
    const prevNet = {};
    const rebuild = () => { setServers(buildServers(info, statusMap, prevNet)); };
    fetchInfo().then((i) => { info = i || {}; rebuild(); }).catch(() => rebuild());
    const unsub = subscribeStatus(
      (st) => { statusMap = st || {}; setConnError(false); rebuild(); },
      (e) => { if (e && e.message === "connection_lost") setConnError(true); },
    );
    return () => unsub && unsub();
  }, [authed]);
  return [servers, connError];
}

function BootSplash() {
  const { t } = useI18n();
  return (
    <div className="boot">
      <div className="boot-logo"><img src={logo} alt="Infinite Servers" /></div>
      <div className="boot-ring" />
      <div className="boot-text">{t("boot.fleet")}</div>
    </div>
  );
}

function LoginForm({ onLogin }) {
  const { t } = useI18n();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [doodle, setDoodle] = useState(null);

  useEffect(() => {
    let abort = false;
    (async () => {
      try {
        const r = await fetch(API_BASE + "doodle", { signal: AbortSignal.timeout(5000) });
        const data = await r.json();
        if (!abort && data && data.length) {
          const d = data[Math.floor(Math.random() * data.length)];
          if (d.url) setDoodle("https://www.google.com/logos/doodles/" + d.url);
        }
      } catch (e) { /* silently fail */ }
    })();
    return () => { abort = true; };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const result = await login(password);
    setLoading(false);
    if (result.ok) {
      onLogin();
    } else {
      setError(result.error || "登录失败");
    }
  };

  return (
    <div className="login-wrap">
      <div className="login-box">
        {doodle && <img src={doodle} alt="Google Doodle" className="login-doodle" />}
        <img src={logo} alt="Infinite Servers" className="login-logo" />
        <h1>Infinite<strong>Servers</strong></h1>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            placeholder={t("login.placeholder") || "输入密码"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
          {error && <div className="login-error">{error}</div>}
          <button type="submit" disabled={loading}>
            {loading ? "..." : t("login.submit") || "登录"}
          </button>
        </form>
      </div>
    </div>
  );
}

function App() {
  const { t } = useI18n();
  const [dark, setDark] = usePref("is.dark", false);
  const [density, setDensity] = usePref("is.density", "compact");
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [activeTags, setActiveTags] = useState([]);
  const [authed, setAuthed] = useState(isLoggedIn());

  const [servers, connError] = useFleet(authed);

  // distinct tags in first-seen order, with counts
  const allTags = useMemo(() => {
    if (!servers) return [];
    const order = [];
    const count = {};
    servers.forEach((s) => (s.tags || []).forEach((t) => {
      if (!(t in count)) { order.push(t); count[t] = 0; }
      count[t]++;
    }));
    return order.map((t) => ({ name: t, count: count[t] }));
  }, [servers]);

  const regions = useMemo(() => {
    if (!servers) return 0;
    return new Set(servers.map((s) => s.regionCode).filter(Boolean)).size;
  }, [servers]);

  const toggleTag = (t) =>
    setActiveTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  const shown = useMemo(() => {
    if (!servers) return [];
    return servers.filter((s) => {
      const okF = filter === "all" ? true : s.status === filter;
      const okQ = !query || (s.name + " " + s.region + " " + s.os + " " + (s.tags || []).join(" ")).toLowerCase().includes(query.toLowerCase());
      const okT = activeTags.length === 0 || (s.tags || []).some((t) => activeTags.includes(t));
      return okF && okQ && okT;
    });
  }, [servers, filter, query, activeTags]);

  // reserve the compact GPU column only when at least one visible server has a
  // GPU; if none do, every row stays at 3 columns and lines up naturally
  const anyGpu = shown.some((s) => gpuSummary(s.gpu));

  if (!authed) return <LoginForm onLogin={() => setAuthed(true)} />;
  if (!servers) return <BootSplash />;

  const counts = {
    all: servers.length,
    online: servers.filter((s) => s.status === "online").length,
    warning: servers.filter((s) => s.status === "warning").length,
    offline: servers.filter((s) => s.status === "offline").length,
  };

  const tabs = [
    { id: "all" },
    { id: "online" },
    { id: "warning" },
    { id: "offline" },
  ];

  return (
    <div
      className="app"
      data-theme={dark ? "dark" : "light"}
      data-density={density}
    >
      <AppBar dark={dark} setDark={setDark}>
        <span className="clock-dot" /> <span className="live-text">{t("live")}</span>
        <div className="seg">
          <button className={density === "compact" ? "on" : ""} onClick={() => setDensity("compact")}>{t("density.compact")}</button>
          <button className={density === "comfy" ? "on" : ""} onClick={() => setDensity("comfy")}>{t("density.comfy")}</button>
        </div>
      </AppBar>

      <main className="wrap">
        {connError && (
          <div className="conn-error">
            {t("error.connectionLost") || "Connection lost — Worker unreachable. Retrying..."}
          </div>
        )}
        <div className="page-head">
          <div>
            <h1>{t("dash.title")}</h1>
            <p className="subhead">{t("dash.subhead", {
              n: servers.length,
              nodes: t(servers.length === 1 ? "unit.node" : "unit.nodes"),
              regions: regions > 0
                ? t("unit.regionSuffix", { n: regions, regions: t(regions === 1 ? "unit.region" : "unit.regions") })
                : "",
            })}</p>
          </div>
        </div>

        <div className="toolbar">
          <div className="tabs">
            {tabs.map((tb) => (
              <button
                key={tb.id}
                className={"tab" + (filter === tb.id ? " active" : "")}
                onClick={() => setFilter(tb.id)}
              >
                {t("tab." + tb.id)}<span className="tab-c">{counts[tb.id]}</span>
              </button>
            ))}
          </div>
          <div className="search">
            <input
              placeholder={t("search.placeholder")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        <ExpiryAlert servers={servers} />

        {allTags.length > 0 && (
          <div className="tagbar">
            <span className="tagbar-lead"><Icon.tag /> {t("tags.label")}</span>
            {allTags.map((t) => (
              <button
                key={t.name}
                className={"tagchip" + (activeTags.includes(t.name) ? " on" : "")}
                onClick={() => toggleTag(t.name)}
              >
                {t.name}<span className="tagchip-c">{t.count}</span>
              </button>
            ))}
            {activeTags.length > 0 && (
              <button className="tag-clear" onClick={() => setActiveTags([])}>
                <Icon.close /> {t("tags.clear")}
              </button>
            )}
          </div>
        )}

        <section className="grid" key={filter + "|" + density + "|" + activeTags.join(",")}>
          {shown.map((s, i) => (
            density === "compact"
              ? <RowCard s={s} idx={i} key={s.name} showGpu={anyGpu} />
              : <ServerCard s={s} idx={i} key={s.name} />
          ))}
          {shown.length === 0 && <div className="empty" key="empty">{servers.length === 0 ? t("empty.noServers") : t("empty.noMatch")}</div>}
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

createRoot(document.getElementById("root")).render(
  <I18nProvider><App /></I18nProvider>
);
