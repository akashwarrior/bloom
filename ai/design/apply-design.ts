import z from "zod/v4";

import type { DesignPass } from "@/ai/design/design-pass";
import { FILE_STATUS, STATUS } from "@/ai/message/data-part";
import type { ToolParams } from "@/ai/tools";
import { toolErrorSchema, toolFailure, typeScriptValidationSchema, tscErrorSchema } from "@/ai/tools/schemas";
import { presetForComponents, type DesignSelection } from "@/lib/design/design-selection";
import { designNotesSchema, effectivePreset, type DesignNotes } from "@/lib/design/design-skill";
import { colorProblems, resolveFonts, storedDirection, type DesignDirection } from "@/lib/design/direction";
import { GOOGLE_FONT_CATALOG } from "@/lib/design/google-fonts.server";
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
  direction: DesignDirection;
  /** Preset compatibility notes from shadcn's own constraints. */
  notes: string[];
};

type DesignPreparation =
  | { prepared: PreparedDesign }
  | { failure: ReturnType<typeof toolFailure> };

/**
 * Checks the direction mechanically (legible color pairs, fonts next/font can
 * load) and resolves its component base into the preset `shadcn apply` writes.
 * Problems go back to the director as facts to fix, not as style advice.
 */
export async function prepareDesign({
  input,
  signal,
}: {
  input: DesignSelection;
  signal?: AbortSignal;
}): Promise<DesignPreparation> {
  const fonts = resolveFonts(input.direction.typography, GOOGLE_FONT_CATALOG);
  const problems = [...colorProblems(input.direction.color), ...("problems" in fonts ? fonts.problems : [])];
  if (problems.length > 0) {
    return {
      failure: toolFailure(
        "DESIGN_DIRECTION_INVALID",
        new Error(problems.map((problem) => `- ${problem}`).join("\n")),
        "Fix exactly these values and submit the whole direction again. Keep the idea; change only what is listed.",
      ),
    };
  }
  try {
    const { theme, resolved, notes } = await prepareShadcnTheme(
      presetForComponents(input.components, input.direction.color.mode),
      signal,
    );
    return {
      prepared: {
        theme: { input: theme, resolved },
        direction: storedDirection(input.direction),
        notes,
      },
    };
  } catch (error) {
    const rejected = error instanceof Error && /returned 4\d\d/.test(error.message);
    return {
      failure: toolFailure("SHADCN_THEME_FAILED", error, rejected
        ? "shadcn rejected these component values. Change the values named in the message and submit again."
        : "This is a network failure, not a problem with the direction. Submit the same direction once more."),
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

/** Apply a prepared direction and its component base to the project and return the main-agent-facing result. */
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
    const sampled = new Set(designNotes.inspiration.map((frame) => frame.number));
    const direction: DesignDirection = {
      ...prepared.direction,
      references: prepared.direction.references.filter((reference) => sampled.has(reference.frame)),
    };
    const { paths, contents, validation, tscError, warnings } = await writeDesignSystem({
      projectId,
      signal,
      logger,
      theme,
      notes: designNotes,
      direction,
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
    session.appliedDesign = { theme: effectivePreset(theme, direction), direction };
    session.designedThisRun = true;
    session.designDoc = contents.find((content) => content.path === "DESIGN.md")?.after ?? null;
    session.designReferences = direction.references.flatMap((reference) => {
      const frame = designNotes.inspiration.find((entry) => entry.number === reference.frame);
      return frame ? [{ frame: frame.number, url: frame.assetUrl, borrow: reference.borrow }] : [];
    });
    await logger.write("design.applied", {
      tool: toolName,
      preset: theme.input,
      code: theme.resolved.code,
      direction,
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
        : "If the message names fonts, change them; otherwise this is an environment failure and the same direction can be submitted once more.",
    );
  }
}
