import type { AssetInput } from "./tools/generate-asset-input.ts";

export function generationPrompt(
  input: AssetInput,
  surfaceColor: string | null,
  useConceptContext = false,
  artDirection: string | null = null,
) {
  const background = input.transparent
    ? "Isolate the subject on a transparent background for layering. If alpha is unavailable, use a plain uniform background. Never paint a checkerboard to represent transparency."
    : surfaceColor
      ? `Use a flat background matching the placement surface, ${surfaceColor}.`
      : "Follow the requested background treatment.";
  return [
    "Create one original production-ready website asset.",
    `Aspect ratio: ${input.aspect_ratio}. Follow the requested framing, subject position, lighting and negative space.`,
    background,
    artDirection && `Art direction for every image in this project: ${artDirection}`,
    input.prompt,
    useConceptContext
      ? "The reference shows the interface this asset belongs to. If the requested subject is pictured there, preserve its appearance and framing. For a new subject, use only the visual direction. Return the standalone artwork with any obscured areas filled in. Omit interface lettering, stickers, page layout and controls."
      : input.reference_url && input.reference_url !== "none" && "Preserve the referenced subject and any supplied branding. Render only the requested asset. Omit surrounding interface text and controls.",
  ].filter(Boolean).join("\n");
}
