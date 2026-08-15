require("dotenv").config();

const {
  claimNextQueuedJob,
  markJobCompleted,
  markJobRetryOrFailed,
} = require("../backgroundJobRepository");

const {
  triageMessage,
} = require("../llm/triageService");

const POLL_INTERVAL_MS = 2000;

let shuttingDown = false;

async function processJob(job) {
  console.log(
    `[worker] Processing job ${job.id} (attempt ${job.attempt_count}/${job.max_attempts})`
  );

  try {
    if (job.job_type !== "triage") {
      throw new Error(
        `Unsupported job type: ${job.job_type}`
      );
    }

    const text = job.payload?.text;

    if (!text) {
      throw new Error(
        "Triage job payload does not contain text."
      );
    }

    const triageResult = await triageMessage(text);

    await markJobCompleted(
      job.id,
      triageResult.data
    );

    console.log(
      `[worker] Job ${job.id} completed.`
    );
  } catch (error) {
    const updatedJob = await markJobRetryOrFailed(
      job.id,
      error.message
    );

    if (updatedJob.status === "queued") {
      console.warn(
        `[worker] Job ${job.id} failed on attempt ${updatedJob.attempt_count}/${updatedJob.max_attempts}. Requeued for retry.`
      );
    } else {
      console.error(
        `[worker] Job ${job.id} permanently failed after ${updatedJob.attempt_count} attempts:`,
        error.message
      );
    }
  }
}

async function runWorker() {
  console.log(
    "[worker] Triage background worker started."
  );

  while (!shuttingDown) {
    try {
      const job =
        await claimNextQueuedJob();

      if (!job) {
        await sleep(POLL_INTERVAL_MS);
        continue;
      }

      await processJob(job);
    } catch (error) {
      console.error(
        "[worker] Unexpected worker error:",
        error.message
      );

      await sleep(POLL_INTERVAL_MS);
    }
  }

  console.log(
    "[worker] Triage background worker stopped."
  );
}

function sleep(ms) {
  return new Promise((resolve) =>
    setTimeout(resolve, ms)
  );
}

process.on("SIGINT", () => {
  console.log(
    "\n[worker] Shutdown requested."
  );

  shuttingDown = true;
});

process.on("SIGTERM", () => {
  shuttingDown = true;
});

runWorker().catch((error) => {
  console.error(
    "[worker] Fatal worker error:",
    error
  );

  process.exit(1);
});