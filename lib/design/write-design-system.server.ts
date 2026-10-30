import "server-only";

import z from "zod/v4";

import { designBriefSchema, SURFACE_ROLES, type DesignBrief } from "@/lib/design/brief";
import { loadBlockSources } from "@/lib/design/blocks.server";
import {
  generateDesignDoc,
  generateGlobalsCss,
  generateLayout,
  isReplaceableLayout,
  patchButtonComponent,
  patchUtilsFile,
  type ResolvedFonts,
  type StyleOptions,
} from "@/lib/design/design-system";
import { shadcnThemeSchema, type ResolvedShadcnTheme, type ShadcnTheme } from "@/lib/design/shadcn-theme";
import type { RequestTraceLogger } from "@/lib/request-trace-logger.server";
import {
  applyProjectChanges,
  captureProjectSourceSnapshot,
  runProjectCommand,
} from "@/lib/runtime/runtime-service.server";

/** The accepted design, kept in the project so the theme can be changed later without the agent. */
export const DESIGN_STATE_PATH = ".bloom/design.json";

export const designStateSchema = z.object({
  brief: designBriefSchema,
  shadcn: shadcnThemeSchema.nullable(),
  surfaceRoles: z.array(z.enum(SURFACE_ROLES)).nullable(),
  style: z.object({ highlight: z.enum(["color", "italic", "marker"]).optional() }),
  docAppendix: z.string(),
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
  brief: DesignBrief;
  fonts: ResolvedFonts;
  style: StyleOptions;
  theme?: { input: ShadcnTheme; resolved: ResolvedShadcnTheme };
  surfaceRoles: DesignState["surfaceRoles"];
  docAppendix: string;
  includeBlocks: boolean;
  onPlanned?: (paths: string[]) => void;
};

/**
 * Applies a shadcn create preset (when given) with `shadcn apply`, then writes
 * Bloom's design system: tokens, fonts, DESIGN.md, the cn/button patches, and
 * the design state. shadcn components that fail the type check after apply are
 * restored to their previous version.
 */
export async function writeDesignSystem({
  projectId,
  signal,
  logger,
  brief,
  fonts,
  style,
  theme,
  surfaceRoles,
  docAppendix,
  includeBlocks,
  onPlanned,
}: WriteDesignSystemInput) {
  const warnings: string[] = [];
  const beforeApply = theme ? await captureProjectSourceSnapshot(projectId, signal) : [];
  if (theme) {
    const applied = await runProjectCommand(
      projectId,
      { executable: "pnpm", args: ["exec", "shadcn", "apply", theme.resolved.code, "--yes"], cwd: ".", timeoutMs: 240_000 },
      signal,
    );
    await logger?.write("shadcn_theme.applied", {
      preset: theme.input,
      code: theme.resolved.code,
      exitCode: applied.exitCode,
      changedFiles: applied.changedFiles.length,
      stderr: applied.exitCode === 0 ? null : applied.stderr.slice(-1500),
    });
    if (applied.exitCode !== 0) {
      warnings.push(`shadcn apply ${theme.resolved.code} failed, so components/ui keeps its previous style. Colors and fonts are still applied.`);
    }
  }

  const snapshot = await captureProjectSourceSnapshot(projectId, signal);
  const fileContent = (path: string) => snapshot.find((file) => file.path === path)?.content ?? null;
  const state: DesignState = {
    brief,
    shadcn: theme?.input ?? null,
    surfaceRoles,
    style: style.highlight ? { highlight: style.highlight } : {},
    docAppendix,
  };
  const changes: Array<{ type: "create"; path: string; content: string }> = [
    { type: "create", path: "app/globals.css", content: generateGlobalsCss(brief, fonts, style) },
    { type: "create", path: "DESIGN.md", content: `${generateDesignDoc(brief, fonts)}${docAppendix ? `\n\n${docAppendix}` : ""}` },
    { type: "create", path: DESIGN_STATE_PATH, content: `${JSON.stringify(state, null, 2)}\n` },
    ...(includeBlocks ? (await loadBlockSources()).map((block) => ({ type: "create" as const, ...block })) : []),
  ];
  const patchedUtils = patchUtilsFile(fileContent("lib/utils.ts"));
  if (patchedUtils) changes.push({ type: "create", path: "lib/utils.ts", content: patchedUtils });
  if (isReplaceableLayout(fileContent("app/layout.tsx"))) {
    changes.push({
      type: "create",
      path: "app/layout.tsx",
      content: generateLayout(brief, fonts, {
        toaster: Boolean(fileContent("components/ui/toast.tsx")),
        tooltip: Boolean(fileContent("components/ui/tooltip.tsx")),
      }),
    });
  } else {
    warnings.push("app/layout.tsx was customized, so fonts were not wired automatically. Load the brief fonts with next/font/google using the variables --font-display-face and --font-body-face on <html>.");
  }
  const patchedButton = patchButtonComponent(fileContent("components/ui/button.tsx"), { keepRadius: Boolean(theme) });
  if (patchedButton) changes.push({ type: "create", path: "components/ui/button.tsx", content: patchedButton });

  onPlanned?.(changes.map((change) => change.path));
  const { contents, ...result } = await applyProjectChanges(projectId, changes, { signal });
  let validation = result.validation.status;
  let tscError = result.tscError;
  const errorFiles = [...new Set([...(tscError ?? "").matchAll(/^([^\s(]+)\(\d+,\d+\): error/gm)].map((match) => match[1]!))];
  const restorable = errorFiles.flatMap((path) => beforeApply.find((file) => file.path === path) ?? []);
  if (theme && validation === "failed" && errorFiles.length > 0 && errorFiles.every((path) => path.startsWith("components/ui/")) && restorable.length === errorFiles.length) {
    const reverted = await applyProjectChanges(
      projectId,
      restorable.map((file) => ({ type: "create" as const, path: file.path, content: file.content })),
      { signal },
    );
    validation = reverted.validation.status;
    tscError = reverted.tscError;
    warnings.push(`shadcn apply left ${errorFiles.join(", ")} failing the type check, so Bloom restored the previous version of ${errorFiles.length === 1 ? "that file" : "those files"}.`);
    await logger?.write("shadcn_theme.reverted", { files: errorFiles, validation });
  }
  return { paths: changes.map((change) => change.path), contents, validation, tscError, warnings };
}
