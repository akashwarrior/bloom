import "server-only";

import { DEFAULT_PRESET_CONFIG } from "shadcn/preset";

import { SURFACE_ROLES, type DesignBrief } from "@/lib/design/brief";
import { repairContrast } from "@/lib/design/brief-checks";
import { deltaE, parseColor } from "@/lib/design/color";
import { DESIGN_SYSTEM_MARKER, type ResolvedFont } from "@/lib/design/design-system";
import { ITALIC_FAMILIES } from "@/lib/design/directions";
import { findCatalogFont } from "@/lib/design/fonts";
import { briefFromTheme, compatibleShadcnTheme, resolveShadcnTheme, shadcnPresetCode, shadcnThemeSchema, type ShadcnTheme } from "@/lib/design/shadcn-theme";
import { DESIGN_STATE_PATH, designStateSchema, readDesignState, writeDesignSystem, type DesignState } from "@/lib/design/write-design-system.server";
import { getProjectRevisionFile } from "@/lib/project-source.server";
import {
  captureProjectSourceSnapshot,
  checkpointProjectRuntime,
  prepareProjectRuntime,
  runProjectCommand,
} from "@/lib/runtime/runtime-service.server";

export class LegacyDesignError extends Error {
  constructor() {
    super("This site was designed before theme editing existed, so its theme can't be changed here. Generate it again to make the theme editable.");
  }
}

async function revisionFile(projectId: string, path: string) {
  return getProjectRevisionFile(projectId, path).then((file) => file.content).catch(() => null);
}

/** The project's shadcn create inputs: the stored preset, or what components.json records. */
export async function getProjectTheme(projectId: string): Promise<{ theme: ShadcnTheme; hasDesignSystem: boolean; editable: boolean }> {
  const stored = await revisionFile(projectId, DESIGN_STATE_PATH);
  if (stored) {
    const state = designStateSchema.safeParse(JSON.parse(stored));
    if (state.success && state.data.shadcn) return { theme: state.data.shadcn, hasDesignSystem: true, editable: true };
  }
  const legacy = !stored && Boolean((await revisionFile(projectId, "app/globals.css"))?.includes(DESIGN_SYSTEM_MARKER));
  const components = JSON.parse((await revisionFile(projectId, "components.json")) ?? "{}") as {
    style?: string;
    iconLibrary?: string;
    tailwind?: { baseColor?: string };
  };
  const candidate = {
    ...DEFAULT_PRESET_CONFIG,
    style: components.style?.replace(/^(?:radix|base|aria)-/, ""),
    baseColor: components.tailwind?.baseColor,
    iconLibrary: components.iconLibrary,
    mode: "light",
  };
  const fields = shadcnThemeSchema.shape;
  const theme = Object.fromEntries(
    Object.entries(fields).map(([key, schema]) => {
      const value = schema.safeParse(candidate[key as keyof typeof candidate]);
      return [key, value.success ? value.data : schema.parse(key === "mode" ? "light" : DEFAULT_PRESET_CONFIG[key as keyof typeof DEFAULT_PRESET_CONFIG])];
    }),
  ) as ShadcnTheme;
  return { theme, hasDesignSystem: Boolean(stored), editable: !legacy };
}

/** Surface roles for a brief written before roles existed: the closest theme color wins. */
function inferSurfaceRoles(brief: DesignBrief): DesignState["surfaceRoles"] {
  const { colors } = brief;
  const anchors: Record<(typeof SURFACE_ROLES)[number], string> = {
    background: colors.background,
    muted: colors.muted,
    primary: colors.primary,
    inverse: colors.foreground,
    chart: colors.accent,
  };
  return colors.surfaces.map((surface) => {
    const color = parseColor(surface.background)!;
    return SURFACE_ROLES.reduce((best, role) =>
      deltaE(color, parseColor(anchors[role])!) < deltaE(color, parseColor(anchors[best])!) ? role : best);
  });
}

function catalogFont(family: string, weights: number[], italic = false): ResolvedFont {
  const entry = findCatalogFont(family);
  if (!entry) throw new Error(`${family} is not in the Bloom font catalog`);
  return { kind: "google", entry, weights, ...(italic ? { italic: true } : {}) };
}

/**
 * Applies shadcn create inputs chosen by the user. A Bloom-designed project
 * keeps its brief (brand, type scale, surfaces by role, sections) and gets new
 * colors, fonts, radius and component style; any other project gets the plain
 * `shadcn apply`. The result is saved as a user revision.
 */
export async function applyManualTheme(projectId: string, requested: ShadcnTheme, signal?: AbortSignal) {
  const { theme } = compatibleShadcnTheme(requested);
  const resolved = await resolveShadcnTheme(theme, signal);
  await prepareProjectRuntime(projectId, undefined, signal);
  const snapshot = await captureProjectSourceSnapshot(projectId, signal);
  const current = readDesignState(snapshot);
  const warnings: string[] = [];

  if (current) {
    const roles = current.surfaceRoles ?? inferSurfaceRoles(current.brief);
    const { anchor, traits, brand, layout, signature, imagery, sections, colors, typography } = current.brief;
    const { brief } = repairContrast(briefFromTheme({
      anchor,
      traits,
      brand,
      layout,
      signature,
      imagery,
      sections,
      shadcn: theme,
      surfaces: colors.surfaces.map((surface, index) => ({ name: surface.name, role: roles?.[index] ?? "background" })),
      typography: {
        display: {
          weight: typography.display.weight,
          sizePx: typography.display.sizePx,
          lineHeight: typography.display.lineHeight,
          tracking: typography.display.tracking,
          uppercase: typography.display.uppercase,
        },
        heading: typography.heading,
        body: { weight: typography.body.weight, sizePx: typography.body.sizePx },
      },
    }, resolved));
    const italic = current.style.highlight === "italic" && ITALIC_FAMILIES.has(brief.typography.display.family);
    const written = await writeDesignSystem({
      projectId,
      signal,
      brief,
      fonts: {
        display: catalogFont(brief.typography.display.family, [brief.typography.display.weight, brief.typography.heading.weight], italic),
        body: catalogFont(brief.typography.body.family, [brief.typography.body.weight, 500, 600]),
        mono: brief.typography.mono ? catalogFont(brief.typography.mono.family, [400, 500]) : null,
      },
      style: { ...current.style, chart: resolved.chart, radiusPx: resolved.radiusPx },
      theme: { input: theme, resolved },
      surfaceRoles: roles,
      docAppendix: current.docAppendix,
      includeBlocks: false,
    });
    warnings.push(...written.warnings);
  } else {
    if (snapshot.some((file) => file.path === "app/globals.css" && file.content.includes(DESIGN_SYSTEM_MARKER))) {
      throw new LegacyDesignError();
    }
    const applied = await runProjectCommand(
      projectId,
      { executable: "pnpm", args: ["exec", "shadcn", "apply", shadcnPresetCode(theme), "--yes"], cwd: ".", timeoutMs: 240_000 },
      signal,
    );
    if (applied.exitCode !== 0) throw new Error(`shadcn apply failed: ${applied.stderr.slice(-400) || applied.stdout.slice(-400)}`);
  }

  const checkpoint = await checkpointProjectRuntime(projectId, "USER");
  return { theme, code: resolved.code, revisionId: checkpoint.revisionId, warnings };
}
