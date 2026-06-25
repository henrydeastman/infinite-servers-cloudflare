import { Hono } from "hono";
import { Env } from "../types";
import { clearAuthCookie, invalidateToken } from "../auth";

export const logoutRoute = new Hono<{ Bindings: Env }>();

logoutRoute.get("/logout", async (c) => {
  const auth = c.req.header("Authorization") ?? "";
  if (auth.startsWith("Bearer ")) {
    await invalidateToken(c.env, auth.slice(7));
  }
  const cookie = c.req.header("Cookie") ?? "";
  const match = cookie.match(/is_auth=([^;]+)/);
  if (match && match[1] !== "1") {
    await invalidateToken(c.env, match[1]);
  }
  clearAuthCookie(c);
  return c.redirect("/");
});
