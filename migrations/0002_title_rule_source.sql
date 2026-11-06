-- Payee rules made in Settings › Payee rules are 'manual'; ones learned from edits stay 'learned'.
-- Learning never overwrites a manual rule.
ALTER TABLE title_rules ADD COLUMN source TEXT NOT NULL DEFAULT 'learned';
