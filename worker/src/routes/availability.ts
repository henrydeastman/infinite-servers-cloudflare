import { Hono } from "hono";
import { Env } from "../types";
import { isAuthenticated } from "../auth";
import { getConfig, getServers } from "../kv";
import { getServerAvailability, getServerIncidents } from "../db";

export const availabilityRoute = new Hono<{ Bindings: Env }>();

availabilityRoute.get("/availability", async (c) => {
  const config = await getConfig(c.env);
  if (config.password && !(await isAuthenticated(c, c.env))) {
    return c.json({ error: "unauthorized" }, 401);
  }

  const name = c.req.query("server") || "";
  const maxDays = config["history-days"] || 30;
  const days = Math.max(1, Math.min(parseInt(c.req.query("days") || "30") || 30, maxDays));

  const servers = await getServers(c.env);
  if (!name || !servers[name]) {
    return c.json({ error: "not found" }, 404);
  }

  const avail = await getServerAvailability(c.env, name, days);
  const rawIncidents = await getServerIncidents(c.env, name, days);
  avail.incidents = rawIncidents.map((inc) => ({
    kind: inc.kind,
    at: inc.startTs,
    downMin: inc.downMin,
  }));
  return c.json(avail);
});
