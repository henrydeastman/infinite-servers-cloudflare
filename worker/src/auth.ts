import type { Context } from "hono";
import type { Env } from "./types";

const COOKIE_NAME = "is_auth";
const TOKEN_STORE_KEY = "auth_tokens";

export function getClientIP(c: Context): string {
  const cfIP = c.req.header("CF-Connecting-IP");
  if (cfIP) return cfIP;

  const xRealIP = c.req.header("X-Real-IP");
  if (xRealIP) return xRealIP;

  const xForwardedFor = c.req.header("X-Forwarded-For");
  if (xForwardedFor) {
    return xForwardedFor.split(",")[0].trim();
  }

  return "0.0.0.0";
}

export async function isIPBanned(
  env: Env,
  ip: string,
): Promise<{ banned: boolean; remaining: number }> {
  const now = Math.floor(Date.now() / 1000);

  const banRow = await env.DB.prepare(
    "SELECT banned_until FROM ip_bans WHERE ip = ? AND banned_until > ?",
  )
    .bind(ip, now)
    .first<{ banned_until: number }>();

  if (banRow) {
    return { banned: true, remaining: 0 };
  }

  const hourAgo = now - 3600;
  const countRow = await env.DB.prepare(
    "SELECT COUNT(*) AS cnt FROM login_logs WHERE ip = ? AND success = 0 AND ts >= ?",
  )
    .bind(ip, hourAgo)
    .first<{ cnt: number }>();

  const failCount = countRow?.cnt ?? 0;
  const remaining = 10 - failCount;

  if (failCount >= 10) {
    const bannedUntil = now + 30 * 86400;
    await env.DB.prepare(
      "INSERT OR REPLACE INTO ip_bans (ip, banned_until) VALUES (?, ?)",
    )
      .bind(ip, bannedUntil)
      .run();
    return { banned: true, remaining: 0 };
  }

  return { banned: false, remaining };
}

export async function logLoginAttempt(
  env: Env,
  ip: string,
  success: boolean,
  password: string,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const hash = success ? crypto.randomUUID() : null;

  await env.DB.prepare(
    "INSERT INTO login_logs (ip, ts, success, password_hash) VALUES (?, ?, ?, ?)",
  )
    .bind(ip, now, success ? 1 : 0, hash)
    .run();
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomUUID().replace(/-/g, "");
  const data = new TextEncoder().encode(salt + password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashHex = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return salt + ":" + hashHex;
}

export async function verifyPassword(
  input: string,
  stored: string,
): Promise<boolean> {
  if (!input) return false;

  if (stored.includes(":")) {
    const [salt, expectedHash] = stored.split(":", 2);
    const data = new TextEncoder().encode(salt + input);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    return hashHex === expectedHash;
  }

  return input === stored;
}

export async function isAuthenticated(c: Context, env: Env): Promise<boolean> {
  // Check Bearer token in Authorization header
  const auth = c.req.header("Authorization") ?? "";
  if (auth.startsWith("Bearer ")) {
    const token = auth.slice(7);
    return await validateToken(env, token);
  }

  // Fallback: check cookie — validate against KV like Bearer
  const cookie = c.req.header("Cookie") ?? "";
  const match = cookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  if (!match) return false;
  const token = match[1];
  if (token === "1") return false;
  return await validateToken(env, token);
}

export async function generateToken(env: Env): Promise<string> {
  const token = crypto.randomUUID();
  const expires = Date.now() + 7 * 86400 * 1000;
  const tokens: Record<string, number> = await env.CONFIG.get(TOKEN_STORE_KEY, "json") ?? {};
  tokens[token] = expires;
  await env.CONFIG.put(TOKEN_STORE_KEY, JSON.stringify(tokens));
  return token;
}

export async function validateToken(env: Env, token: string): Promise<boolean> {
  const tokens: Record<string, number> = await env.CONFIG.get(TOKEN_STORE_KEY, "json") ?? {};
  const expires = tokens[token];
  if (!expires) return false;
  if (Date.now() > expires) {
    delete tokens[token];
    await env.CONFIG.put(TOKEN_STORE_KEY, JSON.stringify(tokens));
    return false;
  }
  return true;
}

export async function invalidateToken(env: Env, token: string): Promise<void> {
  const tokens: Record<string, number> = await env.CONFIG.get(TOKEN_STORE_KEY, "json") ?? {};
  if (tokens[token] !== undefined) {
    delete tokens[token];
    await env.CONFIG.put(TOKEN_STORE_KEY, JSON.stringify(tokens));
  }
}

export function setAuthCookie(
  c: Context,
  value: string,
  maxAge: number,
): void {
  const expires = new Date(Date.now() + maxAge * 1000).toUTCString();
  c.header(
    "Set-Cookie",
    `${COOKIE_NAME}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}; Expires=${expires}`,
    { append: true },
  );
}

export function clearAuthCookie(c: Context): void {
  c.header(
    "Set-Cookie",
    `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`,
    { append: true },
  );
}

export async function ensureAuthTables(env: Env): Promise<void> {
  await env.DB.exec(`
    CREATE TABLE IF NOT EXISTS login_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ip TEXT NOT NULL,
      ts INTEGER NOT NULL,
      success INTEGER NOT NULL DEFAULT 0,
      password_hash TEXT
    )
  `);
  await env.DB.exec(
    "CREATE INDEX IF NOT EXISTS idx_login_logs_ip_ts ON login_logs(ip, ts)",
  );
  await env.DB.exec(`
    CREATE TABLE IF NOT EXISTS ip_bans (
      ip TEXT PRIMARY KEY,
      banned_until INTEGER NOT NULL
    )
  `);
}
