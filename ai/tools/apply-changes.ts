import { tool } from "ai";
import z from "zod/v4";

import { FILE_STATUS, STATUS } from "@/ai/message/data-part";
import type { ToolParams } from "@/ai/tools";
import {
  applyProjectChanges,
  exploreProjectFiles,
} from "@/lib/runtime/runtime-service.server";
import {
  projectPathSchema,
  toolError,
  toolErrorSchema,
} from "@/ai/tools/schemas";
import { validateSourceTextEscaping } from "@/ai/source-change-policy";
import type { LineEdit } from "@/lib/runtime/source-files.server";
import { lintSourceChange, summarizeViolations } from "@/lib/design/lint";
import { resolveGeneratedImageForModel } from "@/lib/generated-assets.server";
import { modelAssetFilename } from "@/lib/model-asset-reference";
import { applyChangesInputSchema, groupApplyChanges } from "./apply-changes-input";

const LINE_NUMBER_PREFIX = /^\s*\d+\t/;

/** Drops "12\t" prefixes when a model pastes numbered readFiles output back as content. */
function stripLineNumbers(content: string) {
  const lines = content.split("\n");
  const numbered = lines.filter((line) => line.length > 0);
  if (numbered.length === 0 || !numbered.every((line) => LINE_NUMBER_PREFIX.test(line))) return content;
  return lines.map((line) => line.replace(LINE_NUMBER_PREFIX, "")).join("\n");
}

/** Numbered lines of the edited regions in the new file, so the model can verify and keep editing without rereading. */
function editExcerpts(after: string, edits: LineEdit[]) {
  const lines = after.split("\n");
  let offset = 0;
  const windows: Array<[number, number]> = [];
  for (const edit of [...edits].sort((a, b) => a.startLine - b.startLine)) {
    const added = edit.content.length === 0 ? 0 : edit.content.replace(/\n$/, "").split("\n").length;
    const start = edit.startLine + offset;
    windows.push([Math.max(1, start - 2), Math.min(lines.length, start + Math.max(added, 1) + 1)]);
    offset += added - (edit.endLine - edit.startLine + 1);
  }
  return windows
    .map(([from, to]) => lines.slice(from - 1, to).map((line, index) => `${from + index}\t${line}`).join("\n"))
    .join("\n...\n")
    .slice(0, 4_000);
}

const outputFileSchema = z.strictObject({
  path: projectPathSchema,
  operation: z.enum(["created", "edited", "deleted", "moved"]),
  addedLines: z.number().int().nonnegative(),
  deletedLines: z.number().int().nonnegative(),
});

export const applyChanges = ({
  projectId,
  writer,
  mode,
  signal,
  session,
}: ToolParams) => {
  const outputSchema = z.strictObject({
    status: z.enum(["success", "error"]),
    files: z.array(outputFileSchema),
    changedPaths: z.array(projectPathSchema),

    validation: z
      .strictObject({
        status: z.enum([
          "skipped",
          "passed",
          "failed",
          "timed-out",
          "unavailable",
        ]),
        exitCode: z.number().int().nullable(),
        durationMs: z.number().int().nonnegative(),
        timedOut: z.boolean(),
        outputTruncated: z.boolean(),
      })
      .optional(),

    edited: z
      .array(
        z.strictObject({
          path: projectPathSchema,
          totalLines: z.number().int().nonnegative(),
          excerpt: z.string(),
        }),
      )
      .optional(),
    editNote: z.string().max(1_000).optional(),
    tscError: z.string().max(6_000).nullable().optional(),
    designViolations: z.array(z.string()).max(20).optional(),
    designNote: z.string().max(1_000).optional(),
    anchorFrames: z
      .array(
        z.strictObject({
          section: z.string(),
          frame: z.number().int().positive(),
          url: z.string().startsWith("/api/assets/"),
        }),
      )
      .max(3)
      .optional(),
    error: toolErrorSchema.optional(),
  });

  return tool({
    description:
      "Edit project files in one atomic batch. Each entry has type create, update, or delete; entries may mix types and target different files. If any entry is invalid, nothing is applied. The result shows each updated region with its new line numbers.",
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
            ...edit,
            content: session.resolveAssetSlots(stripLineNumbers(edit.content)),
          })),
        );
      }
      let failureCode = "FILE_CHANGE_REJECTED";
      let failureRecovery =
        "Inspect or reread the exact path, then submit a corrected atomic batch. Do not guess files or retry the same input.";

      const changes = [
        ...creates.map((change) => ({
          type: "create" as const,
          path: change.path,
          content: session.resolveAssetSlots(stripLineNumbers(change.content)),
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
        if (changes.length === 0) {
          throw new Error("At least one file operation is required");
        }

        if (changes.length > 40) {
          throw new Error(
            "At most 40 file operations are allowed per batch",
          );
        }

        if (mode !== "BUILD") {
          throw new Error("File changes are disabled in plan mode");
        }

        try {
          validateSourceTextEscaping(
            [
              ...creates.map(({ path, content }) => ({ path, text: content })),
              ...[...editsByPath].flatMap(([path, edits]) => edits.map((edit) => ({ path, text: edit.content }))),
            ],
          );
        } catch (error) {
          failureCode = "MALFORMED_SOURCE_ESCAPING";
          failureRecovery =
            "Resubmit the full atomic batch with normal source quotes and real newlines. The tool input is already JSON-decoded, so do not prefix source quotes with backslashes.";
          throw error;
        }

        const { contents, ...result } = await applyProjectChanges(
          projectId,
          changes,
          { signal },
        );

        session.recordToolSuccess("applyChanges");
        session.lastValidation = result.validation.status;
        session.lastTscError = result.tscError;
        session.recordEdit();
        const lintEnabled = session.gated || session.designSystemPresent;
        const reference = session.referenceCopy();
        for (const content of contents) {
          if (!session.baselines.has(content.path)) {
            session.baselines.set(content.path, content.before);
          }
          session.writtenPaths.add(content.path);
          if (session.gated) session.trackAssetSlots(content.path, content.after);
          if (!lintEnabled || content.after === null) {
            session.violations.delete(content.path);
            continue;
          }
          const violations = lintSourceChange({
            path: content.path,
            before: session.baselines.get(content.path) ?? null,
            after: content.after,
            reference,
          });
          if (violations.length > 0) {
            session.violations.set(content.path, violations);
          } else {
            session.violations.delete(content.path);
          }
        }
        const anchor = session.anchor;
        const anchorFrames = anchor
          ? contents.flatMap((content) => {
            if (content.before !== null || content.after === null) return [];
            const section = session.sectionForPath(content.path);
            const frame = section?.anchorFrame
              ? anchor.frames.find((candidate) => candidate.number === section.anchorFrame)
              : null;
            if (!section || !frame || session.viewedFrames.has(frame.number)) return [];
            session.viewedFrames.add(frame.number);
            return [{ section: section.id, frame: frame.number, url: frame.assetUrl }];
          }).slice(0, 3)
          : [];
        const openViolations = session.openViolations();
        const touchedViolations = openViolations.filter((violation) =>
          contents.some((content) => content.path === violation.path),
        );

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
        const edited = [...editsByPath].flatMap(([path, edits]) => {
          const after = contents.find((content) => content.path === path)?.after;
          return after == null
            ? []
            : [{ path, totalLines: after.split("\n").length, excerpt: editExcerpts(after, edits) }];
        });

        return {
          status: "success" as const,
          ...result,
          ...(edited.length > 0 ? { edited } : {}),
          ...(smallRewrites.length > 0
            ? { editNote: `${smallRewrites.map((content) => content.path).join(", ")} kept most lines unchanged. For focused changes use one update entry with the line range instead of rewriting the whole file; it is faster and keeps context small.` }
            : {}),
          ...(touchedViolations.length > 0
            ? {
              designViolations: summarizeViolations(touchedViolations, 20),
              designNote:
                `The changes were saved, but ${touchedViolations.length} line(s) break the design contract. Fix them in your next applyChanges call: use the design tokens from the brief and original copy. finishBuild will not pass while design violations remain${openViolations.length > touchedViolations.length ? ` (${openViolations.length} open across the project)` : ""}.`,
            }
            : {}),
          ...(anchorFrames.length > 0 ? { anchorFrames } : {}),
        };
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Could not apply changes";
        if (/runtime is not prepared|docker|container/i.test(message)) {
          session.recordToolFailure("applyChanges", message);
        }

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

        const changedPaths = await exploreProjectFiles(
          projectId,
          signal,
        )
          .then((inspection) => inspection.changedPaths)
          .catch(() => []);

        return {
          status: "error" as const,
          files: [],
          changedPaths,
          error: toolError(
            failureCode,
            error,
            failureRecovery,
          ),
        };
      }
    },
    toModelOutput: async ({ output }) => {
      const { anchorFrames, ...rest } = output;
      if (!anchorFrames || anchorFrames.length === 0) {
        return { type: "json" as const, value: rest };
      }
      const frames = await Promise.all(
        anchorFrames.map(async (frame) => ({
          frame,
          image: await resolveGeneratedImageForModel(projectId, frame.url).catch(() => null),
        })),
      );
      return {
        type: "content" as const,
        value: [
          { type: "text" as const, text: JSON.stringify(rest) },
          ...frames.flatMap(({ frame, image }) => image
            ? [
              {
                type: "text" as const,
                text: `Anchor frame ${frame.frame}, which section "${frame.section}" adapts. Compare the component you just wrote against it: section height and padding, grid and alignment, headline scale, media size and placement, surface color. Patch the component if it is thinner, smaller, or more generic than this frame.`,
              },
              {
                type: "file" as const,
                data: { type: "data" as const, data: image.data },
                mediaType: image.mediaType,
                filename: modelAssetFilename(image.assetId, `public-reference-frame-${frame.frame}.webp`),
              },
            ]
            : []),
        ],
      };
    },
  });
};
