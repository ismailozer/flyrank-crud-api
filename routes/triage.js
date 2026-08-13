const express = require("express");

const { triageMessage } = require("../llm/triageService");

const {
  triageInputSchema,
  triageOutputSchema,
} = require("../llm/schema");

const router = express.Router();

router.post("/", async (req, res) => {
  // 1. Validate input before doing any expensive work.
  const inputResult = triageInputSchema.safeParse(req.body);

  if (!inputResult.success) {
    const issue = inputResult.error.issues[0];

    return res.status(400).json({
      error: "Invalid request",
      field: issue.path.join(".") || "body",
      message: issue.message,
    });
  }

  // 2. Global LLM kill switch.
  if (
    String(process.env.LLM_ENABLED).toLowerCase() ===
    "false"
  ) {
    return res.status(503).json({
      error: "LLM feature is currently disabled",
    });
  }

  // 3. Development stub mode.
  if (process.env.LLM_STUB === "1") {
    const stubResponse = {
      category: "billing",
      urgency: "normal",
      suggested_team: "billing",
      confidence: 0.95,
      reason: "Stub response used for development.",
    };

    const outputResult =
      triageOutputSchema.safeParse(stubResponse);

    if (!outputResult.success) {
      return res.status(500).json({
        error: "Stub response does not match output schema",
      });
    }

    return res.status(200).json(outputResult.data);
  }

  // 4. Real LLM execution.
  try {
    const result = await triageMessage(
      inputResult.data.text
    );

    return res.status(200).json(result.data);
  } catch (error) {
    // Model responded, but output remained invalid
    // even after one repair attempt.
    if (error.code === "TRIAGE_OUTPUT_INVALID") {
      return res.status(422).json({
        error: "Model output validation failed",
        message:
          "The model could not produce a valid triage response after one repair attempt.",
      });
    }

    // Model/provider exceeded our configured timeout.
    if (error.code === "LLM_TIMEOUT") {
      return res.status(504).json({
        error: "LLM provider timed out",
        message:
          "The model did not respond within the configured timeout.",
      });
    }

    // Authentication errors must not be retried.
    if (error.status === 401) {
      return res.status(502).json({
        error: "LLM provider authentication failed",
      });
    }

    console.error(
      "Triage model call failed:",
      error.message
    );

    return res.status(502).json({
      error: "LLM provider request failed",
    });
  }
});

module.exports = router;