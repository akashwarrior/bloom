import z from "zod/v4";

import { directionCssVars, type DesignDirection, type DirectionFont } from "./direction.ts";
import type { ResolvedPreset } from "./shadcn-theme.ts";
import {
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

/** Stable design evidence stored in `.bloom/design.json`; regenerated into DESIGN.md. */
export const designNotesSchema = z.object({
  inspiration: z.array(inspirationNoteSchema).max(24).default([]),
});

export type DesignNotes = z.infer<typeof designNotesSchema>;

type DesignDocOptions = {
  notes?: DesignNotes;
  direction?: DesignDirection | null;
};

/**
 * The preset as the page actually renders it: a direction with its overlay
 * replaces the preset's colors, chart palette, radius and mode.
 */
export function effectivePreset(theme: ResolvedPreset, direction?: DesignDirection | null): ResolvedPreset {
  if (!direction?.overlay) return theme;
  const vars = directionCssVars(direction);
  const dark = direction.color.mode === "dark";
  return {
    input: { ...theme.input, mode: direction.color.mode },
    resolved: {
      ...theme.resolved,
      vars: { ...theme.resolved.vars, ...vars },
      darkVars: dark ? { ...theme.resolved.darkVars, ...vars } : theme.resolved.darkVars,
      chart: theme.resolved.chart.map((value, index) => vars[`chart-${index + 1}`] ?? value),
      radiusPx: direction.shape.radiusPx === undefined ? theme.resolved.radiusPx : Math.round(direction.shape.radiusPx),
    },
  };
}

/** Inverted menus render on shadcn's dark tokens, so their accent comes from the dark side. */
function menuAccentColors(theme: ResolvedPreset) {
  const inverted = theme.input.menuColor === "inverted" || theme.input.menuColor === "inverted-translucent";
  const vars = inverted ? theme.resolved.darkVars : theme.resolved.vars;
  const accent = vars.accent;
  const foreground = vars["accent-foreground"];
  return accent && foreground ? { accent, foreground, surface: inverted ? "inverted dark" : "page" } : null;
}

function colorRows(theme: ResolvedPreset, direction: DesignDirection | null) {
  const vars = theme.resolved.vars;
  const menu = menuAccentColors(theme);
  const rows = [
    `| Page canvas and default text | \`bg-background text-foreground\` | ${vars.background} / ${vars.foreground} |`,
    `| Raised or grouped surface | \`bg-card text-card-foreground\` | ${vars.card ?? vars.muted} / ${vars["card-foreground"] ?? vars.foreground} |`,
    `| Main action and strongest emphasis | \`bg-primary text-primary-foreground\` | ${vars.primary} / ${vars["primary-foreground"]} |`,
    `| Secondary action | \`bg-secondary text-secondary-foreground\` | ${vars.secondary ?? vars.muted} / ${vars["secondary-foreground"] ?? vars.foreground} |`,
    `| Quiet surface and secondary text | \`bg-muted text-muted-foreground\` | ${vars.muted} / ${vars["muted-foreground"]} |`,
    ...(menu ? [`| Hover and selected state in menus and ghost controls (${menu.surface} surface) | \`bg-accent text-accent-foreground\` | ${menu.accent} / ${menu.foreground} |`] : []),
    `| Hairlines and input outlines | \`border-border\` | ${vars.border} |`,
    `| Focus ring | \`ring-ring\` | ${vars.ring ?? vars.primary} |`,
    `| Data visualization only | \`chart-1\` … \`chart-5\` | ${theme.resolved.chart.join(" / ")} |`,
  ];
  // Named colors stay defined even after a preset replaces the direction's semantic tokens.
  for (const color of direction?.color.extra ?? []) {
    rows.push(`| ${color.use.replace(/\|/g, "/")} | \`bg-${color.name} text-${color.name}-foreground\`, \`text-${color.name}\`, \`border-${color.name}\` | ${color.value.toUpperCase()} / ${color.on.toUpperCase()} |`);
  }
  return rows.join("\n");
}

function fontLine(label: string, utility: string, font: DirectionFont) {
  const weights = font.weights && font.weights.length > 0 ? `, weights ${font.weights.join("/")}` : "";
  return `- ${label}: \`${utility}\` — ${font.family}${weights}${font.italic ? ", with italics" : ""}.`;
}

function typeSection(theme: ResolvedPreset, direction: DesignDirection | null) {
  if (direction?.overlay) {
    const { display, body, utility } = direction.typography;
    return [
      fontLine("Display", "font-heading", display),
      fontLine("Body", "font-sans", body),
      utility ? fontLine("Utility", "font-mono", utility) : "- Utility: `font-mono` is the component default; use it only where the direction calls for it.",
      "",
      direction.typography.treatment,
    ].join("\n");
  }
  const body = optionLabel(FONT_OPTIONS, theme.input.font);
  const heading = theme.input.fontHeading === "inherit"
    ? `\`font-sans\` — ${body} (headings share the body face)`
    : `\`font-heading\` — ${optionLabel(FONT_OPTIONS, theme.input.fontHeading)}`;
  return [
    `- Display: ${heading}.`,
    `- Body: \`font-sans\` — ${body}.`,
    "- Utility: `font-mono` for labels, data or code where it helps.",
    ...(direction ? ["", "The fonts were changed in the theme panel after this direction was written. Keep the direction's intent for scale, weight and spacing, applied to the faces above.", "", direction.typography.treatment] : []),
  ].join("\n");
}

function inspirationSection(notes: DesignNotes, direction: DesignDirection | null) {
  const byNumber = new Map(notes.inspiration.map((frame) => [frame.number, frame]));
  const chosen = (direction?.references ?? []).flatMap((reference) => {
    const frame = byNumber.get(reference.frame);
    return frame ? [`- Frame ${frame.number} (${frame.assetUrl}): ${reference.borrow}`] : [];
  });
  if (chosen.length > 0) {
    return [
      "The director studied sampled work from other products and kept these principles. They are principles, not layouts: never reuse a frame's words, names, logos, numbers or arrangement.",
      ...chosen,
    ].join("\n");
  }
  if (notes.inspiration.length === 0) return "No library frames were sampled; the direction comes from the request and its attachments.";
  return `The director looked at ${notes.inspiration.length} sampled frames from other products before writing this direction. Nothing in them may be reused: no words, names, logos, numbers or arrangement.`;
}

function directionSections(direction: DesignDirection) {
  return `## The idea

${direction.concept}

**Signature.** ${direction.signature}

## Composition

${direction.composition}

**Narrow screens.** ${direction.mobile}

## Imagery

${direction.imagery}

## Motion

${direction.motion}

## Voice

${direction.voice}

## What this design refuses

${direction.avoid.map((item) => `- ${item}`).join("\n")}
`;
}

/**
 * The design contract stored as DESIGN.md: the direction written for this
 * project, the tokens and fonts it resolved to, and how to build with them.
 * It is regenerated whenever the design changes, so it cannot drift from the
 * CSS the page actually uses.
 */
export function generateDesignDoc(
  theme: ResolvedPreset,
  { notes = designNotesSchema.parse({}), direction = null }: DesignDocOptions = {},
) {
  const effective = effectivePreset(theme, direction);
  const icon = ICON_OPTIONS[effective.input.iconLibrary];
  const customized = Boolean(direction?.overlay);

  return `# Design direction

This is the design contract for this project. Read it before changing any UI. ${direction
    ? "It was written for this project by the design director; build what it describes, not a generic page dressed in its colors."
    : "It lists the tokens, fonts and component rules the project uses."} **Do not hand-edit this file, \`app/globals.css\`, \`app/layout.tsx\`, \`app/bloom-fonts.ts\`, \`components/ui\` or \`.bloom/design.json\`**; Bloom regenerates them. To change the look, start a redesign or use the theme panel.

${direction ? directionSections(direction) : ""}
## Color

${direction ? `${direction.color.strategy}${customized ? "" : "\n\nThe semantic colors were changed in the theme panel after this direction was written; the table below is what the page uses now. The direction's named colors are unchanged."}\n\n` : ""}Every color in the page is one of these tokens, with opacity modifiers where needed (\`bg-primary/10\`). In CSS they are \`var(--background)\`, \`var(--primary)\` and so on. The page is designed for ${effective.input.mode} mode.

| Role | Classes | Value (surface / text) |
| --- | --- | --- |
${colorRows(effective, direction)}

## Type

${typeSection(effective, direction)}

## Shape and surface

- Base radius: ${effective.resolved.radiusPx}px (\`rounded-lg\`; \`rounded-sm\`/\`md\`/\`xl\`/\`2xl\` scale from it). Use another radius only where the direction asks for one.
${direction ? `\n${direction.shape.treatment}\n` : ""}
## Inspiration

${inspirationSection(notes, direction)}

## Components

- Component style: ${optionLabel(STYLE_OPTIONS, effective.input.style)} — ${STYLE_OPTIONS[effective.input.style].description.toLowerCase()}.
- Icons: ${icon.label}. Package: \`${icon.package}\`. Import: \`${icon.import}\`. Usage: \`${icon.usage}\`. Use only this package.
- Menus: ${effective.input.menuAccent} accent on the ${effective.input.menuColor} surface.

${SHADCN_COMPONENT_RULES}

- States: every interactive element has visible hover, focus-visible, disabled and, where relevant, loading, empty and error states. Errors use \`FieldError\` with \`aria-invalid\`; empty areas use \`Empty\`; loading composes \`Spinner\` with \`disabled\`.
- Motion respects \`prefers-reduced-motion\` and never shifts layout while the page loads.
- Effects Tailwind cannot express (keyframes, masks, textures) go in a small CSS file imported by the page, using \`var(--token)\` for every color.

## Before you call it done

Look at the rendered page, not the code, and answer honestly:

- Does the first viewport show the idea above, or could it belong to any product in this category?
- Is the signature actually on the page, built with care, and the most memorable thing there?
- Does the type follow the described scale and spacing, with a clear order of what to read first, second and third?
- Does color follow the stated distribution, with the strongest color kept as rare as the strategy says?
- Do regions differ in scale, density and structure the way the composition describes, or did they collapse into repeated equal blocks?
- Is every edge aligned to something, every gap deliberate, and every image cropped on purpose?
- On a narrow screen, was the composition rethought as described, with nothing clipped or overflowing?
- Is every color a token, every control a \`components/ui\` primitive with working states, and every word original to this page?
`;
}
