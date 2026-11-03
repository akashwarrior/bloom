import z from "zod/v4";

import { projectPathSchema } from "./schemas.ts";

const createFile = z.strictObject({
  type: z.literal("create").describe("Create a new file or completely rewrite an existing one."),
  path: projectPathSchema,
  content: z.string().describe(
    "Complete file content.",
  ),
});

const replaceFile = z.strictObject({
  type: z.literal("replace").describe("Replace exact text in an existing file."),
  path: projectPathSchema,
  oldString: z.string().min(1).describe(
    "Exact text to find, including indentation and excluding readFiles line-number prefixes. It must appear exactly once in the current file.",
  ),
  newString: z.string().describe(
    "Text that replaces oldString; an empty string deletes it. No line-number prefixes.",
  ),
});

const deleteFile = z.strictObject({
  type: z.literal("delete").describe("Delete an existing file."),
  path: projectPathSchema,
});

export const applyChangesInputSchema = z.strictObject({
  changes: z
    .array(z.discriminatedUnion("type", [createFile, replaceFile, deleteFile]))
    .min(1)
    .max(40)
    .describe("Array of files to create, exact text to replace, or files to delete."),
});

type ApplyChange = z.infer<typeof applyChangesInputSchema>["changes"][number];

type TextEdit = { oldString: string; newString: string };

export function groupApplyChanges(changes: ApplyChange[]) {
  const creates: Array<{ path: string; content: string }> = [];
  const editsByPath = new Map<string, TextEdit[]>();
  const deletes: string[] = [];
  for (const change of changes) {
    if (change.type === "create") {
      creates.push({ path: change.path, content: change.content });
    } else if (change.type === "replace") {
      const edits = editsByPath.get(change.path) ?? [];
      edits.push({
        oldString: change.oldString,
        newString: change.newString,
      });
      editsByPath.set(change.path, edits);
    } else {
      deletes.push(change.path);
    }
  }
  return { creates, editsByPath, deletes };
}
