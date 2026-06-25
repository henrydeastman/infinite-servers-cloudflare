/* ============================================================
   Server Detail page — composition (real data).
   ============================================================ */
import React, { useState, useEffect, useMemo, useRef } from "react";
import { createRoot } from "react-dom/client";
import "./fonts.js";
import "./styles/detail.css";
import logo from "./assets/logo.png";
import { AreaChart, Sparkline, UptimeStrip } from "./charts.jsx";
import { fetchInfo, subscribeStatus, buildServers, fetchHistory, toSeries, fetchAvailability, setExpiry, setPurchaseDate } from "./api.js";
import { I18nProvider, useI18n } from "./i18n.jsx";
import { AppBar, SiteFooter } from "./chrome.jsx";

/* ---------- icons ---------- */
const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

function DatePicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value || "");
  const [viewDate, setViewDate] = useState(() => {
    if (value) {
      const parts = value.split("/");
      return new Date(parseInt(parts[0] || 2026), parseInt(parts[1] || 1) - 1, 1);
    }
    return new Date();
  });
  const ref = React.useRef(null);

  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const format = (y, m, d) => {
    const mm = String(m + 1).padStart(2, "0");
    const dd = String(d).padStart(2, "0");
    return `${y}/${mm}/${dd}`;
  };

  const handleText = (e) => {
    let v = e.target.value.replace(/[^\d]/g, "");
    if (v.length > 8) v = v.slice(0, 8);
    if (v.length > 4) v = v.slice(0, 4) + "/" + v.slice(4);
    if (v.length > 7) v = v.slice(0, 7) + "/" + v.slice(7);
    setDraft(v);
    if (v.length === 10) {
      const parts = v.split("/");
      const y = parseInt(parts[0]), m = parseInt(parts[1]), d = parseInt(parts[2]);
      if (y && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
        onChange(v);
        setOpen(false);
      }
    }
  };

  const selectDay = (y, m, d) => {
    const v = format(y, m, d);
    setDraft(v);
    onChange(v);
    setOpen(false);
  };

  const today = new Date();
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(<span key={"e" + i} className="dp-cell dp-empty" />);
  for (let d = 1; d <= daysInMonth; d++) {
    const isToday = year === today.getFullYear() && month === today.getMonth() && d === today.getDate();
    const isSelected = draft === format(year, month, d);
    cells.push(
      <span
        key={d}
        className={"dp-cell" + (isToday ? " dp-today" : "") + (isSelected ? " dp-selected" : "")}
        onClick={() => selectDay(year, month, d)}
      >
        {d}
      </span>
    );
  }

  return (
    <div className="dp-wrap" ref={ref}>
      <input
        type="text"
        className="eb-date"
        value={draft}
        onChange={handleText}
        onFocus={() => setOpen(true)}
        placeholder="YYYY/MM/DD"
        maxLength={10}
      />
      {open && (
        <div className="dp-dropdown">
          <div className="dp-header">
            <button className="dp-nav" onClick={() => setViewDate(new Date(year, month - 1, 1))}>‹</button>
            <span className="dp-title">{year}年{month + 1}月</span>
            <button className="dp-nav" onClick={() => setViewDate(new Date(year, month + 1, 1))}>›</button>
          </div>
          <div className="dp-weekdays">
            {WEEKDAYS.map((w) => <span key={w} className="dp-wd">{w}</span>)}
          </div>
          <div className="dp-grid">{cells}</div>
        </div>
      )}
    </div>
  );
}

const I = {
  cpu: (p) => <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" {...p}><rect x="7" y="7" width="10" height="10" rx="1.5" /><path d="M9 2v3M12 2v3M15 2v3M9 19v3M12 19v3M15 19v3M2 9h3M2 12h3M2 15h3M19 9h3M19 12h3M19 15h3" /></svg>,
  ram: (p) => <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" {...p}><rect x="2" y="7" width="20" height="10" rx="1.5" /><path d="M6 17v2M10 17v2M14 17v2M18 17v2M7 10v4M12 10v4M17 10v4" /></svg>,
  disk: (p) => <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" {...p}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="2.5" /></svg>,
  gpu: (p) => <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" {...p}><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="8" cy="12" r="2.4" /><circle cx="15" cy="12" r="2.4" /><path d="M19 9v6" /></svg>,
  os: (p) => <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" {...p}><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></svg>,
  warn: (p) => <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg>,
  check: (p) => <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M20 6 9 17l-5-5" /></svg>,
  tag: (p) => <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M3 7.5V4a1 1 0 0 1 1-1h3.5a2 2 0 0 1 1.4.6l10 10a2 2 0 0 1 0 2.8l-4.1 4.1a2 2 0 0 1-2.8 0l-10-10A2 2 0 0 1 3 9.3z" /><circle cx="7" cy="7" r="1.4" fill="currentColor" stroke="none" /></svg>,
};

const STATUS = {
  online: { color: "var(--ok)" },
  warning: { color: "var(--warn)" },
  offline: { color: "var(--down)" },
};

const RANGES = ["1H", "24H", "7D", "30D"];

const METRICS = [
  { key: "cpu", unit: "%" },
  { key: "mem", unit: "%" },
  { key: "swap", unit: "%" },
  { key: "disk", unit: "%" },
  { key: "load", unit: "%" },
  { key: "net", unit: "MB/s" },
];
// translated display label for a metric key
const metricLabel = (t, key) => t("res.metric." + key);

/* ---------- formatters ---------- */
const pctFmt = (v) => Math.round(v) + "%";
const netAxis = (v) =>
  v >= 1048576 ? (v / 1048576).toFixed(0) + "T"
  : v >= 1024 ? (v / 1024).toFixed(0) + "G"
  : v >= 1 ? v.toFixed(0) + "M"
  : Math.round(v * 1024) + "K";
function fmtMB(mb) {
  if (mb >= 1048576) return (mb / 1048576).toFixed(1) + " TB/s";
  if (mb >= 1024) return (mb / 1024).toFixed(1) + " GB/s";
  if (mb >= 1) return mb.toFixed(1) + " MB/s";
  if (mb >= 1 / 1024) return (mb * 1024).toFixed(0) + " KB/s";
  return (mb * 1048576).toFixed(0) + " B/s";
}

function statsOf(arr) {
  if (!arr.length) return { cur: 0, avg: 0, min: 0, max: 0 };
  const vs = arr.map((p) => p.v);
  const sum = vs.reduce((a, b) => a + b, 0);
  return { cur: vs[vs.length - 1], avg: sum / vs.length, min: Math.min(...vs), max: Math.max(...vs) };
}

function gpuStats(s) {
  if (!s || !s.gpu || !s.gpu.length) return null;
  const used = s.gpu.reduce((a, g) => a + g.used, 0);
  const count = s.gpu.reduce((a, g) => a + g.count, 0);
  return { used, count, free: count - used, types: s.gpu };
}

function buildPayload(rows, key, range, cores, t) {
  if (key === "net") {
    const down = toSeries(rows, "netDown", range, cores);
    const up = toSeries(rows, "netUp", range, cores);
    return {
      series: [
        { key: t("net.download"), color: "var(--accent)", data: down },
        { key: t("net.upload"), color: "var(--c2)", data: up },
      ],
      fmt: fmtMB, axisFmt: netAxis, primary: down, unit: "MB/s",
    };
  }
  const data = toSeries(rows, key, range, cores);
  return { series: [{ key: metricLabel(t, key), color: "var(--accent)", data }], fmt: pctFmt, axisFmt: pctFmt, primary: data, unit: "%", yMax: 100 };
}

function usePref(key, def) {
  const [v, setV] = useState(() => { try { const s = localStorage.getItem(key); return s === null ? def : JSON.parse(s); } catch (e) { return def; } });
  return [v, (nv) => { setV(nv); try { localStorage.setItem(key, JSON.stringify(nv)); } catch (e) {} }];
}

/* ---------- live fleet (same source as the dashboard) ---------- */
function useFleet() {
  const [servers, setServers] = useState(null);
  const refreshRef = useRef(null);
  useEffect(() => {
    let info = {};
    let statusMap = {};
    const prevNet = {};
    const rebuild = () => setServers(buildServers(info, statusMap, prevNet));
    const loadInfo = () => fetchInfo().then((i) => { info = i || {}; rebuild(); }).catch(() => rebuild());
    loadInfo();
    refreshRef.current = loadInfo;
    const unsub = subscribeStatus((st) => { statusMap = st || {}; rebuild(); });
    return () => unsub && unsub();
  }, []);
  return [servers, refreshRef];
}

/* ---------- overview tiles ---------- */
function Overview({ s }) {
  const { t } = useI18n();
  const vcpu = t(s.cores > 1 ? "ov.vcpuCores" : "ov.vcpuCore", { n: s.cores });
  const tiles = [
    { ic: <I.os />, k: t("ov.os"), v: s.os },
    { ic: <I.cpu />, k: t("ov.cpu"), v: s.cpuModel || vcpu, sub: s.cpuModel ? vcpu : null },
    { ic: <I.ram />, k: t("ov.mem"), v: t("ov.ramSuffix", { v: s.ram }) },
    { ic: <I.disk />, k: t("ov.storage"), v: t("ov.diskSuffix", { v: s.disk }) },
  ];
  return (
    <div className="ov-grid">
      {tiles.map((t, i) => (
        <div className="ov" key={i}>
          <span className="ov-ic">{t.ic}</span>
          <div className="ov-txt">
            <div className="ov-k">{t.k}</div>
            <div className="ov-v" title={t.v}>{t.v}</div>
            {t.sub && <div className="ov-sub">{t.sub}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------- resources (selector + chart) ---------- */
function Resources({ s, range, setRange }) {
  const { t } = useI18n();
  const [sel, setSel] = useState("cpu");
  const [rows, setRows] = useState(null);

  useEffect(() => {
    let alive = true;
    setRows(null);
    fetchHistory(s.name, range).then((r) => { if (alive) setRows(r); }).catch(() => { if (alive) setRows([]); });
    return () => { alive = false; };
  }, [s.name, range]);

  const active = METRICS.find((m) => m.key === sel) ? sel : "cpu";

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>{t("res.title")}</h2>
          <p className="panel-sub">{t("res.sub")}</p>
        </div>
        <div className="seg small">
          {RANGES.map((r) => (
            <button key={r} className={range === r ? "on" : ""} onClick={() => setRange(r)}>{r}</button>
          ))}
        </div>
      </div>

      {rows === null ? (
        <div className="panel-empty">{t("res.loading")}</div>
      ) : rows.length === 0 ? (
        <div className="panel-empty">{t("res.empty")}</div>
      ) : (
        <ResourceBody s={s} rows={rows} range={range} active={active} setSel={setSel} />
      )}
    </section>
  );
}

function ResourceBody({ s, rows, range, active, setSel }) {
  const { t } = useI18n();
  const payload = buildPayload(rows, active, range, s.cores, t);
  const st = statsOf(payload.primary);
  const cur = payload.primary.length ? payload.primary[payload.primary.length - 1].v : 0;
  const unit = METRICS.find((m) => m.key === active).unit;
  const fmtStat = (v) => (unit === "%" ? Math.round(v) + "%" : fmtMB(v));

  return (
    <>
      <div className="metric-strip">
        {METRICS.map((m) => {
          const p = buildPayload(rows, m.key, range, s.cores, t);
          const v = p.primary.length ? p.primary[p.primary.length - 1].v : 0;
          const disp = m.unit === "%" ? Math.round(v) + "%" : fmtMB(v);
          return (
            <button key={m.key} className={"ms" + (active === m.key ? " on" : "")} onClick={() => setSel(m.key)}>
              <div className="ms-k">{metricLabel(t, m.key)}</div>
              <div className="ms-v">{disp}</div>
              <div className="ms-spark"><Sparkline data={p.primary} color={active === m.key ? "var(--accent)" : "var(--bar)"} height={28} /></div>
            </button>
          );
        })}
      </div>

      <div className="chart-head">
        <div className="chart-title">
          <span className="ct-name">{metricLabel(t, active)}</span>
          {payload.series.length > 1 && (
            <span className="ct-legend">
              {payload.series.map((se, i) => (
                <span key={i} className="ct-leg"><i style={{ background: se.color }} />{se.key}</span>
              ))}
            </span>
          )}
        </div>
        <div className="chart-stats">
          <span><b>{fmtStat(cur)}</b> {t("stat.current")}</span>
          <span><b>{fmtStat(st.avg)}</b> {t("stat.avg")}</span>
          <span><b>{fmtStat(st.min)}</b> {t("stat.min")}</span>
          <span><b>{fmtStat(st.max)}</b> {t("stat.peak")}</span>
        </div>
      </div>

      <AreaChart key={s.name + active + range} series={payload.series} yMax={payload.yMax} fmt={payload.fmt} axisFmt={payload.axisFmt} />
    </>
  );
}

/* ---------- GPU usage panel (per-type, multi-model) ---------- */
function GpuPanel({ s }) {
  const { t } = useI18n();
  const agg = gpuStats(s);
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>{t("gpu.title")}</h2>
          <p className="panel-sub">{t("gpu.countTypes", { n: agg.count, types: s.gpu.length > 1 ? t("gpu.typesSuffix", { n: s.gpu.length }) : "" })}</p>
        </div>
        <div className="gpu-count">
          <span className="gpu-count-v"><b>{agg.used}</b><span className="gpu-count-d">/ {agg.count}</span></span>
          <span className="gpu-count-k">{t("gpu.inUseFree", { n: agg.free })}</span>
        </div>
      </div>

      <div className="gpu-types">
        {s.gpu.map((g, i) => {
          const pct = g.count ? Math.round((g.used / g.count) * 100) : 0;
          return (
            <div className="gtype" key={i}>
              <div className="gtype-head">
                <span className="gtype-name"><I.gpu /> {g.model}</span>
                <span className="gtype-count">{t("gpu.inUse", { used: g.used, count: g.count })}</span>
              </div>
              <div className="meter-bar lg"><i style={{ width: pct + "%", background: pct >= 85 ? "var(--accent)" : "var(--bar)" }} /></div>
              <div className="gtype-foot">
                <span>{t("gpu.allocated", { n: pct })}</span>
                <span>{t("gpu.free", { n: g.count - g.used })}</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ---------- availability ---------- */
function Availability({ name }) {
  const { t, lang } = useI18n();
  const locale = lang === "zh" ? "zh-CN" : "en";
  const [data, setData] = useState(null);
  useEffect(() => {
    let alive = true;
    setData(null);
    fetchAvailability(name, 30).then((a) => { if (alive) setData(a); });
    return () => { alive = false; };
  }, [name]);

  if (!data) return (
    <section className="panel"><div className="panel-head"><div><h2>{t("avail.title")}</h2><p className="panel-sub">{t("avail.sub")}</p></div></div><div className="panel-empty">{t("avail.loading")}</div></section>
  );

  const tone = data.overall >= 99.5 ? "ok" : data.overall >= 98 ? "warn" : "down";
  const inc = data.incidents;
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>{t("avail.title")}</h2>
          <p className="panel-sub">{t("avail.sub")}</p>
        </div>
        <div className="avail-pct">
          <span className={"ap-v t-" + tone}>{data.overall.toFixed(2)}%</span>
          <span className="ap-k">{t("avail.uptime")}</span>
        </div>
      </div>

      {data.days.length > 0 ? <UptimeStrip days={data.days} /> : <div className="panel-empty">{t("avail.noData")}</div>}

      <div className="incidents">
        <div className="inc-h">{t("avail.incidents")}</div>
        {inc.length === 0 ? (
          <div className="inc-none"><I.check /> {t("avail.noIncidents")}</div>
        ) : inc.map((e, i) => {
          const h = Math.floor(e.downMin / 60), m = e.downMin % 60;
          const fmtTs = (ts) => {
            if (!ts) return null;
            const d = new Date(ts * 1000);
            return d.toLocaleString(locale, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
          };
          const startTime = e.startTs ? fmtTs(e.startTs) : null;
          const endTime = e.endTs ? fmtTs(e.endTs) : null;
          const duration = h ? t("dur.hm", { h, m }) : t("dur.m", { m });
          return (
            <div className="inc" key={i}>
              <span className={"inc-ic " + e.kind}><I.warn /></span>
              <div className="inc-body">
                <div className="inc-title">{t("incident." + e.kind)}</div>
                <div className="inc-timeline">
                  {startTime && <div className="inc-tl-row"><span className="inc-tl-dot down" /><span className="inc-tl-time">{startTime}</span><span className="inc-tl-label">{t("incident.down")}</span></div>}
                  <div className="inc-tl-line" />
                  {endTime ? (
                    <div className="inc-tl-row"><span className="inc-tl-dot up" /><span className="inc-tl-time">{endTime}</span><span className="inc-tl-label">{t("incident.up")}</span></div>
                  ) : (
                    <div className="inc-tl-row"><span className="inc-tl-dot down pulse" /><span className="inc-tl-time">{t("incident.stillDown")}</span></div>
                  )}
                </div>
              </div>
              <span className="inc-dur">{duration}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function BootSplash({ text }) {
  const { t } = useI18n();
  return (
    <div className="boot">
      <div className="boot-logo"><img src={logo} alt="Infinite Servers" /></div>
      <div className="boot-ring" />
      <div className="boot-text">{text || t("boot.node")}</div>
    </div>
  );
}

/* ---------- expiry board ---------- */
function ExpiryBoard({ s, onExpiryChange, onPurchaseDateChange }) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => s.expiry ? s.expiry.replace(/-/g, "/") : "");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [purchaseDraft, setPurchaseDraft] = useState(() => s.purchase_date ? s.purchase_date.replace(/-/g, "/") : "");
  const [editingPurchase, setEditingPurchase] = useState(false);
  const [savingPurchase, setSavingPurchase] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const apiDate = draft.replace(/\//g, "-");
      await setExpiry(s.name, apiDate);
      onExpiryChange();
      setEditing(false);
      setToast(t(draft ? "expiry.saved" : "expiry.cleared"));
      setTimeout(() => setToast(null), 2000);
    } catch (e) {
      setToast(t("expiry.saveFailed") || "Save failed");
      setTimeout(() => setToast(null), 3000);
    }
    setSaving(false);
  };

  const savePurchase = async () => {
    setSavingPurchase(true);
    try {
      const apiDate = purchaseDraft.replace(/\//g, "-");
      await setPurchaseDate(s.name, apiDate);
      onPurchaseDateChange();
      setEditingPurchase(false);
      setToast(t(purchaseDraft ? "expiry.purchaseSaved" : "expiry.purchaseCleared"));
      setTimeout(() => setToast(null), 2000);
    } catch (e) {
      setToast(t("expiry.saveFailed") || "Save failed");
      setTimeout(() => setToast(null), 3000);
    }
    setSavingPurchase(false);
  };

  const handleDateInput = (e) => {
    let v = e.target.value.replace(/[^\d]/g, "");
    if (v.length > 8) v = v.slice(0, 8);
    if (v.length > 4) v = v.slice(0, 4) + "/" + v.slice(4);
    if (v.length > 7) v = v.slice(0, 7) + "/" + v.slice(7);
    setDraft(v);
  };

  // compute the grid: from purchase-date (or first-seen) to expiry + 15 days
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const exp = s.expiry ? new Date(s.expiry + "T00:00:00") : null;
  const purchaseDate = s.purchase_date ? new Date(s.purchase_date + "T00:00:00") : null;
  const firstSeen = s.first_seen ? new Date(s.first_seen + "T00:00:00") : null;
  const effectiveStart = purchaseDate || firstSeen;
  const startRef = effectiveStart || new Date(now.getTime() - 30 * 86400000);
  const endRef = exp ? new Date(exp.getTime() + 15 * 86400000) : new Date(now.getTime() + 30 * 86400000);
  const totalDays = Math.max(1, Math.round((endRef.getTime() - startRef.getTime()) / 86400000));
  const elapsed = Math.max(0, Math.min(totalDays, Math.round((now.getTime() - startRef.getTime()) / 86400000)));
  const pct = Math.round((elapsed / totalDays) * 100);
  const todayStr = now.toISOString().slice(0, 10);

  // build day cells
  // Colors: red = before today, green = today, yellow = tomorrow → expiry, grey = after expiry
  const cells = [];
  for (let i = 0; i < totalDays; i++) {
    const d = new Date(startRef.getTime() + i * 86400000);
    const ts = d.getTime();
    let cls;
    if (ts < now.getTime()) {
      cls = "eb-red";        // past
    } else if (ts === now.getTime()) {
      cls = "eb-green";      // today
    } else if (exp && ts <= exp.getTime()) {
      cls = "eb-yellow";     // remaining until expiry
    } else {
      cls = "eb-grey";       // after expiry
    }
    cells.push(<span key={i} className={"eb-cell " + cls} title={d.toLocaleDateString()} />);
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>{t("expiry.board")}</h2>
          <p className="panel-sub">
            {effectiveStart ? t("expiry.purchaseDate") + ": " + (s.purchase_date || s.first_seen) : "—"}
            {s.expiry ? " · " + t("expiry.end") + ": " + s.expiry : ""}
          </p>
        </div>
        <div className="eb-controls">
          {editing ? (
            <>
              <span className="eb-edit-label">{t("expiry.end")}</span>
              <DatePicker value={draft} onChange={setDraft} />
              <div className="eb-combine">
                <div className="eb-combine-item">
                  <button className="eb-btn eb-btn-primary" onClick={save} disabled={saving}>{saving ? "…" : t("expiry.save")}</button>
                </div>
                <div className="eb-combine-item">
                  <button className="eb-btn" onClick={() => { setEditing(false); setDraft(s.expiry ? s.expiry.replace(/-/g, "/") : ""); }}>{t("expiry.exit")}</button>
                </div>
              </div>
            </>
          ) : editingPurchase ? (
            <>
              <span className="eb-edit-label">{t("expiry.purchaseDate")}</span>
              <DatePicker value={purchaseDraft} onChange={setPurchaseDraft} />
              <div className="eb-combine">
                <div className="eb-combine-item">
                  <button className="eb-btn eb-btn-primary" onClick={savePurchase} disabled={savingPurchase}>{savingPurchase ? "…" : t("expiry.save")}</button>
                </div>
                <div className="eb-combine-item">
                  <button className="eb-btn" onClick={() => { setEditingPurchase(false); setPurchaseDraft(s.purchase_date ? s.purchase_date.replace(/-/g, "/") : ""); }}>{t("expiry.exit")}</button>
                </div>
              </div>
            </>
          ) : (
            <div className="seg small">
              <button className={editingPurchase ? "on" : ""} onClick={() => setEditingPurchase(true)}>{t("expiry.setPurchase")}</button>
              <button className={editing ? "on" : ""} onClick={() => setEditing(true)}>{t("expiry.set")}</button>
            </div>
          )}
        </div>
      </div>

      {toast && <div className="eb-toast">{toast}</div>}

      <div className="eb-board">
        <div className="eb-legend">
          <span className="eb-cell eb-red" /><span>已过</span>
          <span className="eb-cell eb-green" /><span>今天</span>
          <span className="eb-cell eb-yellow" /><span>剩余</span>
          <span className="eb-cell eb-grey" /><span>过期</span>
        </div>
        <div className="eb-grid">{cells}</div>
        <div className="eb-bar"><div className="eb-bar-fill" style={{ width: pct + "%" }} /></div>
      </div>
    </section>
  );
}

/* ---------- page ---------- */
function App() {
  const { t, relTime, fmtUptime } = useI18n();
  const [servers, refreshRef] = useFleet();
  const [dark, setDark] = usePref("is.dark", false);
  const [range, setRange] = useState("24H");
  const initial = new URLSearchParams(location.search).get("id");
  const [name, setName] = useState(initial);

  const names = useMemo(() => (servers ? servers.map((s) => s.name) : []), [servers]);

  // clamp the selection once the fleet loads
  useEffect(() => {
    if (servers && servers.length && !names.includes(name)) setName(servers[0].name);
  }, [servers, names, name]);

  if (!servers) return <BootSplash />;
  if (!servers.length) return <BootSplash text={t("empty.noServers")} />;

  const s = servers.find((x) => x.name === name) || servers[0];
  const st = STATUS[s.status];

  const changeServer = (nm) => {
    setName(nm);
    const url = new URL(location.href); url.searchParams.set("id", nm); history.replaceState(null, "", url);
  };

  const handleExpiryChange = () => {
    if (refreshRef.current) refreshRef.current();
  };

  const handlePurchaseDateChange = () => {
    if (refreshRef.current) refreshRef.current();
  };

  const curNet = `↓ ${s.netDown} · ↑ ${s.netUp}`;

  return (
    <div className="app" data-theme={dark ? "dark" : "light"}>
      <AppBar dark={dark} setDark={setDark} back="./" key="appbar">
        <select className="srv-select" value={s.name} onChange={(e) => changeServer(e.target.value)}>
          {names.map((nm) => <option key={nm} value={nm}>{nm}</option>)}
        </select>
      </AppBar>

      <main className="wrap" key={s.name}>
        <div className="dt-head">
          <div className="dt-id">
            <span className="status">
              <span className="dot" style={{ background: st.color }}>{s.status === "online" && <span className="ping" style={{ background: st.color }} />}</span>
              <span className="status-label" style={{ color: st.color }}>{t("status." + s.status)}</span>
            </span>
            <h1><span className="flag">{s.flag}</span>{s.name}</h1>
            <div className="dt-meta">
              <span>{s.region}</span><span className="sep">·</span>
              <span>{s.os}</span>
              {s.ip && <><span className="sep">·</span><span className="mono">{s.ip}</span></>}
            </div>
            {s.tags && s.tags.length > 0 && (
              <div className="dt-tags">
                {s.tags.map((t) => <span className="dt-tag" key={t}><I.tag /> {t}</span>)}
              </div>
            )}
          </div>
          <div className="dt-stats">
            <div className="dts"><div className="dts-k">{t("dt.uptime")}</div><div className="dts-v">{fmtUptime(s.uptimeSec)}</div></div>
            <div className="dts"><div className="dts-k">{t("dt.network")}</div><div className="dts-v mono">{curNet}</div></div>
            <div className="dts"><div className="dts-k">{t("dt.lastSeen")}</div><div className="dts-v">{relTime(s.time)}</div></div>
          </div>
        </div>

        <Overview s={s} />
        <Resources s={s} range={range} setRange={setRange} />
        {s.gpu && s.gpu.length > 0 && <GpuPanel s={s} />}
        <Availability name={s.name} />
        <ExpiryBoard s={s} onExpiryChange={handleExpiryChange} onPurchaseDateChange={handlePurchaseDateChange} />
      </main>

      <SiteFooter key="footer" />
    </div>
  );
}

createRoot(document.getElementById("root")).render(
  <I18nProvider><App /></I18nProvider>
);
