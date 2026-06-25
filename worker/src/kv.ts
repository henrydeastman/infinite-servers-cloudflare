import { Env, GlobalConfig, ServersFile, ServerConfig } from "./types";

const CONFIG_KEY = "config.json";
const SERVERS_KEY = "servers.json";

const DEFAULT_CONFIG: GlobalConfig = {
  sse: false,
  interval: 5,
  "history-interval": 5,
  "history-days": 30,
};

export async function getConfig(env: Env): Promise<GlobalConfig> {
  const raw = await env.CONFIG.get<Partial<GlobalConfig>>(CONFIG_KEY, "json");
  if (!raw) return DEFAULT_CONFIG;
  return {
    sse: raw.sse ?? false,
    interval: raw.interval ?? 5,
    "history-interval": raw["history-interval"] ?? 5,
    "history-days": raw["history-days"] ?? 30,
    password: raw.password,
  };
}

export async function getServers(env: Env): Promise<Record<string, ServerConfig>> {
  const raw = await env.CONFIG.get<ServersFile>(SERVERS_KEY, "json");
  return raw?.servers ?? {};
}

export async function getPassword(env: Env): Promise<string | undefined> {
  const config = await getConfig(env);
  return config.password;
}
