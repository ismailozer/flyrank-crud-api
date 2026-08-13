const fs = require("fs");
const path = require("path");

const casesPath = path.join(
  __dirname,
  "cases.json"
);

const cases = JSON.parse(
  fs.readFileSync(casesPath, "utf8")
);

const API_URL =
  process.env.EVAL_API_URL ||
  "http://localhost:3000/triage";

async function runCase(testCase) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: testCase.text,
    }),
  });

  if (!response.ok) {
    return {
      id: testCase.id,
      passed: false,
      error: `HTTP ${response.status}`,
      expected: testCase.expected,
    };
  }

  const actual = await response.json();

  const categoryMatch =
    actual.category ===
    testCase.expected.category;

  return {
    id: testCase.id,
    text: testCase.text,
    passed: categoryMatch,
    expected: testCase.expected,
    actual,
  };
}

async function main() {
  console.log(
    `Running ${cases.length} eval cases...\n`
  );

  const results = [];

  for (const testCase of cases) {
    const result = await runCase(testCase);
    results.push(result);

    const symbol = result.passed ? "PASS" : "FAIL";

    console.log(
      `[${symbol}] Case ${testCase.id}: ${testCase.text}`
    );

    if (!result.passed) {
      console.log(
        `  Expected category: ${testCase.expected.category}`
      );

      console.log(
        `  Actual category: ${
          result.actual?.category ||
          result.error
        }`
      );
    }
  }

  const passed = results.filter(
    (result) => result.passed
  ).length;

  const total = results.length;
  const percentage = (
    (passed / total) *
    100
  ).toFixed(1);

  console.log("\n----------------------------");
  console.log(`Score: ${passed}/${total}`);
  console.log(`Accuracy: ${percentage}%`);
  console.log("----------------------------");

  const failures = results.filter(
    (result) => !result.passed
  );

  if (failures.length > 0) {
    console.log("\nFailed cases:");

    for (const failure of failures) {
      console.log(
        `- Case ${failure.id}: expected ${
          failure.expected.category
        }, received ${
          failure.actual?.category ||
          failure.error
        }`
      );
    }
  }
}

main().catch((error) => {
  console.error("Eval run failed:");
  console.error(error);
  process.exit(1);
});