const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

const REPORTS_DIR = path.join(
  __dirname,
  "reports"
);

function ensureReportsDirectory() {
  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, {
      recursive: true,
    });
  }
}

function generateTaskReportPdf(
    reportData,
    reportId = Date.now().toString()
    ) {
  return new Promise(
    (resolve, reject) => {
      ensureReportsDirectory();

      const fileName =
        `task-report-${reportId}.pdf`;

      const filePath = path.join(
        REPORTS_DIR,
        fileName
      );

      const doc = new PDFDocument({
        size: "A4",
        margin: 50,
      });

      const output =
        fs.createWriteStream(filePath);

      doc.pipe(output);

      // Title
      doc
        .fontSize(22)
        .text(reportData.reportTitle, {
          align: "center",
        });

      doc.moveDown();

      doc
        .fontSize(10)
        .text(
          `Generated at: ${new Date(
            reportData.generatedAt
          ).toLocaleString()}`
        );

      doc.moveDown(2);

      // Summary
      doc
        .fontSize(16)
        .text("Summary");

      doc.moveDown(0.5);

      doc
        .fontSize(11)
        .text(
          `Total Tasks: ${reportData.summary.totalTasks}`
        )
        .text(
          `Completed Tasks: ${reportData.summary.completedTasks}`
        )
        .text(
          `Pending Tasks: ${reportData.summary.pendingTasks}`
        )
        .text(
          `Completion Rate: ${reportData.summary.completionRate}%`
        );

      doc.moveDown(2);

      // Task list
      doc
        .fontSize(16)
        .text("Tasks");

      doc.moveDown();

      reportData.tasks.forEach(
        (task) => {
          doc
            .fontSize(11)
            .text(
              `#${task.id} - ${task.title}`
            );

          doc
            .fontSize(9)
            .text(
              `Status: ${task.status}`
            );

          doc.moveDown(0.7);
        }
      );

      doc.end();

      output.on("finish", () => {
        resolve({
          fileName,
          filePath,
          url: `/reports/files/${fileName}`,
        });
      });

      output.on("error", reject);
      doc.on("error", reject);
    }
  );
}

module.exports = {
  generateTaskReportPdf,
};