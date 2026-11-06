-- Monthly recaps written by the AI feature, one per user and month. `body` is JSON: headline, summary, points.
CREATE TABLE ai_recaps (
  user_id TEXT NOT NULL,
  month TEXT NOT NULL,           -- YYYY-MM in the user's time zone
  currency TEXT NOT NULL,        -- the currency the figures were written in
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, month)
);
