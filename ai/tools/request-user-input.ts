import { tool } from "ai";
import z from "zod/v4";

const questionIdSchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]{0,47}$/)
  .describe("Stable snake_case identifier for this question.");

const optionSchema = z.strictObject({
  id: z
    .string()
    .regex(/^[a-z][a-z0-9_]{0,47}$/)
    .describe("Stable snake_case option identifier."),
  label: z.string().min(1).max(80),
  description: z.string().min(1).max(240).optional(),
});

const questionSchema = z
  .strictObject({
    id: questionIdSchema,
    header: z.string().min(1).max(24).describe("Short UI label."),
    question: z.string().min(1).max(500),
    options: z
      .array(optionSchema)
      .min(2)
      .max(4)
      .optional()
      .describe("Mutually exclusive choices. Omit for a free-text question."),
    allowFreeText: z
      .boolean()
      .default(true)
      .describe("Whether the user may provide an answer outside the listed choices."),
  })
  .superRefine((question, ctx) => {
    if (!question.options && !question.allowFreeText) {
      ctx.addIssue({
        code: "custom",
        message: "A question without options must allow free-text answers",
      });
    }
    const optionIds = question.options?.map((option) => option.id) ?? [];
    if (new Set(optionIds).size !== optionIds.length) {
      ctx.addIssue({ code: "custom", message: "Option IDs must be unique" });
    }
  });

const userInputRequestSchema = z
  .strictObject({
    questions: z
      .array(questionSchema)
      .min(1)
      .max(3)
      .describe("Only questions that block a materially correct implementation."),
  })
  .superRefine(({ questions }, ctx) => {
    const ids = questions.map((question) => question.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: "custom", message: "Question IDs must be unique" });
    }
  });

const answerSchema = z
  .strictObject({
    questionId: questionIdSchema,
    selectedOptionId: z.string().max(48).optional(),
    text: z.string().trim().min(1).max(2_000).optional(),
  })
  .superRefine((answer, ctx) => {
    if (!answer.selectedOptionId && !answer.text) {
      ctx.addIssue({ code: "custom", message: "An answer is required" });
    }
  });

const userInputResponseSchema = z.strictObject({
  answers: z.array(answerSchema).min(1).max(3),
});

type UserInputRequest = z.infer<typeof userInputRequestSchema>;
export type UserInputResponse = z.infer<typeof userInputResponseSchema>;

export function validateUserInputResponse(
  input: UserInputRequest,
  output: unknown,
) {
  const response = userInputResponseSchema.parse(output);
  const answers = new Map(
    response.answers.map((answer) => [answer.questionId, answer]),
  );

  if (answers.size !== response.answers.length) {
    throw new Error("Each question must be answered exactly once");
  }
  if (answers.size !== input.questions.length) {
    throw new Error("Every requested question must be answered");
  }

  for (const question of input.questions) {
    const answer = answers.get(question.id);
    if (!answer) throw new Error(`Missing answer for ${question.id}`);

    if (answer.selectedOptionId) {
      const valid = question.options?.some(
        (option) => option.id === answer.selectedOptionId,
      );
      if (!valid) {
        throw new Error(`Invalid option for ${question.id}`);
      }
    } else if (!question.allowFreeText) {
      throw new Error(`${question.id} requires one of the listed options`);
    }
  }

  return response;
}

export const requestUserInput = () =>
  tool({
    description:
      "Pause and ask the user up to three concise questions when an unresolved choice would materially change the implementation or external authorization is required. Ask before any mutation and never call this alongside another tool. Prefer one recommended option first, include concrete tradeoffs, and do not ask for details that can be safely inferred. The client supplies the result and resumes the agent.",
    inputSchema: userInputRequestSchema,
    outputSchema: userInputResponseSchema,
  });
