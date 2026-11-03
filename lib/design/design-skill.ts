import z from "zod/v4";

import type { ResolvedPreset } from "./shadcn-theme.ts";
import {
  describePreset,
  FONT_OPTIONS,
  ICON_OPTIONS,
  optionLabel,
  SHADCN_COMPONENT_RULES,
  STYLE_OPTIONS,
} from "./theme-options.ts";

const inspirationNoteSchema = z.strictObject({
  number: z.number().int().positive(),
  imageId: z.string().min(1).max(200),
  assetUrl: z.string().min(1).max(1_000),
  batch: z.number().int().positive(),
});

type InspirationNote = z.infer<typeof inspirationNoteSchema>;

/** Stable design evidence stored in `.bloom/design.json`; regenerated into DESIGN.md. */
export const designNotesSchema = z.object({
  inspiration: z.array(inspirationNoteSchema).max(24).default([]),
});

export type DesignNotes = z.infer<typeof designNotesSchema>;

type DesignDocOptions = {
  notes?: DesignNotes;
};

type RoleMapRow = {
  role: string;
  token: string;
  value: string;
  use: string;
};

/** Inverted menus render on shadcn's dark tokens, so their accent comes from the dark side. */
function menuAccentColors(theme: ResolvedPreset) {
  const inverted = theme.input.menuColor === "inverted" || theme.input.menuColor === "inverted-translucent";
  const vars = inverted ? theme.resolved.darkVars : theme.resolved.vars;
  const accent = vars.accent;
  const foreground = vars["accent-foreground"];
  return accent && foreground ? { accent, foreground, surface: inverted ? "inverted dark" : "page" } : null;
}

/**
 * The resolved role map is the bridge between the chosen preset and the page:
 * every semantic token, its actual hex value, and the class a component uses.
 */
function themedRoleMap(theme: ResolvedPreset): RoleMapRow[] {
  const { resolved } = theme;
  const vars = resolved.vars;
  const menu = menuAccentColors(theme);
  const rows: RoleMapRow[] = [
    { role: "Page canvas", token: "background / foreground", value: `${vars.background} / ${vars.foreground}`, use: "bg-background text-foreground" },
    { role: "Card or grouped panel", token: "card / card-foreground", value: `${vars.card ?? vars.muted} / ${vars["card-foreground"] ?? vars.foreground}`, use: "bg-card text-card-foreground" },
    { role: "Primary action", token: "primary / primary-foreground", value: `${vars.primary} / ${vars["primary-foreground"]}`, use: "bg-primary text-primary-foreground" },
    { role: "Quiet panel and secondary text", token: "muted / muted-foreground", value: `${vars.muted} / ${vars["muted-foreground"]}`, use: "bg-muted text-muted-foreground" },
    { role: "Hairline and inputs", token: "border / input", value: vars.border ?? "", use: "border-border" },
    { role: "Focus ring", token: "ring", value: vars.ring ?? vars.primary ?? "", use: "focus-visible:ring-ring/50" },
  ];
  if (menu) {
    rows.push({
      role: `Menu hover (${menu.surface} surface)`,
      token: "accent / accent-foreground",
      value: `${menu.accent} / ${menu.foreground}`,
      use: "bg-accent text-accent-foreground",
    });
  }
  resolved.chart.forEach((value, index) => {
    rows.push({
      role: `Chart ${index + 1}`,
      token: `chart-${index + 1}`,
      value,
      use: `bg-chart-${index + 1} text-foreground`,
    });
  });
  return rows;
}

function presetRows(theme: ResolvedPreset) {
  const { input, resolved } = theme;
  const icon = ICON_OPTIONS[input.iconLibrary];
  return [
    `- Style: ${optionLabel(STYLE_OPTIONS, input.style)} (${input.style}).`,
    `- Preset summary: ${describePreset(input)}.`,
    `- Preset fields: style=${input.style}; baseColor=${input.baseColor}; theme=${input.theme}; chartColor=${input.chartColor}; font=${input.font}; fontHeading=${input.fontHeading}; iconLibrary=${input.iconLibrary}; radius=${input.radius}; mode=${input.mode}; menuAccent=${input.menuAccent}; menuColor=${input.menuColor}.`,
    `- Base color: ${input.baseColor}; theme (primary): ${input.theme}; chart color: ${input.chartColor} (charts and chart-role panels).`,
    `- Fonts: ${input.font}${input.fontHeading === "inherit" ? " with headings inheriting the body face" : ` + ${input.fontHeading}`}; radius: ${input.radius} (${resolved.radiusPx}px); mode: ${input.mode}.`,
    `- Menus: ${input.menuAccent} accent; ${input.menuColor} surface.`,
    `- Icons: ${icon.label}. Package: \`${icon.package}\`. Import: \`${icon.import}\`. Usage: \`${icon.usage}\`. Use only this package; do not add another icon library.`,
    `- Resolved preset code: \`${resolved.code}\`.`,
    "- To change the look later, use the Bloom theme panel (it applies another shadcn create preset) or start a full redesign. Do not rewrite the tokens by hand.",
  ].join("\n");
}

function inspirationSection(notes: DesignNotes) {
  if (notes.inspiration.length === 0) {
    return "No design-library frames were sampled. The design evidence came from the request and attachments.";
  }
  const byBatch = new Map<number, InspirationNote[]>();
  for (const frame of notes.inspiration) {
    const batch = byBatch.get(frame.batch) ?? [];
    batch.push(frame);
    byBatch.set(frame.batch, batch);
  }
  return [
    "These are references, not templates. Study composition, type scale, spacing, color relationships, texture and media treatment; never copy a frame's words, names, logos, numbers or exact layout.",
    ...[...byBatch.entries()].map(([batch, frames]) => [
      `- Batch ${batch}:`,
      ...frames.map((frame) => `  - Frame ${frame.number}: image \`${frame.imageId}\` — ${frame.assetUrl}`),
    ].join("\n")),
  ].join("\n");
}

function themedColorRows(theme: ResolvedPreset) {
  const vars = theme.resolved.vars;
  const menu = menuAccentColors(theme);
  return [
    `| background / foreground | page canvas and default text | ${vars.background} / ${vars.foreground} |`,
    `| card / card-foreground | cards and grouped panels | ${vars.card ?? vars.muted} / ${vars["card-foreground"] ?? vars.foreground} |`,
    `| primary / primary-foreground | main actions and emphasis | ${vars.primary} / ${vars["primary-foreground"]} |`,
    `| muted / muted-foreground | quiet panels and secondary text | ${vars.muted} / ${vars["muted-foreground"]} |`,
    ...(menu ? [`| accent / accent-foreground | menu hover and selected items (${theme.input.menuAccent} accent on the ${menu.surface} surface) | ${menu.accent} / ${menu.foreground} |`] : []),
    `| border / input | hairlines and inputs | ${vars.border} |`,
    `| chart-1..5 | charts and chart-role panels only | ${theme.resolved.chart.join(" / ")} |`,
  ].join("\n");
}

/** Token cheat-sheet stored in DESIGN.md. */
function tokenUsageGuide(theme: ResolvedPreset) {
  const heading = theme.input.fontHeading === "inherit" ? "font-sans" : "font-heading";
  return [
    "Colors: bg-background text-foreground for the page; bg-card text-card-foreground for cards and grouped panels; bg-muted text-muted-foreground for quiet panels and secondary text; bg-primary text-primary-foreground for actions and emphasis; bg-accent text-accent-foreground for menu hover; text-chart-1 through text-chart-5 for charts; border-border for hairlines.",
    `Type: ${heading} for display and headings, font-sans for body, font-mono for labels or data. Use standard Tailwind type utilities.`,
    "Shape: use the preset radius through components/ui and standard rounded-sm/md/lg/xl utilities; do not invent one-off radii or shadows.",
    "Raw palette classes (bg-zinc-900, text-white, emerald-500) and arbitrary color values are rejected. Use the semantic token names above and standard Tailwind utilities.",
  ].join("\n");
}

/**
 * Human-readable design contract and skill stored as DESIGN.md. It contains
 * only the applied shadcn preset, its resolved tokens, component rules and the
 * inspiration references. It is regenerated whenever the preset changes, so
 * none of those details can drift from the actual tokens.
 */
export function generateDesignDoc(
  theme: ResolvedPreset,
  { notes = designNotesSchema.parse({}) }: DesignDocOptions = {},
) {
  const iconPackage = theme.resolved.iconPackage;
  const roleRows = themedRoleMap(theme)
    .map((row) => `| ${row.role} | \`${row.token}\` | ${row.value} | \`${row.use}\` |`)
    .join("\n");
  const bodyFont = optionLabel(FONT_OPTIONS, theme.input.font);
  const headingFont = theme.input.fontHeading === "inherit"
    ? `\`font-sans\` (${bodyFont}; headings inherit the body face)`
    : `\`font-heading\` (${optionLabel(FONT_OPTIONS, theme.input.fontHeading)})`;

  return `# Bloom design skill

This file is the visual contract for this project. It contains the applied shadcn preset, its resolved tokens and the inspiration references sampled for this design. Read it before changing UI. Every component uses the shadcn semantic tokens below; never use raw Tailwind palette classes (bg-zinc-900, text-white, emerald-500) or hex values in components. **Do not hand-edit this file, \`app/globals.css\`, \`components/ui\` or \`.bloom/design.json\`.** \`shadcn apply\` owns the tokens, fonts and components; change the preset from the Bloom theme panel, or start a full redesign.

## How to use this skill

1. Read the applied preset and role map before writing JSX.
2. Compose the page from the semantic tokens, standard Tailwind utilities and the component rules below. Use \`components/ui\` primitives; read a component before using its API.
3. Build the page the user requested. This file does not prescribe its composition, brand, copy or layout; those belong to the main agent.
4. Check every state (hover, focus, disabled, loading, empty, error) and the acceptance checklist before finishing.

## Applied preset

${presetRows(theme)}

## Inspiration

${inspirationSection(notes)}

## Resolved role map

| Role | Token | Resolved value | Use |
| --- | --- | --- | --- |
${roleRows}

## Color tokens

| Token | Use | Value |
| --- | --- | --- |
${themedColorRows(theme)}

## Typography

- Headings: ${headingFont}. Use standard Tailwind display sizes.
- Body: \`font-sans\` (${bodyFont}). Use standard Tailwind body sizes.
- Labels and data: \`font-mono\` when a utility face helps. Use standard Tailwind sizes.

## Shape

- Radius comes from the preset (${theme.resolved.radiusPx}px base). Use the component defaults and standard \`rounded-sm\`/\`rounded-md\`/\`rounded-lg\`/\`rounded-xl\`; no one-off radii.
- Buttons: use the \`components/ui\` Button variants and sizes; the preset owns radius, height and colors.
- Cards and panels: \`bg-card text-card-foreground\`, with \`border-border\` where separation is needed.

## Component library

Build the page in custom JSX using the semantic tokens and standard Tailwind utilities. \`components/ui\` is the only component library for this themed build; compose its primitives (Button, Card, Input, Field, Tabs, Dialog, ...) and read a component before using its API.

## Component and state rules

${SHADCN_COMPONENT_RULES}

- Hover and focus: keep the shadcn hover treatment and the visible \`focus-visible:ring-ring/50\` ring. Never remove focus styles.
- Disabled: use \`disabled:pointer-events-none disabled:opacity-50\`; do not hand-roll a dimmed fake button.
- Loading: compose \`Spinner\` with \`disabled\`; do not invent an \`isPending\` prop.
- Empty: use \`Empty\`/\`EmptyHeader\`/\`EmptyTitle\` instead of a bare "No data" paragraph.
- Errors: use \`FieldError\` and \`aria-invalid\` with an inline message; never rely on color alone.
- Motion: keep it purposeful and respect \`prefers-reduced-motion\`; do not animate layout-shifting properties on load.
- Copy: original for the page. Never reuse a reference frame's words, names, labels, numbers or logos.

## Acceptance checklist

- [ ] Every color comes from a shadcn semantic token; no raw palette classes or hex values.
- [ ] Component colors, typography, radius and states come from \`components/ui\` variants, not \`className\` overrides.
- [ ] The page uses \`${iconPackage}\` and the project's Button/Input/Card primitives.
- [ ] Dialog, Sheet and Drawer titles exist; Select/Dropdown/Command items sit inside their groups.
- [ ] Loading, empty, error and disabled states use the shadcn primitives.
- [ ] No reference frame's words, names, labels, numbers or logos were reused.
- [ ] The latest \`applyChanges\` typecheck passed.

## Usage cheat-sheet

${tokenUsageGuide(theme)}
`;
}
