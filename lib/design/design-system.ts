import type { DesignBrief } from "./brief.ts";
import { chroma, contrastRatio, deltaE, hslToRgb, isLightColor, parseColor, rgbToHsl, toHex, type Rgb } from "./color.ts";
import { nextFontExportName, weightsFor, type CatalogFont } from "./fonts.ts";

export const DESIGN_SYSTEM_MARKER = "bloom:design-system";

export type ResolvedFont =
  | { kind: "google"; entry: CatalogFont; weights: number[]; italic?: boolean }
  | {
    kind: "reference";
    family: string;
    files: Array<{ localPath: string; weight: string; style: string; format?: string; unicodeRange?: string }>;
  };

export type ResolvedFonts = {
  display: ResolvedFont;
  body: ResolvedFont;
  mono: ResolvedFont | null;
};

function blend(foreground: string, background: string, amount: number) {
  const fg = parseColor(foreground) as Rgb;
  const bg = parseColor(background) as Rgb;
  return toHex({
    r: fg.r * amount + bg.r * (1 - amount),
    g: fg.g * amount + bg.g * (1 - amount),
    b: fg.b * amount + bg.b * (1 - amount),
  });
}

function rgbOf(hex: string): Rgb {
  return parseColor(hex) ?? { r: 0, g: 0, b: 0 };
}

/** A saturated color of the given hue, nudged in lightness until it reads (3:1) on the background. */
function readableHue(hue: number, background: string, saturation = 0.68) {
  const bg = rgbOf(background);
  const dark = !isLightColor(bg);
  let lightness = dark ? 0.66 : 0.52;
  let color = hslToRgb({ h: hue, s: saturation, l: lightness });
  for (let step = 0; step < 14 && contrastRatio(color, bg) < 3; step += 1) {
    lightness += dark ? 0.025 : -0.025;
    color = hslToRgb({ h: hue, s: saturation, l: lightness });
  }
  return toHex(color);
}

/** Hue of the most saturated brand color, or null for a neutral (black/white/gray) brand. */
function brandHue(brief: DesignBrief) {
  const candidates = [brief.colors.primary, brief.colors.accent, ...brief.colors.surfaces.map((surface) => surface.background)].map(rgbOf);
  const best = candidates.reduce((winner, color) => (chroma(color) > chroma(winner) ? color : winner));
  return chroma(best) >= 12 ? rgbToHsl(best).h : null;
}

/** Five distinguishable, brand-related data colors readable on the page background. */
function chartPalette(brief: DesignBrief) {
  const hue = brandHue(brief);
  const hues = hue === null ? [220, 160, 35, 280, 350] : [hue, hue + 40, hue + 140, hue + 200, hue + 300];
  return hues.map((entry) => readableHue(entry, brief.colors.background));
}

export type ToneTokens = {
  canvas: string;
  ink: string;
  inkMuted: string;
  action: string;
  actionForeground: string;
  highlight: string;
  /** Swash color behind a marker-style highlight: the brand accent wherever it stands out from the surface. */
  marker: string;
};

/** Design-system options that come from a curated art direction rather than the brief. */
export type StyleOptions = {
  highlight?: "color" | "italic" | "marker";
  /** chart-1..5 from a shadcn theme instead of hues derived from the brand. */
  chart?: string[];
  /** The shadcn theme's --radius in px. */
  radiusPx?: number;
};

/**
 * Contextual colors for content on one surface: the action color is the brand
 * primary (or accent) only where it stays visible, otherwise the surface's own
 * text color; the highlight is a saturated brand color readable on the surface.
 */
export function toneFor(
  brief: DesignBrief,
  background: string,
  foreground: string,
  muted: string,
  { neutralHighlight = false }: { neutralHighlight?: boolean } = {},
): ToneTokens {
  const bg = rgbOf(background);
  const fg = rgbOf(foreground);
  const { primary, primaryForeground, accent, accentForeground } = brief.colors;
  const [action, actionForeground] = ([[primary, primaryForeground], [accent, accentForeground]] as const).find(
    ([color, text]) => contrastRatio(rgbOf(color), bg) >= 3 && contrastRatio(rgbOf(text), rgbOf(color)) >= 4.5,
  ) ?? [foreground, background];
  const hue = brandHue(brief);
  const highlight = [primary, accent].find(
    (color) => chroma(rgbOf(color)) >= 15 && contrastRatio(rgbOf(color), bg) >= 3 && deltaE(rgbOf(color), fg) > 15,
  ) ?? (hue === null || neutralHighlight ? foreground : readableHue(hue, background));
  const marker = [accent, primary].find((color) => chroma(rgbOf(color)) >= 15 && deltaE(rgbOf(color), bg) > 25) ??
    (isLightColor(bg) ? "#FFFFFF" : "#000000");
  return { canvas: background, ink: foreground, inkMuted: muted, action, actionForeground, highlight, marker };
}

function toneUtilities(name: string, variables: { canvas: string; ink: string; inkMuted: string }, tone: ToneTokens) {
  const declarations = [
    `--canvas: ${variables.canvas};`,
    `--ink: ${variables.ink};`,
    `--ink-muted: ${variables.inkMuted};`,
    `--action: ${tone.action};`,
    `--action-foreground: ${tone.actionForeground};`,
    `--highlight: ${tone.highlight};`,
    `--marker: ${tone.marker};`,
  ];
  return [
    `@utility surface-${name} {\n${[...declarations, "background-color: var(--canvas);", "color: var(--ink);"].map((line) => `  ${line}`).join("\n")}\n}`,
    `@utility tone-${name} {\n${[...declarations, "color: var(--ink);"].map((line) => `  ${line}`).join("\n")}\n}`,
  ].join("\n");
}

const px = (value: number) => `${Math.round(value * 100) / 100}px`;
const rem = (value: number) => `${Math.round((value / 16) * 1000) / 1000}rem`;

function fluid(maxPx: number, minPx: number, designWidth = 1440) {
  const min = Math.min(minPx, maxPx);
  const vw = Math.round((maxPx / designWidth) * 100 * 100) / 100;
  return `clamp(${rem(min)}, ${vw}vw, ${rem(maxPx)})`;
}

function fallbackStack(font: ResolvedFont, role: "display" | "body" | "mono") {
  if (role === "mono") return "ui-monospace, SFMono-Regular, Menlo, monospace";
  const serif = font.kind === "google" && font.entry.category === "serif";
  return serif
    ? "ui-serif, Georgia, Cambria, \"Times New Roman\", serif"
    : "ui-sans-serif, system-ui, -apple-system, \"Segoe UI\", sans-serif";
}

function fontVariable(role: "display" | "body" | "mono") {
  return `--font-${role}-face`;
}

function fontFamilyValue(font: ResolvedFont, role: "display" | "body" | "mono") {
  const face = font.kind === "google"
    ? `var(${fontVariable(role)})`
    : `"${font.family}"`;
  return `${face}, ${fallbackStack(font, role)}`;
}

function buttonRadius(brief: DesignBrief) {
  if (brief.shape.buttonShape === "pill") return "9999px";
  if (brief.shape.buttonShape === "square") return "2px";
  return px(Math.min(Math.max(brief.shape.cardRadiusPx * 0.5, 8), 14));
}

function shadowValue(shadows: DesignBrief["shape"]["shadows"]) {
  if (shadows === "none") return "none";
  if (shadows === "subtle") return "0 1px 2px rgb(0 0 0 / 0.06), 0 1px 3px rgb(0 0 0 / 0.08)";
  return "0 18px 48px -18px rgb(0 0 0 / 0.22)";
}

function referenceFontFaces(fonts: ResolvedFonts) {
  const seen = new Set<string>();
  const rules: string[] = [];
  for (const font of [fonts.display, fonts.body, fonts.mono]) {
    if (!font || font.kind !== "reference") continue;
    for (const file of font.files) {
      const key = `${font.family}|${file.localPath}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rules.push(
        [
          "@font-face {",
          `  font-family: "${font.family}";`,
          `  src: url("${file.localPath}")${file.format ? ` format("${file.format}")` : ""};`,
          `  font-weight: ${file.weight};`,
          `  font-style: ${file.style};`,
          "  font-display: swap;",
          file.unicodeRange ? `  unicode-range: ${file.unicodeRange};` : null,
          "}",
        ].filter(Boolean).join("\n"),
      );
    }
  }
  return rules.join("\n\n");
}

/** Viewport-relative cap for a hero headline that shares its row with a visual: narrow faces can run larger. */
function splitDisplayVw(font: ResolvedFont) {
  if (font.kind !== "google") return "5.4vw";
  if (font.entry.width === "condensed") return "7.4vw";
  if (font.entry.category === "serif") return "6.2vw";
  return "5.4vw";
}

/** Condensed display faces run larger at hero size. */
function narrowDisplay(font: ResolvedFont) {
  return font.kind === "google" && font.entry.width === "condensed" && font.entry.category !== "serif";
}

/** Condensed or extra-wide poster faces overflow and read poorly in small titles, so card and row titles use the body face. */
function posterDisplay(font: ResolvedFont) {
  return font.kind === "google" && font.entry.width !== "normal" && font.entry.category !== "serif";
}

/** Unlayered rules for the highlighted phrase in headlines (they override the text-highlight utility). */
function highlightCss(style: NonNullable<StyleOptions["highlight"]>) {
  if (style === "italic") {
    return ".brand-highlight {\n  font-style: italic;\n}";
  }
  if (style === "marker") {
    return [
      ".brand-highlight {",
      "  color: var(--ink);",
      "  background-image: linear-gradient(transparent 56%, color-mix(in oklab, var(--marker) 70%, transparent) 56%, color-mix(in oklab, var(--marker) 70%, transparent) 92%, transparent 92%);",
      "  padding-inline: 0.06em;",
      "  -webkit-box-decoration-break: clone;",
      "  box-decoration-break: clone;",
      "}",
    ].join("\n");
  }
  return "";
}

/** Full globals.css generated from the brief: one source of truth for every visual token. */
export function generateGlobalsCss(brief: DesignBrief, fonts: ResolvedFonts, style: StyleOptions = {}) {
  const { colors, typography, shape, layout } = brief;
  const surfaces = colors.surfaces.map((surface, index) => ({
    index: index + 1,
    ...surface,
    muted: blend(surface.foreground, surface.background, 0.72),
  }));
  const chart = style.chart ?? chartPalette(brief);
  const onChart = ["#FFFFFF", "#111111"].reduce((best, candidate) => {
    const worst = (color: string) => Math.min(...chart.map((entry) => contrastRatio(rgbOf(color), rgbOf(entry))));
    return worst(candidate) > worst(best) ? candidate : best;
  });
  const neutralHighlight = style.highlight === "italic";
  const baseTone = toneFor(brief, colors.background, colors.foreground, colors.mutedForeground, { neutralHighlight });
  const positive = readableHue(145, colors.background, 0.6);
  const negative = readableHue(356, colors.background, 0.7);
  const toneCss = [
    toneUtilities("base", { canvas: "var(--background)", ink: "var(--foreground)", inkMuted: "var(--muted-foreground)" }, baseTone),
    ...surfaces.map((surface) =>
      toneUtilities(
        String(surface.index),
        {
          canvas: `var(--surface-${surface.index})`,
          ink: `var(--surface-${surface.index}-foreground)`,
          inkMuted: `var(--surface-${surface.index}-muted)`,
        },
        toneFor(brief, surface.background, surface.foreground, surface.muted, { neutralHighlight }),
      ),
    ),
  ].join("\n\n");

  const variables = [
    `--background: ${colors.background};`,
    `--foreground: ${colors.foreground};`,
    `--card: ${colors.muted};`,
    `--card-foreground: ${colors.foreground};`,
    `--popover: ${colors.background};`,
    `--popover-foreground: ${colors.foreground};`,
    `--primary: ${colors.primary};`,
    `--primary-foreground: ${colors.primaryForeground};`,
    `--secondary: ${colors.muted};`,
    `--secondary-foreground: ${colors.foreground};`,
    `--muted: ${colors.muted};`,
    `--muted-foreground: ${colors.mutedForeground};`,
    `--accent: ${colors.accent};`,
    `--accent-foreground: ${colors.accentForeground};`,
    "--destructive: oklch(0.577 0.245 27.325);",
    `--border: ${colors.border};`,
    `--input: ${colors.border};`,
    `--ring: ${colors.primary};`,
    ...chart.map((color, index) => `--chart-${index + 1}: ${color};`),
    `--radius: ${px(style.radiusPx ?? Math.max(shape.cardRadiusPx * 0.5, 4))};`,
    `--radius-card-value: ${px(shape.cardRadiusPx)};`,
    `--radius-button-value: ${buttonRadius(brief)};`,
    `--shadow-card-value: ${shadowValue(shape.shadows)};`,
    `--sidebar: ${colors.background};`,
    `--sidebar-foreground: ${colors.foreground};`,
    `--sidebar-primary: ${colors.primary};`,
    `--sidebar-primary-foreground: ${colors.primaryForeground};`,
    `--sidebar-accent: ${colors.muted};`,
    `--sidebar-accent-foreground: ${colors.foreground};`,
    `--sidebar-border: ${colors.border};`,
    `--sidebar-ring: ${colors.primary};`,
    ...surfaces.flatMap((surface) => [
      `--surface-${surface.index}: ${surface.background};`,
      `--surface-${surface.index}-foreground: ${surface.foreground};`,
      `--surface-${surface.index}-muted: ${surface.muted};`,
    ]),
    "--canvas: var(--background);",
    "--ink: var(--foreground);",
    "--ink-muted: var(--muted-foreground);",
    `--action: ${baseTone.action};`,
    `--action-foreground: ${baseTone.actionForeground};`,
    `--highlight: ${baseTone.highlight};`,
    `--marker: ${baseTone.marker};`,
    `--display-split-vw: ${splitDisplayVw(fonts.display)};`,
    `--on-chart: ${onChart};`,
    `--positive: ${positive};`,
    `--negative: ${negative};`,
  ].map((line) => `    ${line}`).join("\n");

  const display = typography.display;
  const headlineSize = Math.round(Math.min(Math.max(typography.heading.sizePx, display.sizePx * 0.72, 44), 80));
  const titleSize = Math.round(Math.min(Math.max(headlineSize * 0.58, 28), 44));
  const bodySize = typography.body.sizePx;
  const themeLines = [
    `--font-display: ${fontFamilyValue(fonts.display, "display")};`,
    `--font-heading: ${fontFamilyValue(fonts.display, "display")};`,
    `--font-sans: ${fontFamilyValue(fonts.body, "body")};`,
    `--font-mono: ${fonts.mono ? fontFamilyValue(fonts.mono, "mono") : "ui-monospace, SFMono-Regular, Menlo, monospace"};`,
    "",
    `--text-display: ${fluid(display.sizePx, Math.max(40, display.sizePx * (narrowDisplay(fonts.display) ? 0.42 : 0.32)))};`,
    `--text-display--line-height: ${display.lineHeight};`,
    `--text-display--letter-spacing: ${display.tracking}em;`,
    `--text-display--font-weight: ${display.weight};`,
    `--text-headline: ${fluid(headlineSize, 34)};`,
    `--text-headline--line-height: ${headlineSize >= 56 ? 1.02 : 1.08};`,
    `--text-headline--letter-spacing: ${Math.min(display.tracking, -0.015)}em;`,
    `--text-headline--font-weight: ${typography.heading.weight};`,
    `--text-title: ${fluid(titleSize, 26)};`,
    "--text-title--line-height: 1.12;",
    `--text-title--letter-spacing: ${Math.min(display.tracking, 0)}em;`,
    `--text-title--font-weight: ${typography.heading.weight};`,
    `--text-subtitle: ${fluid(Math.max(21, Math.round(titleSize * 0.66)), 19)};`,
    "--text-subtitle--line-height: 1.25;",
    `--text-lead: ${fluid(Math.round(bodySize * 1.3), bodySize + 1)};`,
    "--text-lead--line-height: 1.5;",
    `--text-body: ${rem(bodySize)};`,
    "--text-body--line-height: 1.6;",
    `--text-eyebrow: ${rem(Math.max(11, Math.round(bodySize * 0.78)))};`,
    "--text-eyebrow--line-height: 1.2;",
    "--text-eyebrow--letter-spacing: 0.08em;",
    "",
    `--container-page: ${px(layout.contentWidthPx)};`,
    `--spacing-section: ${fluid(layout.sectionPaddingPx, Math.max(48, layout.sectionPaddingPx * 0.45))};`,
    "--shadow-card: var(--shadow-card-value);",
    "--radius-card: var(--radius-card-value);",
    "--radius-button: var(--radius-button-value);",
    "",
    "--color-background: var(--background);",
    "--color-foreground: var(--foreground);",
    "--color-card: var(--card);",
    "--color-card-foreground: var(--card-foreground);",
    "--color-popover: var(--popover);",
    "--color-popover-foreground: var(--popover-foreground);",
    "--color-primary: var(--primary);",
    "--color-primary-foreground: var(--primary-foreground);",
    "--color-secondary: var(--secondary);",
    "--color-secondary-foreground: var(--secondary-foreground);",
    "--color-muted: var(--muted);",
    "--color-muted-foreground: var(--muted-foreground);",
    "--color-accent: var(--accent);",
    "--color-accent-foreground: var(--accent-foreground);",
    "--color-destructive: var(--destructive);",
    "--color-border: var(--border);",
    "--color-input: var(--input);",
    "--color-ring: var(--ring);",
    ...[1, 2, 3, 4, 5].map((index) => `--color-chart-${index}: var(--chart-${index});`),
    "--color-sidebar: var(--sidebar);",
    "--color-sidebar-foreground: var(--sidebar-foreground);",
    "--color-sidebar-primary: var(--sidebar-primary);",
    "--color-sidebar-primary-foreground: var(--sidebar-primary-foreground);",
    "--color-sidebar-accent: var(--sidebar-accent);",
    "--color-sidebar-accent-foreground: var(--sidebar-accent-foreground);",
    "--color-sidebar-border: var(--sidebar-border);",
    "--color-sidebar-ring: var(--sidebar-ring);",
    ...surfaces.flatMap((surface) => [
      `--color-surface-${surface.index}: var(--surface-${surface.index});`,
      `--color-surface-${surface.index}-foreground: var(--surface-${surface.index}-foreground);`,
      `--color-surface-${surface.index}-muted: var(--surface-${surface.index}-muted);`,
    ]),
    "--color-canvas: var(--canvas);",
    "--color-ink: var(--ink);",
    "--color-ink-muted: var(--ink-muted);",
    "--color-action: var(--action);",
    "--color-action-foreground: var(--action-foreground);",
    "--color-highlight: var(--highlight);",
    "--color-on-chart: var(--on-chart);",
    "--color-positive: var(--positive);",
    "--color-negative: var(--negative);",
    "",
    "--animate-marquee: marquee 40s linear infinite;",
    "--animate-float: float 7s ease-in-out infinite;",
    "@keyframes marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }",
    "@keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }",
    "",
    "--radius-sm: calc(var(--radius) * 0.6);",
    "--radius-md: calc(var(--radius) * 0.8);",
    "--radius-lg: var(--radius);",
    "--radius-xl: calc(var(--radius) * 1.4);",
    "--radius-2xl: calc(var(--radius) * 1.8);",
    "--radius-3xl: calc(var(--radius) * 2.2);",
    "--radius-4xl: calc(var(--radius) * 2.6);",
  ].map((line) => (line ? `    ${line}` : "")).join("\n");

  const fontFaces = referenceFontFaces(fonts);

  return `@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";

/*
 * ${DESIGN_SYSTEM_MARKER} - generated from the design brief for ${brief.brand.name}.
 * Every color, font, type size, radius, shadow, width, and section spacing lives here.
 * Components use these tokens (bg-surface-2, text-display, font-display, rounded-card, max-w-page, py-section)
 * instead of raw palette classes or hex values. Change a token here to restyle the whole site.
 */

@custom-variant dark (&:is(.dark *));
${fontFaces ? `\n${fontFaces}\n` : ""}
@theme inline {
${themeLines}
}

:root {
${variables}
}

.dark {
${variables}
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  html {
    @apply font-sans;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }
  body {
    @apply bg-background text-foreground text-body;
  }
  h1, h2, h3 {
    font-family: var(--font-heading);
    text-wrap: balance;
  }${typography.display.uppercase ? `
  h1, h2, .display-case {
    text-transform: uppercase;
  }` : ""}${posterDisplay(fonts.display) ? `
  h3 {
    font-family: var(--font-sans);
    font-weight: 600;
    letter-spacing: -0.015em;
  }` : ""}
  p {
    text-wrap: pretty;
  }
}

/* Contextual colors: surface-N paints a section; tone-N only sets colors. Inside either, text-ink, text-ink-muted, bg-ink/5, bg-action, text-highlight, and bg-canvas adapt to that surface. */
${toneCss}
${highlightCss(style.highlight ?? "color")}${posterDisplay(fonts.display) ? "\nh3.font-display {\n  font-family: var(--font-sans);\n  font-weight: 600;\n}\n" : ""}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
`;
}

function fontDeclaration(font: ResolvedFont, role: "display" | "body" | "mono", constName: string) {
  if (font.kind !== "google") return null;
  const weights = weightsFor(font.entry, font.weights);
  const options = [
    "subsets: [\"latin\"]",
    `variable: "${fontVariable(role)}"`,
    "display: \"swap\"",
    weights ? `weight: [${weights.map((weight) => `"${weight}"`).join(", ")}]` : null,
    font.italic ? "style: [\"normal\", \"italic\"]" : null,
  ].filter(Boolean).join(", ");
  return `const ${constName} = ${nextFontExportName(font.entry.family)}({ ${options} })`;
}

/** True when layout.tsx still has the starter structure the generator can safely replace. */
export function isReplaceableLayout(content: string | null) {
  if (!content) return false;
  return (
    content.includes("next/font") &&
    content.includes("ThemeProvider") &&
    content.includes("RootLayout") &&
    !/<(?:Navbar|Header|Nav|Footer)\b/.test(content)
  );
}

export function generateLayout(
  brief: DesignBrief,
  fonts: ResolvedFonts,
  options: { toaster: boolean; tooltip: boolean },
) {
  const roles = [
    { role: "display" as const, font: fonts.display, constName: "displayFont" },
    { role: "body" as const, font: fonts.body, constName: "bodyFont" },
    ...(fonts.mono ? [{ role: "mono" as const, font: fonts.mono, constName: "monoFont" }] : []),
  ];
  const googleRoles = roles.filter((entry) => entry.font.kind === "google");
  const imports = [
    ...new Set(
      googleRoles.map((entry) =>
        entry.font.kind === "google" ? nextFontExportName(entry.font.entry.family) : "",
      ),
    ),
  ];
  const declarations = googleRoles
    .map((entry) => fontDeclaration(entry.font, entry.role, entry.constName))
    .filter(Boolean)
    .join("\n");
  const variables = googleRoles.map((entry) => `${entry.constName}.variable`).join(", ");
  const forcedTheme = brief.theme === "dark" ? "dark" : "light";
  const title = `${brief.brand.name} - ${brief.brand.tagline}`;

  return `import type { Metadata } from "next"
${imports.length > 0 ? `import { ${imports.join(", ")} } from "next/font/google"\n` : ""}${options.toaster ? "import { Toaster } from \"@/components/ui/toast\"\n" : ""}${options.tooltip ? "import { TooltipProvider } from \"@/components/ui/tooltip\"\n" : ""}import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { cn } from "@/lib/utils"

${declarations}

export const metadata: Metadata = {
  title: ${JSON.stringify(title)},
  description: ${JSON.stringify(brief.brand.tagline)},
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("antialiased"${variables ? `, ${variables}` : ""})}
    >
      <body className="bg-background font-sans text-foreground">
        <ThemeProvider
          attribute="class"
          forcedTheme="${forcedTheme}"
          defaultTheme="${forcedTheme}"
          enableSystem={false}
          disableTransitionOnChange
        >
          ${options.tooltip ? "<TooltipProvider>{children}</TooltipProvider>" : "{children}"}
        </ThemeProvider>${options.toaster ? "\n        <Toaster />" : ""}
      </body>
    </html>
  )
}
`;
}

const BUTTON_BASE = "rounded-lg border border-transparent bg-clip-padding";
const BUTTON_SIZES_ANCHOR = /"icon-lg": "size-\d+",/;

/**
 * Adds marketing-scale sizes to the shadcn button and points it at the brief's
 * button radius, unless a shadcn style already owns the button's shape.
 */
export function patchButtonComponent(content: string | null, { keepRadius = false } = {}) {
  const anchor = content?.match(BUTTON_SIZES_ANCHOR)?.[0];
  if (!content || !anchor || content.includes('xl: "h-11')) return null;
  if (!keepRadius && (!content.includes(BUTTON_BASE) || content.includes("rounded-button"))) return null;
  return (keepRadius ? content : content.replace(BUTTON_BASE, "rounded-button border border-transparent bg-clip-padding"))
    .replace(
      anchor,
      `${anchor}\n        xl: "h-11 gap-2 px-5 text-base has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4",\n        "2xl": "h-14 gap-2.5 px-7 text-base has-data-[icon=inline-end]:pr-6 has-data-[icon=inline-start]:pl-6",`,
    );
}

const CUSTOM_TEXT_SIZES = ["display", "headline", "title", "subtitle", "lead", "body", "eyebrow"];

/**
 * Teaches the project's cn() helper the design-system text sizes; without it,
 * tailwind-merge reads text-display as a color and drops it next to text-ink.
 */
export function patchUtilsFile(content: string | null) {
  const stock = content?.includes("twMerge(clsx(inputs))") || content?.trim() === 'export { cn } from "cn"';
  if (!content || !stock || content.includes("extendTailwindMerge")) {
    return null;
  }
  return `import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ${JSON.stringify(CUSTOM_TEXT_SIZES)} }],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
`;
}

function fontLabel(font: ResolvedFont) {
  return font.kind === "google" ? font.entry.family : `${font.family} (captured reference font)`;
}

/** Token cheat-sheet returned to the agent and stored in DESIGN.md. */
export function tokenUsageGuide(brief: DesignBrief) {
  const surfaces = brief.colors.surfaces
    .map((surface, index) => `bg-surface-${index + 1} text-surface-${index + 1}-foreground (${surface.name}; secondary text text-surface-${index + 1}-muted)`)
    .join("; ");
  return [
    `Section surfaces: ${surfaces}. Prefer the surface-N class (paints the surface and sets the contextual colors below); tone-N sets the colors without painting.`,
    "Contextual colors (adapt to whichever surface they sit in, light or dark): text-ink, text-ink-muted, bg-ink/5 for quiet panels, ring-ink/10 or border-ink/10 for hairlines, bg-action text-action-foreground for buttons, text-highlight / bg-highlight/15 for accents, bg-canvas for the surface color itself, text-positive / text-negative for up/down values.",
    "Page canvas: bg-background text-foreground; quiet panels bg-muted / bg-card; secondary text text-muted-foreground; hairlines border-border.",
    "Actions: bg-action text-action-foreground (or the blocks' Actions); shadcn Button sizes xl / 2xl exist for CTAs.",
    `Type: hero h1 = font-display text-display${brief.typography.display.uppercase ? " uppercase" : ""}; section titles = font-display text-headline; row/card titles text-title or text-subtitle; intros text-lead; body text-body; labels text-eyebrow uppercase.`,
    "Shape: rounded-card for cards/panels/media frames, rounded-button for buttons and pills, shadow-card only where the brief allows shadows.",
    "Layout: wrap content in mx-auto w-full max-w-page px-6 md:px-10; vertical section rhythm py-section.",
    "Opacity modifiers on tokens are fine (bg-primary/10, border-surface-2-foreground/20). Raw palette classes (bg-zinc-900, text-white, emerald-500) and hex/rgb arbitrary values are rejected.",
  ].join("\n");
}

/** Human-readable contract stored in the project so later edits keep the same system. */
export function generateDesignDoc(brief: DesignBrief, fonts: ResolvedFonts) {
  const surfaceRows = brief.colors.surfaces
    .map(
      (surface, index) =>
        `| surface-${index + 1} | ${surface.name} | ${surface.background} | ${surface.foreground} | \`bg-surface-${index + 1} text-surface-${index + 1}-foreground\`, secondary text \`text-surface-${index + 1}-muted\` |`,
    )
    .join("\n");
  const sectionRows = brief.sections
    .map(
      (section, index) =>
        `${index + 1}. **${section.id}** (${section.block}${section.variant ? ` ${section.variant}` : ""} block, surface-${section.surface}${section.anchorFrame ? `, adapts anchor frame ${section.anchorFrame}` : ""}): ${section.purpose}. Layout: ${section.composition}${section.media ? ` Media: ${section.media}.` : ""}`,
    )
    .join("\n");

  return `# ${brief.brand.name} design system

${brief.brand.tagline}

This file is the visual contract for this project. Every component uses the tokens below; never use raw Tailwind palette classes (bg-zinc-900, text-white, emerald-500) or hex values in components. To change the look, edit \`app/globals.css\`.

- Anchor: ${brief.anchor.url ?? "none"} - keeps ${brief.anchor.keep}
${brief.traits.map((trait) => `- Trait from ${trait.url}: ${trait.trait}`).join("\n")}
- Theme: ${brief.theme}
- Voice: ${brief.brand.voice}
- Signature element: ${brief.signature}
- Imagery: ${brief.imagery}

## Color tokens

| Token | Use | Value |
| --- | --- | --- |
| background / foreground | page canvas and default text | ${brief.colors.background} / ${brief.colors.foreground} |
| primary / primary-foreground | main actions | ${brief.colors.primary} / ${brief.colors.primaryForeground} |
| accent / accent-foreground | sparing highlights | ${brief.colors.accent} / ${brief.colors.accentForeground} |
| muted / muted-foreground | quiet panels, secondary text | ${brief.colors.muted} / ${brief.colors.mutedForeground} |
| border | hairlines and inputs | ${brief.colors.border} |

### Section surfaces

| Token | Role | Background | Text | Classes |
| --- | --- | --- | --- | --- |
${surfaceRows}

## Typography

- Display: ${fontLabel(fonts.display)}, ${brief.typography.display.sizePx}px desktop, weight ${brief.typography.display.weight}${brief.typography.display.uppercase ? ", uppercase" : ""}. Classes: \`font-display text-display\`${brief.typography.display.uppercase ? " `uppercase`" : ""}.
- Section titles: \`font-display text-headline\`. Row and card titles: \`text-title\`, \`text-subtitle\`.
- Body: ${fontLabel(fonts.body)}, \`text-body\` (${brief.typography.body.sizePx}px); intro paragraphs \`text-lead\`.
- Labels/eyebrows: \`text-eyebrow uppercase\`${fonts.mono ? ` (\`font-mono\` = ${fontLabel(fonts.mono)})` : ""}.

## Shape, layout, spacing

- Cards/panels: \`rounded-card\` (${brief.shape.cardRadiusPx}px), shadow \`shadow-card\` (${brief.shape.shadows}), borders ${brief.shape.borders ? "allowed" : "avoided"}.
- Buttons: ${brief.shape.buttonShape} via \`rounded-button\`; shadcn Button sizes \`xl\` and \`2xl\` for marketing CTAs.
- Page container: \`mx-auto w-full max-w-page px-6 md:px-10\` (${brief.layout.contentWidthPx}px).
- Section rhythm: \`py-section\` (${brief.layout.sectionPaddingPx}px desktop).

## Section blocks

Build the planned compositions in custom JSX using the tokens. \`components/blocks\` is an optional library (Hero, FeatureCards, Bento, FeatureSplit, Faq, Cta, SiteFooter, ...) with mockup primitives (Stage, PhoneFrame, BrowserFrame, MetricCard, AreaChart, ...). Use a block only when its geometry fits; do not squeeze an original concept into its props. Every block takes \`surface={N}\`. Custom sections use \`className="surface-N"\` for the same contextual colors.

## Usage cheat-sheet

${tokenUsageGuide(brief)}

## Page plan

${sectionRows}
`;
}
