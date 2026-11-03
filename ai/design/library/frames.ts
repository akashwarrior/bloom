/** Categories describe visible composition. IDs correspond to reviewed library images. */
export const referenceCategories = [
  "image-led-editorial", "display-typography", "product-demonstration",
  "data-workspace", "focused-form", "none",
] as const;

export const referenceFrames: Record<typeof referenceCategories[number], readonly string[]> = {
  "image-led-editorial": ["035", "060"],
  "display-typography": ["112", "115"],
  "product-demonstration": ["007", "004"],
  "data-workspace": ["063", "109"],
  "focused-form": ["006", "104"],
  none: [],
};
