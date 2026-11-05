-- Amounts are integer minor units (cents/paise). Dates are unix seconds.
CREATE TABLE wallets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  currency TEXT NOT NULL,            -- lowercase ISO code, e.g. 'eur'
  colour TEXT,
  sort INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT,                         -- emoji
  income INTEGER NOT NULL DEFAULT 0,
  parent_id TEXT REFERENCES categories(id),
  sort INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0
);

-- category '0' is reserved for transfers and balance corrections (excluded from income/expense).
CREATE TABLE transactions (
  id TEXT PRIMARY KEY,
  wallet_id TEXT NOT NULL REFERENCES wallets(id),
  category_id TEXT NOT NULL REFERENCES categories(id),
  subcategory_id TEXT REFERENCES categories(id),
  name TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  amount INTEGER NOT NULL,           -- negative = money out
  date INTEGER NOT NULL,
  paid INTEGER NOT NULL DEFAULT 1,   -- 0 = upcoming, not counted in balances
  kind TEXT,                         -- NULL | upcoming | subscription | repetitive | credit | debt
  statement_ref TEXT,                -- set when reconciled against a bank statement row
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX transactions_date ON transactions(date);
CREATE INDEX transactions_wallet_date ON transactions(wallet_id, date);
CREATE UNIQUE INDEX transactions_statement_ref ON transactions(wallet_id, statement_ref);

-- Title -> category hints (Cashew "associated titles"), used for auto-categorising.
CREATE TABLE title_rules (
  title TEXT PRIMARY KEY COLLATE NOCASE,
  category_id TEXT NOT NULL REFERENCES categories(id),
  exact INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE rates (
  currency TEXT PRIMARY KEY,
  per_usd REAL NOT NULL
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT INTO settings (key, value) VALUES ('primary_currency', 'eur'), ('timezone', 'Europe/Berlin'), ('rates_updated', '0');
