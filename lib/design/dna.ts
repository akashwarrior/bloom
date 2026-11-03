import {
  deltaE,
  isLightColor,
  parseColor,
  toHex,
  type Rgb,
} from "./color.ts";
import type { MeasuredFont } from "./fonts.ts";

/** Pixel statistics for one captured viewport frame (computed in the browser). */
export type FrameAnalysis = {
  scrollY: number;
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

type TextStyleSample = {
  family: string;
  size: number;
  weight: number;
  transform: string;
  chars: number;
};

/** Computed-style evidence gathered from the live DOM. */
export type DesignProfile = {
  stickyHeaderHeight: number;
  textStyles: TextStyleSample[];
  headings: string[];
  /** Large on-page text (>= 24px): headlines, taglines, and claims. */
  prominentTexts?: string[];
  /** Glyph metrics of the main families as rendered on the page. */
  fontMetrics?: MeasuredFont[];
};

type TypeRole = {
  family: string;
  size: number;
  measured?: MeasuredFont;
};

type Surface = {
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
  type: {
    display: TypeRole | null;
    body: TypeRole | null;
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
): TypeRole | null {
  if (!sample) return null;
  const measured = metrics.find((entry) => entry.family === sample.family && entry.weight === sample.weight) ??
    metrics.find((entry) => entry.family === sample.family);
  return {
    family: readableFamily(sample.family),
    size: Math.round(sample.size),
    ...(measured ? { measured: { ...measured, weight: sample.weight } } : {}),
  };
}

function typographyFromProfile(profile: DesignProfile): PageDna["type"] {
  const styles = profile.textStyles.filter((style) => style.chars >= 2 && style.size >= 10);
  const display = [...styles]
    .sort((a, b) => b.size - a.size)
    .find((style) => style.size >= 28 && style.chars >= 4);
  const body = [...styles]
    .filter((style) => style.size >= 13 && style.size <= 22 && style.transform !== "uppercase")
    .sort((a, b) => b.chars - a.chars)[0];
  const metrics = profile.fontMetrics ?? [];
  return {
    display: typeRole(display, metrics),
    body: typeRole(body, metrics),
  };
}

export function buildPageDna({
  frames,
  profile,
  pageHeight,
}: {
  frames: FrameAnalysis[];
  profile: DesignProfile | null;
  pageHeight: number;
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
  return {
    theme,
    lightShare,
    surfaces,
    surfaceColors: surfaceColors.slice(0, 8),
    palette,
    type: profile
      ? typographyFromProfile(profile)
      : { display: null, body: null },
  };
}
