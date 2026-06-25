import { Hono } from "hono";
import { Env } from "../types";
import { isAuthenticated } from "../auth";
import { getConfig } from "../kv";
import { getServerInfo } from "../db";

export const serversRoute = new Hono<{ Bindings: Env }>();

serversRoute.get("/servers", async (c) => {
  const config = await getConfig(c.env);
  if (config.password && !(await isAuthenticated(c, c.env))) {
    return c.json({ error: "unauthorized" }, 401);
  }

  const info = await getServerInfo(c.env);
  return c.json(info);
});
