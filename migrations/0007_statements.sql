-- Reconciliation, statement import and recurring detection.

-- The reconciliation that checked this row against a bank statement. NULL until then.
ALTER TABLE transactions ADD COLUMN reconciled_id TEXT;
-- The bank's own id for an imported line (OFX FITID, or a hash of its day, amount and text), so importing the same
-- statement again finds it.
ALTER TABLE transactions ADD COLUMN bank_ref TEXT;
CREATE INDEX transactions_bank_ref ON transactions(user_id, wallet_id, bank_ref);

-- One finished reconciliation: on statement_day the account matched the statement's closing balance.
CREATE TABLE reconciliations (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  wallet_id TEXT NOT NULL,
  statement_day TEXT NOT NULL,   -- YYYY-MM-DD
  balance INTEGER NOT NULL,      -- the closing balance as Kosha keeps it (available credit for cards)
  credit_limit INTEGER,          -- a card's limit then, so what was owed stays right if the limit changes
  entries INTEGER NOT NULL,      -- how many transactions it checked
  adjustment INTEGER NOT NULL DEFAULT 0, -- a correction added to close a difference, in cents
  adjustment_tx_id TEXT,         -- that correction's transaction, removed again if the reconciliation is undone
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, id)
);
CREATE INDEX reconciliations_wallet ON reconciliations(user_id, wallet_id, statement_day);

-- How to read a bank's CSV, keyed by its header row, so the second import from a bank needs no setup.
CREATE TABLE import_layouts (
  user_id TEXT NOT NULL,
  signature TEXT NOT NULL,
  layout TEXT NOT NULL,          -- JSON, see Layout in src/lib/statement.ts
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, signature)
);

-- The payee a bank description stands for ("card payment to tesco stores" is Tesco), learned from imports.
CREATE TABLE payee_aliases (
  user_id TEXT NOT NULL,
  descriptor TEXT NOT NULL,      -- descriptorKey() of the bank's text
  payee TEXT NOT NULL,
  PRIMARY KEY (user_id, descriptor)
);

-- Payees whose regular payments the person said aren't recurring, so Recurring stops suggesting them.
CREATE TABLE recurring_dismissed (
  user_id TEXT NOT NULL,
  payee TEXT NOT NULL,           -- lowercase
  PRIMARY KEY (user_id, payee)
);
