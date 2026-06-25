import { Hono } from "hono";
import { Env } from "../types";
import { isAuthenticated } from "../auth";
import { getConfig, getServers } from "../kv";
import { getServerHistory } from "../db";

export const historyRoute = new Hono<{ Bindings: Env }>();

historyRoute.get("/history", async (c) => {
  const config = await getConfig(c.env);
  if (config.password && !(await isAuthenticated(c, c.env))) {
    return c.json({ error: "unauthorized" }, 401);
  }

  const name = c.req.query("server") || "";
  const maxHours = (config["history-days"] || 7) * 24;
  const hours = Math.min(parseInt(c.req.query("hours") || "24") || 24, maxHours);

  const servers = await getServers(c.env);
  if (!name || !servers[name]) {
    return c.json({ error: "not found" }, 404);
  }

  const history = await getServerHistory(c.env, name, hours);
  return c.json(history);
});
