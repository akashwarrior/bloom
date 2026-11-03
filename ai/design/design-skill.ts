import { z } from "zod";

import { fontLoading, fontThemeLines, type DesignDirection, type DirectionFont, type ResolvedFonts } from "./direction.ts";
import { DEFAULT_CONTROL_HEIGHT_PX } from "./ui-sdk-theme.ts";

const inspirationNoteSchema = z.strictObject({
  number: z.number().int().positive(),
  imageId: z.string().min(1).max(200),
  assetUrl: z.string().min(1).max(1_000),
  batch: z.number().int().positive(),
});

/** Stable design evidence stored in `.bloom/design.json`; regenerated into DESIGN.md. */
export const designNotesSchema = z.object({
  conceptUrl: z.string().startsWith("/api/assets/").optional(),
  inspiration: z.array(inspirationNoteSchema).max(24).default([]),
});

export type DesignNotes = z.infer<typeof designNotesSchema>;

function colorRows(direction: DesignDirection) {
  const { canvas, ink, palette } = direction.color;
  return [
    `| \`canvas\` | ${canvas.toUpperCase()} | ${ink.toUpperCase()} | The page background. |`,
    `| \`ink\` | ${ink.toUpperCase()} | ${canvas.toUpperCase()} | Default text on the canvas. |`,
    ...palette.map((color) => `| \`${color.name}\` | ${color.value.toUpperCase()} | ${color.on.toUpperCase()} | ${color.use.replace(/\|/g, "/")} |`),
  ].join("\n");
}

function fontLine(label: string, font: DirectionFont) {
  const weights = font.weights && font.weights.length > 0 ? `, weights ${font.weights.join("/")}` : "";
  return `- ${label}: ${font.family}${weights}${font.italic ? ", with italics" : ""}.`;
}

function inspirationSection(notes: DesignNotes, direction: DesignDirection) {
  if (notes.inspiration.length === 0) return "No saved reference images.";
  const borrow = new Map(direction.references.map((reference) => [reference.frame, reference.borrow]));
  return [
    "References from other products. Take the stated principle only: never reuse a frame's words, names, logos, numbers or arrangement.",
    ...notes.inspiration.map((frame) =>
      `- Frame ${frame.number}: image \`${frame.imageId}\` — ${frame.assetUrl}${borrow.has(frame.number) ? ` — ${borrow.get(frame.number)}` : ""}`
    ),
  ].join("\n");
}

/**
 * The design contract stored as DESIGN.md: the direction written for this
 * project, as decisions. Bloom writes no stylesheet, tokens or layout from it;
 * the builder turns these decisions into the project's own theme.
 */
export function generateDesignDoc(direction: DesignDirection, fonts: ResolvedFonts, notes: DesignNotes = designNotesSchema.parse({})) {
  const { display, body, utility } = direction.typography;
  const radius = direction.shape.radiusPx;
  const controlHeight = direction.shape.controlHeightPx ?? DEFAULT_CONTROL_HEIGHT_PX;

  return `# Design direction

The design contract for this project, written for it by the design director. Build what it describes, not a familiar page in its colors. Bloom writes this file and \`.bloom/design.json\`; a different look needs a redesign, not a hand edit. Everything else, including \`app/globals.css\` and \`app/layout.tsx\`, is yours to write from it.

## The idea

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

## Color

${direction.color.strategy}

The page is designed for ${direction.color.mode} mode. These are all of its colors; each text color has been checked against its surface.

| Name | Color | Text on it | Where it is used |
| --- | --- | --- | --- |
${colorRows(direction)}

## Type

${fontLine("Display", display)}
${fontLine("Body", body)}
${utility ? fontLine("Utility", utility) : "- Utility: none."}

${direction.typography.treatment}

The families, weights and subsets below are checked against Google Fonts. Load them this way in \`app/layout.tsx\`:

\`\`\`tsx
${fontLoading(fonts).trim()}
\`\`\`

In \`@theme inline\` these lines make them \`font-display\`, \`font-body\`${utility ? " and \`font-utility\`" : ""}: ${fontThemeLines(fonts).map((line) => `\`${line}\``).join(" ")}

## Shape and controls

- Corners: ${radius === undefined ? "no single radius; follow the treatment below" : `${Math.round(radius)}px on a standard control and card`}.
- Controls: a standard button, field and select is ${controlHeight}px tall.

${direction.shape.treatment}

${notes.conceptUrl ? `## Visual study\n\n${notes.conceptUrl}\n\nA rendering of the first screen. Where it differs from the direction above, the direction decides. Use its asset URL for matching artwork.\n` : ""}
## Inspiration

${inspirationSection(notes, direction)}
`;
}
