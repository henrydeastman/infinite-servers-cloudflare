import { Hono } from "hono";
import { Env } from "../types";
import { getServers, getConfig } from "../kv";
import { isAuthenticated } from "../auth";
import { saveServerPurchaseDate } from "../db";

export const setPurchaseDateRoute = new Hono<{ Bindings: Env }>();

setPurchaseDateRoute.post("/set-purchase-date", async (c) => {
  const config = await getConfig(c.env);
  if (config.password && !(await isAuthenticated(c, c.env))) {
    return c.json({ error: "unauthorized" }, 401);
  }

  const body = await c.req.parseBody();
  const name = (body.name as string) || "";
  const purchaseDate = (body.purchase_date as string) || "";

  if (!name) return c.json({ error: "name is required" }, 400);

  const servers = await getServers(c.env);
  if (!servers[name]) return c.json({ error: "server not found" }, 404);

  if (purchaseDate && !/^\d{4}-\d{2}-\d{2}$/.test(purchaseDate)) {
    return c.json({ error: "purchase_date must be YYYY-MM-DD or empty" }, 400);
  }

  const ok = await saveServerPurchaseDate(c.env, name, purchaseDate || null);
  if (!ok) return c.json({ error: "failed to save purchase_date" }, 500);

  return c.json({ ok: true, name, purchase_date: purchaseDate });
});
