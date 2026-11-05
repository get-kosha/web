-- How an account counts towards net worth:
--   bank / cash: balance
--   credit:      balance is the available credit, so the debt is credit_limit - balance
--   investment:  balance is the money put in; add the latest recorded gain for market value
ALTER TABLE wallets ADD COLUMN type TEXT NOT NULL DEFAULT 'bank' CHECK (type IN ('bank', 'cash', 'credit', 'investment'));
ALTER TABLE wallets ADD COLUMN credit_limit INTEGER;  -- cents, credit cards only

-- Gains of an investment account entered by hand from time to time. Latest by day wins.
CREATE TABLE valuations (
  id TEXT PRIMARY KEY,
  wallet_id TEXT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  day TEXT NOT NULL,                 -- 'YYYY-MM-DD'
  gain INTEGER NOT NULL,             -- cents, market value minus money invested on that day
  invested INTEGER NOT NULL,         -- cents invested on that day (for return %)
  note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (wallet_id, day)
);
