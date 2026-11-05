-- A transfer moves money between two of your own accounts. It is stored as two rows that share
-- transfer_id: money out of one account (negative) and money in to the other (positive, in that
-- account's currency). Transfers are never income or spending.
INSERT INTO categories (id, name, icon, income, sort) VALUES ('transfer', 'Transfer', '↔️', 0, 999)
  ON CONFLICT(id) DO NOTHING;

ALTER TABLE transactions ADD COLUMN transfer_id TEXT;
CREATE INDEX transactions_transfer ON transactions(transfer_id);

-- Recurring transfers are subscriptions with a destination account.
ALTER TABLE subscriptions ADD COLUMN to_wallet_id TEXT REFERENCES wallets(id);
ALTER TABLE subscriptions ADD COLUMN to_amount INTEGER;   -- received per payment, destination currency; NULL = same as -amount
ALTER TABLE subscriptions ADD COLUMN variable INTEGER NOT NULL DEFAULT 0;  -- amount changes each time: ask instead of recording automatically
