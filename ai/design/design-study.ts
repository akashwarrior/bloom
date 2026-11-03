import type { ModelMessage } from "ai";

import { generateProjectImage } from "@/ai/image-generation";
import { requestText } from "@/ai/request-text";
import type { ToolParams } from "@/ai/tools";
import { studyPrompt, type DesignDirection } from "@/ai/design/direction";
import { storeGeneratedImageAsset } from "@/ai/generated-assets.server";

/** Images attached to the user's latest message: artwork and branding the study has to respect. */
function suppliedArtwork(messages: ModelMessage[]) {
  const content = messages.findLast((message) => message.role === "user")?.content;
  if (!content || typeof content === "string") return [];
  return content.flatMap((part) => {
    if (part.type !== "file" || !part.mediaType.startsWith("image/")) return [];
    const data = part.data;
    return typeof data === "object" && "type" in data && data.type === "data" && data.data instanceof Uint8Array
      ? [data.data] : [];
  });
}

/**
 * Renders the first screen from the written direction, so the builder sees the
 * design the director decided instead of an image model's guess from the bare
 * request. Returns null when no image could be made; the direction stands alone.
 */
export async function renderDesignStudy(
  { projectId, signal, logger }: Pick<ToolParams, "projectId" | "signal" | "logger">,
  direction: DesignDirection,
  messages: ModelMessage[],
) {
  const text = studyPrompt(direction, requestText(messages));
  const images = suppliedArtwork(messages);
  try {
    const { image } = await generateProjectImage({
      prompt: images.length ? { text: `${text}\nRespect the supplied branding, artwork and product appearance.`, images } : text,
      aspectRatio: "16:9",
      abortSignal: signal,
    }, 0, logger);
    const asset = await storeGeneratedImageAsset({
      projectId,
      filename: "design-study." + image.mediaType.split("/")[1],
      mediaType: image.mediaType,
      bytes: image.uint8Array,
    });
    return asset.url;
  } catch (error) {
    signal.throwIfAborted();
    await logger.write("design_study.failed", { error });
    return null;
  }
}
