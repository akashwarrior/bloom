import z from "zod/v4";

export const projectPathSchema = z
  .string()
  .min(1)
  .max(500)
  .describe(
    "Project-relative POSIX path. Never absolute and never containing '..'.",
  );

export const globSchema = z
  .string()
  .min(1)
  .max(300)
  .describe("Project-relative glob such as 'app/**/*.tsx'.");

export const toolErrorSchema = z.strictObject({
  code: z.string().min(1).max(80),
  message: z.string().min(1).max(2_000),
  recovery: z.string().min(1).max(500).optional(),
});

export const typeScriptValidationStatusSchema = z.enum([
  "skipped",
  "passed",
  "failed",
  "timed-out",
  "unavailable",
]);

export const typeScriptValidationSchema = z.strictObject({
  status: typeScriptValidationStatusSchema,
  exitCode: z.number().int().nullable(),
  durationMs: z.number().int().nonnegative(),
  timedOut: z.boolean(),
  outputTruncated: z.boolean(),
});

export const tscErrorSchema = z.string().max(6_000).nullable();

const toolFailureSchema = z.strictObject({
  status: z.literal("error"),
  error: toolErrorSchema,
});

export function toolError(code: string, error: unknown, recovery?: string) {
  let rawMessage: string;
  if (error instanceof Error) {
    rawMessage = error.message;
  } else if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    rawMessage = error.message;
  } else if (typeof error === "string") {
    rawMessage = error;
  } else {
    try {
      rawMessage = JSON.stringify(error) ?? String(error);
    } catch {
      rawMessage = String(error);
    }
  }
  const message =
    rawMessage.trim() || "The tool failed without an error message.";

  return {
    code,
    message: message,
    ...(recovery ? { recovery } : {}),
  };
}

export function toolFailure(code: string, error: unknown, recovery?: string) {
  return {
    status: "error" as const,
    error: toolError(code, error, recovery),
  };
}

export function toolOutputSchema<T extends z.ZodType>(successSchema: T) {
  return z.union([successSchema, toolFailureSchema]);
}
