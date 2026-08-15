const express = require("express");

const {
  createJob,
  getJobById,
} = require("../backgroundJobRepository");

const router = express.Router();

/**
 * POST /reports
 *
 * Queue a task report for background generation.
 */
router.post("/", async (req, res) => {
  try {
    const rawIdempotencyKey =
      req.get("Idempotency-Key");

    // Namespace the key so it cannot collide
    // with triage jobs using the same value.
    const idempotencyKey =
      rawIdempotencyKey
        ? `report:${rawIdempotencyKey}`
        : null;

    const job = await createJob({
      jobType: "report",

      payload: {
        reportType: "task-report",
        requestedAt:
          new Date().toISOString(),
      },

      idempotencyKey,
      maxAttempts: 3,
    });

    return res.status(202).json({
      job_id: job.id,
      status: job.status,
      status_url: `/reports/${job.id}`,
    });
  } catch (error) {
    console.error(
      "Failed to queue report job:",
      error
    );

    return res.status(500).json({
      error:
        "Failed to queue report generation.",
    });
  }
});

/**
 * GET /reports/:jobId
 *
 * Check report generation status.
 */
router.get("/:jobId", async (req, res) => {
  try {
    const job = await getJobById(
      req.params.jobId
    );

    if (
      !job ||
      job.job_type !== "report"
    ) {
      return res.status(404).json({
        error: "Report job not found.",
      });
    }

    const response = {
      job_id: job.id,
      status: job.status,
      attempt_count:
        job.attempt_count,
      max_attempts:
        job.max_attempts,
      created_at:
        job.created_at,
      started_at:
        job.started_at,
      completed_at:
        job.completed_at,
    };

    if (job.status === "completed") {
      response.result = job.result;
    }

    if (job.status === "failed") {
      response.error =
        job.error_message;
    }

    return res.json(response);
  } catch (error) {
    console.error(
      "Failed to read report job:",
      error
    );

    return res.status(500).json({
      error:
        "Failed to read report status.",
    });
  }
});

module.exports = router;