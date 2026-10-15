PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS jobs (
 id TEXT PRIMARY KEY, owner TEXT NOT NULL, mode TEXT NOT NULL CHECK (mode IN ('image','video')),
 provider TEXT NOT NULL, provider_job_id TEXT NOT NULL, status TEXT NOT NULL, prompt TEXT NOT NULL,
 result_url TEXT, error_message TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_jobs_owner_created ON jobs(owner, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_provider_id ON jobs(provider, provider_job_id);
CREATE TABLE IF NOT EXISTS assets (
 id TEXT PRIMARY KEY, owner TEXT NOT NULL, object_key TEXT NOT NULL UNIQUE, public_url TEXT NOT NULL,
 content_type TEXT NOT NULL, size_bytes INTEGER NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_assets_owner_created ON assets(owner, created_at DESC);
CREATE TABLE IF NOT EXISTS rate_limits (
 id INTEGER PRIMARY KEY AUTOINCREMENT, identity TEXT NOT NULL, bucket TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rate_limits_identity_bucket_created ON rate_limits(identity, bucket, created_at);
