import { tool } from "ai";
import { z } from "zod";

import { FILE_STATUS, STATUS } from "@/ai/message/data-part";
import type { ToolParams } from "@/ai/tools";
import { applyProjectChanges } from "@/lib/runtime/runtime-service.server";
import {
  projectPathSchema,
  toolError,
  toolErrorSchema,
  tscErrorSchema,
  typeScriptValidationSchema,
} from "@/ai/tools/schemas";
import { crowdedComponentFile, validateSourceTextEscaping } from "@/ai/source-change-policy";
import { lintSourceChange, summarizeViolations, type DesignViolation } from "@/ai/design/lint";
import { applyChangesInputSchema, groupApplyChanges } from "./apply-changes-input";
import { buildApplyChangesFiles } from "./apply-changes-output";

const LINE_NUMBER_PREFIX = /^\s*\d+\t/;
/** The direction as Bloom saved it; a hand edit would make it disagree with what the director decided. */
const GENERATED_DESIGN_PATHS = new Set(["DESIGN.md", ".bloom/design.json"]);

function isGeneratedDesignPath(path: string) {
  return GENERATED_DESIGN_PATHS.has(path);
}

/** UI files that must wait for `designSite` on a new project. */
const UI_SOURCE_PATH = /^(?:app\/(?:.*\/)?(?:page|layout)|components\/.+)\.(?:tsx|jsx)$/;

function isUiSourcePath(path: string) {
  return UI_SOURCE_PATH.test(path);
}

/** Drops "12\t" prefixes when a model pastes numbered readFiles output back as content. */
function stripLineNumbers(content: string) {
  const lines = content.split("\n");
  const numbered = lines.filter((line) => line.length > 0);

  if (numbered.length === 0 || !numbered.every((line) => LINE_NUMBER_PREFIX.test(line))) {
    return content;
  }
  return lines.map((line) => line.replace(LINE_NUMBER_PREFIX, "")).join("\n");
}

const outputFileSchema = z.strictObject({
  path: projectPathSchema,
  status: z.enum(["success", "error"]),
  addedLines: z.number().int().nonnegative().optional(),
  deletedLines: z.number().int().nonnegative().optional(),
  totalLines: z.number().int().nonnegative().optional(),
  validation: typeScriptValidationSchema.optional(),
  tscError: z.string().max(6_000).optional(),
  error: z.string().max(2_000).optional(),
});

const outputSchema = z.strictObject({
  files: z.array(outputFileSchema),
  validation: typeScriptValidationSchema.optional(),
  tscError: tscErrorSchema.optional(),
  editNote: z.string().max(1_000).optional(),
  structureNote: z.string().max(1_000).optional(),
  designViolations: z.array(z.string()).max(20).optional(),
  designNote: z.string().max(1_000).optional(),
  error: toolErrorSchema.optional(),
});

export const applyChanges = ({
  projectId,
  writer,
  signal,
  session,
}: ToolParams) =>
  tool({
    description: "Edit project files. Use `create` for a new file or full rewrite, `replace` to swap exact text in an existing file, `delete` to remove a file. One call takes up to 40 changes across any number of files and typechecks once, so send everything one piece of work needs together: all the files of a new page, or every replace a fix touches. Several replace entries may target the same file; they apply in order.",
    inputSchema: applyChangesInputSchema,

    outputSchema,

    execute: async (
      { changes: entries },
      { toolCallId },
    ) => {
      const { creates, editsByPath, deletes } = groupApplyChanges(entries);
      for (const [path, edits] of editsByPath) {
        editsByPath.set(
          path,
          edits.map((edit) => ({
            oldString: stripLineNumbers(edit.oldString),
            newString: stripLineNumbers(edit.newString),
          })),
        );
      }
      let failureCode = "FILE_CHANGE_REJECTED";
      let failureRecovery =
        "Reread the exact path and submit the corrected changes. For replace, oldString must match the current file exactly and appear once. Do not guess or retry the same input.";

      const changes = [
        ...creates.map((change) => ({
          type: "create" as const,
          path: change.path,
          content: stripLineNumbers(change.content),
        })),
        ...[...editsByPath].map(([path, edits]) => ({
          type: "edit" as const,
          path,
          edits,
        })),
        ...deletes.map((path) => ({
          type: "delete" as const,
          path,
        })),
      ];

      const labels = changes.map((change) => ({
        path: change.path,
        status: FILE_STATUS.PENDING,
      }));

      writer.write({
        id: toolCallId,
        type: "data-file-changes",
        data: {
          status: STATUS.LOADING,
          files: labels,
        },
      });

      try {
        if (changes.some((change) => isGeneratedDesignPath(change.path))) {
          failureCode = "GENERATED_DESIGN_FILE";
          failureRecovery =
            "Leave the direction as written and build from it; a different look needs designSite, not a hand edit.";
          throw new Error(
            "Bloom writes DESIGN.md and .bloom/design.json from the design director's direction. Everything else in the project is yours to write.",
          );
        }

        if (session.designResultUnread && changes.some((change) => isUiSourcePath(change.path))) {
          failureCode = "DESIGN_NOT_READ";
          failureRecovery =
            "Read the direction designSite just returned, then write the UI from it in your next step.";
          throw new Error(
            "designSite was called in this same step, so these files were written before its direction could be read. Build the page from the returned direction.",
          );
        }

        if (!session.appliedDirection && changes.some((change) => isUiSourcePath(change.path))) {
          failureCode = "DESIGN_REQUIRED";
          failureRecovery =
            "Call designSite first; it writes the design system and DESIGN.md, then build the UI against that contract.";
          throw new Error(
            "This project has no design yet. Call designSite before writing UI files so the page is built from a direction written for it instead of ad-hoc colors and fonts.",
          );
        }

        try {
          validateSourceTextEscaping(
            [
              ...creates.map(({ path, content }) => ({ path, text: content })),
              ...[...editsByPath].flatMap(([path, edits]) => edits.map((edit) => ({ path, text: edit.newString }))),
            ],
          );
        } catch (error) {
          failureCode = "MALFORMED_SOURCE_ESCAPING";
          failureRecovery =
            "Resubmit all changes with normal source quotes and real newlines. The tool input is already JSON-decoded, so do not prefix source quotes with backslashes.";
          throw error;
        }

        const { contents, ...result } = await applyProjectChanges(
          projectId,
          changes,
          { signal },
        );

        session.recordEdit();
        if (result.validation?.status === "passed") {
          session.recordTypecheckPassed();
        }
        const touchedViolations: DesignViolation[] = [];
        for (const content of contents) {
          session.recordPagePath(content.path, content.after !== null);
          if (!session.baselines.has(content.path)) {
            session.baselines.set(content.path, content.before);
          }
          if (content.after === null) continue;
          touchedViolations.push(...lintSourceChange({
            path: content.path,
            before: session.baselines.get(content.path) ?? null,
            after: content.after,
          }));
        }

        const warning = result.tscError?.slice(0, 500);

        writer.write({
          id: toolCallId,
          type: "data-file-changes",
          data: {
            status: STATUS.COMPLETE,
            files: labels.map(({ path }) => ({
              path,
              status: FILE_STATUS.SUCCESS,
            })),
            ...(warning ? { warning } : {}),
          },
        });

        const smallRewrites = contents.filter((content) => {
          if (content.before === null || content.after === null || !creates.some((create) => create.path === content.path)) return false;
          const beforeLines = content.before.split("\n");
          const afterLines = new Set(content.after.split("\n"));
          const kept = beforeLines.filter((line) => afterLines.has(line)).length;
          return beforeLines.length >= 20 && kept / beforeLines.length >= 0.7;
        });
        const crowded = contents.flatMap((content) => {
          const now = crowdedComponentFile(content.path, content.after);
          return now && !crowdedComponentFile(content.path, content.before) ? [`${content.path} (${now.lines} lines, ${now.components} components)`] : [];
        });
        const files = buildApplyChangesFiles(
          result.files,
          contents,
          { validation: result.validation, tscError: result.tscError },
        );

        return {
          files,
          validation: result.validation,
          tscError: result.tscError,
          ...(smallRewrites.length > 0
            ? { editNote: `${smallRewrites.map((content) => content.path).join(", ")} kept most lines unchanged. For a few focused changes, send them as replace entries in one call instead of rewriting the file; it is faster and keeps context small.` }
            : {}),
          ...(crowded.length > 0
            ? { structureNote: `${crowded.join(", ")} holds several components in one file. Give each section and each reusable control its own file under components/, keep the page file a Server Component that composes them, and mark only the files that need state with "use client". Split it in one applyChanges call.` }
            : {}),
          ...(touchedViolations.length > 0
            ? {
              designViolations: summarizeViolations(touchedViolations, 20),
              designNote:
                `The changes were saved, but ${touchedViolations.length} line(s) break the design contract. Fix them in your next applyChanges call. Do not finish with design-contract violations.`,
            }
            : {}),
        };
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Could not apply changes";

        writer.write({
          id: toolCallId,
          type: "data-file-changes",
          data: {
            status: STATUS.ERROR,
            files: labels.map(({ path }) => ({
              path,
              status: FILE_STATUS.ERROR,
              error: message,
            })),
            error: { message },
          },
        });

        return {
          files: labels.map(({ path }) => ({
            path,
            status: "error" as const,
            error: message,
          })),
          error: toolError(
            failureCode,
            error,
            failureRecovery,
          ),
        };
      }
    },
    toModelOutput: async ({ output }) => ({ type: "json" as const, value: output }),
  });
