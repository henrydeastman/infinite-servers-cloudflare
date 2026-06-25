export interface Env {
  DB: D1Database;
  CONFIG: KVNamespace;
  SSE_ENABLED: string;
  INTERVAL: string;
  HISTORY_DAYS: string;
  HISTORY_INTERVAL: string;
  PASSWORD?: string;
}

export interface ServerConfig {
  region?: string;
  location?: string;
  tags?: string[];
  token: string;
  url?: string;
  ip_mask?: string;
  expiry?: string;
  purchase_date?: string;
}

export interface ServersFile {
  servers: Record<string, ServerConfig>;
}

export interface GlobalConfig {
  password?: string;
  sse: boolean;
  interval: number;
  "history-interval": number;
  "history-days": number;
}

export interface ServerData {
  server: string;
  data: string;
  updated: number;
}

export interface HistoryRow {
  server: string;
  ts: number;
  load1: number | null;
  mem_pct: number | null;
  disk_pct: number | null;
  net_rx: number | null;
  net_tx: number | null;
  cpu_pct: number | null;
  swap_pct: number | null;
}