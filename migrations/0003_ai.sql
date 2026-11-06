-- AI groundwork. Provider keys are AES-GCM ciphertext; the key (AI_KEY_SECRET) lives only in the Worker.
CREATE TABLE ai_providers (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,              -- anthropic | openai | gemini | openrouter | ollama | compatible
  base_url TEXT,                 -- ollama and compatible only
  model TEXT NOT NULL DEFAULT '',
  key_cipher TEXT,               -- AES-GCM ciphertext, base64
  key_iv TEXT,
  key_hint TEXT,                 -- last 4 characters, shown as "sk-…a1B2"
  is_default INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, id)
);
-- Exactly what was sent and received, kept 30 days when the request log is on.
CREATE TABLE ai_log (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  at INTEGER NOT NULL DEFAULT (unixepoch()),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  feature TEXT NOT NULL,
  request TEXT NOT NULL,
  response TEXT NOT NULL,
  tokens_in INTEGER NOT NULL DEFAULT 0,
  tokens_out INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, id)
);
CREATE INDEX ai_log_at ON ai_log(user_id, at);
