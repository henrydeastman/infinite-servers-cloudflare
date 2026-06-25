import { Hono } from "hono";
import { Env } from "../types";
import { getServers, getConfig } from "../kv";
import { isAuthenticated } from "../auth";
import { saveServerExpiry } from "../db";

export const setExpiryRoute = new Hono<{ Bindings: Env }>();

setExpiryRoute.post("/set-expiry", async (c) => {
  const config = await getConfig(c.env);
  if (config.password && !(await isAuthenticated(c, c.env))) {
    return c.json({ error: "unauthorized" }, 401);
  }

  const body = await c.req.parseBody();
  const name = (body.name as string) || "";
  const expiry = (body.expiry as string) || "";

  if (!name) return c.json({ error: "name is required" }, 400);

  const servers = await getServers(c.env);
  if (!servers[name]) return c.json({ error: "server not found" }, 404);

  if (expiry && !/^\d{4}-\d{2}-\d{2}$/.test(expiry)) {
    return c.json({ error: "expiry must be YYYY-MM-DD or empty" }, 400);
  }

  const ok = await saveServerExpiry(c.env, name, expiry || null);
  if (!ok) return c.json({ error: "failed to save expiry" }, 500);

  return c.json({ ok: true, name, expiry });
});
