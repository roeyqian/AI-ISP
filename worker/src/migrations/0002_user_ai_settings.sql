CREATE TABLE IF NOT EXISTS user_ai_settings (
  user_id TEXT PRIMARY KEY,
  request_url TEXT NOT NULL,
  model TEXT NOT NULL,
  api_key TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
