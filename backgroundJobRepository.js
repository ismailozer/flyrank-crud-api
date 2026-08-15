const { Pool } = require("pg");
const { randomUUID } = require("crypto");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function createJob({
  jobType,
  payload,
  idempotencyKey = null,
  maxAttempts = 3,
}) {
  const id = randomUUID();

  const query = `
    INSERT INTO background_jobs (
      id,
      job_type,
      status,
      payload,
      idempotency_key,
      attempt_count,
      max_attempts
    )
    VALUES (
      $1,
      $2,
      'queued',
      $3::jsonb,
      $4,
      0,
      $5
    )
    ON CONFLICT (idempotency_key)
    DO UPDATE SET
      idempotency_key = EXCLUDED.idempotency_key
    RETURNING *;
  `;

  const values = [
    id,
    jobType,
    JSON.stringify(payload),
    idempotencyKey,
    maxAttempts,
  ];

  const result = await pool.query(query, values);

  return result.rows[0];
}

async function getJobById(id) {
  const query = `
    SELECT *
    FROM background_jobs
    WHERE id = $1;
  `;

  const result = await pool.query(query, [id]);

  return result.rows[0] || null;
}

async function getJobByIdempotencyKey(idempotencyKey) {
  const query = `
    SELECT *
    FROM background_jobs
    WHERE idempotency_key = $1;
  `;

  const result = await pool.query(query, [
    idempotencyKey,
  ]);

  return result.rows[0] || null;
}

async function claimNextQueuedJob(
  jobType = null
) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const selectQuery = `
      SELECT *
      FROM background_jobs
      WHERE status = 'queued'
        AND (
          $1::varchar IS NULL
          OR job_type = $1
        )
      ORDER BY created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1;
    `;

    const selected = await client.query(
      selectQuery,
      [jobType]
    );

    if (selected.rows.length === 0) {
      await client.query("COMMIT");
      return null;
    }

    const job = selected.rows[0];

    const updateQuery = `
      UPDATE background_jobs
      SET
        status = 'running',
        attempt_count = attempt_count + 1,
        started_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
      RETURNING *;
    `;

    const updated = await client.query(
      updateQuery,
      [job.id]
    );

    await client.query("COMMIT");

    return updated.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function markJobCompleted(id, result) {
  const query = `
    UPDATE background_jobs
    SET
      status = 'completed',
      result = $2::jsonb,
      error_message = NULL,
      completed_at = NOW(),
      updated_at = NOW()
    WHERE id = $1
    RETURNING *;
  `;

  const queryResult = await pool.query(query, [
    id,
    JSON.stringify(result),
  ]);

  return queryResult.rows[0] || null;
}

async function markJobRetryOrFailed(id, errorMessage) {
  const query = `
    UPDATE background_jobs
    SET
      status = CASE
        WHEN attempt_count < max_attempts
          THEN 'queued'
        ELSE 'failed'
      END,

      error_message = $2,

      completed_at = CASE
        WHEN attempt_count >= max_attempts
          THEN NOW()
        ELSE NULL
      END,

      updated_at = NOW()

    WHERE id = $1
    RETURNING *;
  `;

  const result = await pool.query(query, [
    id,
    errorMessage,
  ]);

  return result.rows[0] || null;
}

async function getFailedJobs(limit = 20) {
  const safeLimit = Math.min(
    Math.max(Number(limit) || 20, 1),
    100
  );

  const query = `
    SELECT *
    FROM background_jobs
    WHERE status = 'failed'
    ORDER BY updated_at DESC
    LIMIT $1;
  `;

  const result = await pool.query(query, [
    safeLimit,
  ]);

  return result.rows;
}

module.exports = {
  createJob,
  getJobById,
  getJobByIdempotencyKey,
  claimNextQueuedJob,
  markJobCompleted,
  markJobRetryOrFailed,
  getFailedJobs,
};