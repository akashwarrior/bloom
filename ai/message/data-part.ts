import z from "zod/v4";

const errorSchema = z.object({
  message: z.string(),
});

export enum STATUS {
  LOADING = "LOADING",
  COMPLETE = "COMPLETE",
  ERROR = "ERROR",
}

export const FILE_STATUS = {
  PENDING: "pending",
  SUCCESS: "success",
  ERROR: "error",
} as const;

const legacyFileEntrySchema = z.object({
  path: z.string(),
  error: z.string().optional(),
});

const fileActionSchema = z.object({
  status: z.enum(STATUS),
  files: legacyFileEntrySchema.array(),
});

const changedFileEntrySchema = z.object({
  path: z.string(),
  status: z.enum(FILE_STATUS),
  error: z.string().optional(),
});

const fileChangesSchema = z.object({
  status: z.enum(STATUS),
  files: changedFileEntrySchema.array(),
  summary: z.string().optional(),
  warning: z.string().optional(),
  error: errorSchema.optional(),
});

export const dataPartSchemas = {
  "design-progress": z.object({
    stage: z.string().min(1).max(80),
    label: z.string().min(1).max(200),
    status: z.enum([STATUS.LOADING, STATUS.COMPLETE, STATUS.ERROR]),
    detail: z.string().max(500).optional(),
  }),
  "context-compaction": z.object({
    sourceTokenCount: z.number().int().nonnegative(),
    compactedTokenCount: z.number().int().nonnegative(),
  }),
  "create-files": fileActionSchema,
  "read-file": fileActionSchema,
  "edit-file": fileActionSchema,
  "file-changes": fileChangesSchema,
  "shell": z.object({
    commandId: z.string().optional(),
    command: z.string(),
    args: z.array(z.string()),
    purpose: z.string().optional(),
    status: z.enum([STATUS.LOADING, STATUS.COMPLETE, STATUS.ERROR]),
    exitCode: z.number().int().optional(),
    durationMs: z.number().int().nonnegative().optional(),
    outputTruncated: z.boolean().optional(),
    error: errorSchema.optional(),
  }),
};

export type DataPart = z.infer<z.ZodObject<typeof dataPartSchemas>>;
