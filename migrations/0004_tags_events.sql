-- Hashtags on a transaction: a JSON array of lowercase names without the '#', e.g. '["trip","food"]'.
ALTER TABLE transactions ADD COLUMN tags TEXT NOT NULL DEFAULT '[]';

-- An event groups transactions across categories (a trip, a wedding) to see what it cost. New one-off
-- entries dated between start_day and end_day get the event by default; the dates are optional.
CREATE TABLE events (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  start_day TEXT,
  end_day TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, id)
);

-- No foreign key: ADD COLUMN can't add a composite one, so deleting an event clears event_id in the app.
ALTER TABLE transactions ADD COLUMN event_id TEXT;
CREATE INDEX transactions_event ON transactions(user_id, event_id);
