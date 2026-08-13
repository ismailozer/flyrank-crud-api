const fs = require("fs");
const path = require("path");

const client = require("./client");
const { triageOutputSchema } = require("./schema");

const PROMPT_VERSION = "triage-v1";

const promptPath = path.join(
  __dirname,
  "..",
  "prompts",
  `${PROMPT_VERSION}.md`
);

const systemPrompt = fs.readFileSync(promptPath, "utf8");

function extractJsonObject(rawText) {
  if (typeof rawText !== "string") {
    throw new Error("Model output is not a string");
  }

  let cleaned = rawText.trim();

  // Remove Markdown code fences such as:
  // ```json
  // { ... }
  // ```
  cleaned = cleaned
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  // Models may add text before or after the JSON.
  // Keep only the first JSON object.
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");

  if (
    firstBrace === -1 ||
    lastBrace === -1 ||
    lastBrace < firstBrace
  ) {
    throw new Error("No JSON object found in model output");
  }

  return cleaned.slice(firstBrace, lastBrace + 1);
}

function parseAndValidate(rawText) {
  let parsed;

  try {
    const jsonText = extractJsonObject(rawText);
    parsed = JSON.parse(jsonText);
  } catch (error) {
    return {
      success: false,
      error: `JSON parse failed: ${error.message}`,
    };
  }

  const validationResult =
    triageOutputSchema.safeParse(parsed);

  if (!validationResult.success) {
    const validationErrors =
      validationResult.error.issues.map((issue) => ({
        field: issue.path.join(".") || "body",
        message: issue.message,
      }));

    return {
      success: false,
      error: `Schema validation failed: ${JSON.stringify(
        validationErrors
      )}`,
    };
  }

  return {
    success: true,
    data: validationResult.data,
  };
}

async function callModel(messages) {
  const response = await client.chat.completions.create({
    model: process.env.LLM_MODEL,
    messages,
  });

  return response.choices[0].message.content;
}

async function repairOutput(
  inputText,
  brokenOutput,
  validationError
) {
  const repairInstruction = `
Your previous answer was rejected for this reason:

${validationError}

Return only corrected JSON matching the schema in the system prompt.

Do not include Markdown.
Do not include code fences.
Do not include explanations before or after the JSON.
`;

  return callModel([
    {
      role: "system",
      content: systemPrompt,
    },
    {
      role: "user",
      content: inputText,
    },
    {
      role: "assistant",
      content: brokenOutput,
    },
    {
      role: "user",
      content: repairInstruction,
    },
  ]);
}

function writeQuarantineLog({
  input,
  firstOutput,
  repairedOutput,
  error,
}) {
  const logsDirectory = path.join(
    __dirname,
    "..",
    "logs"
  );

  fs.mkdirSync(logsDirectory, {
    recursive: true,
  });

  const quarantinePath = path.join(
    logsDirectory,
    "quarantine.jsonl"
  );

  const record = {
    timestamp: new Date().toISOString(),
    prompt_version: PROMPT_VERSION,
    model: process.env.LLM_MODEL,
    input,
    first_output: firstOutput,
    repaired_output: repairedOutput,
    error,
  };

  fs.appendFileSync(
    quarantinePath,
    `${JSON.stringify(record)}\n`,
    "utf8"
  );
}

class TriageOutputError extends Error {
  constructor(message) {
    super(message);
    this.name = "TriageOutputError";
    this.code = "TRIAGE_OUTPUT_INVALID";
  }
}

async function triageMessage(text) {
  // First model attempt
  const firstOutput = await callModel([
    {
      role: "system",
      content: systemPrompt,
    },
    {
      role: "user",
      content: text,
    },
  ]);

  const firstResult = parseAndValidate(firstOutput);

  if (firstResult.success) {
    return {
      data: firstResult.data,
      repairCount: 0,
    };
  }

  console.warn(
    "Initial model output rejected:",
    firstResult.error
  );

  // One repair attempt only
  const repairedOutput = await repairOutput(
    text,
    firstOutput,
    firstResult.error
  );

  const repairedResult =
    parseAndValidate(repairedOutput);

  if (repairedResult.success) {
    return {
      data: repairedResult.data,
      repairCount: 1,
    };
  }

  // Second failure: quarantine and stop.
  writeQuarantineLog({
    input: text,
    firstOutput,
    repairedOutput,
    error: repairedResult.error,
  });

  throw new TriageOutputError(
    "Model output failed validation after one repair attempt"
  );
}

module.exports = {
  triageMessage,
};