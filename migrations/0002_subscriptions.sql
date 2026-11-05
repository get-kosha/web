-- A subscription is a schedule plus a template. Occurrences are projected from
-- start_day; a transaction row only exists once an occurrence is paid, edited, or skipped.
CREATE TABLE subscriptions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  wallet_id TEXT NOT NULL REFERENCES wallets(id),
  category_id TEXT NOT NULL REFERENCES categories(id),
  amount INTEGER NOT NULL,                 -- cents, negative = money out
  note TEXT NOT NULL DEFAULT '',
  every INTEGER NOT NULL DEFAULT 1 CHECK (every > 0),
  unit TEXT NOT NULL CHECK (unit IN ('day', 'week', 'month', 'year')),
  start_day TEXT NOT NULL,                 -- 'YYYY-MM-DD', first occurrence of the current schedule
  end_day TEXT,                            -- no occurrences after this day
  auto_pay INTEGER NOT NULL DEFAULT 1,     -- due occurrences are recorded as paid automatically
  kind TEXT NOT NULL DEFAULT 'subscription' CHECK (kind IN ('subscription', 'repetitive')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

ALTER TABLE transactions ADD COLUMN subscription_id TEXT REFERENCES subscriptions(id);
ALTER TABLE transactions ADD COLUMN due_day TEXT;  -- the occurrence this row pays, overrides, or skips (kind = 'skipped')
CREATE UNIQUE INDEX transactions_occurrence ON transactions(subscription_id, due_day);
