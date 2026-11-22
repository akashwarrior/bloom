import "server-only";

import z from "zod/v4";

import { designNotesSchema, generateDesignDoc, type DesignNotes } from "@/lib/design/design-skill";
import {
  BLOOM_FONTS_PATH,
  directionCss,
  fontsModule,
  resolveFonts,
  storedDirectionSchema,
  withDirectionCss,
  withDirectionLayout,
  type DesignDirection,
} from "@/lib/design/direction";
import { GOOGLE_FONT_CATALOG } from "@/lib/design/google-fonts.server";
import { resolvedShadcnThemeSchema, shadcnThemeSchema, type ResolvedPreset } from "@/lib/design/shadcn-theme";
import type { RequestTraceLogger } from "@/lib/request-trace-logger.server";
import {
  applyProjectChanges,
  captureProjectSourceSnapshot,
  runProjectCommand,
} from "@/lib/runtime/runtime-service.server";
import { changedSourcePaths, type AtomicFileChange } from "@/lib/runtime/source-files.server";

/** The accepted design, kept in the project so the theme can be changed later without the agent. */
export const DESIGN_STATE_PATH = ".bloom/design.json";

const designStateSchema = z.object({
  theme: z.object({
    input: shadcnThemeSchema,
    resolved: resolvedShadcnThemeSchema,
  }),
  notes: designNotesSchema,
  /** The art direction written for this project; absent in projects designed before directions existed. */
  direction: storedDirectionSchema.nullish(),
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
  theme: ResolvedPreset;
  notes: DesignNotes;
  /** The direction to keep with the design. Its tokens and fonts are layered over the preset while `overlay` is true. */
  direction?: DesignDirection | null;
  onPlanned?: (paths: string[]) => void;
};

/** Restores every file changed since the snapshot, deleting files that did not exist before. */
async function rollbackToSnapshot(
  projectId: string,
  before: Array<{ path: string; content: string }>,
  logger?: RequestTraceLogger,
) {
  // Use a fresh timeout instead of the request signal: the rollback must still
  // run when the apply failed because the request was aborted.
  const signal = AbortSignal.timeout(180_000);
  const after = await captureProjectSourceSnapshot(projectId, signal);
  const changed = changedSourcePaths(before, after);
  if (changed.length === 0) return;

  const beforeByPath = new Map(before.map((file) => [file.path, file.content]));
  const changes: AtomicFileChange[] = changed.map((path) => {
    const content = beforeByPath.get(path);
    return content === undefined
      ? { type: "delete", path }
      : { type: "create", path, content };
  });
  await applyProjectChanges(projectId, changes, { signal, typecheck: false });
  await logger?.write("design_system.rolled_back", { files: changed });
}

const GLOBALS_PATH = "app/globals.css";
const LAYOUT_PATH = "app/layout.tsx";

type FileChange = { type: "create"; path: string; content: string } | { type: "delete"; path: string };

/**
 * The file changes that layer a direction's colors, radius and fonts over what
 * `shadcn apply` wrote, or that remove an earlier layer when there is none.
 */
export function directionOverlayChanges(
  files: Array<{ path: string; content: string }>,
  direction: DesignDirection | null,
): { changes: FileChange[]; warnings: string[] } {
  const changes: FileChange[] = [];
  const warnings: string[] = [];
  const content = (path: string) => files.find((file) => file.path === path)?.content ?? null;
  const css = content(GLOBALS_PATH);
  const layout = content(LAYOUT_PATH);
  const hasFontsModule = content(BLOOM_FONTS_PATH) !== null;
  const put = (path: string, before: string | null, after: string) => {
    if (before !== after) changes.push({ type: "create", path, content: after });
  };

  if (!direction?.overlay) {
    if (css !== null) put(GLOBALS_PATH, css, withDirectionCss(css, null));
    if (layout !== null) put(LAYOUT_PATH, layout, withDirectionLayout(layout, null) ?? layout);
    if (hasFontsModule) changes.push({ type: "delete", path: BLOOM_FONTS_PATH });
    return { changes, warnings };
  }

  if (css === null) throw new Error(`${GLOBALS_PATH} is missing, so the design direction cannot be applied.`);
  const resolved = resolveFonts(direction.typography, GOOGLE_FONT_CATALOG);
  if ("problems" in resolved) throw new Error(resolved.problems.join(" "));
  const patchedLayout = layout === null ? null : withDirectionLayout(layout, direction.color.mode);
  if (patchedLayout === null) {
    warnings.push(`${LAYOUT_PATH} no longer has the shape shadcn generated, so the direction's fonts and color mode were not wired in; its colors still apply.`);
    put(GLOBALS_PATH, css, withDirectionCss(css, directionCss(direction, null)));
    if (hasFontsModule) changes.push({ type: "delete", path: BLOOM_FONTS_PATH });
    return { changes, warnings };
  }
  put(GLOBALS_PATH, css, withDirectionCss(css, directionCss(direction, resolved.fonts)));
  put(BLOOM_FONTS_PATH, content(BLOOM_FONTS_PATH), fontsModule(resolved.fonts));
  put(LAYOUT_PATH, layout, patchedLayout);
  return { changes, warnings };
}

/**
 * Applies a shadcn create preset with `shadcn apply`, layers the project's art
 * direction over it, then writes Bloom's design contract and state.
 * `shadcn apply` owns lib/utils.ts and components/ui and writes the base of
 * app/globals.css and app/layout.tsx; Bloom adds the direction's tokens and
 * fonts to those two files and owns app/bloom-fonts.ts, DESIGN.md and
 * .bloom/design.json. A failed apply, or a later write failure, restores every
 * file the operation touched so a partial design never survives.
 */
export async function writeDesignSystem({
  projectId,
  signal,
  logger,
  theme,
  notes,
  direction = null,
  onPlanned,
}: WriteDesignSystemInput) {
  const warnings: string[] = [];
  const beforeApply = await captureProjectSourceSnapshot(projectId, signal);

  let applied: Awaited<ReturnType<typeof runProjectCommand>>;
  try {
    applied = await runProjectCommand(
      projectId,
      { executable: "pnpm", args: ["exec", "shadcn", "apply", theme.resolved.code, "--yes"], cwd: ".", timeoutMs: 240_000 },
      signal,
    );
  } catch (error) {
    await rollbackToSnapshot(projectId, beforeApply, logger).catch((rollbackError) => {
      console.error("Failed to roll back shadcn apply", rollbackError);
    });
    throw error;
  }

  await logger?.write("shadcn_theme.applied", {
    preset: theme.input,
    code: theme.resolved.code,
    exitCode: applied.exitCode,
    changedFiles: applied.changedFiles.length,
    stderr: applied.exitCode === 0 ? null : applied.stderr.slice(-1500),
  });
  if (applied.exitCode !== 0) {
    await rollbackToSnapshot(projectId, beforeApply, logger).catch((rollbackError) => {
      console.error("Failed to roll back shadcn apply", rollbackError);
    });
    const detail = (applied.stderr || applied.stdout).trim().slice(-1200);
    throw new Error(`shadcn apply ${theme.resolved.code} failed${detail ? `: ${detail}` : ""}`);
  }

  const state: DesignState = { theme, notes, direction };

  try {
    const afterApply = await captureProjectSourceSnapshot(projectId, signal);
    const overlay = directionOverlayChanges(afterApply, direction);
    warnings.push(...overlay.warnings);
    const changes: FileChange[] = [
      ...overlay.changes,
      { type: "create", path: "DESIGN.md", content: generateDesignDoc(theme, { notes, direction }) },
      { type: "create", path: DESIGN_STATE_PATH, content: `${JSON.stringify(state, null, 2)}\n` },
    ];
    onPlanned?.(changes.map((change) => change.path));
    const { contents, ...result } = await applyProjectChanges(projectId, changes, { signal });
    let validation = result.validation;
    let tscError = result.tscError;
    const errorFiles = [...new Set([...(tscError ?? "").matchAll(/^([^\s(]+)\(\d+,\d+\): error/gm)].map((match) => match[1]!))];
    if (validation.status === "failed" && errorFiles.includes(BLOOM_FONTS_PATH)) {
      const detail = (tscError ?? "").split("\n").filter((line) => line.startsWith(BLOOM_FONTS_PATH)).join(" ").slice(0, 800);
      throw new Error(`next/font could not load the direction's fonts: ${detail} Choose families and weights that exist on Google Fonts.`);
    }
    const restorable = errorFiles.flatMap((path) => beforeApply.find((file) => file.path === path) ?? []);
    if (validation.status === "failed" && errorFiles.length > 0 && errorFiles.every((path) => path.startsWith("components/ui/")) && restorable.length === errorFiles.length) {
      const reverted = await applyProjectChanges(
        projectId,
        restorable.map((file) => ({ type: "create" as const, path: file.path, content: file.content })),
        { signal },
      );
      validation = reverted.validation;
      tscError = reverted.tscError;
      warnings.push(`shadcn apply left ${errorFiles.join(", ")} failing the type check, so Bloom restored the previous version of ${errorFiles.length === 1 ? "that file" : "those files"}.`);
      await logger?.write("shadcn_theme.reverted", { files: errorFiles, validation: validation.status });
    }
    return { paths: changes.map((change) => change.path), contents, validation, tscError, warnings };
  } catch (error) {
    await rollbackToSnapshot(projectId, beforeApply, logger).catch((rollbackError) => {
      console.error("Failed to roll back the design system write", rollbackError);
    });
    throw error;
  }
}
