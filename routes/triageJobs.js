const express = require("express");

const {
  triageInputSchema,
} = require("../llm/schema");

const {
  createJob,
  getJobById,
  getFailedJobs,
} = require("../backgroundJobRepository");

const router = express.Router();

/*
 * POST /triage-jobs
 *
 * Accept the work immediately and store it as a queued job.
 * The LLM is intentionally NOT called from this request.
 */
router.post("/", async (req, res) => {
  const inputResult = triageInputSchema.safeParse(req.body);

  if (!inputResult.success) {
    const issue = inputResult.error.issues[0];

    return res.status(400).json({
      error: "Invalid request",
      field: issue.path.join(".") || "body",
      message: issue.message,
    });
  }

  try {
    const idempotencyKey =
      req.get("Idempotency-Key") || null;

    const job = await createJob({
      jobType: "triage",
      payload: {
        text: inputResult.data.text,
      },
      idempotencyKey,
      maxAttempts: 3,
    });

    return res.status(202).json({
      job_id: job.id,
      status: job.status,
      status_url: `/triage-jobs/${job.id}`,
    });
  } catch (error) {
    console.error(
      "Failed to create background job:",
      error.message
    );

    return res.status(500).json({
      error: "Failed to create background job",
    });
  }
});

/*
 * GET /triage-jobs/failures
 *
 * Operational visibility for permanently failed jobs.
 *
 * Important:
 * This route must be declared before /:id,
 * otherwise Express may interpret "failures" as an id.
 */
router.get("/failures", async (req, res) => {
  try {
    const jobs = await getFailedJobs(
      req.query.limit
    );

    return res.status(200).json({
      count: jobs.length,

      jobs: jobs.map((job) => ({
        job_id: job.id,
        job_type: job.job_type,
        status: job.status,
        error_message: job.error_message,
        attempt_count: job.attempt_count,
        max_attempts: job.max_attempts,
        created_at: job.created_at,
        started_at: job.started_at,
        completed_at: job.completed_at,
      })),
    });
  } catch (error) {
    console.error(
      "Failed to list failed background jobs:",
      error.message
    );

    return res.status(500).json({
      error: "Failed to list background job failures",
    });
  }
});

/*
 * GET /triage-jobs/:id
 *
 * Lets the client inspect the current state of a job.
 */
router.get("/:id", async (req, res) => {
  try {
    const job = await getJobById(req.params.id);

    if (!job) {
      return res.status(404).json({
        error: "Job not found",
      });
    }

    return res.status(200).json({
      job_id: job.id,
      job_type: job.job_type,
      status: job.status,
      result: job.result,
      error_message: job.error_message,
      attempt_count: job.attempt_count,
      max_attempts: job.max_attempts,
      created_at: job.created_at,
      started_at: job.started_at,
      completed_at: job.completed_at,
    });
  } catch (error) {
    console.error(
      "Failed to read background job:",
      error.message
    );

    return res.status(500).json({
      error: "Failed to read background job",
    });
  }
});

module.exports = router;