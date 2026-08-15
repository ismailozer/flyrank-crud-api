CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  done BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS background_jobs (
    id UUID PRIMARY KEY,

    job_type VARCHAR(50) NOT NULL,

    status VARCHAR(20) NOT NULL
        CHECK (status IN ('queued', 'running', 'completed', 'failed')),

    payload JSONB NOT NULL,

    result JSONB,

    error_message TEXT,

    idempotency_key VARCHAR(255) UNIQUE,

    attempt_count INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);