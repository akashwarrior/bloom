import "server-only";

import { DEFAULT_PRESET_CONFIG } from "shadcn/preset";

import { prepareShadcnTheme, shadcnThemeSchema, type ShadcnTheme } from "@/lib/design/shadcn-theme";
import { DESIGN_STATE_PATH, readDesignState, writeDesignSystem } from "@/lib/design/write-design-system.server";
import { getProjectRevisionFile } from "@/lib/project-source.server";
import {
  captureProjectSourceSnapshot,
  checkpointProjectRuntime,
  prepareProjectRuntime,
  runProjectCommand,
} from "@/lib/runtime/runtime-service.server";

async function revisionFile(projectId: string, path: string) {
  return getProjectRevisionFile(projectId, path).then((file) => file.content).catch(() => null);
}

/** The project's shadcn create inputs: the stored preset, or what components.json records. */
export async function getProjectTheme(projectId: string): Promise<{ theme: ShadcnTheme; hasDesignSystem: boolean }> {
  const stored = await revisionFile(projectId, DESIGN_STATE_PATH);
  if (stored) {
    const state = readDesignState([{ path: DESIGN_STATE_PATH, content: stored }]);
    if (state) return { theme: state.theme.input, hasDesignSystem: true };
  }
  const components = JSON.parse((await revisionFile(projectId, "components.json")) ?? "{}") as {
    style?: string;
    iconLibrary?: string;
    menuAccent?: string;
    menuColor?: string;
    tailwind?: { baseColor?: string };
  };
  const candidate = {
    ...DEFAULT_PRESET_CONFIG,
    style: components.style?.replace(/^(?:radix|base|aria)-/, ""),
    baseColor: components.tailwind?.baseColor,
    iconLibrary: components.iconLibrary,
    menuAccent: components.menuAccent,
    menuColor: components.menuColor,
    mode: "light",
  };
  const fields = shadcnThemeSchema.shape;
  const theme = Object.fromEntries(
    Object.entries(fields).map(([key, schema]) => {
      const value = schema.safeParse(candidate[key as keyof typeof candidate]);
      return [key, value.success ? value.data : schema.parse(key === "mode" ? "light" : DEFAULT_PRESET_CONFIG[key as keyof typeof DEFAULT_PRESET_CONFIG])];
    }),
  ) as ShadcnTheme;
  return { theme, hasDesignSystem: false };
}

/**
 * Applies shadcn create inputs chosen by the user. A Bloom-designed project
 * keeps its inspiration notes and gets new colors, fonts, radius and component
 * style; any other project gets the plain `shadcn apply`. The result is saved
 * as a user revision.
 */
export async function applyManualTheme(projectId: string, requested: ShadcnTheme, signal?: AbortSignal) {
  const { theme, resolved } = await prepareShadcnTheme(requested, signal);
  await prepareProjectRuntime(projectId, undefined, signal);
  const snapshot = await captureProjectSourceSnapshot(projectId, signal);
  const current = readDesignState(snapshot);
  const warnings: string[] = [];

  if (current) {
    const written = await writeDesignSystem({
      projectId,
      signal,
      theme: { input: theme, resolved },
      notes: current.notes,
    });
    warnings.push(...written.warnings);
  } else {
    const applied = await runProjectCommand(
      projectId,
      { executable: "pnpm", args: ["exec", "shadcn", "apply", resolved.code, "--yes"], cwd: ".", timeoutMs: 240_000 },
      signal,
    );
    if (applied.exitCode !== 0) throw new Error(`shadcn apply failed: ${applied.stderr.slice(-400) || applied.stdout.slice(-400)}`);
  }

  const checkpoint = await checkpointProjectRuntime(projectId, "USER");
  return { theme, code: resolved.code, revisionId: checkpoint.revisionId, warnings };
}
