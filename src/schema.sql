-- sunwatch schema

CREATE TABLE IF NOT EXISTS monitors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL,
  interval_sec INTEGER NOT NULL DEFAULT 300,
  expected_status INTEGER NOT NULL DEFAULT 200,
  response_ms_threshold INTEGER,
  webhook_url TEXT,
  state TEXT NOT NULL DEFAULT 'pending', -- pending, active, paused
  payment_amount TEXT,
  payment_currency TEXT,
  payment_tx_hash TEXT,
  paid_until INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_monitors_state ON monitors(state);

CREATE TABLE IF NOT EXISTS checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  monitor_id INTEGER NOT NULL,
  status_code INTEGER,
  response_ms INTEGER,
  up INTEGER NOT NULL,
  checked_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (monitor_id) REFERENCES monitors(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_checks_monitor_time ON checks(monitor_id, checked_at);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  monitor_id INTEGER,
  tx_hash TEXT,
  amount TEXT,
  currency TEXT,
  block_number INTEGER,
  confirmed_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_payments_tx ON payments(tx_hash);
