import z from "zod/v4";

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
    "Short kebab-case filename stem that matches the asset:<name> placeholder, such as hero-orbit or pricing-texture. Unique within the batch.",
  );

const assetInputSchema = z.strictObject({
  name: assetNameSchema,
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
    "Request a transparent background when the asset should be layered over the page. Prefer placement_surface for objects sitting on a solid section or card color.",
  ),
  placement_surface: z
    .string()
    .trim()
    .max(20)
    .nullable()
    .default(null)
    .describe(
      "Design token the image will sit on: background, card, muted, primary, accent, or chart-3. The image is generated on a plain background of that color so it blends into the section or card.",
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
      "Every asset to generate in this call. One call produces one UI group, so batch all ready assets, up to ten.",
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
