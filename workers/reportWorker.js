require("dotenv").config();

const {
  claimNextQueuedJob,
  markJobCompleted,
  markJobRetryOrFailed,
} = require("../backgroundJobRepository");

const {
  getTaskReportData,
} = require("../reportRepository");

const {
  generateTaskReportPdf,
} = require("../pdfRenderer");

const POLL_INTERVAL_MS = 2000;

let shuttingDown = false;

async function processJob(job) {
  console.log(
    `[report-worker] Processing job ${job.id} ` +
      `(attempt ${job.attempt_count}/${job.max_attempts})`
  );

  try {
    if (job.job_type !== "report") {
      throw new Error(
        `Unsupported job type: ${job.job_type}`
      );
    }
    
    // 1. Query report data from PostgreSQL.
    const reportData =
      await getTaskReportData();

    // 2. Generate and store the PDF.
    //
    // Using the job ID makes generation idempotent:
    // retries overwrite the same artifact.
    const artifact =
      await generateTaskReportPdf(
        reportData,
        job.id
      );

    // 3. Store only artifact metadata in the job result.
    // We do NOT store/pass the PDF itself in the database.
    const result = {
      report_type: "task-report",
      file_name: artifact.fileName,
      download_url: artifact.url,
      generated_at:
        reportData.generatedAt,
    };

    await markJobCompleted(
      job.id,
      result
    );

    console.log(
      `[report-worker] Job ${job.id} completed.`
    );

    console.log(
      `[report-worker] Report: ${artifact.url}`
    );
  } catch (error) {
    const updatedJob =
      await markJobRetryOrFailed(
        job.id,
        error.message
      );

    if (
      updatedJob &&
      updatedJob.status === "queued"
    ) {
      console.error(
        `[report-worker] Job ${job.id} failed ` +
          `on attempt ${job.attempt_count}/${job.max_attempts}. ` +
          "Requeued for retry:",
        error.message
      );

      return;
    }

    console.error(
      `[report-worker] Job ${job.id} permanently failed:`,
      error.message
    );
  }
}

async function runWorker() {
  console.log(
    "[report-worker] PDF report worker started."
  );

  while (!shuttingDown) {
    try {
      const job =
        await claimNextQueuedJob(
          "report"
        );

      if (!job) {
        await sleep(
          POLL_INTERVAL_MS
        );

        continue;
      }

      await processJob(job);
    } catch (error) {
      console.error(
        "[report-worker] Unexpected worker error:",
        error.message
      );

      await sleep(
        POLL_INTERVAL_MS
      );
    }
  }

  console.log(
    "[report-worker] PDF report worker stopped."
  );
}

function sleep(ms) {
  return new Promise((resolve) =>
    setTimeout(resolve, ms)
  );
}

process.on("SIGINT", () => {
  console.log(
    "\n[report-worker] Shutdown requested."
  );

  shuttingDown = true;
});

process.on("SIGTERM", () => {
  shuttingDown = true;
});

runWorker().catch((error) => {
  console.error(
    "[report-worker] Fatal worker error:",
    error
  );

  process.exit(1);
});