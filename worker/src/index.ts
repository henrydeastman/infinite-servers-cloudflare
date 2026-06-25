import { Hono } from "hono";
import { Env } from "./types";
import { getWorkerGeo } from "./geo";
import { runCronCheck } from "./cron";
import { loginRoute } from "./routes/login";
import { logoutRoute } from "./routes/logout";
import { serversRoute } from "./routes/servers";
import { statusRoute } from "./routes/status";
import { historyRoute } from "./routes/history";
import { availabilityRoute } from "./routes/availability";
import { pushRoute } from "./routes/push";
import { setExpiryRoute } from "./routes/set-expiry";
import { setPurchaseDateRoute } from "./routes/set-purchase-date";
import { doodleRoute } from "./routes/doodle";

const app = new Hono<{ Bindings: Env }>();

function matchOrigin(origin: string, allowed: string[]): boolean {
  const u = new URL(origin);
  for (const pattern of allowed) {
    if (pattern.startsWith("*.")) {
      const suffix = pattern.slice(1);
      if (u.hostname.endsWith(suffix)) return true;
    } else if (u.origin === pattern) {
      return true;
    }
  }
  return false;
}

app.use("*", async (c, next) => {
  const origin = c.req.header("Origin") ?? "";
  const allowedRaw = (c.env as any).CORS_ORIGINS as string | undefined;
  const allowed = allowedRaw
    ? allowedRaw.split(",").map((s) => s.trim())
    : ["*.pages.dev", "*.workers.dev"];

  if (origin && matchOrigin(origin, allowed)) {
    c.header("Access-Control-Allow-Origin", origin);
    c.header("Vary", "Origin");
  }
  c.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  c.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  c.header("Access-Control-Max-Age", "86400");

  if (c.req.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }
  await next();
});

app.get("/geo", async (c) => {
  try {
    const geo = await getWorkerGeo(c.env);
    return c.json(geo ?? { error: "geo not available" });
  } catch (e: any) {
    return c.json({ error: e?.message || "geo lookup failed" }, 500);
  }
});

app.route("/", loginRoute);
app.route("/", logoutRoute);
app.route("/", serversRoute);
app.route("/", statusRoute);
app.route("/", historyRoute);
app.route("/", availabilityRoute);
app.route("/", pushRoute);
app.route("/", setExpiryRoute);
app.route("/", setPurchaseDateRoute);
app.route("/", doodleRoute);

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Env) {
    await getWorkerGeo(env);
    await runCronCheck(env);
  },
};