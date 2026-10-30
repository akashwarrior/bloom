import {
  chroma,
  deltaE,
  describeColor,
  isLightColor,
  parseColor,
  toHex,
  type Rgb,
} from "./color.ts";
import { closestCatalogFonts, type MeasuredFont } from "./fonts.ts";

/** Pixel statistics for one captured viewport frame (computed in the browser). */
export type FrameAnalysis = {
  scrollY: number;
  width: number;
  height: number;
  /** Equal-height horizontal bands, top to bottom. */
  bands: Array<{
    /** Dominant color across the whole band. */
    color: string;
    share: number;
    /** Dominant color in the left and right page margins of the band. */
    edgeColor: string;
    edgeShare: number;
  }>;
  /** Frame-wide dominant colors, most common first. */
  palette: Array<{ color: string; share: number }>;
};

export type TextStyleSample = {
  family: string;
  size: number;
  weight: number;
  lineHeight: number | null;
  letterSpacing: number | null;
  transform: string;
  color: string;
  chars: number;
  headingChars: number;
  tags: string[];
};

export type ButtonSample = {
  shape: "pill" | "rounded" | "square";
  radius: number;
  height: number;
  background: string | null;
  color: string;
  border: boolean;
  weight: number;
  transform: string;
  count: number;
  /** Page Y of the first occurrence. */
  firstY?: number;
};

/** Computed-style evidence gathered from the live DOM. */
export type DesignProfile = {
  viewportWidth: number;
  viewportHeight: number;
  pageHeight: number;
  stickyHeaderHeight: number;
  textStyles: TextStyleSample[];
  headings: Array<{
    tag: string;
    text: string;
    family: string;
    size: number;
    weight: number;
    transform: string;
    y: number;
  }>;
  buttons: ButtonSample[];
  /** Large on-page text (>= 24px): headlines, taglines, and claims. */
  prominentTexts?: string[];
  /** Glyph metrics of the main families as rendered on the page. */
  fontMetrics?: MeasuredFont[];
  /** Visible text whose color nearly matches its solid background (ratio < 2.5:1). */
  lowContrast?: {
    count: number;
    examples: Array<{ text: string; color: string; background: string; ratio: number; y: number }>;
  };
  /** Large painted boxes with no image, illustration, chart or substantial text: unfinished visual slots. */
  emptyPanels?: {
    count: number;
    examples: Array<{ text: string; width: number; height: number; y: number }>;
  };
  /** The image rendered most often at card size or larger, and how many times. */
  repeatedImage?: { src: string; count: number };
  /** Largest share of the first screen covered by one image, video, canvas, SVG or background image. */
  firstScreenMedia?: number;
  /** Text boxes whose words run past their own width (long words in narrow cards). */
  textOverflow?: {
    count: number;
    examples: Array<{ text: string; overflow: number; y: number }>;
  };
  cards: {
    count: number;
    radiusMedian: number | null;
    shadowShare: number;
    borderShare: number;
  };
  contentWidth: number | null;
  sectionCount: number;
  images: { count: number; broken: number };
  overflowX: number;
  rootFamilies: { body: string; h1: string | null };
  loadedFontFamilies: string[];
};

export type TypeRole = {
  family: string;
  size: number;
  weight: number;
  lineHeight: number | null;
  letterSpacing: number | null;
  uppercase: boolean;
  /** Closest Bloom catalog faces by measured glyph metrics. */
  matches?: string[];
  measured?: MeasuredFont;
};

export type Surface = {
  start: number;
  end: number;
  color: string;
  light: boolean;
};

export type PageDna = {
  theme: "light" | "dark" | "mixed";
  lightShare: number;
  surfaces: Surface[];
  surfaceColors: Array<{ color: string; share: number; light: boolean }>;
  palette: Array<{ color: string; share: number }>;
  accents: string[];
  textColors: string[];
  type: {
    display: TypeRole | null;
    heading: TypeRole | null;
    body: TypeRole | null;
    label: TypeRole | null;
    scale: number[];
    families: Array<{ family: string; share: number }>;
  };
  ui: {
    buttonShape: "pill" | "rounded" | "square" | null;
    buttonRadius: number | null;
    buttonHeight: number | null;
    buttonFill: string | null;
    buttonText: string | null;
    cardRadius: number | null;
    cardCount: number;
    shadows: "none" | "subtle" | "frequent";
    borders: boolean;
  };
  layout: {
    pageHeight: number;
    viewportHeight: number;
    viewports: number;
    contentWidth: number | null;
    sectionCount: number;
  };
};

const SOLID_BAND_SHARE = 0.55;
const SAME_COLOR_DELTA = 9;
const MIN_SURFACE_HEIGHT = 140;

function rgb(value: string): Rgb {
  return parseColor(value) ?? { r: 0, g: 0, b: 0 };
}

function mergeWeightedColors(
  entries: Array<{ color: string; weight: number }>,
  threshold = 10,
) {
  const merged: Array<{ rgb: Rgb; weight: number }> = [];
  for (const entry of [...entries].sort((a, b) => b.weight - a.weight)) {
    const color = rgb(entry.color);
    const match = merged.find((candidate) => deltaE(candidate.rgb, color) < threshold);
    if (match) {
      match.weight += entry.weight;
      continue;
    }
    merged.push({ rgb: color, weight: entry.weight });
  }
  return merged.sort((a, b) => b.weight - a.weight);
}

/** Converts overlapping viewport frames into a top-to-bottom sequence of page surfaces. */
export function surfacesFromFrames(
  frames: FrameAnalysis[],
  pageHeight: number,
  stickyHeaderHeight = 0,
): Surface[] {
  type Sample = { start: number; end: number; color: Rgb | null };
  const samples: Sample[] = [];
  let coveredUntil = 0;
  for (const frame of [...frames].sort((a, b) => a.scrollY - b.scrollY)) {
    const bandHeight = frame.height / Math.max(1, frame.bands.length);
    frame.bands.forEach((band, index) => {
      const localStart = index * bandHeight;
      if (frame.scrollY > 0 && localStart < stickyHeaderHeight) return;
      const start = frame.scrollY + localStart;
      const end = Math.min(pageHeight, start + bandHeight);
      if (end <= coveredUntil + bandHeight / 2) return;
      const solid = band.edgeShare >= SOLID_BAND_SHARE
        ? band.edgeColor
        : band.share >= SOLID_BAND_SHARE
          ? band.color
          : null;
      samples.push({
        start: Math.max(start, coveredUntil),
        end,
        color: solid ? rgb(solid) : null,
      });
      coveredUntil = Math.max(coveredUntil, end);
    });
  }

  const surfaces: Array<{ start: number; end: number; rgb: Rgb }> = [];
  for (const sample of samples) {
    const current = surfaces.at(-1);
    if (!sample.color) {
      if (current) current.end = sample.end;
      continue;
    }
    if (current && deltaE(current.rgb, sample.color) < SAME_COLOR_DELTA) {
      current.end = sample.end;
      continue;
    }
    if (current) current.end = sample.start;
    surfaces.push({ start: sample.start, end: sample.end, rgb: sample.color });
  }

  const compacted: typeof surfaces = [];
  for (const surface of surfaces) {
    const previous = compacted.at(-1);
    if (previous && surface.end - surface.start < MIN_SURFACE_HEIGHT) {
      previous.end = surface.end;
      continue;
    }
    if (previous && deltaE(previous.rgb, surface.rgb) < SAME_COLOR_DELTA) {
      previous.end = surface.end;
      continue;
    }
    compacted.push({ ...surface });
  }

  return compacted.map((surface) => ({
    start: Math.round(surface.start),
    end: Math.round(surface.end),
    color: toHex(surface.rgb),
    light: isLightColor(surface.rgb),
  }));
}

/** "__wixMadeforDisplay_a50bae" (next/font hashed names) -> "Wix Madefor Display". */
export function readableFamily(family: string) {
  const hashed = /^__(.+?)(?:_Fallback)?_[a-f0-9]{5,}$/i.exec(family.trim());
  if (!hashed) return family;
  const spaced = hashed[1]!
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function typeRole(
  sample: TextStyleSample | undefined,
  metrics: MeasuredFont[] = [],
  role: "display" | "body" = "display",
): TypeRole | null {
  if (!sample) return null;
  const measured = metrics.find((entry) => entry.family === sample.family && entry.weight === sample.weight) ??
    metrics.find((entry) => entry.family === sample.family);
  const matches = measured
    ? closestCatalogFonts({ ...measured, weight: sample.weight }, role).map((match) => match.entry.family)
    : undefined;
  return {
    ...(matches && measured ? { matches, measured: { ...measured, weight: sample.weight } } : {}),
    family: readableFamily(sample.family),
    size: Math.round(sample.size),
    weight: sample.weight,
    lineHeight: sample.lineHeight === null
      ? null
      : Math.round((sample.lineHeight / sample.size) * 100) / 100,
    letterSpacing: sample.letterSpacing === null
      ? null
      : Math.round((sample.letterSpacing / sample.size) * 1000) / 1000,
    uppercase: sample.transform === "uppercase",
  };
}

export function typographyFromProfile(profile: DesignProfile): PageDna["type"] {
  const styles = profile.textStyles.filter((style) => style.chars >= 2 && style.size >= 10);
  const totalChars = styles.reduce((sum, style) => sum + style.chars, 0) || 1;
  const bySize = [...styles].sort((a, b) => b.size - a.size);
  const display = bySize.find((style) => style.size >= 28 && style.chars >= 4);
  const headingCandidates = styles.filter(
    (style) =>
      style !== display &&
      style.size >= 20 &&
      (style.headingChars > 0 || style.size >= 24) &&
      (!display || style.size < display.size * 0.85),
  );
  const heading = [...headingCandidates].sort(
    (a, b) => b.headingChars + b.chars * 0.2 - (a.headingChars + a.chars * 0.2),
  )[0];
  const body = [...styles]
    .filter((style) => style.size >= 13 && style.size <= 22 && style.transform !== "uppercase")
    .sort((a, b) => b.chars - a.chars)[0];
  const label = [...styles]
    .filter(
      (style) =>
        style.size <= 15 &&
        (style.transform === "uppercase" || (style.letterSpacing ?? 0) > 0.5),
    )
    .sort((a, b) => b.chars - a.chars)[0];
  const scale = [...new Set(bySize.map((style) => Math.round(style.size)))]
    .filter((size) => size >= 12)
    .slice(0, 8);
  const familyChars = new Map<string, number>();
  for (const style of styles) {
    const family = readableFamily(style.family);
    familyChars.set(family, (familyChars.get(family) ?? 0) + style.chars);
  }
  const families = [...familyChars.entries()]
    .map(([family, chars]) => ({
      family,
      share: Math.round((chars / totalChars) * 100) / 100,
    }))
    .sort((a, b) => b.share - a.share)
    .slice(0, 5);

  const metrics = profile.fontMetrics ?? [];
  return {
    display: typeRole(display, metrics, "display"),
    heading: typeRole(heading, metrics, "display"),
    body: typeRole(body, metrics, "body"),
    label: typeRole(label),
    scale,
    families,
  };
}

export function buildPageDna({
  frames,
  profile,
  pageHeight,
  viewportHeight,
}: {
  frames: FrameAnalysis[];
  profile: DesignProfile | null;
  pageHeight: number;
  viewportHeight: number;
}): PageDna {
  const surfaces = surfacesFromFrames(
    frames,
    pageHeight,
    profile?.stickyHeaderHeight ?? 0,
  );
  const surfaceArea = surfaces.reduce((sum, surface) => sum + (surface.end - surface.start), 0) || 1;
  const surfaceColors = mergeWeightedColors(
    surfaces.map((surface) => ({
      color: surface.color,
      weight: surface.end - surface.start,
    })),
    SAME_COLOR_DELTA,
  ).map((entry) => ({
    color: toHex(entry.rgb),
    share: Math.round((entry.weight / surfaceArea) * 100) / 100,
    light: isLightColor(entry.rgb),
  }));
  const lightShare = Math.round(
    surfaceColors.filter((entry) => entry.light).reduce((sum, entry) => sum + entry.share, 0) * 100,
  ) / 100;
  const prominentSurfaces = surfaceColors.filter((entry) => entry.share >= 0.05);
  const colorBlocked = prominentSurfaces.length >= 4 && lightShare <= 0.9 && lightShare >= 0.1;
  const theme = surfaceColors.length === 0
    ? "light"
    : colorBlocked
      ? "mixed"
      : lightShare >= 0.72
        ? "light"
        : lightShare <= 0.28
          ? "dark"
          : "mixed";

  const frameArea = frames.length || 1;
  const palette = mergeWeightedColors(
    frames.flatMap((frame) =>
      frame.palette.map((entry) => ({ color: entry.color, weight: entry.share })),
    ),
  )
    .slice(0, 10)
    .map((entry) => ({
      color: toHex(entry.rgb),
      share: Math.round((entry.weight / frameArea) * 1000) / 1000,
    }));
  const surfaceRgbs = surfaceColors.map((entry) => rgb(entry.color));
  const accents = palette
    .filter((entry) => {
      const color = rgb(entry.color);
      return (
        chroma(color) >= 28 &&
        entry.share <= 0.12 &&
        !surfaceRgbs.some((surface) => deltaE(surface, color) < 12)
      );
    })
    .slice(0, 4)
    .map((entry) => entry.color);

  const textColors = profile
    ? mergeWeightedColors(
      profile.textStyles.flatMap((style) =>
        parseColor(style.color) ? [{ color: style.color, weight: style.chars }] : [],
      ),
    )
      .slice(0, 4)
      .map((entry) => toHex(entry.rgb))
    : [];

  const buttons = profile?.buttons ?? [];
  const aboveFold = buttons.filter(
    (button) => button.firstY !== undefined && button.firstY < viewportHeight * 1.5 && button.background,
  );
  const primaryButton = [...(aboveFold.length > 0 ? aboveFold : buttons)].sort((a, b) => b.count - a.count)[0];
  const cards = profile?.cards;

  return {
    theme,
    lightShare,
    surfaces,
    surfaceColors: surfaceColors.slice(0, 8),
    palette,
    accents,
    textColors,
    type: profile
      ? typographyFromProfile(profile)
      : { display: null, heading: null, body: null, label: null, scale: [], families: [] },
    ui: {
      buttonShape: primaryButton?.shape ?? null,
      buttonRadius: primaryButton ? Math.round(primaryButton.radius) : null,
      buttonHeight: primaryButton ? Math.round(primaryButton.height) : null,
      buttonFill: primaryButton?.background ? toHex(rgb(primaryButton.background)) : null,
      buttonText: primaryButton ? toHex(rgb(primaryButton.color)) : null,
      cardRadius: cards?.radiusMedian ?? null,
      cardCount: cards?.count ?? 0,
      shadows: !cards || cards.count === 0 || cards.shadowShare < 0.1
        ? "none"
        : cards.shadowShare < 0.5
          ? "subtle"
          : "frequent",
      borders: (cards?.borderShare ?? 0) >= 0.4,
    },
    layout: {
      pageHeight,
      viewportHeight,
      viewports: Math.round((pageHeight / Math.max(1, viewportHeight)) * 10) / 10,
      contentWidth: profile?.contentWidth ?? null,
      sectionCount: profile?.sectionCount ?? 0,
    },
  };
}

function formatRole(label: string, role: TypeRole | null) {
  if (!role) return null;
  const parts = [
    `"${role.family}" ${role.size}px`,
    role.lineHeight !== null ? `line-height ${role.lineHeight}` : null,
    `weight ${role.weight}`,
    role.letterSpacing !== null && Math.abs(role.letterSpacing) >= 0.005
      ? `tracking ${role.letterSpacing}em`
      : null,
    role.uppercase ? "UPPERCASE" : null,
  ].filter(Boolean);
  const matches = role.matches && role.matches.length > 0
    ? ` -> closest catalog faces by measured glyph shape: ${role.matches.join(", ")}`
    : "";
  return `  - ${label}: ${parts.join(", ")}${matches}`;
}

/** Compact, model-facing description of measured design evidence. */
export function formatDna(dna: PageDna, label: string) {
  const surfaceLines = dna.surfaces.slice(0, 12).map((surface, index) =>
    `  ${index + 1}. ${surface.color} (${describeColor(rgb(surface.color))}) ${surface.start}-${surface.end}px`,
  );
  const lines = [
    `MEASURED DESIGN DNA - ${label} (computed from rendered pixels and computed styles; treat as facts)`,
    `- Theme: ${dna.theme}${dna.theme === "mixed" ? " (color-blocked sections)" : ""}; light surfaces cover ${Math.round(dna.lightShare * 100)}% of the page.`,
    surfaceLines.length > 0
      ? `- Surface rhythm, top to bottom:\n${surfaceLines.join("\n")}`
      : "- Surface rhythm: no large solid surfaces detected (imagery-led page).",
    `- Distinct surface colors by area: ${dna.surfaceColors.map((entry) => `${entry.color} ${Math.round(entry.share * 100)}%`).join(", ") || "none"}`,
    `- Pixel palette by area: ${dna.palette.slice(0, 8).map((entry) => `${entry.color} ${Math.round(entry.share * 100)}%`).join(", ")}`,
    dna.accents.length > 0 ? `- Accent colors (small, saturated): ${dna.accents.join(", ")}` : null,
    dna.textColors.length > 0 ? `- Text colors by usage: ${dna.textColors.join(", ")}` : null,
    "- Typography:",
    formatRole("Display", dna.type.display),
    formatRole("Heading", dna.type.heading),
    formatRole("Body", dna.type.body),
    formatRole("Label", dna.type.label),
    dna.type.scale.length > 0 ? `  - Size scale (px): ${dna.type.scale.join(" / ")}` : null,
    dna.type.families.length > 0
      ? `  - Families by text share: ${dna.type.families.map((entry) => `"${entry.family}" ${Math.round(entry.share * 100)}%`).join(", ")}`
      : null,
    dna.ui.buttonShape
      ? `- Buttons: ${dna.ui.buttonShape}${dna.ui.buttonRadius !== null ? ` (radius ${dna.ui.buttonRadius}px)` : ""}, ${dna.ui.buttonHeight ?? "?"}px tall${dna.ui.buttonFill ? `, fill ${dna.ui.buttonFill}` : ", outline/text"}${dna.ui.buttonText ? `, text ${dna.ui.buttonText}` : ""}`
      : null,
    `- Cards/panels: ${dna.ui.cardCount} detected${dna.ui.cardRadius !== null ? `, radius ~${Math.round(dna.ui.cardRadius)}px` : ""}, shadows ${dna.ui.shadows}, borders ${dna.ui.borders ? "common" : "rare"}`,
    `- Layout: ${dna.layout.pageHeight}px tall (${dna.layout.viewports} viewports)${dna.layout.contentWidth ? `, content width ~${Math.round(dna.layout.contentWidth)}px` : ""}${dna.layout.sectionCount ? `, ${dna.layout.sectionCount} sections` : ""}`,
  ];
  return lines.filter(Boolean).join("\n");
}

export type DnaGap = {
  severity: "blocking" | "major" | "minor";
  message: string;
};

export type DnaExpectation = {
  theme: "light" | "dark" | "mixed";
  surfaceColors: string[];
  displaySize: number | null;
  displayFamily: string | null;
  bodyFamily: string | null;
};

function familyMatches(rendered: string, expected: string) {
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
  const target = normalize(expected);
  return rendered
    .split(",")
    .map((entry) => normalize(entry))
    .some((entry) => entry.includes(target));
}

/**
 * Compares a rendered preview against the design brief (and the anchor DNA
 * the brief was derived from). Every gap names the measured value and the
 * expected one so the agent can act on it directly.
 */
export function compareDna({
  preview,
  previewProfile,
  expected,
  anchor,
}: {
  preview: PageDna;
  previewProfile: DesignProfile | null;
  expected: DnaExpectation;
  anchor: PageDna | null;
}): DnaGap[] {
  const gaps: DnaGap[] = [];

  if (expected.theme !== "mixed" && preview.theme !== expected.theme && preview.theme !== "mixed") {
    gaps.push({
      severity: "blocking",
      message: `Theme mismatch: the preview renders ${preview.theme} (${Math.round(preview.lightShare * 100)}% light surfaces) but the brief is ${expected.theme}. Use the brief's background/surface tokens for section backgrounds.`,
    });
  }
  if (expected.theme === "mixed") {
    const distinct = preview.surfaceColors.filter((entry) => entry.share >= 0.04).length;
    const expectedFamilies = mergeWeightedColors(expected.surfaceColors.map((color) => ({ color, weight: 1 })), SAME_COLOR_DELTA).length;
    const wanted = Math.min(3, expectedFamilies);
    if (distinct < wanted) {
      gaps.push({
        severity: "major",
        message: `Color-blocking is missing: the preview shows ${distinct} distinct section surface color(s); the brief defines ${expectedFamilies} visually distinct color families. Use the planned section surfaces rather than repeating one background.`,
      });
    }
  }

  const briefSurfaces = expected.surfaceColors.map((color) => rgb(color));
  if (briefSurfaces.length > 0 && preview.surfaceColors.length > 0) {
    const offBrief = preview.surfaceColors.filter(
      (entry) =>
        entry.share >= 0.08 &&
        !briefSurfaces.some((color) => deltaE(color, rgb(entry.color)) < 14),
    );
    for (const entry of offBrief.slice(0, 3)) {
      gaps.push({
        severity: "major",
        message: `Off-brief surface color ${entry.color} covers ${Math.round(entry.share * 100)}% of the page. Every section background must come from the brief's surface tokens (${expected.surfaceColors.join(", ")}).`,
      });
    }
  }

  const displaySize = preview.type.display?.size ?? 0;
  if (expected.displaySize && displaySize > 0 && displaySize < expected.displaySize * 0.7) {
    gaps.push({
      severity: "major",
      message: `Display type is too small: the largest headline renders at ${displaySize}px; the brief's display size is ${expected.displaySize}px at desktop. Use the text-display token for the hero headline.`,
    });
  }

  if (previewProfile) {
    if (expected.displayFamily && previewProfile.rootFamilies.h1 && !familyMatches(previewProfile.rootFamilies.h1, expected.displayFamily)) {
      gaps.push({
        severity: "major",
        message: `The h1 renders in ${previewProfile.rootFamilies.h1.split(",")[0]} instead of the brief display font "${expected.displayFamily}". Apply font-display to display headlines.`,
      });
    }
    if (!previewProfile.rootFamilies.h1) {
      gaps.push({
        severity: "major",
        message: "The page has no h1. The hero headline must be an h1 using the display type tokens.",
      });
    }
    if (expected.bodyFamily && !familyMatches(previewProfile.rootFamilies.body, expected.bodyFamily)) {
      gaps.push({
        severity: "major",
        message: `Body text renders in ${previewProfile.rootFamilies.body.split(",")[0]} instead of the brief body font "${expected.bodyFamily}".`,
      });
    }
    if (previewProfile.lowContrast && previewProfile.lowContrast.count > 0) {
      const lowContrast = previewProfile.lowContrast;
      const examples = lowContrast.examples
        .slice(0, 4)
        .map((example) => `"${example.text}" ${example.color} on ${example.background} (${example.ratio}:1, y=${example.y}px)`)
        .join("; ");
      gaps.push({
        severity: glyphOnlyContrast(lowContrast) ? "minor" : "blocking",
        message: `${previewProfile.lowContrast.count} text element(s) are nearly invisible: ${examples}. This usually means a card or button uses another surface's background but keeps the section's text token. Pair every background token with its own foreground token (bg-surface-N with text-surface-N-foreground, bg-primary with text-primary-foreground).`,
      });
    }
    if (previewProfile.emptyPanels && previewProfile.emptyPanels.count > 0) {
      gaps.push({
        severity: "major",
        message: `${previewProfile.emptyPanels.count} large panel(s) are empty, so they read as unfinished placeholders: ${previewProfile.emptyPanels.examples.map((example) => `${example.width}x${example.height}px at y=${example.y}px${example.text ? ` ("${example.text}")` : ""}`).join("; ")}. Fill each with a generated image (src="asset:<name>"), real product UI built in code, or remove the box.`,
      });
    }
    if (previewProfile.textOverflow && previewProfile.textOverflow.count > 0) {
      gaps.push({
        severity: "major",
        message: `${previewProfile.textOverflow.count} text element(s) run past their box at ${previewProfile.viewportWidth}px: ${previewProfile.textOverflow.examples.slice(0, 4).map((example) => `"${example.text}" by ${example.overflow}px (y=${example.y}px)`).join("; ")}. Reduce the type size for that container, allow the grid fewer columns, or shorten the words.`,
      });
    }
    if (previewProfile.images.broken > 0) {
      gaps.push({
        severity: "blocking",
        message: `${previewProfile.images.broken} image(s) failed to load in the preview. Use asset: placeholder names that match generated images, or exact generateAsset localPath values.`,
      });
    }
  }

  if (anchor) {
    const ratio = preview.layout.pageHeight / Math.max(1, anchor.layout.pageHeight);
    const anchorViewports = Math.min(anchor.layout.viewports, 9);
    if (preview.layout.viewports < Math.max(3, anchorViewports * 0.55)) {
      gaps.push({
        severity: "major",
        message: `The page is thin: ${preview.layout.viewports} viewports tall vs the anchor's ${anchor.layout.viewports} (${Math.round(ratio * 100)}%). Build out every planned section with real content and the anchor's vertical pacing (section padding, large media).`,
      });
    }
    if (anchor.ui.buttonShape && preview.ui.buttonShape && anchor.ui.buttonShape !== preview.ui.buttonShape) {
      gaps.push({
        severity: "minor",
        message: `Button shape differs: anchor buttons are ${anchor.ui.buttonShape}, preview buttons are ${preview.ui.buttonShape}. Use the rounded-button token.`,
      });
    }
  }

  return gaps;
}

/** True when every low-contrast element is a decorative glyph (one or two characters), not readable copy. */
export function glyphOnlyContrast(lowContrast: NonNullable<DesignProfile["lowContrast"]>) {
  return lowContrast.count === lowContrast.examples.length &&
    lowContrast.examples.every((example) => example.text.trim().length <= 2);
}

/**
 * How much of the first screen is a visual rather than flat fills: the largest
 * of the biggest image/video placement in view (manifest or live DOM) and the
 * share of pixel bands no single color dominates (artwork, photography, canvas).
 */
export function heroImagery(
  frames: FrameAnalysis[],
  media: Array<{ kind: string; placements: Array<{ bounds: readonly [number, number, number, number] }> }> = [],
  viewport: { width: number; height: number } | null = null,
  profile: DesignProfile | null = null,
) {
  const top = [...frames].sort((a, b) => a.scrollY - b.scrollY)[0];
  const pixelShare = top && top.bands.length > 0
    ? top.bands.filter((band) => band.share < SOLID_BAND_SHARE).length / top.bands.length
    : 0;
  const mediaShare = viewport
    ? Math.max(0, ...media.filter((asset) => asset.kind !== "mask").flatMap((asset) => asset.placements.map(({ bounds: [x, y, width, height] }) => {
      const visibleWidth = Math.max(0, Math.min(x + width, viewport.width) - Math.max(x, 0));
      const visibleHeight = Math.max(0, Math.min(y + height, viewport.height) - Math.max(y, 0));
      return (visibleWidth * visibleHeight) / (viewport.width * viewport.height);
    })))
    : 0;
  return Math.round(Math.min(1, Math.max(pixelShare, mediaShare, profile?.firstScreenMedia ?? 0)) * 100) / 100;
}

/**
 * Measured gaps between an original page and the primary reference it adapts.
 * Palette, copy and page length are free; theme family, display scale and
 * whether the hero is led by imagery are kept.
 */
export function compareWithPrimaryReference({
  preview,
  previewHeroImagery,
  reference,
  requestedTheme,
}: {
  preview: PageDna;
  previewHeroImagery: number;
  reference: { host: string; dna: PageDna; heroImagery: number };
  requestedTheme: "light" | "dark" | null;
}): DnaGap[] {
  const gaps: DnaGap[] = [];
  const dna = reference.dna;
  if (dna.theme !== "mixed" && requestedTheme === null && Math.abs(preview.lightShare - dna.lightShare) > 0.45) {
    gaps.push({
      severity: "blocking",
      message: `The primary reference ${reference.host} is a ${dna.theme} page (${Math.round(dna.lightShare * 100)}% light surfaces) but the preview is ${Math.round(preview.lightShare * 100)}% light. Keep the reference's theme family and express the brand through accent, type and artwork instead.`,
    });
  }
  const referenceDisplay = dna.type.display?.size ?? 0;
  const previewDisplay = preview.type.display?.size ?? 0;
  if (referenceDisplay > 0 && previewDisplay > 0 && previewDisplay < referenceDisplay * 0.75) {
    gaps.push({
      severity: "major",
      message: `The hero headline renders at ${previewDisplay}px; ${reference.host} sets its display type at ${referenceDisplay}px. Keep the reference's type scale (at least ${Math.round(referenceDisplay * 0.75)}px) with text-display.`,
    });
  }
  if (reference.heroImagery >= 0.35 && previewHeroImagery < Math.max(0.2, reference.heroImagery * 0.5)) {
    gaps.push({
      severity: "major",
      message: `${reference.host}'s first screen is led by artwork or photography (${Math.round(reference.heroImagery * 100)}% of it is imagery); the preview's first screen is ${Math.round(previewHeroImagery * 100)}% imagery, mostly flat fills and small UI. A small image card does not count: make one generated text-free image cover at least ${Math.round(Math.max(0.2, reference.heroImagery * 0.5) * 100)}% of the first screen, either full-bleed behind the headline (absolute inset-0 object-cover with a scrim) or a full-width rounded media card under or around it (w-full, min-h-[60vh]). At most one product card may rest on the image; move any other UI out of the hero.`,
    });
  }
  return gaps;
}
