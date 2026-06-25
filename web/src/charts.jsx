/* ============================================================
   Detail-page chart primitives (pure SVG, theme-aware).
   ============================================================ */
import React, { useState, useRef, useEffect, useId } from "react";
import { useI18n } from "./i18n.jsx";

/* measure container width for crisp (non-distorted) SVG text */
function useMeasure() {
  const ref = useRef(null);
  const [w, setW] = useState(680);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((es) => setW(es[0].contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

const linePath = (data, x, y) =>
  data.map((d, i) => (i ? "L" : "M") + x(i).toFixed(1) + " " + y(d.v).toFixed(1)).join(" ");
const areaPath = (data, x, y, y0) =>
  linePath(data, x, y) + " L" + x(data.length - 1).toFixed(1) + " " + y0.toFixed(1) +
  " L" + x(0).toFixed(1) + " " + y0.toFixed(1) + " Z";

/* ------------------------------------------------------------------ */
export function AreaChart({ series, yMax, height = 248, fmt = (v) => v + "%", axisFmt }) {
  const [ref, w] = useMeasure();
  const [hi, setHi] = useState(null);
  const uid = useId().replace(/:/g, "");
  axisFmt = axisFmt || fmt;

  const PL = 46, PR = 16, PT = 16, PB = 26;
  const plotW = Math.max(10, w - PL - PR);
  const plotH = height - PT - PB;
  const n = series[0].data.length;

  const dataMax = Math.max(1, ...series.flatMap((s) => s.data.map((d) => d.v)));
  const maxV = yMax != null ? yMax : niceMax(dataMax * 1.12);

  const x = (i) => PL + (n <= 1 ? 0 : (i / (n - 1)) * plotW);
  const y = (v) => PT + plotH - (v / maxV) * plotH;
  const y0 = PT + plotH;

  const grid = [0, 0.25, 0.5, 0.75, 1];
  const tickIdx = pickTicks(n, series[0].data, 6);

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    let i = Math.round(((mx - PL) / plotW) * (n - 1));
    i = Math.max(0, Math.min(n - 1, i));
    setHi(i);
  };

  const tip = hi != null;
  const tipLeft = tip ? Math.min(Math.max(x(hi), 70), w - 70) : 0;

  return (
    <div className="chart" ref={ref} style={{ position: "relative" }}>
      <svg width={w} height={height} onMouseMove={onMove} onMouseLeave={() => setHi(null)} style={{ display: "block" }}>
        <defs>
          {series.map((s, si) => (
            <linearGradient key={si} id={`g${uid}-${si}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity="0.28" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>

        {/* gridlines + y labels */}
        {grid.map((g, i) => {
          const yy = PT + plotH - g * plotH;
          return (
            <g key={i}>
              <line x1={PL} y1={yy} x2={w - PR} y2={yy} stroke="var(--chart-grid)" strokeWidth="1" />
              <text x={PL - 9} y={yy + 3.5} textAnchor="end" className="chart-axis">{axisFmt(round1(maxV * g))}</text>
            </g>
          );
        })}

        {/* x labels */}
        {tickIdx.map((i) => (
          <text key={i} x={x(i)} y={height - 8} textAnchor="middle" className="chart-axis">{series[0].data[i].label}</text>
        ))}

        {/* series */}
        {series.map((s, si) => (
          <g key={si}>
            <path className="cl-area" d={areaPath(s.data, x, y, y0)} fill={`url(#g${uid}-${si})`} />
            <path className="cl-draw" pathLength="1" d={linePath(s.data, x, y)} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          </g>
        ))}

        {/* hover */}
        {tip && (
          <g>
            <line x1={x(hi)} y1={PT} x2={x(hi)} y2={y0} stroke="var(--chart-cross)" strokeWidth="1" strokeDasharray="3 3" />
            {series.map((s, si) => (
              <circle key={si} cx={x(hi)} cy={y(s.data[hi].v)} r="3.5" fill="var(--surface)" stroke={s.color} strokeWidth="2" />
            ))}
          </g>
        )}
      </svg>

      {tip && (
        <div className="chart-tip" style={{ left: tipLeft }}>
          <div className="chart-tip-t">{series[0].data[hi].label}</div>
          {series.map((s, si) => (
            <div className="chart-tip-r" key={si}>
              <span className="chart-tip-dot" style={{ background: s.color }} />
              <span className="chart-tip-k">{s.key}</span>
              <span className="chart-tip-v">{fmt(s.data[hi].v)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function niceMax(v) {
  if (v <= 100 && v > 60) return 100;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / pow;
  const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nf * pow;
}
function round1(v) { return Math.round(v * 10) / 10; }
function pickTicks(n, data, want) {
  const step = Math.max(1, Math.round((n - 1) / (want - 1)));
  const out = [];
  for (let i = 0; i < n; i += step) out.push(i);
  const last = out[out.length - 1];
  if (last !== n - 1) {
    if (n - 1 - last < step * 0.6) out[out.length - 1] = n - 1;
    else out.push(n - 1);
  }
  return out;
}

/* ------------------------------------------------------------------ */
export function Sparkline({ data, color, height = 36 }) {
  const vals = data.map((d) => (typeof d === "number" ? d : d.v));
  const n = vals.length;
  const maxV = Math.max(1, ...vals) * 1.15;
  const x = (i) => (n <= 1 ? 0 : (i / (n - 1)) * 100);
  const y = (v) => height - (v / maxV) * height;
  const line = vals.map((v, i) => (i ? "L" : "M") + x(i).toFixed(2) + " " + y(v).toFixed(2)).join(" ");
  const area = line + ` L100 ${height} L0 ${height} Z`;
  const uid = useId().replace(/:/g, "");
  return (
    <svg className="spark" viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" width="100%" height={height}>
      <defs>
        <linearGradient id={`s${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#s${uid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Calculate color based on uptime percentage: red (0%) -> yellow (50%) -> green (100%) */
function uptimeColor(pct) {
  if (pct === null || pct === undefined) return "var(--track)"; // nodata
  const p = Math.max(0, Math.min(100, pct));
  // HSL: 0° = red, 60° = yellow, 120° = green
  const hue = (p / 100) * 120;
  return `hsl(${hue}, 70%, 45%)`;
}

export function UptimeStrip({ days }) {
  const { t, lang } = useI18n();
  const locale = lang === "zh" ? "zh-CN" : "en";
  return (
    <div className="uptime">
      <div className="uptime-bars">
        {days.map((d, i) => (
          <span
            key={i}
            className="ub"
            style={{ background: uptimeColor(d.pct) }}
            title={`${d.date.toLocaleDateString(locale, { month: "short", day: "numeric" })} · ${d.status === "nodata" ? t("uptime.noData") : t("uptime.dayPct", { n: d.pct })}`}
          />
        ))}
      </div>
      <div className="uptime-foot">
        <span>{t("uptime.ago", { n: days.length })}</span>
        <span>{t("uptime.today")}</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
export function MeterBar({ label, sub, value, unit = "%", max = 100, color }) {
  const crit = unit === "%" && value >= 85;
  const c = color || (crit ? "var(--accent)" : "var(--bar)");
  return (
    <div className="meter">
      <div className="meter-top">
        <span className="meter-label">{label}{sub && <i> {sub}</i>}</span>
        <span className="meter-val">{value}{unit === "%" ? "%" : " " + unit}</span>
      </div>
      <div className="meter-bar"><i style={{ width: Math.min(100, (value / max) * 100) + "%", background: c }} /></div>
    </div>
  );
}
