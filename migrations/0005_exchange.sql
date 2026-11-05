-- Extra detail for a transfer (keyed by transactions.transfer_id), mostly for currency exchange.
-- The fee is a separate expense transaction (category 'transfer_fee') so it counts as spending;
-- the transfer's out half is the amount actually converted.
CREATE TABLE transfers (
  id TEXT PRIMARY KEY,                       -- = transactions.transfer_id
  fee INTEGER NOT NULL DEFAULT 0,            -- cents, in the sending account's currency
  fee_tx_id TEXT REFERENCES transactions(id) ON DELETE SET NULL,
  provider TEXT NOT NULL DEFAULT '',         -- Wise, Xe, bank, ...
  market_rate REAL                           -- public mid-market rate that day: units of `to` per 1 `from`
);

INSERT INTO categories (id, name, icon, income, sort) VALUES ('transfer_fee', 'Transfer fees', '💱', 0, 998)
  ON CONFLICT(id) DO NOTHING;
