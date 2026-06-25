import { Hono } from "hono";
import { Env } from "../types";
import { isAuthenticated } from "../auth";
import { getConfig } from "../kv";
import { getServerStatus } from "../db";

export const statusRoute = new Hono<{ Bindings: Env }>();

statusRoute.get("/status", async (c) => {
  const config = await getConfig(c.env);
  if (config.password && !(await isAuthenticated(c, c.env))) {
    return c.json({ error: "unauthorized" }, 401);
  }

  const status = await getServerStatus(c.env);
  return c.json(status);
});
