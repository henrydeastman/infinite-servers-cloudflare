/* ============================================================
   Lightweight i18n — string tables + React context.

   - Auto-detects the browser/system language on first load.
   - Defaults to English when nothing matches.
   - Remembers an explicit choice in localStorage ("is.lang").

   Add a language by extending LANGUAGES and STRINGS below.
   ============================================================ */
import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";

const STORE_KEY = "is.lang";

export const LANGUAGES = [
  { code: "en", label: "English", short: "EN" },
  { code: "zh", label: "简体中文", short: "中" },
];
const SUPPORTED = LANGUAGES.map((l) => l.code);

/* pick a language: saved choice → system language → English */
export function detectLang() {
  try {
    const saved = localStorage.getItem(STORE_KEY);
    if (saved && SUPPORTED.includes(saved)) return saved;
  } catch (e) { /* ignore */ }
  const navs = (navigator.languages && navigator.languages.length)
    ? navigator.languages
    : [navigator.language];
  for (const n of navs) {
    const low = (n || "").toLowerCase();
    if (low.startsWith("zh")) return "zh";
    if (low.startsWith("en")) return "en";
  }
  return "en";
}

const STRINGS = {
  en: {
    // appbar / chrome
    "live": "LIVE",
    "density.compact": "Compact",
    "density.comfy": "Comfy",
    "theme.toggle": "Toggle theme",
    "lang.toggle": "切换语言 / Switch language",
    "nav.dashboard": "Dashboard",

    // status
    "status.online": "Online",
    "status.warning": "Degraded",
    "status.offline": "Offline",

    // boot / empty
    "boot.fleet": "Loading fleet…",
    "boot.node": "Loading node…",
    "empty.noServers": "No servers available.",
    "empty.noMatch": "No nodes match your filter.",

    // dashboard head
    "dash.title": "Fleet Dashboard",
    "dash.subhead": "Real-time health across {n} {nodes}{regions}",
    "unit.node": "node",
    "unit.nodes": "nodes",
    "unit.regionSuffix": " · {n} {regions}",
    "unit.region": "region",
    "unit.regions": "regions",

    // tabs
    "tab.all": "All",
    "tab.online": "Online",
    "tab.warning": "Degraded",
    "tab.offline": "Offline",

    // toolbar / tags
    "search.placeholder": "Filter by name, region, OS, tag…",
    "tags.label": "Tags",
    "tags.clear": "Clear",

    // card specs / metrics
    "spec.core": "core",
    "spec.cores": "cores",
    "spec.ram": "ram",
    "spec.disk": "disk",
    "card.up": "up {v}",
    "metric.load": "LOAD",
    "metric.mem": "MEM",
    "metric.swap": "SWAP",
    "metric.disk": "DISK",
    "metric.stg": "STG",
    "metric.cpu": "CPU",
    "metric.gpu": "GPU",
    "net.upload": "Upload",
    "net.download": "Download",

    // detail — overview
    "ov.os": "Operating system",
    "ov.cpu": "Processor",
    "ov.mem": "Memory",
    "ov.storage": "Storage",
    "ov.vcpuCore": "{n} vCPU core",
    "ov.vcpuCores": "{n} vCPU cores",
    "ov.ramSuffix": "{v} RAM",
    "ov.diskSuffix": "{v} disk",

    // detail — header stats
    "dt.uptime": "Uptime",
    "dt.network": "Network",
    "dt.lastSeen": "Last seen",

    // detail — resources
    "res.title": "Resource history",
    "res.sub": "Hover the chart to inspect any point in time",
    "res.loading": "Loading history…",
    "res.empty": "No history recorded yet for this range.",
    "res.metric.cpu": "CPU",
    "res.metric.mem": "Memory",
    "res.metric.swap": "Swap",
    "res.metric.disk": "Disk",
    "res.metric.load": "Load",
    "res.metric.net": "Network",
    "stat.current": "current",
    "stat.avg": "avg",
    "stat.min": "min",
    "stat.peak": "peak",

    // detail — gpu
    "gpu.title": "GPU usage",
    "gpu.countTypes": "{n} GPUs{types}",
    "gpu.typesSuffix": " · {n} types",
    "gpu.inUseFree": "in use · {n} free",
    "gpu.inUse": "{used} / {count} in use",
    "gpu.allocated": "{n}% allocated",
    "gpu.free": "{n} free",

    // detail — availability
    "avail.title": "Availability",
    "avail.sub": "Daily uptime over the last 30 days",
    "avail.loading": "Loading…",
    "avail.uptime": "uptime",
    "avail.noData": "No availability data yet.",
    "uptime.ago": "{n} days ago",
    "uptime.today": "Today",
    "uptime.noData": "no data",
    "uptime.dayPct": "{n}% uptime",
    "avail.incidents": "Recent incidents",
    "avail.noIncidents": "No incidents in the last 30 days.",
    "incident.outage": "Connection lost",
    "incident.degraded": "Missed health checks",
    "incident.down": "Went down",
    "incident.up": "Recovered",
    "incident.stillDown": "Still down",
    "dur.hm": "{h}h {m}m",
    "dur.m": "{m}m",

    // footer
    "footer.rights": "All rights reserved.",
    "footer.source": "Source on GitHub",

    // relative time (last seen)
    "rel.never": "never",
    "rel.now": "just now",
    "rel.s": "{n}s ago",
    "rel.m": "{n}m ago",
    "rel.hm": "{h}h {m}m ago",
    "rel.d": "{n}d ago",

    // uptime (humanised duration)
    "up.day": "{n} day",
    "up.days": "{n} days",
    "up.hour": "{n} hour",
    "up.hours": "{n} hours",
    "up.min": "{n} minute",
    "up.mins": "{n} minutes",

    // expiry
    "expiry.daysLeft": "{n} days left",
    "expiry.today": "Expires today",
    "expiry.expired": "Expired {n} days ago",
    "expiry.board": "Service expiry board",
    "expiry.set": "Set expiry date",
    "expiry.save": "Save",
    "expiry.exit": "Exit",
    "expiry.clear": "Clear",
    "expiry.start": "Start date",
    "expiry.end": "Expiry date",
    "expiry.progress": "Service progress",
    "expiry.saved": "Expiry date saved",
    "expiry.cleared": "Expiry date cleared",
    "expiry.purchaseDate": "Purchase date",
    "expiry.setPurchase": "Set purchase date",
    "expiry.purchaseSaved": "Purchase date saved",
    "expiry.purchaseCleared": "Purchase date cleared",
    "expiry.saveFailed": "Save failed",

    // expiry alert
    "expiry.alert.title": "Expiring soon",

    // login
    "login.placeholder": "Enter password",
    "login.submit": "Login",
  },
  zh: {
    // appbar / chrome
    "live": "实时",
    "density.compact": "紧凑",
    "density.comfy": "宽松",
    "theme.toggle": "切换主题",
    "lang.toggle": "切换语言 / Switch language",
    "nav.dashboard": "仪表盘",

    // status
    "status.online": "在线",
    "status.warning": "降级",
    "status.offline": "离线",

    // boot / empty
    "boot.fleet": "正在加载集群…",
    "boot.node": "正在加载节点…",
    "empty.noServers": "暂无可用服务器。",
    "empty.noMatch": "没有匹配筛选条件的节点。",

    // dashboard head
    "dash.title": "集群仪表盘",
    "dash.subhead": "实时监控 {n} {nodes}{regions}",
    "unit.node": "个节点",
    "unit.nodes": "个节点",
    "unit.regionSuffix": " · {n} {regions}",
    "unit.region": "个地区",
    "unit.regions": "个地区",

    // tabs
    "tab.all": "全部",
    "tab.online": "在线",
    "tab.warning": "降级",
    "tab.offline": "离线",

    // toolbar / tags
    "search.placeholder": "按名称、地区、系统、标签筛选…",
    "tags.label": "标签",
    "tags.clear": "清除",

    // card specs / metrics
    "spec.core": "核心",
    "spec.cores": "核心",
    "spec.ram": "内存",
    "spec.disk": "磁盘",
    "card.up": "运行 {v}",
    "metric.load": "负载",
    "metric.mem": "内存",
    "metric.swap": "交换",
    "metric.disk": "磁盘",
    "metric.stg": "存储",
    "metric.cpu": "处理器",
    "metric.gpu": "显卡",
    "net.upload": "上传",
    "net.download": "下载",

    // detail — overview
    "ov.os": "操作系统",
    "ov.cpu": "处理器",
    "ov.mem": "内存",
    "ov.storage": "存储",
    "ov.vcpuCore": "{n} 个 vCPU 核心",
    "ov.vcpuCores": "{n} 个 vCPU 核心",
    "ov.ramSuffix": "{v} 内存",
    "ov.diskSuffix": "{v} 磁盘",

    // detail — header stats
    "dt.uptime": "运行时间",
    "dt.network": "网络",
    "dt.lastSeen": "最后在线",

    // detail — resources
    "res.title": "资源历史",
    "res.sub": "将鼠标悬停在图表上可查看任意时刻的数据",
    "res.loading": "正在加载历史数据…",
    "res.empty": "该时间范围内暂无历史记录。",
    "res.metric.cpu": "处理器",
    "res.metric.mem": "内存",
    "res.metric.swap": "交换",
    "res.metric.disk": "磁盘",
    "res.metric.load": "负载",
    "res.metric.net": "网络",
    "stat.current": "当前",
    "stat.avg": "平均",
    "stat.min": "最小",
    "stat.peak": "峰值",

    // detail — gpu
    "gpu.title": "显卡使用情况",
    "gpu.countTypes": "{n} 块显卡{types}",
    "gpu.typesSuffix": " · {n} 种型号",
    "gpu.inUseFree": "使用中 · {n} 块空闲",
    "gpu.inUse": "{used} / {count} 使用中",
    "gpu.allocated": "已分配 {n}%",
    "gpu.free": "{n} 块空闲",

    // detail — availability
    "avail.title": "可用性",
    "avail.sub": "最近 30 天每日在线率",
    "avail.loading": "加载中…",
    "avail.uptime": "在线率",
    "avail.noData": "暂无可用性数据。",
    "uptime.ago": "{n} 天前",
    "uptime.today": "今天",
    "uptime.noData": "无数据",
    "uptime.dayPct": "在线率 {n}%",
    "avail.incidents": "近期故障",
    "avail.noIncidents": "最近 30 天内无故障。",
    "incident.outage": "连接中断",
    "incident.degraded": "健康检查失败",
    "incident.down": "掉线",
    "incident.up": "恢复连接",
    "incident.stillDown": "仍未恢复",
    "dur.hm": "{h} 小时 {m} 分",
    "dur.m": "{m} 分",

    // footer
    "footer.rights": "版权所有。",
    "footer.source": "在 GitHub 查看源码",

    // relative time (last seen)
    "rel.never": "从未",
    "rel.now": "刚刚",
    "rel.s": "{n} 秒前",
    "rel.m": "{n} 分钟前",
    "rel.hm": "{h} 小时 {m} 分前",
    "rel.d": "{n} 天前",

    // uptime (humanised duration)
    "up.day": "{n} 天",
    "up.days": "{n} 天",
    "up.hour": "{n} 小时",
    "up.hours": "{n} 小时",
    "up.min": "{n} 分钟",
    "up.mins": "{n} 分钟",

    // expiry
    "expiry.daysLeft": "还有{n}天到期",
    "expiry.today": "今天到期",
    "expiry.expired": "已到期{n}天",
    "expiry.board": "服务到期看板",
    "expiry.set": "设置到期时间",
    "expiry.save": "设置",
    "expiry.exit": "退出",
    "expiry.clear": "清除",
    "expiry.start": "开始日期",
    "expiry.end": "到期日期",
    "expiry.progress": "服务进度",
    "expiry.saved": "到期日期已保存",
    "expiry.cleared": "到期日期已清除",
    "expiry.purchaseDate": "购买时间",
    "expiry.setPurchase": "设置购买时间",
    "expiry.purchaseSaved": "购买时间已保存",
    "expiry.purchaseCleared": "购买时间已清除",
    "expiry.saveFailed": "保存失败",

    // expiry alert
    "expiry.alert.title": "即将到期",

    // login
    "login.placeholder": "输入密码",
    "login.submit": "登录",
  },
};

function interpolate(str, vars) {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
}

function translate(lang, key, vars) {
  const table = STRINGS[lang] || STRINGS.en;
  const raw = table[key] != null ? table[key] : (STRINGS.en[key] != null ? STRINGS.en[key] : key);
  return interpolate(raw, vars);
}

/* humanised "last seen" from an epoch-seconds timestamp, in the active language */
function relTime(lang, timeSec, now = Date.now()) {
  if (!timeSec) return translate(lang, "rel.never");
  const s = Math.max(0, Math.floor(now / 1000 - timeSec));
  if (s < 8) return translate(lang, "rel.now");
  if (s < 60) return translate(lang, "rel.s", { n: s });
  const m = Math.floor(s / 60);
  if (m < 60) return translate(lang, "rel.m", { n: m });
  const h = Math.floor(m / 60);
  if (h < 24) return translate(lang, "rel.hm", { h, m: m % 60 });
  return translate(lang, "rel.d", { n: Math.floor(h / 24) });
}

/* humanised uptime from a duration in seconds, in the active language */
function fmtUptime(lang, sec) {
  if (sec == null || !isFinite(sec) || sec < 0) return "—";
  const totalMin = Math.floor(sec / 60);
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const min = totalMin % 60;
  const parts = [];
  if (days) parts.push(translate(lang, days === 1 ? "up.day" : "up.days", { n: days }));
  if (hours) parts.push(translate(lang, hours === 1 ? "up.hour" : "up.hours", { n: hours }));
  parts.push(translate(lang, min === 1 ? "up.min" : "up.mins", { n: min }));
  return parts.join(" ");
}

const I18nCtx = createContext({
  lang: "en",
  setLang: () => {},
  t: (k, v) => translate("en", k, v),
  relTime: (ts) => relTime("en", ts),
  fmtUptime: (sec) => fmtUptime("en", sec),
});

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(detectLang);

  const setLang = useCallback((l) => {
    setLangState(l);
    try { localStorage.setItem(STORE_KEY, l); } catch (e) { /* ignore */ }
    try { document.documentElement.lang = l === "zh" ? "zh-CN" : "en"; } catch (e) { /* ignore */ }
  }, []);

  // keep <html lang> in sync for accessibility / correct font shaping
  useEffect(() => {
    try { document.documentElement.lang = lang === "zh" ? "zh-CN" : "en"; } catch (e) { /* ignore */ }
  }, [lang]);

  const t = useCallback((key, vars) => translate(lang, key, vars), [lang]);
  const rel = useCallback((ts, now) => relTime(lang, ts, now), [lang]);
  const upt = useCallback((sec) => fmtUptime(lang, sec), [lang]);

  return (
    <I18nCtx.Provider value={{ lang, setLang, t, relTime: rel, fmtUptime: upt }}>
      {children}
    </I18nCtx.Provider>
  );
}

export function useI18n() {
  return useContext(I18nCtx);
}

const LangIcon = (p) => (
  <svg viewBox="0 0 20 20" width="18" height="18" fill="currentColor" aria-hidden="true" {...p}>
    <path d="M7.75 2.75a.75.75 0 0 0-1.5 0v1.258a32.987 32.987 0 0 0-3.599.278.75.75 0 1 0 .198 1.487A31.545 31.545 0 0 1 8.7 5.545 19.381 19.381 0 0 1 7 9.56a19.418 19.418 0 0 1-1.002-2.05.75.75 0 0 0-1.384.577 20.935 20.935 0 0 0 1.492 2.91 19.613 19.613 0 0 1-3.828 4.154.75.75 0 1 0 .945 1.164A21.116 21.116 0 0 0 7 12.331c.095.132.192.262.29.391a.75.75 0 0 0 1.194-.91c-.204-.266-.4-.538-.59-.815a20.888 20.888 0 0 0 2.333-5.332c.31.031.618.068.924.108a.75.75 0 0 0 .198-1.487 32.832 32.832 0 0 0-3.599-.278V2.75Z" />
    <path fillRule="evenodd" d="M13 8a.75.75 0 0 1 .671.415l4.25 8.5a.75.75 0 1 1-1.342.67L15.787 16h-5.573l-.793 1.585a.75.75 0 1 1-1.342-.67l4.25-8.5A.75.75 0 0 1 13 8Zm2.037 6.5L13 10.427 10.964 14.5h4.073Z" clipRule="evenodd" />
  </svg>
);
const CheckIcon = (p) => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

/* language switch for the appbar — opens a selectable list (scales past 2 langs) */
export function LangToggle() {
  const { lang, setLang, t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const choose = (code) => { setLang(code); setOpen(false); };

  return (
    <div className="lang" ref={ref}>
      <button
        className={"icon-btn lang-btn" + (open ? " on" : "")}
        title={t("lang.toggle")}
        aria-label={t("lang.toggle")}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <LangIcon />
      </button>
      <div className={"lang-menu" + (open ? " open" : "")} role="listbox">
        {LANGUAGES.map((l) => (
          <button
            key={l.code}
            role="option"
            aria-selected={l.code === lang}
            className={"lang-opt" + (l.code === lang ? " on" : "")}
            onClick={() => choose(l.code)}
          >
            <span className="lang-opt-short">{l.short}</span>
            <span className="lang-opt-label">{l.label}</span>
            {l.code === lang && <CheckIcon className="lang-check" />}
          </button>
        ))}
      </div>
    </div>
  );
}
