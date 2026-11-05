-- Accounts (Better Auth) and per-user data.
--
-- Every data table gets user_id and a (user_id, id) primary key. Ids only need to be unique per
-- user, so fixed ids ('0', 'transfer', ...) and ids copied from a Cashew backup ('1', '2', ...)
-- never clash between users. Foreign keys include user_id, so a row can only point at rows of
-- the same user.
--
-- Existing rows move to the placeholder user 'legacy'. Give them to a real account with
-- scripts/claim-legacy.ts once that account exists.

PRAGMA defer_foreign_keys = on;

-- ---------- Better Auth (generated with better-auth getMigrations: email + password, passkey, database rate limit) ----------

CREATE TABLE "user" ("id" text not null primary key, "name" text not null, "email" text not null unique, "emailVerified" integer not null, "image" text, "createdAt" date not null, "updatedAt" date not null);
CREATE TABLE "session" ("id" text not null primary key, "expiresAt" date not null, "token" text not null unique, "createdAt" date not null, "updatedAt" date not null, "ipAddress" text, "userAgent" text, "userId" text not null references "user" ("id") on delete cascade);
CREATE TABLE "account" ("id" text not null primary key, "accountId" text not null, "providerId" text not null, "userId" text not null references "user" ("id") on delete cascade, "accessToken" text, "refreshToken" text, "idToken" text, "accessTokenExpiresAt" date, "refreshTokenExpiresAt" date, "scope" text, "password" text, "createdAt" date not null, "updatedAt" date not null);
CREATE TABLE "verification" ("id" text not null primary key, "identifier" text not null, "value" text not null, "expiresAt" date not null, "createdAt" date not null, "updatedAt" date not null);
CREATE TABLE "passkey" ("id" text not null primary key, "name" text, "publicKey" text not null, "userId" text not null references "user" ("id") on delete cascade, "credentialID" text not null, "counter" integer not null, "deviceType" text not null, "backedUp" integer not null, "transports" text, "createdAt" date, "aaguid" text);
CREATE TABLE "rateLimit" ("id" text not null primary key, "key" text not null unique, "count" integer not null, "lastRequest" bigint not null);
CREATE INDEX "session_userId_idx" ON "session" ("userId");
CREATE INDEX "account_userId_idx" ON "account" ("userId");
CREATE INDEX "verification_identifier_idx" ON "verification" ("identifier");
CREATE INDEX "passkey_userId_idx" ON "passkey" ("userId");
CREATE INDEX "passkey_credentialID_idx" ON "passkey" ("credentialID");

-- ---------- exchange rates stay shared; the refresh time moves out of settings ----------

ALTER TABLE rates ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;
UPDATE rates SET updated_at = COALESCE((SELECT CAST(value AS INTEGER) FROM settings WHERE key = 'rates_updated'), 0);

-- ---------- rebuild data tables with user_id ----------

ALTER TABLE wallets RENAME TO old_wallets;
ALTER TABLE categories RENAME TO old_categories;
ALTER TABLE transactions RENAME TO old_transactions;
ALTER TABLE title_rules RENAME TO old_title_rules;
ALTER TABLE settings RENAME TO old_settings;
ALTER TABLE subscriptions RENAME TO old_subscriptions;
ALTER TABLE valuations RENAME TO old_valuations;
ALTER TABLE transfers RENAME TO old_transfers;

-- Amounts are integer minor units (cents/paise). Dates are unix seconds.
CREATE TABLE wallets (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  currency TEXT NOT NULL,            -- lowercase ISO code, e.g. 'eur'
  colour TEXT,
  sort INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  -- How an account counts towards net worth:
  --   bank / cash: balance
  --   credit:      balance is the available credit, so the debt is credit_limit - balance
  --   investment:  balance is the money put in; add the latest recorded gain for market value
  type TEXT NOT NULL DEFAULT 'bank' CHECK (type IN ('bank', 'cash', 'credit', 'investment')),
  credit_limit INTEGER,              -- cents, credit cards only
  PRIMARY KEY (user_id, id)
);

-- Category '0' (balance correction), 'transfer' and 'transfer_fee' exist for every user.
CREATE TABLE categories (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  icon TEXT,                         -- emoji
  income INTEGER NOT NULL DEFAULT 0,
  parent_id TEXT,
  sort INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id, parent_id) REFERENCES categories(user_id, id)
);

-- A subscription is a schedule plus a template. Occurrences are projected from
-- start_day; a transaction row only exists once an occurrence is paid, edited, or skipped.
-- Recurring transfers are subscriptions with a destination account.
CREATE TABLE subscriptions (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  wallet_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  amount INTEGER NOT NULL,                 -- cents, negative = money out
  note TEXT NOT NULL DEFAULT '',
  every INTEGER NOT NULL DEFAULT 1 CHECK (every > 0),
  unit TEXT NOT NULL CHECK (unit IN ('day', 'week', 'month', 'year')),
  start_day TEXT NOT NULL,                 -- 'YYYY-MM-DD', first occurrence of the current schedule
  end_day TEXT,                            -- no occurrences after this day
  auto_pay INTEGER NOT NULL DEFAULT 1,     -- due occurrences are recorded as paid automatically
  kind TEXT NOT NULL DEFAULT 'subscription' CHECK (kind IN ('subscription', 'repetitive')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  to_wallet_id TEXT,
  to_amount INTEGER,                       -- received per payment, destination currency; NULL = same as -amount
  variable INTEGER NOT NULL DEFAULT 0,     -- amount changes each time: ask instead of recording automatically
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id, wallet_id) REFERENCES wallets(user_id, id),
  FOREIGN KEY (user_id, category_id) REFERENCES categories(user_id, id),
  FOREIGN KEY (user_id, to_wallet_id) REFERENCES wallets(user_id, id)
);

-- A transfer moves money between two of your own accounts. It is stored as two rows that share
-- transfer_id: money out of one account (negative) and money in to the other (positive, in that
-- account's currency). Transfers are never income or spending.
CREATE TABLE transactions (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  wallet_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  subcategory_id TEXT,
  name TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  amount INTEGER NOT NULL,           -- negative = money out
  date INTEGER NOT NULL,
  paid INTEGER NOT NULL DEFAULT 1,   -- 0 = upcoming, not counted in balances
  kind TEXT,                         -- NULL | upcoming | subscription | repetitive | credit | debt | skipped
  statement_ref TEXT,                -- set when reconciled against a bank statement row
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  subscription_id TEXT,
  due_day TEXT,                      -- the occurrence this row pays, overrides, or skips (kind = 'skipped')
  transfer_id TEXT,
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id, wallet_id) REFERENCES wallets(user_id, id),
  FOREIGN KEY (user_id, category_id) REFERENCES categories(user_id, id),
  FOREIGN KEY (user_id, subcategory_id) REFERENCES categories(user_id, id),
  FOREIGN KEY (user_id, subscription_id) REFERENCES subscriptions(user_id, id)
);

-- Title -> category hints (Cashew "associated titles"), used for auto-categorising.
CREATE TABLE title_rules (
  user_id TEXT NOT NULL,
  title TEXT NOT NULL COLLATE NOCASE,
  category_id TEXT NOT NULL,
  exact INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, title),
  FOREIGN KEY (user_id, category_id) REFERENCES categories(user_id, id)
);

CREATE TABLE settings (
  user_id TEXT NOT NULL,
  key TEXT NOT NULL,                 -- primary_currency | timezone
  value TEXT NOT NULL,
  PRIMARY KEY (user_id, key)
);

-- Gains of an investment account entered by hand from time to time. Latest by day wins.
CREATE TABLE valuations (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  wallet_id TEXT NOT NULL,
  day TEXT NOT NULL,                 -- 'YYYY-MM-DD'
  gain INTEGER NOT NULL,             -- cents, market value minus money invested on that day
  invested INTEGER NOT NULL,         -- cents invested on that day (for return %)
  note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, id),
  UNIQUE (user_id, wallet_id, day),
  FOREIGN KEY (user_id, wallet_id) REFERENCES wallets(user_id, id) ON DELETE CASCADE
);

-- Extra detail for a transfer (keyed by transactions.transfer_id), mostly for currency exchange.
-- The fee is a separate expense transaction (category 'transfer_fee') so it counts as spending;
-- the transfer's out half is the amount actually converted. fee_tx_id has no foreign key: a
-- composite ON DELETE SET NULL would also null user_id, so the app clears it instead.
CREATE TABLE transfers (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,                          -- = transactions.transfer_id
  fee INTEGER NOT NULL DEFAULT 0,            -- cents, in the sending account's currency
  fee_tx_id TEXT,
  provider TEXT NOT NULL DEFAULT '',         -- Wise, Xe, bank, ...
  market_rate REAL,                          -- public mid-market rate that day: units of `to` per 1 `from`
  PRIMARY KEY (user_id, id)
);

INSERT INTO wallets SELECT 'legacy', id, name, currency, colour, sort, archived, type, credit_limit FROM old_wallets;
INSERT INTO categories SELECT 'legacy', id, name, icon, income, parent_id, sort, archived FROM old_categories;
INSERT INTO subscriptions SELECT 'legacy', id, name, wallet_id, category_id, amount, note, every, unit, start_day, end_day,
  auto_pay, kind, created_at, to_wallet_id, to_amount, variable FROM old_subscriptions;
INSERT INTO transactions SELECT 'legacy', id, wallet_id, category_id, subcategory_id, name, note, amount, date, paid, kind,
  statement_ref, created_at, updated_at, subscription_id, due_day, transfer_id FROM old_transactions;
INSERT INTO title_rules SELECT 'legacy', title, category_id, exact FROM old_title_rules;
INSERT INTO settings SELECT 'legacy', key, value FROM old_settings WHERE key <> 'rates_updated';
INSERT INTO valuations SELECT 'legacy', id, wallet_id, day, gain, invested, note, created_at FROM old_valuations;
INSERT INTO transfers SELECT 'legacy', id, fee, fee_tx_id, provider, market_rate FROM old_transfers;
-- Opening balances use category '0', which older imports may not have.
INSERT OR IGNORE INTO categories (user_id, id, name, icon, income, sort) VALUES ('legacy', '0', 'Balance correction', '⚖️', 0, 997);

DROP TABLE old_transfers;
DROP TABLE old_valuations;
DROP TABLE old_title_rules;
DROP TABLE old_transactions;
DROP TABLE old_subscriptions;
DROP TABLE old_settings;
DROP TABLE old_categories;
DROP TABLE old_wallets;

CREATE INDEX transactions_date ON transactions(user_id, date);
CREATE INDEX transactions_wallet_date ON transactions(user_id, wallet_id, date);
CREATE UNIQUE INDEX transactions_statement_ref ON transactions(user_id, wallet_id, statement_ref);
CREATE UNIQUE INDEX transactions_occurrence ON transactions(user_id, subscription_id, due_day);
CREATE INDEX transactions_transfer ON transactions(user_id, transfer_id);
CREATE INDEX transactions_category ON transactions(user_id, category_id);

PRAGMA defer_foreign_keys = off;
