CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_login_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_user_created
ON messages (user_id, created_at);

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id TEXT PRIMARY KEY,
  profile_json TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  risk_score INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS common_features (
  category TEXT NOT NULL,
  feature TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  last_seen_at TEXT NOT NULL,
  PRIMARY KEY (category, feature)
);

CREATE INDEX IF NOT EXISTS idx_common_features_count
ON common_features (count DESC, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS user_features (
  user_id TEXT NOT NULL,
  category TEXT NOT NULL,
  feature TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  PRIMARY KEY (user_id, category, feature),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_features_category
ON user_features (category, feature);
