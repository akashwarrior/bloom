import { z } from "zod";

import { FILE_STATUS, STATUS } from "@/ai/message/data-part";
import type { ToolParams } from "@/ai/tools";
import { toolErrorSchema, toolFailure, typeScriptValidationSchema, tscErrorSchema } from "@/ai/tools/schemas";
import type { DesignSelection } from "@/ai/design/design-selection";
import { colorProblems, proofProblems, resolveFonts, storedDirection, type DesignDirection } from "@/ai/design/direction";
import { GOOGLE_FONT_CATALOG } from "@/ai/design/google-fonts.server";
import { writeDesignSystem } from "@/ai/design/write-design-system.server";

export const designOutputSchema = z.union([
  z.strictObject({
    status: z.literal("applied"),
    files: z.array(z.string()),
    validation: typeScriptValidationSchema,
    tscError: tscErrorSchema,
    warnings: z.array(z.string()),
  }),
  z.strictObject({
    status: z.literal("error"),
    error: toolErrorSchema,
  }),
]);

export type DesignOutput = z.infer<typeof designOutputSchema>;

type DesignContext = Pick<ToolParams, "projectId" | "signal" | "writer" | "logger" | "session">;

type DesignPreparation =
  | { direction: DesignDirection }
  | { failure: ReturnType<typeof toolFailure> };

/**
 * Checks the direction mechanically: legible color pairs, fonts next/font can
 * load, and no proof the page would have to invent. Problems go back to the
 * director as facts to fix, not as style advice.
 */
export function prepareDesign({ input, request = "" }: {
  input: DesignSelection;
  /** The user's request, so proof they supplied themselves is not questioned. */
  request?: string;
}): DesignPreparation {
  const fonts = resolveFonts(input.direction.typography, GOOGLE_FONT_CATALOG);
  const problems = [
    ...colorProblems(input.direction.color),
    ...("problems" in fonts ? fonts.problems : []),
    ...proofProblems(input.direction, request),
  ];
  if (problems.length === 0) return { direction: storedDirection(input.direction) };
  return {
    failure: toolFailure(
      "DESIGN_DIRECTION_INVALID",
      new Error(problems.map((problem) => `- ${problem}`).join("\n")),
      "Fix exactly these values and submit the whole direction again. Keep the idea; change only what is listed.",
    ),
  };
}

/** Writes a checked direction into the project and returns the main-agent-facing result. */
export async function applyDesign(
  { projectId, signal, writer, logger, session }: DesignContext,
  toolCallId: string,
  prepared: DesignDirection,
): Promise<DesignOutput> {
  try {
    const shown = new Set(session.designReferences.map((frame) => frame.number));
    const direction: DesignDirection = {
      ...prepared,
      references: prepared.references.filter((reference) => shown.has(reference.frame)),
    };
    const { paths, contents, validation, tscError, warnings } = await writeDesignSystem({
      projectId,
      signal,
      logger,
      notes: { inspiration: session.designReferences, conceptUrl: session.conceptUrl ?? undefined },
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
    for (const content of contents) {
      if (!session.baselines.has(content.path)) session.baselines.set(content.path, content.before);
    }
    writer.write({
      id: toolCallId,
      type: "data-file-changes",
      data: {
        status: STATUS.COMPLETE,
        files: paths.map((path) => ({ path, status: FILE_STATUS.SUCCESS })),
      },
    });

    session.recordEdit();
    session.appliedDirection = direction;
    session.appliedConceptUrl = session.conceptUrl;
    session.designedThisRun = true;
    session.designDoc = contents.find((content) => content.path === "DESIGN.md")?.after ?? null;

    return { status: "applied" as const, files: paths, validation, tscError, warnings };
  } catch (error) {
    return toolFailure(
      "DESIGN_APPLY_FAILED",
      error,
      "If the message names fonts, change them. For a transient service failure, submit the same direction once more.",
    );
  }
}
