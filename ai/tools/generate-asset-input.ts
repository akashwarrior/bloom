import { z } from "zod";

export const MAX_ASSETS_PER_CALL = 10;

const assetNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(61)
  .regex(
    /^[a-z0-9][a-z0-9-]*$/,
    "Use a kebab-case name such as hero-orbit.",
  )
  .describe(
    "Short kebab-case filename stem, such as hero-orbit or pricing-texture. Unique within the batch.",
  );

const coordinate = z.number().int().min(0).max(1000);

const assetInputSchema = z.strictObject({
  name: assetNameSchema,
  crop: z.strictObject({ left: coordinate, top: coordinate, right: coordinate, bottom: coordinate }).nullable().default(null).describe("To extract existing artwork, give its bounding box on the reference image (0–1000 coordinates). Include only the photo or illustration, excluding surrounding text and controls. Use null to generate new art."),
  reference_url: z.union([z.string().startsWith("/api/assets/").max(180), z.literal("none")]).nullable().default(null)
    .describe("A project image URL preserves that subject. With null, new artwork uses this run’s design study as visual context if available. Choose none to generate independently. A crop defaults to the current or saved design study."),
  aspect_ratio: z.enum([
    "1:1",
    "2:3",
    "3:2",
    "3:4",
    "4:3",
    "4:5",
    "5:4",
    "9:16",
    "16:9",
    "21:9",
  ]).default("1:1").describe(
    "Required output aspect ratio. The model chooses the actual pixel dimensions.",
  ),
  transparent: z.boolean().default(false).describe(
    "Request a transparent background when the asset should be layered over the page.",
  ),
  placement_surface: z
    .string()
    .trim()
    .max(40)
    .nullable()
    .default(null)
    .describe(
      "Name of the color in DESIGN.md the image will sit on, such as canvas or one of the palette names. The image is generated on a plain background of that color so it blends into the section or card. Leave null for photographs and full-bleed scenes.",
    ),
  prompt: z.string().trim().min(1).max(4_000).describe(
    "Subject, composition, crop, camera, lighting, materials, and the asset's visible role on the page.",
  ),
});

export const generateAssetInputSchema = z.strictObject({
  assets: z
    .array(assetInputSchema)
    .min(1)
    .max(MAX_ASSETS_PER_CALL)
    .describe(
      "Artwork needed for the requested design. Batch independent images together.",
    ),
});

export type AssetInput = z.infer<typeof assetInputSchema>;
type GenerateAssetInput = z.infer<typeof generateAssetInputSchema>;

/** Returns a human-readable reason when the batch is invalid. */
export function validateGenerateAssetInput(input: GenerateAssetInput) {
  const names = new Set<string>();
  for (const asset of input.assets) {
    if (names.has(asset.name)) {
      return `Asset names must be unique within a batch; "${asset.name}" appears more than once.`;
    }
    names.add(asset.name);
  }

  return null;
}
