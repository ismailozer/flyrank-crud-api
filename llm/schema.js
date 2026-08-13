const { z } = require("zod");

const triageInputSchema = z
  .object({
    text: z
      .string()
      .min(1, "text cannot be empty")
      .max(2000, "text must be at most 2000 characters"),
  })
  .strict();

const triageOutputSchema = z
  .object({
    category: z.enum([
      "billing",
      "bug",
      "feature",
      "account",
      "other",
    ]),

    urgency: z.enum([
      "low",
      "normal",
      "high",
    ]),

    suggested_team: z.enum([
      "billing",
      "engineering",
      "product",
      "support",
    ]),

    confidence: z
      .number()
      .min(0)
      .max(1),

    reason: z
      .string()
      .min(1)
      .max(250),
  })
  .strict();

module.exports = {
  triageInputSchema,
  triageOutputSchema,
};