require("dotenv").config();

const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

/**
 * Returns summary statistics for the task report.
 */
async function getTaskReportSummary() {
  const query = `
    SELECT
      COUNT(*)::int AS total_tasks,

      COUNT(*) FILTER (
        WHERE done = true
      )::int AS completed_tasks,

      COUNT(*) FILTER (
        WHERE done = false
      )::int AS pending_tasks,

      CASE
        WHEN COUNT(*) = 0 THEN 0
        ELSE ROUND(
          (
            COUNT(*) FILTER (
              WHERE done = true
            )::numeric
            / COUNT(*)::numeric
          ) * 100,
          2
        )
      END AS completion_rate
    FROM tasks;
  `;

  const result = await pool.query(query);

  return result.rows[0];
}

/**
 * Returns the task rows that will be displayed
 * inside the generated report.
 */
async function getTaskReportItems() {
  const query = `
    SELECT
      id,
      title,
      done
    FROM tasks
    ORDER BY id ASC;
  `;

  const result = await pool.query(query);

  return result.rows;
}

/**
 * Builds the complete data object required
 * by the PDF renderer.
 */
async function getTaskReportData() {
  const [
    summary,
    tasks,
  ] = await Promise.all([
    getTaskReportSummary(),
    getTaskReportItems(),
  ]);

  return {
    reportTitle: "Task Report",

    generatedAt:
      new Date().toISOString(),

    summary: {
      totalTasks:
        summary.total_tasks,

      completedTasks:
        summary.completed_tasks,

      pendingTasks:
        summary.pending_tasks,

      completionRate:
        Number(
          summary.completion_rate
        ),
    },

    tasks: tasks.map((task) => ({
      id: task.id,
      title: task.title,
      status: task.done
        ? "Completed"
        : "Pending",
    })),
  };
}

module.exports = {
  getTaskReportSummary,
  getTaskReportItems,
  getTaskReportData,
};