import { tool } from "ai";
import z from "zod/v4";

import { FILE_STATUS, STATUS } from "@/ai/message/data-part";
import type { ToolParams } from "@/ai/tools";
import { toolErrorSchema, toolFailure } from "@/ai/tools/schemas";
import { BLOCK_KINDS, blockKindsForPrompt, type BlockKind } from "@/lib/design/blocks-catalog";
import { designBriefSchema, themedBriefSchema, type DesignBrief, type ThemedBrief } from "@/lib/design/brief";
import { writeDesignSystem } from "@/lib/design/write-design-system.server";
import { briefFromTheme, compatibleShadcnTheme, resolveShadcnTheme, type ResolvedShadcnTheme, type ShadcnTheme } from "@/lib/design/shadcn-theme";
import { applyPrimaryReferenceDefaults, genericLookProblems, primaryReferenceProblems, repairContrast, structureProblems } from "@/lib/design/brief-checks";
import { ITALIC_FAMILIES, type DirectionId } from "@/lib/design/directions";
import { formatDesignStudy } from "@/lib/design/study";
import { chroma, contrastRatio, deltaE, isLightColor, parseColor, type Rgb } from "@/lib/design/color";
import {
  tokenUsageGuide,
  type ResolvedFont,
  type ResolvedFonts,
  type StyleOptions,
} from "@/lib/design/design-system";
import { catalogFontDistance, catalogForPrompt, closestCatalogFonts, findCatalogFont } from "@/lib/design/fonts";
import type { BuildSession } from "@/ai/build-session";

const MAX_REJECTIONS = 3;

function rgb(hex: string): Rgb {
  return parseColor(hex) ?? { r: 0, g: 0, b: 0 };
}

function contrastProblems(brief: DesignBrief) {
  const pairs: Array<[string, string, string, number]> = [
    ["foreground on background", brief.colors.foreground, brief.colors.background, 7],
    ["primaryForeground on primary", brief.colors.primaryForeground, brief.colors.primary, 4.5],
    ["accentForeground on accent", brief.colors.accentForeground, brief.colors.accent, 4.5],
    ["mutedForeground on background", brief.colors.mutedForeground, brief.colors.background, 4.5],
    ...brief.colors.surfaces.map((surface, index): [string, string, string, number] => [
      `surfaces[${index}] (${surface.name}) foreground on background`,
      surface.foreground,
      surface.background,
      4.5,
    ]),
  ];
  return pairs.flatMap(([label, foreground, background, minimum]) => {
    const ratio = contrastRatio(rgb(foreground), rgb(background));
    return ratio < minimum
      ? [`Contrast too low for ${label}: ${ratio.toFixed(2)}:1 (needs ${minimum}:1). Darken or lighten one of ${foreground} / ${background}.`]
      : [];
  });
}

function resolveFont(
  family: string,
  weights: number[],
  session: BuildSession,
  role: "display" | "body" | "mono",
): ResolvedFont | string {
  const entry = findCatalogFont(family);
  if (entry) {
    if (role !== "mono" && !entry.roles.includes(role) && !(role === "display" && entry.category !== "mono")) {
      return `"${family}" is not suited to the ${role} role. Pick a ${role} face from the catalog.`;
    }
    return { kind: "google", entry, weights };
  }
  if (session.workflow === "clone") {
    const files = session.references
      .flatMap((reference) => reference.fonts)
      .filter((font) => font.family.toLowerCase() === family.trim().toLowerCase());
    if (files.length > 0) {
      return {
        kind: "reference",
        family: files[0]!.family,
        files: files.map(({ localPath, weight, style, format, unicodeRange }) => ({
          localPath,
          weight,
          style,
          ...(format ? { format } : {}),
          ...(unicodeRange ? { unicodeRange } : {}),
        })),
      };
    }
  }
  return `"${family}" is not in the Bloom font catalog. Choose the closest catalog family by character (width, weight, serif/sans, mood).`;
}

function validateAgainstAnchor(brief: DesignBrief, session: BuildSession) {
  const problems: string[] = [];
  if (session.references.length === 0) {
    return brief.anchor.url || brief.traits.length > 0
      ? ["No reference was captured. Do not invent an anchor or supporting reference URL."]
      : problems;
  }
  if (session.workflow === "app") return problems;
  if (!brief.anchor.url) {
    return [`anchor.url must be one of the captured references: ${session.references.map((reference) => reference.url).join(", ")}.`];
  }
  const anchor = session.findReference(brief.anchor.url);
  if (!anchor) {
    return [`anchor.url ${brief.anchor.url} was not captured. Use one of: ${session.references.map((reference) => reference.url).join(", ")}.`];
  }
  for (const section of brief.sections) {
    if (section.anchorFrame !== null && !anchor.frames.some((frame) => frame.number === section.anchorFrame)) {
      problems.push(`Section "${section.id}" cites a missing anchor frame ${section.anchorFrame}.`);
    }
  }
  for (const trait of brief.traits) {
    if (!session.findReference(trait.url)) problems.push(`Supporting reference ${trait.url} was not captured.`);
  }
  if (session.original) return [...problems, ...primaryReferenceProblems(brief, session, anchor)];
  const dna = anchor.dna;
  if (dna.theme !== "mixed" && brief.theme !== dna.theme) {
    problems.push(`The anchor ${anchor.host} is measured as a ${dna.theme} page (${Math.round(dna.lightShare * 100)}% light surfaces). A white-label keeps the anchor's theme: set theme to "${dna.theme}" and derive the palette from its surfaces (${dna.surfaceColors.slice(0, 4).map((entry) => entry.color).join(", ")}). Sections that are ${dna.theme === "light" ? "dark" : "light"} in the anchor stay that way as individual colors.surfaces.`);
  }
  const prominent = dna.surfaceColors.filter((entry) => entry.share >= 0.04);
  const anchorDark = prominent.filter((entry) => !entry.light);
  const anchorLight = prominent.filter((entry) => entry.light);
  const briefDark = brief.colors.surfaces.filter((surface) => !isLightColor(rgb(surface.background)));
  const briefLight = brief.colors.surfaces.filter((surface) => isLightColor(rgb(surface.background)));
  if (anchorDark.length > 0 && briefDark.length === 0) {
    problems.push(`The anchor has dark section surfaces (${anchorDark.map((entry) => `${entry.color} ${Math.round(entry.share * 100)}%`).join(", ")}) but the brief has none. Keep them as dark colors.surfaces on the matching sections (see the surface rhythm).`);
  }
  if (anchorLight.length > 0 && briefLight.length === 0) {
    problems.push(`The anchor has light section surfaces (${anchorLight.map((entry) => entry.color).join(", ")}) but the brief has none. Mirror the anchor's light/dark rhythm.`);
  }
  const anchorChromatic = prominent.filter((entry) => chroma(rgb(entry.color)) >= 18);
  const briefChromatic = brief.colors.surfaces.filter((surface) => chroma(rgb(surface.background)) >= 18);
  if (anchorChromatic.length >= 2 && briefChromatic.length < Math.min(2, anchorChromatic.length)) {
    problems.push(`The anchor's sections use saturated color fields (${anchorChromatic.map((entry) => entry.color).join(", ")}); the brief's surfaces are mostly neutral. Keep at least ${Math.min(2, anchorChromatic.length)} colored surfaces (re-hued for the brand if you like).`);
  }
  if (dna.theme === "mixed") {
    const anchorSurfaces = dna.surfaceColors.filter((entry) => entry.share >= 0.04).length;
    const needed = Math.min(3, Math.max(2, anchorSurfaces));
    if (brief.theme !== "mixed") {
      problems.push(`The anchor ${anchor.host} is color-blocked (theme "mixed": ${dna.surfaceColors.slice(0, 5).map((entry) => entry.color).join(", ")}). Set theme to "mixed" and give sections their own surfaces.`);
    }
    if (brief.colors.surfaces.length < needed) {
      problems.push(`The anchor alternates ${anchorSurfaces} section surfaces; define at least ${needed} colors.surfaces that mirror its light/dark rhythm.`);
    }
  }
  const backgroundLight = isLightColor(rgb(brief.colors.background));
  if (brief.theme === "light" && !backgroundLight) {
    problems.push("theme is light but colors.background is dark.");
  }
  if (brief.theme === "dark" && backgroundLight) {
    problems.push("theme is dark but colors.background is light.");
  }
  const anchorDisplay = dna.type.display?.size ?? null;
  if (anchorDisplay && brief.typography.display.sizePx < Math.round(anchorDisplay * 0.6)) {
    problems.push(`The anchor's display headline is ${anchorDisplay}px; the brief's ${brief.typography.display.sizePx}px loses its type scale. Use at least ${Math.round(anchorDisplay * 0.75)}px.`);
  }
  for (const [label, role, chosen] of [
    ["display", dna.type.display, brief.typography.display.family],
    ["body", dna.type.body, brief.typography.body.family],
  ] as const) {
    const measured = role?.measured;
    if (!measured || session.workflow === "clone") continue;
    const ranked = closestCatalogFonts(measured, label, 6);
    const best = ranked[0]?.distance ?? 0;
    const distance = catalogFontDistance(chosen, measured);
    if (distance !== null && distance > Math.max(2.5, best * 2) && !ranked.some((match) => match.entry.family.toLowerCase() === chosen.toLowerCase())) {
      problems.push(`"${chosen}" is far from the anchor's ${label} face "${role!.family}" in measured glyph shape (width, x-height, cap height, terminals). Closest catalog faces: ${ranked.slice(0, 4).map((match) => match.entry.family).join(", ")}.`);
    }
  }
  const anchorWeight = dna.type.display?.weight ?? null;
  if (anchorWeight && Math.abs(brief.typography.display.weight - anchorWeight) > 200) {
    problems.push(`The anchor's display type is weight ${anchorWeight}; ${brief.typography.display.weight} changes its voice. Keep the display weight within 200 of ${anchorWeight} and pick a catalog face whose character matches at that weight.`);
  }
  if (anchor.largeMedia >= 3) {
    const withMedia = brief.sections.filter((section) => section.media && section.media.trim().length > 0).length;
    const wanted = Math.min(3, Math.max(2, brief.sections.length - 3));
    if (withMedia < wanted) {
      problems.push(`The anchor is imagery-led (${anchor.largeMedia} large product shots, illustrations, or videos), but the brief plans media for ${withMedia} section(s). Plan concrete media (device mockups of the product UI, objects, illustrations) for at least ${wanted} sections, matching how the anchor uses imagery.`);
    }
  }
  const frameCount = anchor.frames.length;
  for (const section of brief.sections) {
    if (section.anchorFrame !== null && section.anchorFrame > frameCount) {
      problems.push(`Section "${section.id}" names anchorFrame ${section.anchorFrame}, but the anchor has ${frameCount} frames.`);
    }
  }
  const anchorSurfaceColors = dna.surfaceColors.map((entry) => rgb(entry.color));
  const offAnchor = brief.colors.surfaces.filter(
    (surface) => anchorSurfaceColors.length > 0 && !anchorSurfaceColors.some((color) => deltaE(color, rgb(surface.background)) < 40),
  );
  if (offAnchor.length === brief.colors.surfaces.length && anchorSurfaceColors.length > 0) {
    problems.push(`None of the brief's surfaces relate to the anchor's measured surfaces (${dna.surfaceColors.slice(0, 5).map((entry) => entry.color).join(", ")}). Keep the anchor's surface families; a re-skin may shift hue or lightness slightly but must not invent a different palette.`);
  }
  return problems;
}

function validateBrief(brief: DesignBrief, session: BuildSession) {
  const problems = [
    ...contrastProblems(brief),
    ...validateAgainstAnchor(brief, session),
    ...(session.workflow === "clone" ? [] : genericLookProblems(brief, session)),
    ...structureProblems(brief, session),
  ];
  if (session.original && !session.designStudy) problems.push("Submit an evidence-grounded design study before choosing tokens and sections.");
  if (brief.theme === "light" && !isLightColor(rgb(brief.colors.background))) problems.push("A light theme needs a light page background.");
  if (brief.theme === "dark" && isLightColor(rgb(brief.colors.background))) problems.push("A dark theme needs a dark page background.");
  for (const section of brief.sections) {
    if (section.surface > brief.colors.surfaces.length) {
      problems.push(`Section "${section.id}" uses surface ${section.surface}, but only ${brief.colors.surfaces.length} surfaces exist.`);
    }
  }
  const ids = brief.sections.map((section) => section.id);
  if (new Set(ids).size !== ids.length) problems.push("Section ids must be unique.");
  for (const section of brief.sections) {
    const variants: readonly string[] = BLOCK_KINDS[section.block as BlockKind] ?? [];
    if (variants.length > 0 && (!section.variant || !variants.includes(section.variant))) {
      problems.push(`Section "${section.id}" uses the ${section.block} block; set variant to one of: ${variants.join(", ")}.`);
    }
  }
  const fabricated = brief.sections.filter((section) =>
    /\b(?:testimonials?|reviews?|customer quotes?|social proof|press quotes?)\b/i.test(`${section.id} ${section.purpose}`),
  );
  if (session.workflow !== "clone" && fabricated.length > 0) {
    problems.push(`Section(s) ${fabricated.map((section) => `"${section.id}"`).join(", ")} plan testimonials, reviews, or social proof. Nobody provided real quotes or numbers, so plan a non-fabricated equivalent instead: a statement in the brand's own voice, how it works, use cases, or supported integrations described in words.`);
  }
  if (session.workflow !== "clone") {
    for (const section of brief.sections) {
      const description = `${section.purpose} ${section.composition}`;
      if (/\bcase stud(?:y|ies)\b/i.test(description) && !/\b(concept|speculative|illustrative|fictional)\b/i.test(description)) {
        problems.push(`Section "${section.id}": change purpose and composition to explicitly labelled concept projects or speculative design explorations, not real client case studies. Label the rendered examples "Concept project" and omit client endorsements, metrics and outcomes. A portfolio showcase is allowed; invented client history is not.`);
      }
    }
  }
  if (session.workflow === "site") {
    if (!["hero", "custom"].includes(brief.sections[0]!.block)) problems.push("Start with a hero, either custom or the optional hero block.");
    if (!["footer", "custom"].includes(brief.sections.at(-1)!.block)) problems.push("End with a footer, either custom or the optional footer block.");
  }
  if (session.workflow !== "clone") {
    const brandName = brief.brand.name.toLowerCase();
    const borrowed = session.references.find((reference) => brandName.includes(reference.brand));
    if (borrowed) problems.push(`Brand "${brief.brand.name}" reuses the reference brand "${borrowed.brand}". Invent an original name.`);
  }
  return problems;
}

const briefOutputSchema = z.union([
      z.strictObject({
        status: z.literal("applied"),
        files: z.array(z.string()),
        validation: z.string(),
        tscError: z.string().nullable(),
        tokens: z.string(),
        sections: z.array(z.string()),
        warnings: z.array(z.string()),
        next: z.string(),
      }),
      z.strictObject({
        status: z.literal("rejected"),
        problems: z.array(z.string()),
        next: z.string(),
      }),
      z.strictObject({
        status: z.literal("error"),
        error: toolErrorSchema,
      }),
    ]);

type BriefContext = Pick<ToolParams, "projectId" | "signal" | "writer" | "logger" | "session">;

type PreparedBrief = {
  brief: DesignBrief;
  problems: string[];
  notes: string[];
  style: StyleOptions;
  theme?: { input: ShadcnTheme; resolved: ResolvedShadcnTheme };
  surfaceRoles?: ThemedBrief["surfaces"][number]["role"][];
};

export const submitDesignBrief = (context: BriefContext) => context.session.original
  ? tool({
      description:
        "Translate the design study into the design system and section plan. Every body section must cite the anchor frame it adapts in `anchorFrame`; implement that composition with custom JSX or an optional block. The palette, fonts, radius, component style and icons are shadcn create inputs (shadcn); Bloom resolves them with shadcn, applies the preset to the project's components and writes tokens, fonts and DESIGN.md. You decide brand, type scale, surfaces, signature, media and concrete compositions.\n\nSection block kinds:\n" +
        blockKindsForPrompt(),
      inputSchema: themedBriefSchema,
      outputSchema: briefOutputSchema,
      execute: async (input, { toolCallId }) => {
        const { theme: shadcn, notes: themeNotes } = compatibleShadcnTheme(input.shadcn);
        const submitted = { ...input, shadcn };
        let resolved: ResolvedShadcnTheme;
        try {
          resolved = await resolveShadcnTheme(shadcn, context.signal);
        } catch (error) {
          const rejected = error instanceof Error && /returned 4\d\d/.test(error.message);
          return toolFailure("SHADCN_THEME_FAILED", error, rejected
            ? "shadcn rejected these preset values. Change the shadcn values named in the message and resubmit the brief."
            : "This is a network failure, not a problem with the brief. Submit the same brief once more.");
        }
        const { brief, notes } = applyPrimaryReferenceDefaults(briefFromTheme(submitted, resolved), context.session);
        return applyBrief(
          context,
          toolCallId,
          { brief, problems: [], notes: [...themeNotes, ...notes], style: { chart: resolved.chart, radiusPx: resolved.radiusPx }, theme: { input: shadcn, resolved }, surfaceRoles: submitted.surfaces.map((surface) => surface.role) },
          null,
        );
      },
    })
  : tool({
      description:
        "Translate the design study into a complete design system and section plan: palette, type scale, fonts, shapes, layout, signature, media and concrete compositions. For an original site, sources inform specific decisions without locking their theme or page length. For a named reference or clone, preserve its design language. Custom sections are unrestricted; section blocks are optional conveniences. Bloom writes tokens, fonts and DESIGN.md after validation.\n\nSection block kinds:\n" +
        blockKindsForPrompt() +
        "\n\nFont catalog (families must come from this list):\n" +
        catalogForPrompt(),
      inputSchema: designBriefSchema,
      outputSchema: briefOutputSchema,
      execute: async (submitted, { toolCallId }) => {
        const { brief, notes } = applyPrimaryReferenceDefaults(submitted, context.session);
        return applyBrief(context, toolCallId, { brief, problems: [], notes, style: {} }, null);
      },
    });

async function applyBrief(
  { projectId, signal, writer, logger, session }: BriefContext,
  toolCallId: string,
  prepared: PreparedBrief,
  direction: DirectionId | null,
): Promise<z.infer<typeof briefOutputSchema>> {
  if (session.briefInFlight) {
    return {
      status: "rejected" as const,
      problems: ["Another submitDesignBrief call is already running in this step. Submit one brief at a time."],
      next: "Wait for the other call's result.",
    };
  }
  session.briefInFlight = true;
  try {
    if (!session.gated) {
      throw new Error("A design brief is only used for new sites, clones, and new apps. Edit the existing design system directly instead.");
    }
    const { problems: preparedProblems, style, theme } = prepared;
    const repaired = repairContrast(prepared.brief);
    const brief = repaired.brief;
    const notes = [...prepared.notes, ...repaired.notes];
    const problems = [...preparedProblems, ...validateBrief(brief, session)];
    const fontProblems: string[] = [];
    const resolve = (family: string, weights: number[], role: "display" | "body" | "mono") => {
      if (theme) {
        const entry = findCatalogFont(family);
        if (entry) return { kind: "google" as const, entry, weights };
      }
      const resolved = resolveFont(family, weights, session, role);
      if (typeof resolved === "string") {
        fontProblems.push(resolved);
        return null;
      }
      return resolved;
    };
    const resolvedDisplay = resolve(
      brief.typography.display.family,
      [brief.typography.display.weight, brief.typography.heading.weight],
      "display",
    );
    const display = resolvedDisplay?.kind === "google" && style.highlight === "italic" && ITALIC_FAMILIES.has(resolvedDisplay.entry.family)
      ? { ...resolvedDisplay, italic: true }
      : resolvedDisplay;
    const body = resolve(brief.typography.body.family, [brief.typography.body.weight, 500, 600], "body");
    const mono = brief.typography.mono ? resolve(brief.typography.mono.family, [400, 500], "mono") : null;

    if (problems.length > 0 || fontProblems.length > 0) {
      session.briefRejections += 1;
      if (session.briefRejections >= MAX_REJECTIONS) session.abortReason = `The design brief still has unresolved validation problems: ${[...problems, ...fontProblems].join(" ")}`;
      await logger.write("design_brief.rejected", {
        attempt: session.briefRejections,
        problems: [...problems, ...fontProblems],
      });
      return {
        status: "rejected" as const,
        problems: [...problems, ...fontProblems],
        next: "Fix every problem and call submitDesignBrief again with the complete corrected brief.",
      };
    }

    const fonts: ResolvedFonts = {
      display: display ?? { kind: "google", entry: findCatalogFont("Bricolage Grotesque")!, weights: [700] },
      body: body ?? { kind: "google", entry: findCatalogFont("Hanken Grotesk")!, weights: [400, 600] },
      mono,
    };
    const { paths, contents, validation, tscError, warnings } = await writeDesignSystem({
      projectId,
      signal,
      logger,
      brief,
      fonts,
      style,
      theme,
      surfaceRoles: prepared.surfaceRoles ?? null,
      docAppendix: session.designStudy ? formatDesignStudy(session.designStudy) : "",
      includeBlocks: true,
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
    if (theme) session.shadcnTheme = { ...theme.input, code: theme.resolved.code, iconImport: theme.resolved.iconImport };
    for (const content of contents) {
      if (!session.baselines.has(content.path)) session.baselines.set(content.path, content.path.startsWith("components/blocks/") ? content.after : content.before);
      session.writtenPaths.add(content.path);
    }
    writer.write({
      id: toolCallId,
      type: "data-file-changes",
      data: {
        status: STATUS.COMPLETE,
        files: paths.map((path) => ({ path, status: FILE_STATUS.SUCCESS })),
        summary: `Design system for ${brief.brand.name}`,
      },
    });

    session.recordToolSuccess("submitDesignBrief");
    session.brief = brief;
    session.briefFonts = fonts;
    session.direction = direction;
    session.lastValidation = validation;
    session.lastTscError = tscError;
    await logger.write("design_brief.applied", {
      brand: brief.brand.name,
      anchor: brief.anchor.url,
      direction,
      accent: brief.colors.accent,
      theme: brief.theme,
      surfaces: brief.colors.surfaces.map((surface) => surface.background),
      display: brief.typography.display.family,
      body: brief.typography.body.family,
      study: session.designStudy?.thesis ?? null,
    });

    return {
      status: "applied" as const,
      files: paths,
      validation,
      tscError,
      tokens: tokenUsageGuide(brief),
      sections: brief.sections.map(
        (section, index) =>
          `${index + 1}. ${section.id}: ${section.block}${section.variant ? ` (${section.variant})` : ""} on surface-${section.surface}${section.anchorFrame ? `, anchor frame ${section.anchorFrame}` : ""}: ${section.composition}`,
      ),
      warnings,
      next: "Build the hero and its adjacent section, compose app/page.tsx and inspect the desktop and mobile preview before extending the page. Implement the planned geometry with custom JSX; use a block only when it expresses that composition. Keep tokens and fonts. Media may be code-built or generated according to the plan, not a quota.",
    };
  } catch (error) {
    session.recordToolFailure(
      "submitDesignBrief",
      error instanceof Error ? error.message : String(error),
    );
    return toolFailure(
      "DESIGN_BRIEF_FAILED",
      error,
      session.abortReason
        ? "The workflow is stopping. Report this failure to the user."
        : "This is an environment failure, not a problem with the brief. Submit the same brief once more.",
    );
  } finally {
    session.briefInFlight = false;
  }
}
