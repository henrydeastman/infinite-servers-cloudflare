import { Hono } from "hono";
import { cors } from "hono/cors";
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

app.use("*", cors({
  origin: "*",
  allowMethods: ["GET", "POST", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
  exposeHeaders: ["Set-Cookie"],
}));

app.get("/geo", async (c) => {
  try {
    const geo = await getWorkerGeo(c.env);
    return c.json(geo ?? { error: "geo not available" });
  } catch (e: any) {
    return c.json({ error: e?.message || String(e), stack: e?.stack }, 500);
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