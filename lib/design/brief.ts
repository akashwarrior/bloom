import z from "zod/v4";

import { BLOCK_KIND_NAMES } from "./blocks-catalog.ts";
import { DIRECTION_IDS } from "./directions.ts";
import { shadcnThemeSchema } from "./shadcn-theme.ts";

const hexColor = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "Use a 6-digit hex color such as #1A2B3C.");

const fontChoice = z.strictObject({
  family: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .describe(
      "A family from the Bloom font catalog. For an exact clone only, a captured reference family name is also accepted.",
    ),
  weight: z.number().int().min(100).max(1000),
});

const sectionFields = {
  id: z.string().trim().regex(/^[a-z][a-z0-9-]{1,40}$/, "Use a kebab-case id such as hero or feature-grid."),
  purpose: z.string().trim().min(5).max(200),
  block: z
    .enum(BLOCK_KIND_NAMES as [string, ...string[]])
    .describe("Use custom for a bespoke composition, or an optional section block when its geometry fits the plan. No limit on custom sections."),
  variant: z
    .string()
    .trim()
    .max(30)
    .nullable()
    .describe("The block variant, e.g. centered for hero or tall for feature-cards; null for blocks without variants."),
  surface: z.number().int().min(1).max(8).describe("1-based index into colors.surfaces."),
  composition: z
    .string()
    .trim()
    .min(10)
    .max(400)
    .describe("Concrete layout: grid, alignment, media placement, scale."),
  media: z.string().trim().max(200).nullable(),
};

export const designBriefSchema = z.strictObject({
  anchor: z.strictObject({
    url: z
      .string()
      .trim()
      .max(500)
      .nullable()
      .describe("Primary captured source of design evidence. Original sites transfer selected principles, not its entire design. Null only when no reference was captured."),
    keep: z
      .string()
      .trim()
      .min(10)
      .max(600)
      .describe("Specific visual principles adopted and how they are transformed. Only a clone or named-reference build preserves the whole design language."),
  }),
  traits: z
    .array(
      z.strictObject({
        url: z.string().trim().max(500),
        trait: z.string().trim().min(5).max(300),
      }),
    )
    .max(3)
    .describe("One named supporting trait from each other scraped reference."),
  brand: z.strictObject({
    name: z.string().trim().min(2).max(40),
    tagline: z.string().trim().min(4).max(140),
    voice: z.string().trim().min(4).max(200).describe("Copy voice in a few words, e.g. calm, precise, plainspoken."),
  }),
  theme: z.enum(["light", "dark", "mixed"]).describe(
    "light or dark for single-surface pages; mixed for color-blocked pages whose sections alternate light and dark surfaces.",
  ),
  colors: z.strictObject({
    background: hexColor,
    foreground: hexColor,
    primary: hexColor.describe("Main action color (primary buttons, key highlights)."),
    primaryForeground: hexColor,
    accent: hexColor.describe("Secondary highlight used sparingly."),
    accentForeground: hexColor,
    muted: hexColor.describe("Subtle panel/fill color on the page background."),
    mutedForeground: hexColor.describe("Secondary text on the page background."),
    border: hexColor,
    surfaces: z
      .array(
        z.strictObject({
          name: z.string().trim().min(2).max(40).describe("Role of this surface, e.g. hero, product, proof, cta."),
          background: hexColor,
          foreground: hexColor,
        }),
      )
      .min(1)
      .max(8)
      .describe("Surfaces used by this concept. Original designs choose their own rhythm; a clone preserves the target's. surface-1 is the first."),
  }),
  typography: z.strictObject({
    display: fontChoice.extend({
      sizePx: z.number().int().min(32).max(240).describe("Desktop hero headline size in px."),
      lineHeight: z.number().min(0.75).max(1.4),
      tracking: z.number().min(-0.1).max(0.2).describe("Letter spacing in em."),
      uppercase: z.boolean(),
    }),
    heading: z.strictObject({
      sizePx: z.number().int().min(20).max(120).describe("Desktop section title size in px."),
      weight: z.number().int().min(100).max(1000),
    }),
    body: fontChoice.extend({
      sizePx: z.number().int().min(14).max(22),
    }),
    mono: z
      .strictObject({ family: z.string().trim().min(2).max(80) })
      .nullable()
      .describe("Optional utility face for labels or data."),
  }),
  shape: z.strictObject({
    cardRadiusPx: z.number().int().min(0).max(64),
    buttonShape: z.enum(["pill", "rounded", "square"]),
    shadows: z.enum(["none", "subtle", "soft"]),
    borders: z.boolean(),
  }),
  layout: z.strictObject({
    contentWidthPx: z.number().int().min(960).max(1920),
    sectionPaddingPx: z.number().int().min(48).max(240).describe("Desktop vertical padding of a typical section."),
  }),
  signature: z
    .string()
    .trim()
    .min(10)
    .max(300)
    .describe("The memorable visual idea from the study, expressed as buildable geometry rather than a style adjective."),
  imagery: z
    .string()
    .trim()
    .min(10)
    .max(400)
    .describe("Style for generated media: subject matter, rendering style, palette, background treatment."),
  sections: z
    .array(
      z.strictObject({
        ...sectionFields,
        anchorFrame: z
          .number()
          .int()
          .min(1)
          .max(40)
          .nullable()
          .describe("Frame number in the anchor's frame list that this section adapts; null if not adapted from a frame."),
      }),
    )
    .min(3)
    .max(14),
});

export type DesignBrief = z.infer<typeof designBriefSchema>;

export const SURFACE_ROLES = ["background", "muted", "primary", "inverse", "chart"] as const;

/**
 * Brief for an original site: the palette, fonts and radius are shadcn create
 * inputs; Bloom resolves them and fills the colors and shape of the full brief.
 */
export const themedBriefSchema = designBriefSchema.omit({ theme: true, colors: true, shape: true, typography: true }).extend({
  shadcn: shadcnThemeSchema,
  surfaces: z
    .array(
      z.strictObject({
        name: z.string().trim().min(2).max(40).describe("Role of this surface, e.g. hero, product, proof, close."),
        role: z.enum(SURFACE_ROLES).describe("background: page color. muted: subtle panel tone. primary: the theme color with its foreground. inverse: foreground as background. chart: a chart-color field."),
      }),
    )
    .min(1)
    .max(6)
    .describe("Section surfaces; sections point at them by 1-based index."),
  typography: z.strictObject({
    display: z.strictObject({
      weight: z.number().int().min(100).max(1000),
      sizePx: z.number().int().min(32).max(240).describe("Desktop hero headline size in px."),
      lineHeight: z.number().min(0.75).max(1.4),
      tracking: z.number().min(-0.1).max(0.2).describe("Letter spacing in em."),
      uppercase: z.boolean(),
    }),
    heading: z.strictObject({
      sizePx: z.number().int().min(20).max(120).describe("Desktop section title size in px."),
      weight: z.number().int().min(100).max(1000),
    }),
    body: z.strictObject({
      weight: z.number().int().min(100).max(1000),
      sizePx: z.number().int().min(14).max(22),
    }),
  }),
});

export type ThemedBrief = z.infer<typeof themedBriefSchema>;

/**
 * Brief for an original design without a reference: the model picks one
 * curated art direction and decides only what is specific to the brand;
 * Bloom expands the direction into the full palette, type scale, and shape.
 */
export const originalBriefSchema = z.strictObject({
  direction: z.enum(DIRECTION_IDS).describe("The curated art direction that best fits the product and audience."),
  rationale: z.string().trim().min(10).max(300).describe("One sentence: why this direction fits this product and audience."),
  brand: z.strictObject({
    name: z.string().trim().min(2).max(40),
    tagline: z.string().trim().min(4).max(140),
    voice: z.string().trim().min(4).max(200).describe("Copy voice in a few words, e.g. blunt, confident, warm."),
  }),
  accent: hexColor.describe("The one brand accent color, chosen per the direction's accent guidance."),
  displayFont: z.string().trim().min(2).max(80).describe("One of the direction's display fonts."),
  bodyFont: z.string().trim().min(2).max(80).describe("One of the direction's body fonts."),
  signature: z
    .string()
    .trim()
    .min(10)
    .max(300)
    .describe("The one memorable element this page will be remembered by, using the direction's devices."),
  imagery: z
    .string()
    .trim()
    .min(10)
    .max(400)
    .describe("One art direction for every generated image: subject family, material, lighting, background, palette, following the direction's imagery recipe."),
  sections: z.array(z.strictObject(sectionFields)).min(5).max(8),
});

export type OriginalBrief = z.infer<typeof originalBriefSchema>;

const IMAGE_MEDIA = /\b(?:photos?|photograph(?:y|s)?|illustrations?|illustrated|renders?|3d|objects?|still life|lifestyle|textures?|packshots?|product shots?|portraits?|flat ?lay|close-?up|macro|scenery|landscape|art(?:work)?|abstract|sculptur(?:e|al)|ribbons?|collage|painting|generated image)\b/i;

/** Sections whose planned media is a photo, render, artwork or illustration rather than code-built UI. */
export function plannedImageSections(brief: Pick<DesignBrief, "sections">) {
  return brief.sections.filter((section) => section.media && IMAGE_MEDIA.test(section.media)).slice(0, 4);
}
