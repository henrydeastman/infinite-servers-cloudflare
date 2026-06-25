import { Hono } from "hono";
import { Env } from "../types";
import { clearAuthCookie } from "../auth";

export const logoutRoute = new Hono<{ Bindings: Env }>();

logoutRoute.get("/logout", (c) => {
  clearAuthCookie(c);
  return c.redirect("/");
});
