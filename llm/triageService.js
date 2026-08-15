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

const MAX_RETRIES = Number(
  process.env.LLM_MAX_RETRIES || 3
);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTimeoutError(error) {
  const name =
    error?.name ||
    error?.constructor?.name ||
    "";

  const causeName =
    error?.cause?.name ||
    error?.cause?.constructor?.name ||
    "";

  const code =
    error?.code ||
    error?.cause?.code ||
    "";

  const message = String(
    error?.message || ""
  ).toLowerCase();

  return (
    name === "APIConnectionTimeoutError" ||
    causeName === "APIConnectionTimeoutError" ||
    code === "ETIMEDOUT" ||
    code === "UND_ERR_CONNECT_TIMEOUT" ||
    code === "ABORT_ERR" ||
    message.includes("timed out") ||
    message.includes("timeout")
  );
}

function shouldRetry(error) {
  const status = Number(error?.status);

  if (isTimeoutError(error)) {
    return true;
  }

  if (status === 408) {
    return true;
  }

  if (status === 429) {
    return true;
  }

  if (status >= 500 && status <= 599) {
    return true;
  }

  return false;
}

function getRetryAfterMs(error) {
  const headers = error?.headers;

  if (!headers) {
    return null;
  }

  let value = null;

  if (typeof headers.get === "function") {
    value = headers.get("retry-after");
  } else {
    value =
      headers["retry-after"] ??
      headers["Retry-After"];
  }

  if (!value) {
    return null;
  }

  // Retry-After may be seconds.
  const seconds = Number(value);

  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000);
  }

  // It may also be an HTTP date.
  const retryDate = Date.parse(value);

  if (Number.isFinite(retryDate)) {
    return Math.max(0, retryDate - Date.now());
  }

  return null;
}

function calculateRetryDelay(retryNumber, error) {
  if (Number(error?.status) === 429) {
    const retryAfterMs = getRetryAfterMs(error);

    if (retryAfterMs !== null) {
      return retryAfterMs;
    }
  }

  // retryNumber:
  // 1 -> 1000 ms
  // 2 -> 2000 ms
  // 3 -> 4000 ms
  const baseDelay =
    1000 * Math.pow(2, retryNumber - 1);

  // Small random jitter prevents synchronized retry storms.
  const jitter = Math.floor(Math.random() * 250);

  return baseDelay + jitter;
}

function writeLlmCallLog(record) {
  const logsDirectory = path.join(
    __dirname,
    "..",
    "logs"
  );

  fs.mkdirSync(logsDirectory, {
    recursive: true,
  });

  const logPath = path.join(
    logsDirectory,
    "llm-calls.jsonl"
  );

  fs.appendFileSync(
    logPath,
    `${JSON.stringify(record)}\n`,
    "utf8"
  );
}

async function callModel(
  messages,
  { repair = false } = {}
) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const startedAt = Date.now();

    try {
      const response =
        await client.chat.completions.create({
          model: process.env.LLM_MODEL,
          messages,
        });

      const durationMs = Date.now() - startedAt;

      const usage = response.usage || {};

      writeLlmCallLog({
        timestamp: new Date().toISOString(),
        prompt_version: PROMPT_VERSION,
        model:
          response.model ||
          process.env.LLM_MODEL,
        input_tokens:
          usage.prompt_tokens ?? null,
        output_tokens:
          usage.completion_tokens ?? null,
        total_tokens:
          usage.total_tokens ?? null,
        cost:
          usage.cost ?? null,
        duration_ms: durationMs,
        repair,
        attempt: attempt + 1,
        status: "success",
      });

      return response.choices[0].message.content;
    } catch (error) {
      const durationMs = Date.now() - startedAt;

      writeLlmCallLog({
        timestamp: new Date().toISOString(),
        prompt_version: PROMPT_VERSION,
        model: process.env.LLM_MODEL,
        input_tokens: null,
        output_tokens: null,
        total_tokens: null,
        cost: null,
        duration_ms: durationMs,
        repair,
        attempt: attempt + 1,
        status: "failed",
        http_status: error?.status ?? null,
        error_name:
         error?.name ||
         error?.constructor?.name ||
         "UnknownError",

         error_code:
         error?.code ||
         error?.cause?.code ||
         null,

         error_message:
         error?.message ||
         null,
      });

      const canRetry = shouldRetry(error);

      if (!canRetry || attempt >= MAX_RETRIES) {
        if (isTimeoutError(error)) {
          const timeoutError = new Error(
            "LLM provider request timed out"
          );

          timeoutError.code = "LLM_TIMEOUT";
          timeoutError.cause = error;

          throw timeoutError;
        }

        throw error;
      }

      const retryNumber = attempt + 1;

      const delayMs = calculateRetryDelay(
        retryNumber,
        error
      );

      console.warn(
        JSON.stringify({
          event: "llm_retry",
          retry_number: retryNumber,
          status: error?.status ?? null,
          error: error?.name || "UnknownError",
          delay_ms: delayMs,
        })
      );

      await sleep(delayMs);
    }
  }
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

  return callModel(
    [
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
    ],
    { 
      repair: true 
    }
  );
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
  ],
  {
    repair: false,
  });

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