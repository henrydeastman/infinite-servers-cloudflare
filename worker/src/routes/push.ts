import { Hono } from "hono";
import { Env } from "../types";
import { getServers } from "../kv";
import { saveServerInfo, saveServerStatus } from "../db";

export const pushRoute = new Hono<{ Bindings: Env }>();

function unflattenFields(body: Record<string, string>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (k === "name" || k === "token") continue;
    // Check for nested field like "cpuinfo[model]" or "meminfo[memTotal]"
    const m = k.match(/^(\w+)\[(\w+)\]$/);
    if (m) {
      const [, parent, child] = m;
      if (!result[parent]) result[parent] = {};
      (result[parent] as Record<string, unknown>)[child] = v;
    } else {
      result[k] = v;
    }
  }
  return result;
}

pushRoute.post("/push", async (c) => {
  const body = await c.req.parseBody();
  const name = body.name as string;
  const token = body.token as string;

  const servers = await getServers(c.env);
  if (!name || !token || !servers[name] || servers[name].token !== token) {
    return c.json({ error: "forbidden" }, 403);
  }

  const data = unflattenFields(body as Record<string, string>);

  if (body.time) {
    data.time = Number(body.time);
    await saveServerStatus(c.env, name, data);
  } else {
    await saveServerInfo(c.env, name, data);
  }

  return c.json({ ok: true });
});
