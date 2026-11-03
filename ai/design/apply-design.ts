import z from "zod/v4";

import type { DesignPass } from "@/ai/design/design-pass";
import { FILE_STATUS, STATUS } from "@/ai/message/data-part";
import type { ToolParams } from "@/ai/tools";
import { toolErrorSchema, toolFailure, typeScriptValidationSchema, tscErrorSchema } from "@/ai/tools/schemas";
import type { DesignSelection } from "@/lib/design/design-selection";
import { designNotesSchema, type DesignNotes } from "@/lib/design/design-skill";
import { prepareShadcnTheme, type ResolvedPreset } from "@/lib/design/shadcn-theme";
import { writeDesignSystem } from "@/lib/design/write-design-system.server";

export const designOutputSchema = z.union([
  z.strictObject({
    status: z.literal("applied"),
    files: z.array(z.string()),
    validation: typeScriptValidationSchema,
    tscError: tscErrorSchema,
    warnings: z.array(z.string()),
    next: z.string(),
  }),
  z.strictObject({
    status: z.literal("error"),
    error: toolErrorSchema,
  }),
]);

export type DesignOutput = z.infer<typeof designOutputSchema>;

type DesignContext = Pick<ToolParams, "projectId" | "signal" | "writer" | "logger" | "session">;

type PreparedDesign = {
  theme: ResolvedPreset;
  /** Preset compatibility notes from shadcn's own constraints. */
  notes: string[];
};

type DesignPreparation =
  | { prepared: PreparedDesign }
  | { failure: ReturnType<typeof toolFailure> };

/** Resolve a shadcn create preset into the exact tokens `shadcn apply` will write. */
export async function prepareDesign({
  input,
  signal,
}: {
  input: DesignSelection;
  signal?: AbortSignal;
}): Promise<DesignPreparation> {
  try {
    const { theme, resolved, notes } = await prepareShadcnTheme(input.shadcn, signal);
    return { prepared: { theme: { input: theme, resolved }, notes } };
  } catch (error) {
    const rejected = error instanceof Error && /returned 4\d\d/.test(error.message);
    return {
      failure: toolFailure("SHADCN_THEME_FAILED", error, rejected
        ? "shadcn rejected these preset values. Change the values named in the message and submit the preset again."
        : "This is a network failure, not a problem with the preset. Submit the same preset once more."),
    };
  }
}

function notesForDesign(designPass: DesignPass): DesignNotes {
  return designNotesSchema.parse({
    inspiration: designPass.allFrames().map((frame) => ({
      number: frame.number,
      imageId: frame.imageId,
      assetUrl: frame.assetUrl,
      batch: frame.batch,
    })),
  });
}

/** Apply a resolved preset to the project and return the main-agent-facing result. */
export async function applyDesign(
  { projectId, signal, writer, logger, session }: DesignContext,
  designPass: DesignPass,
  toolCallId: string,
  prepared: PreparedDesign,
  toolName: string,
): Promise<DesignOutput> {
  try {
    const { theme, notes } = prepared;
    const designNotes = notesForDesign(designPass);
    const { paths, contents, validation, tscError, warnings } = await writeDesignSystem({
      projectId,
      signal,
      logger,
      theme,
      notes: designNotes,
      onPlanned: (planned) => writer.write({
        id: toolCallId,
        type: "data-file-changes",
        data: {
          status: STATUS.LOADING,
          files: planned.map((path) => ({ path, status: FILE_STATUS.PENDING })),
        },
      }),
    });
    warnings.unshift(...notes);
    for (const content of contents) {
      if (!session.baselines.has(content.path)) session.baselines.set(content.path, content.before);
    }
    writer.write({
      id: toolCallId,
      type: "data-file-changes",
      data: {
        status: STATUS.COMPLETE,
        files: paths.map((path) => ({ path, status: FILE_STATUS.SUCCESS })),
        summary: "Applied design system",
      },
    });

    session.recordToolSuccess(toolName);
    session.recordEdit();
    session.appliedDesign = { theme };
    await logger.write("design.applied", {
      tool: toolName,
      preset: theme.input,
      code: theme.resolved.code,
      inspiration: designNotes.inspiration.length,
      warnings,
    });

    return {
      status: "applied" as const,
      files: paths,
      validation,
      tscError,
      warnings,
      next: "Design applied. Stop; do not call applyDesign again.",
    };
  } catch (error) {
    return toolFailure(
      "DESIGN_APPLY_FAILED",
      error,
      session.abortReason
        ? "The workflow is stopping. Report this failure to the user."
        : "This is an environment failure, not a problem with the preset. Submit the same preset once more.",
    );
  }
}
