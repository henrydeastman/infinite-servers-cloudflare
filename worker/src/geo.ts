import { Env } from "./types";

const GEO_KEY = "worker_geo";
const GEO_TTL = 24 * 60 * 60 * 1000;

export interface GeoInfo {
  ip: string;
  country: string;
  countryCode: string;
  region: string;
  city: string;
  lat: number;
  lon: number;
  timezone: string;
  isp: string;
  queriedAt: string;
}

export async function getWorkerGeo(env: Env): Promise<GeoInfo | null> {
  const cached = await env.CONFIG.get(GEO_KEY, "json");
  if (cached) {
    const age = Date.now() - new Date(cached.queriedAt).getTime();
    if (age < GEO_TTL) return cached;
  }

  const ipResp = await fetch("https://api.ipify.org?format=json");
  const { ip } = await ipResp.json<{ ip: string }>();

  const geoResp = await fetch(`https://ipinfo.io/${ip}/json`);
  const text = await geoResp.text();
  let geo: any;
  try { geo = JSON.parse(text); } catch { return cached; }

  if (!geo.country) return cached;

  const [lat, lon] = (geo.loc || "0,0").split(",").map(Number);

  const info: GeoInfo = {
    ip,
    country: geo.country,
    countryCode: geo.country,
    region: geo.region || "",
    city: geo.city || "",
    lat: lat || 0,
    lon: lon || 0,
    timezone: geo.timezone || "",
    isp: geo.org || "",
    queriedAt: new Date().toISOString(),
  };

  await env.CONFIG.put(GEO_KEY, JSON.stringify(info));
  return info;
}
