import z from "zod/v4";

import { projectPathSchema } from "./schemas.ts";

const createFile = z.strictObject({
  type: z.literal("create").describe("Create a new file or completely rewrite an existing one."),
  path: projectPathSchema,
  content: z.string().describe(
    "Complete file content. Tool strings are already JSON-decoded: use normal source quotes and real newlines, never escaped JSON or line-number prefixes.",
  ),
});

const updateFile = z.strictObject({
  type: z.literal("update").describe("Replace an inclusive 1-based line range of an existing file."),
  path: projectPathSchema,
  startLine: z.number().int().describe("First line to replace (1-based, as shown by readFiles)."),
  endLine: z
    .number()
    .int()
    .describe("Last line to replace, inclusive. Use startLine - 1 to insert before startLine."),
  content: z.string().describe(
    "Replacement lines without line-number prefixes; an empty string deletes the range. Tool strings are already JSON-decoded: use normal source quotes and real newlines.",
  ),
});

const deleteFile = z.strictObject({
  type: z.literal("delete").describe("Delete an existing file."),
  path: projectPathSchema,
});

export const applyChangesInputSchema = z.strictObject({
  changes: z
    .array(z.discriminatedUnion("type", [createFile, updateFile, deleteFile]))
    .min(1)
    .max(40)
    .describe(
      "Atomic batch. Entries may mix types; every entry is applied or none are. Several updates to one path are allowed when their ranges do not overlap, and all line numbers refer to the file as it was before this call.",
    ),
});

export type ApplyChange = z.infer<typeof applyChangesInputSchema>["changes"][number];

type LineEdit = { startLine: number; endLine: number; content: string };

/** Groups a flat batch into the runtime's per-path operations, preserving the create/edit/delete order. */
export function groupApplyChanges(changes: ApplyChange[]) {
  const creates: Array<{ path: string; content: string }> = [];
  const editsByPath = new Map<string, LineEdit[]>();
  const deletes: string[] = [];
  for (const change of changes) {
    if (change.type === "create") {
      creates.push({ path: change.path, content: change.content });
    } else if (change.type === "update") {
      const edits = editsByPath.get(change.path) ?? [];
      edits.push({ startLine: change.startLine, endLine: change.endLine, content: change.content });
      editsByPath.set(change.path, edits);
    } else {
      deletes.push(change.path);
    }
  }
  return { creates, editsByPath, deletes };
}
