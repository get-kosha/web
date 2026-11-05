-- Kosha schema.
--
-- Money is integer minor units (cents, paise), negative = money out. Timestamps are unix seconds;
-- days are 'YYYY-MM-DD' strings in the user's time zone.
--
-- Every data table has user_id and a (user_id, id) primary key: ids only need to be unique per user,
-- so fixed ids ('0', 'transfer', ...) and ids copied from a Cashew backup never clash between users.
-- Foreign keys include user_id, so a row can only point at rows of the same user.

-- ---------- Better Auth (email + password, passkey, two-factor, database rate limit) ----------

CREATE TABLE "user" ("id" text not null primary key, "name" text not null, "email" text not null unique, "emailVerified" integer not null, "image" text, "createdAt" date not null, "updatedAt" date not null, "twoFactorEnabled" integer DEFAULT 0);
CREATE TABLE "session" ("id" text not null primary key, "expiresAt" date not null, "token" text not null unique, "createdAt" date not null, "updatedAt" date not null, "ipAddress" text, "userAgent" text, "userId" text not null references "user" ("id") on delete cascade);
CREATE TABLE "account" ("id" text not null primary key, "accountId" text not null, "providerId" text not null, "userId" text not null references "user" ("id") on delete cascade, "accessToken" text, "refreshToken" text, "idToken" text, "accessTokenExpiresAt" date, "refreshTokenExpiresAt" date, "scope" text, "password" text, "createdAt" date not null, "updatedAt" date not null);
CREATE TABLE "verification" ("id" text not null primary key, "identifier" text not null, "value" text not null, "expiresAt" date not null, "createdAt" date not null, "updatedAt" date not null);
CREATE TABLE "passkey" ("id" text not null primary key, "name" text, "publicKey" text not null, "userId" text not null references "user" ("id") on delete cascade, "credentialID" text not null, "counter" integer not null, "deviceType" text not null, "backedUp" integer not null, "transports" text, "createdAt" date, "aaguid" text);
CREATE TABLE "twoFactor" ("id" text not null primary key, "secret" text not null, "backupCodes" text not null, "userId" text not null references "user" ("id") on delete cascade, "verified" integer DEFAULT 1, "failedVerificationCount" integer DEFAULT 0, "lockedUntil" date);
CREATE TABLE "rateLimit" ("id" text not null primary key, "key" text not null unique, "count" integer not null, "lastRequest" bigint not null);
CREATE INDEX "session_userId_idx" ON "session" ("userId");
CREATE INDEX "account_userId_idx" ON "account" ("userId");
CREATE INDEX "verification_identifier_idx" ON "verification" ("identifier");
CREATE INDEX "passkey_userId_idx" ON "passkey" ("userId");
CREATE INDEX "passkey_credentialID_idx" ON "passkey" ("credentialID");
CREATE INDEX "twoFactor_secret_idx" ON "twoFactor" ("secret");
CREATE INDEX "twoFactor_userId_idx" ON "twoFactor" ("userId");

-- ---------- shared ----------

CREATE TABLE rates (
  currency TEXT PRIMARY KEY,                   -- lowercase ISO code, e.g. 'eur'
  per_usd REAL NOT NULL,                       -- units per 1 USD
  updated_at INTEGER NOT NULL DEFAULT 0
);

-- ---------- per user ----------

CREATE TABLE settings (
  user_id TEXT NOT NULL,
  key TEXT NOT NULL,                           -- primary_currency | timezone | theme | ...
  value TEXT NOT NULL,
  PRIMARY KEY (user_id, key)
);

-- How an account counts towards net worth:
--   bank / cash: the balance
--   credit:      the balance is credit left to spend, so the debt is credit_limit - balance
--   investment:  the balance is money put in; add the latest gain in valuations
CREATE TABLE wallets (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  currency TEXT NOT NULL,                      -- lowercase ISO code
  colour TEXT,
  sort INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  type TEXT NOT NULL DEFAULT 'bank' CHECK (type IN ('bank', 'cash', 'credit', 'investment')),
  credit_limit INTEGER,                        -- credit cards only
  PRIMARY KEY (user_id, id)
);

-- '0' (balance correction), 'transfer' and 'transfer_fee' are created for every user at sign-up.
CREATE TABLE categories (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  icon TEXT,                                   -- emoji
  income INTEGER NOT NULL DEFAULT 0,
  parent_id TEXT,
  sort INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id, parent_id) REFERENCES categories(user_id, id)
);

-- A schedule plus a template. Payments are projected from start_day; a transaction row exists only
-- once a payment is paid, edited or skipped. A recurring transfer has a to_wallet_id.
CREATE TABLE subscriptions (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  wallet_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  every INTEGER NOT NULL DEFAULT 1 CHECK (every > 0),
  unit TEXT NOT NULL CHECK (unit IN ('day', 'week', 'month', 'year')),
  start_day TEXT NOT NULL,                     -- first payment of the current schedule
  end_day TEXT,                                -- no payments after this day
  auto_pay INTEGER NOT NULL DEFAULT 1,         -- record due payments as paid automatically
  kind TEXT NOT NULL DEFAULT 'subscription' CHECK (kind IN ('subscription', 'repetitive')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  to_wallet_id TEXT,
  to_amount INTEGER,                           -- received per payment, in to_wallet's currency; NULL = -amount
  variable INTEGER NOT NULL DEFAULT 0,         -- amount changes each time: ask instead of recording
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id, wallet_id) REFERENCES wallets(user_id, id),
  FOREIGN KEY (user_id, category_id) REFERENCES categories(user_id, id),
  FOREIGN KEY (user_id, to_wallet_id) REFERENCES wallets(user_id, id)
);

-- A transfer is two rows sharing transfer_id: out of one account (negative) and into the other
-- (positive, in that account's currency). Transfers are never income or spending.
CREATE TABLE transactions (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  wallet_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  subcategory_id TEXT,
  name TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  amount INTEGER NOT NULL,
  date INTEGER NOT NULL,
  paid INTEGER NOT NULL DEFAULT 1,             -- 0 = upcoming, left out of balances
  kind TEXT,                                   -- NULL | upcoming | subscription | repetitive | credit | debt | skipped
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  subscription_id TEXT,
  due_day TEXT,                                -- the subscription payment this row pays, edits or skips
  transfer_id TEXT,
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id, wallet_id) REFERENCES wallets(user_id, id),
  FOREIGN KEY (user_id, category_id) REFERENCES categories(user_id, id),
  FOREIGN KEY (user_id, subcategory_id) REFERENCES categories(user_id, id),
  FOREIGN KEY (user_id, subscription_id) REFERENCES subscriptions(user_id, id)
);
CREATE INDEX transactions_date ON transactions(user_id, date);
CREATE INDEX transactions_wallet_date ON transactions(user_id, wallet_id, date);
CREATE INDEX transactions_category ON transactions(user_id, category_id);
CREATE INDEX transactions_transfer ON transactions(user_id, transfer_id);
CREATE UNIQUE INDEX transactions_occurrence ON transactions(user_id, subscription_id, due_day);

-- Exchange details for a transfer (id = transactions.transfer_id). The fee is its own expense row in
-- category 'transfer_fee', so it counts as spending. fee_tx_id has no foreign key: a composite
-- ON DELETE SET NULL would also null user_id, so the app clears it instead.
CREATE TABLE transfers (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  fee INTEGER NOT NULL DEFAULT 0,              -- in the sending account's currency
  fee_tx_id TEXT,
  provider TEXT NOT NULL DEFAULT '',           -- Wise, Xe, bank, ...
  market_rate REAL,                            -- mid-market rate that day: units of `to` per 1 `from`
  PRIMARY KEY (user_id, id)
);

-- Investment gains entered by hand. The latest day wins.
CREATE TABLE valuations (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  wallet_id TEXT NOT NULL,
  day TEXT NOT NULL,
  gain INTEGER NOT NULL,                       -- market value minus money invested, on that day
  invested INTEGER NOT NULL,                   -- money invested on that day, for return %
  note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, id),
  UNIQUE (user_id, wallet_id, day),
  FOREIGN KEY (user_id, wallet_id) REFERENCES wallets(user_id, id) ON DELETE CASCADE
);

-- Title -> category hints for auto-categorising. Seeded from Cashew's associated titles, grows with every save.
CREATE TABLE title_rules (
  user_id TEXT NOT NULL,
  title TEXT NOT NULL COLLATE NOCASE,
  category_id TEXT NOT NULL,
  exact INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, title),
  FOREIGN KEY (user_id, category_id) REFERENCES categories(user_id, id)
);
