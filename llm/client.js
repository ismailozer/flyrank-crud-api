const OpenAI = require("openai");

const client = new OpenAI({
  baseURL: process.env.LLM_BASE_URL,
  apiKey: process.env.LLM_API_KEY,

  // Stage 4: explicit production timeout.
  timeout: Number(process.env.LLM_TIMEOUT_MS || 30000),

  // We implement our own retry policy so SDK retries are disabled.
  maxRetries: 0,
});

module.exports = client;