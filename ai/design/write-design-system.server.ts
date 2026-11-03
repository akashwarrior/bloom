import "server-only";

import { z } from "zod";

import { designNotesSchema, generateDesignDoc, type DesignNotes } from "@/ai/design/design-skill";
import { resolveFonts, storedDirectionSchema, type DesignDirection } from "@/ai/design/direction";
import { GOOGLE_FONT_CATALOG } from "@/ai/design/google-fonts.server";
import type { RequestTraceLogger } from "@/ai/trace-logger.server";
import { applyProjectChanges, captureProjectSourceSnapshot, restoreWorkspaceSnapshot } from "@/lib/runtime/runtime-service.server";
import { skippedTypeScriptValidation } from "@/lib/runtime/typecheck-diagnostics";

/** The accepted design, kept in the project so later runs build on the same direction. */
export const DESIGN_STATE_PATH = ".bloom/design.json";

const designStateSchema = z.object({
  notes: designNotesSchema,
  direction: storedDirectionSchema,
});

export type DesignState = z.infer<typeof designStateSchema>;

export function readDesignState(files: Array<{ path: string; content: string }>): DesignState | null {
  const file = files.find((entry) => entry.path === DESIGN_STATE_PATH);
  if (!file) return null;
  try {
    const parsed = designStateSchema.safeParse(JSON.parse(file.content));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

type WriteDesignSystemInput = {
  projectId: string;
  signal?: AbortSignal;
  logger?: RequestTraceLogger;
  notes: DesignNotes;
  direction: DesignDirection;
  onPlanned?: (paths: string[]) => void;
};

/**
 * Saves the direction in the project as DESIGN.md and its machine-readable
 * state. Nothing else is generated: no stylesheet, tokens, fonts file or layout.
 * A failure restores both files, so a partial design never survives.
 */
export async function writeDesignSystem({ projectId, signal, logger, notes, direction, onPlanned }: WriteDesignSystemInput) {
  const resolved = resolveFonts(direction.typography, GOOGLE_FONT_CATALOG);
  if ("problems" in resolved) throw new Error(resolved.problems.join(" "));
  const state: DesignState = { notes, direction };
  const changes = [
    { type: "create" as const, path: "DESIGN.md", content: generateDesignDoc(direction, resolved.fonts, notes) },
    { type: "create" as const, path: DESIGN_STATE_PATH, content: `${JSON.stringify(state, null, 2)}\n` },
  ];
  const before = await captureProjectSourceSnapshot(projectId, signal);
  onPlanned?.(changes.map((change) => change.path));

  try {
    const { contents } = await applyProjectChanges(projectId, changes, { signal, typecheck: false });
    return { paths: changes.map((change) => change.path), contents, ...skippedTypeScriptValidation(), warnings: [] as string[] };
  } catch (error) {
    await restoreWorkspaceSnapshot(projectId, before, AbortSignal.timeout(180_000)).then(
      () => logger?.write("design_system.rolled_back"),
      (rollbackError) => console.error("Failed to roll back the design system write", rollbackError),
    );
    throw error;
  }
}
