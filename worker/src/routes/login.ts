import { Hono } from "hono";
import { Env } from "../types";
import {
  getClientIP,
  isIPBanned,
  logLoginAttempt,
  verifyPassword,
  generateToken,
} from "../auth";
import { getPassword } from "../kv";

export const loginRoute = new Hono<{ Bindings: Env }>();

loginRoute.post("/login", async (c) => {
  const ip = getClientIP(c);
  const { banned, remaining } = await isIPBanned(c.env, ip);
  if (banned) {
    return c.json({ error: "访问被禁止，请稍后再试" }, 403);
  }

  const body = await c.req.parseBody();
  const pw = (body.password as string) || "";
  const password = await getPassword(c.env);

  if (!password) {
    await logLoginAttempt(c.env, ip, true, pw);
    const token = await generateToken(c.env);
    return c.json({ ok: true, token });
  }

  if (await verifyPassword(pw, password)) {
    await logLoginAttempt(c.env, ip, true, pw);
    const token = await generateToken(c.env);
    return c.json({ ok: true, token });
  }

  await logLoginAttempt(c.env, ip, false, pw);
  let msg = "密码错误";
  if (remaining <= 3 && remaining > 0) {
    msg += `，还剩 ${remaining} 次尝试机会`;
  }
  return c.json({ error: msg }, 401);
});
