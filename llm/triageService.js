const fs = require("fs");
const path = require("path");

const client = require("./client");

const promptPath = path.join(
  __dirname,
  "..",
  "prompts",
  "triage-v1.md"
);

const systemPrompt = fs.readFileSync(promptPath, "utf8");

async function triageMessage(text) {
  const response = await client.chat.completions.create({
    model: process.env.LLM_MODEL,
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: text,
      },
    ],
  });

  return response.choices[0].message.content;
}

module.exports = {
  triageMessage,
};