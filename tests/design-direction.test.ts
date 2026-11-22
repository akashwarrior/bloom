import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

import { effectivePreset } from "../lib/design/design-skill.ts";
import {
  colorProblems,
  designDirectionSchema,
  directionCss,
  directionCssVars,
  directionDigest,
  fontsModule,
  namedColorsCss,
  resolveFont,
  resolveFonts,
  storedDirection,
  withDirectionCss,
  withDirectionLayout,
  type FontCatalog,
} from "../lib/design/direction.ts";
import { lintSourceChange } from "../lib/design/lint.ts";
import type { ResolvedPreset } from "../lib/design/shadcn-theme.ts";
import { directionInput } from "./fixtures/direction.ts";

const catalog = JSON.parse(readFileSync(
  createRequire(import.meta.url).resolve("next/dist/compiled/@next/font/dist/google/font-data.json"),
  "utf8",
)) as FontCatalog;

const direction = storedDirection(directionInput);

const SHADCN_LAYOUT = `import { Geist, Geist_Mono, Inter } from "next/font/google"

import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { cn } from "@/lib/utils";

const inter = Inter({subsets:['latin'],variable:'--font-sans'})

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("antialiased", "font-sans", inter.variable)}
    >
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
`;

test("a direction is free-form but complete: every part of the design is decided", () => {
  assert.equal(designDirectionSchema.safeParse(directionInput).success, true);
  for (const key of ["concept", "signature", "composition", "mobile", "color", "typography", "shape", "imagery", "motion", "voice", "avoid", "explored"] as const) {
    assert.equal(designDirectionSchema.safeParse({ ...directionInput, [key]: undefined }).success, false, `${key} must be required`);
  }
  // Any color and any family are accepted by the schema; nothing is chosen from a fixed list.
  const other = structuredClone(directionInput);
  other.color.tokens.primary = "#7A1FA2";
  other.typography.display.family = "Some Face Nobody Listed";
  assert.equal(designDirectionSchema.safeParse(other).success, true);
  assert.equal(designDirectionSchema.safeParse({ ...directionInput, color: { ...directionInput.color, tokens: { ...directionInput.color.tokens, primary: "tomato" } } }).success, false);
});

test("illegible color pairs and mode mismatches are reported as facts to fix", () => {
  assert.deepEqual(colorProblems(directionInput.color), []);

  const faint = structuredClone(directionInput.color);
  faint.tokens["muted-foreground"] = "#3A5148";
  const problems = colorProblems(faint);
  assert.equal(problems.length, 2);
  assert.match(problems[0]!, /muted-foreground #3A5148 on background #10231C has contrast [\d.]+:1; text needs at least 4\.5:1/);

  const wrongMode = { ...directionInput.color, mode: "light" as const };
  assert.match(colorProblems(wrongMode)[0]!, /color\.mode is "light" but background #10231C is dark/);

  const clash = structuredClone(directionInput.color);
  clash.extra = [
    { name: "primary", value: "#FF5A36", on: "#10231C", use: "Collides with a semantic token." },
    { name: "ember", value: "#FF5A36", on: "#FFFFFF", use: "White text on a bright color." },
  ];
  clash.extra.push({ name: "rose-500", value: "#FF5A36", on: "#10231C", use: "Would generate Tailwind's own palette class." });
  const named = colorProblems(clash);
  assert.ok(named.some((problem) => /"primary" collides/.test(problem)));
  assert.ok(named.some((problem) => /"rose-500" collides/.test(problem)));
  // Every accepted name must produce classes the page lint allows.
  const accepted = { ...directionInput.color, extra: [{ name: "rose-gold", value: "#FF5A36", on: "#10231C", use: "A name that only resembles a palette name." }] };
  assert.deepEqual(colorProblems(accepted), []);
  assert.deepEqual(lintSourceChange({ path: "app/page.tsx", before: null, after: '<p className="bg-rose-gold text-rose-gold-foreground border-signal">', reference: null }), []);
  assert.ok(named.some((problem) => /extra "ember": text #FFFFFF on #FF5A36/.test(problem)));
});

test("fonts resolve against the whole Google catalog, with exact feedback when they cannot load", () => {
  assert.ok(Object.keys(catalog).length > 1_000);

  const variable = resolveFont({ family: "fraunces", italic: true, fallback: "serif" }, catalog);
  assert.ok("font" in variable);
  assert.deepEqual(variable.font, { family: "Fraunces", importName: "Fraunces", weights: null, styles: ["normal", "italic"], subsets: ["latin"], fallback: "serif" });

  const fixed = resolveFont({ family: "DM Mono", weights: [400, 500, 800], fallback: "monospace" }, catalog);
  assert.ok("font" in fixed);
  assert.equal(fixed.font.importName, "DM_Mono");
  assert.deepEqual(fixed.font.weights, ["400", "500"]);

  const defaulted = resolveFont({ family: "Bebas Neue", fallback: "sans-serif" }, catalog);
  assert.ok("font" in defaulted);
  assert.deepEqual(defaulted.font.weights, ["400"]);

  const missing = resolveFont({ family: "Hanken Grotesque", fallback: "sans-serif" }, catalog);
  assert.ok("problem" in missing);
  assert.match(missing.problem, /not a Google Fonts family/);
  assert.match(missing.problem, /Hanken Grotesk/);

  const badWeight = resolveFont({ family: "Bebas Neue", weights: [700], fallback: "sans-serif" }, catalog);
  assert.ok("problem" in badWeight);
  assert.match(badWeight.problem, /has no weight 700\. Available weights: 400/);

  const all = resolveFonts({ ...directionInput.typography, body: { family: "Helvetica Now", fallback: "sans-serif" } }, catalog);
  assert.ok("problems" in all);
  assert.match(all.problems[0]!, /^typography\.body: /);
});

test("the overlay turns a direction into tokens, fonts and layout wiring", () => {
  const fonts = resolveFonts(direction.typography, catalog);
  assert.ok("fonts" in fonts);

  const vars = directionCssVars(direction);
  assert.equal(vars.background, "#10231C");
  assert.equal(vars.popover, vars.card);
  assert.equal(vars.input, vars.border);
  assert.equal(vars.ring, vars.primary);
  assert.equal(vars["sidebar-primary"], vars.primary);
  assert.equal(vars.signal, "#FF5A36");
  assert.equal(vars["signal-foreground"], "#10231C");
  assert.equal(new Set([1, 2, 3, 4, 5].map((index) => vars[`chart-${index}`])).size, 5);

  const css = directionCss(direction, fonts.fonts);
  assert.match(css, /^\/\* bloom:direction:start \*\/\n:root, \.dark \{/);
  assert.match(css, /--primary: #E8B04A;/);
  assert.match(css, /--radius: 0\.125rem;/);
  assert.match(css, /--font-heading: var\(--bloom-font-display\), serif;/);
  assert.match(css, /--font-sans: var\(--bloom-font-body\), sans-serif;/);
  assert.match(css, /--font-mono: var\(--bloom-font-utility\), monospace;/);
  assert.match(css, /--color-signal: var\(--signal\);/);
  assert.match(css, /--color-signal-foreground: var\(--signal-foreground\);/);

  // A light direction leaves shadcn's dark side alone so inverted menus keep working.
  const light = directionCss({ ...direction, color: { ...direction.color, mode: "light" } }, null);
  assert.match(light, /\n:root \{/);
  assert.doesNotMatch(light, /--font-/);

  const source = fontsModule(fonts.fonts);
  assert.match(source, /import \{ Fraunces, Hanken_Grotesk, DM_Mono \} from "next\/font\/google";/);
  assert.match(source, /const display = Fraunces\(\{ subsets: \["latin"\], variable: "--bloom-font-display", display: "swap", style: \["normal","italic"\] \}\);/);
  assert.match(source, /const utility = DM_Mono\(\{ .*weight: \["400","500"\] \}\);/);
  assert.match(source, /export const bloomFontVariables = \[display\.variable, body\.variable, utility\.variable\]\.join\(" "\);/);
});

test("the overlay is idempotent and fully removable", () => {
  const base = "@import \"tailwindcss\";\n\n:root {\n  --background: oklch(1 0 0);\n}\n";
  const block = directionCss(direction, null);
  const once = withDirectionCss(base, block);
  assert.equal(withDirectionCss(once, block), once);
  assert.equal(once.match(/bloom:direction:start/g)?.length, 1);
  assert.ok(once.indexOf("oklch(1 0 0)") < once.indexOf("bloom:direction:start"), "the direction must come after shadcn's tokens to win");
  assert.equal(withDirectionCss(once, null), base);

  const wired = withDirectionLayout(SHADCN_LAYOUT, "dark");
  assert.ok(wired);
  assert.match(wired, /import "\.\/globals\.css"\nimport \{ bloomFontVariables \} from "\.\/bloom-fonts"/);
  assert.match(wired, /className=\{cn\(bloomFontVariables, "antialiased"/);
  assert.match(wired, /<ThemeProvider forcedTheme="dark">/);
  assert.equal(withDirectionLayout(wired, "dark"), wired);
  assert.match(withDirectionLayout(wired, "light")!, /forcedTheme="light"/);
  assert.equal(withDirectionLayout(wired, null), SHADCN_LAYOUT);
  assert.equal(withDirectionLayout("export default function Layout() { return null }", "dark"), null);
});

test("named colors outlive the overlay so existing page classes keep resolving", () => {
  const named = namedColorsCss(direction);
  assert.ok(named);
  assert.match(named, /--signal: #FF5A36;/);
  assert.match(named, /--signal-foreground: #10231C;/);
  assert.match(named, /--color-signal: var\(--signal\);/);
  // Only the named colors: the preset's own semantic tokens, fonts and radius must win.
  assert.doesNotMatch(named, /--(?:background|primary|radius|font-)/);
  const css = withDirectionCss(withDirectionCss(":root {}\n", directionCss(direction, null)), named);
  assert.equal(css.match(/bloom:direction:start/g)?.length, 1);
  assert.doesNotMatch(css, /--primary: #E8B04A/);
  assert.equal(namedColorsCss({ color: { ...direction.color, extra: [] } }), null);
});

test("the page's effective tokens come from the direction while its overlay is on", () => {
  const preset: ResolvedPreset = {
    input: { style: "nova", baseColor: "neutral", theme: "neutral", chartColor: "neutral", font: "inter", fontHeading: "inherit", iconLibrary: "lucide", radius: "default", mode: "light", menuAccent: "subtle", menuColor: "default" },
    resolved: {
      code: "b0",
      vars: { background: "#FFFFFF", foreground: "#0A0A0A", primary: "#171717", "primary-foreground": "#FAFAFA", muted: "#F5F5F5", "muted-foreground": "#737373", border: "#E5E5E5", accent: "#F5F5F5", "accent-foreground": "#171717" },
      darkVars: { background: "#0A0A0A", foreground: "#FAFAFA" },
      radiusPx: 10,
      chart: ["#111111", "#222222", "#333333", "#444444", "#555555"],
      iconPackage: "lucide-react",
    },
  };
  const effective = effectivePreset(preset, direction);
  assert.equal(effective.input.mode, "dark");
  assert.equal(effective.resolved.vars.background, "#10231C");
  assert.equal(effective.resolved.darkVars.background, "#10231C");
  assert.equal(effective.resolved.radiusPx, 2);
  assert.equal(effective.resolved.chart[0], "#E8B04A");
  assert.deepEqual(effectivePreset(effective, direction), effective);
  assert.equal(effectivePreset(preset, { ...direction, overlay: false }), preset);
  assert.equal(effectivePreset(preset, null), preset);
});

test("earlier directions are summarized so a new project can steer away from them", () => {
  const digest = directionDigest(direction);
  assert.match(digest, /^concept: A tide archive/);
  assert.match(digest, /type: Fraunces \/ Hanken Grotesk \/ DM Mono/);
  assert.match(digest, /color: dark; canvas #10231C, text #F2EDE3, primary #E8B04A, extra #FF5A36/);
  assert.ok(digest.length < 900);
});
