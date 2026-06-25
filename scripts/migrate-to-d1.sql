CREATE TABLE IF NOT EXISTS server_info (
  server  TEXT PRIMARY KEY,
  data    TEXT    NOT NULL,
  updated INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS server_status (
  server  TEXT PRIMARY KEY,
  data    TEXT    NOT NULL,
  updated INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS history (
  server   TEXT    NOT NULL,
  ts       INTEGER NOT NULL,
  load1    REAL,
  mem_pct  REAL,
  disk_pct REAL,
  net_rx   INTEGER,
  net_tx   INTEGER,
  cpu_pct  REAL,
  swap_pct REAL,
  PRIMARY KEY (server, ts)
);

CREATE TABLE IF NOT EXISTS login_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip TEXT NOT NULL,
  ts INTEGER NOT NULL,
  success INTEGER NOT NULL DEFAULT 0,
  password_hash TEXT
);

CREATE INDEX IF NOT EXISTS idx_login_logs_ip_ts ON login_logs(ip, ts);

CREATE TABLE IF NOT EXISTS ip_bans (
  ip TEXT PRIMARY KEY,
  banned_until INTEGER NOT NULL
);
