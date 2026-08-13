const express = require("express");
const { triageMessage } = require("../llm/triageService");

const {
  triageInputSchema,
  triageOutputSchema,
} = require("../llm/schema");

const router = express.Router();

router.post("/", async (req, res) => {
  // 1. Validate incoming request before doing anything expensive.
  const inputResult = triageInputSchema.safeParse(req.body);

  if (!inputResult.success) {
    const issue = inputResult.error.issues[0];

    return res.status(400).json({
      error: "Invalid request",
      field: issue.path.join(".") || "body",
      message: issue.message,
    });
  }

  // 2. Stage 1 stub mode.
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

    try {
      const result = await triageMessage(
        inputResult.data.text
      );

      return res.status(200).json(result.data);
    } catch (error) {
      if (error.code === "TRIAGE_OUTPUT_INVALID") {
        return res.status(422).json({
          error: "Model output validation failed",
          message:
            "The model could not produce a valid triage response after one repair attempt.",
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