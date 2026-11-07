-- Files attached to a transaction, such as a receipt or a payslip. The bytes live in the ATTACHMENTS R2 bucket
-- under `<user_id>/<id>`; this table holds what the UI lists.
CREATE TABLE attachments (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  transaction_id TEXT NOT NULL,
  name TEXT NOT NULL,            -- the file name as uploaded
  type TEXT NOT NULL,            -- image/jpeg, image/png, image/webp or application/pdf, read from the bytes
  size INTEGER NOT NULL,         -- bytes
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, id)
);
CREATE INDEX attachments_transaction ON attachments(user_id, transaction_id);

-- R2 keys whose rows are gone. Kosha deletes transactions in many places, so triggers queue the files here and
-- purgeAttachments() removes them from R2 on the next load.
CREATE TABLE attachment_trash (
  user_id TEXT NOT NULL,
  key TEXT NOT NULL,
  PRIMARY KEY (user_id, key)
);

CREATE TRIGGER attachments_follow_transaction AFTER DELETE ON transactions
BEGIN
  DELETE FROM attachments WHERE user_id = OLD.user_id AND transaction_id = OLD.id;
END;

CREATE TRIGGER attachments_trash AFTER DELETE ON attachments
BEGIN
  INSERT OR IGNORE INTO attachment_trash (user_id, key) VALUES (OLD.user_id, OLD.user_id || '/' || OLD.id);
END;
