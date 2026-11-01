import z from "zod/v4";

// Prose quality is evaluated after generation. Minimum character counts make
// structurally valid values such as "None." fatal even though they preserve
// the intended meaning, so the transport schema only enforces type and bounds.
const boundedText = z.string().max(8_000);

const evidencedStatementSchema = z.strictObject({
  statement: boundedText,
  evidence: boundedText.describe(
    "The exact message, path, symbol, tool call, command output, or observed value supporting the statement.",
  ),
});

const decisionSchema = z.strictObject({
  decision: boundedText,
  rationale: boundedText,
  evidence: boundedText,
});

const implementationStateSchema = z.strictObject({
  area: z.string().max(500),
  state: boundedText,
  evidence: boundedText,
});

const fileStateSchema = z.strictObject({
  path: z.string().max(1_000),
  status: z.enum(["created", "modified", "deleted", "inspected", "relevant"]),
  details: boundedText,
  evidence: boundedText,
});

const actionResultSchema = z.strictObject({
  action: boundedText,
  result: boundedText,
  evidence: boundedText,
});

const validationResultSchema = z.strictObject({
  check: boundedText,
  status: z.enum(["passed", "failed", "partial", "not-run"]),
  result: boundedText,
  evidence: boundedText,
});

const coverageSchema = z.strictObject({
  sourceArea: boundedText,
  retainedDetails: boundedText,
  omissions: boundedText,
});

export const compactionOutputSchema = z.strictObject({
  resolvedTask: z.string().max(20_000),
  taskStatus: z.enum(["not-started", "in-progress", "blocked", "completed"]),
  inferredRequirements: z
    .array(evidencedStatementSchema)
    .describe(
      "Requirements inferred from the task or inspected reference, never claims about what the user explicitly said.",
    ),
  constraints: z.array(evidencedStatementSchema),
  decisions: z.array(decisionSchema),
  implementationState: z.array(implementationStateSchema),
  importantFiles: z.array(fileStateSchema),
  commandsAndToolResults: z.array(actionResultSchema),
  validationResults: z.array(validationResultSchema),
  errorsAndBlockers: z.array(evidencedStatementSchema),
  openQuestions: z.array(evidencedStatementSchema),
  nextSteps: z.array(evidencedStatementSchema),
  sourceCoverage: z.array(coverageSchema),
});

export type CompactionOutput = z.infer<typeof compactionOutputSchema>;
