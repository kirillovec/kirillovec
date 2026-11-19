CREATE TABLE IF NOT EXISTS music_jobs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL UNIQUE,
  user_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  style TEXT,
  title TEXT,
  prompt TEXT,
  lyrics TEXT,
  audio_url TEXT,
  stream_url TEXT,
  image_url TEXT,
  duration REAL,
  created_at TEXT NOT NULL,
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_music_jobs_user ON music_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_music_jobs_task ON music_jobs(task_id);
CREATE INDEX IF NOT EXISTS idx_music_jobs_status ON music_jobs(status);
