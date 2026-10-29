export type AssetAspect = "1:1" | "3:4" | "4:3" | "4:5" | "5:4" | "16:9";

export type AssetSlot = {
  name: string;
  path: string;
  aspect: AssetAspect;
  /** The source line holding the placeholder, so the agent knows what the image is for. */
  context: string;
};

const PLACEHOLDER = /asset:([a-z0-9][a-z0-9-]{0,60})/g;

export function placeholderFor(name: string) {
  return `asset:${name}`;
}

function variantAfter(content: string, from: number, index: number) {
  return /variant=\{?["']([\w-]+)["']/.exec(content.slice(from, index + 1_500))?.[1] ?? null;
}

/** Aspect ratio of the frame a placeholder sits in, read from the block that renders it. */
export function inferSlotAspect(content: string, index: number): AssetAspect {
  const before = content.slice(0, index);
  const tag = [...before.matchAll(/<(Hero|FeatureSplit|FeatureCards|Bento|Cta|Photo)\b/g)].at(-1);
  if (!tag || tag.index === undefined) return "4:3";
  const variant = variantAfter(content, tag.index, index);
  switch (tag[1]) {
    case "Hero":
      return variant === "split" ? "4:5" : "16:9";
    case "FeatureSplit":
      return "5:4";
    case "FeatureCards":
      return variant === "tall" ? "3:4" : "4:3";
    case "Bento": {
      const objectStart = content.lastIndexOf("{", index);
      const objectEnd = content.indexOf("}", index);
      const size = /size:\s*["'](\w+)["']/.exec(content.slice(objectStart, objectEnd === -1 ? undefined : objectEnd))?.[1];
      return size === "sm" || size === "tall" ? "1:1" : "16:9";
    }
    case "Cta":
      return "16:9";
    default:
      return "4:3";
  }
}

/** Image placeholders ("asset:<name>") written into a source file, waiting for generated images. */
export function findAssetSlots(path: string, content: string): AssetSlot[] {
  const slots = new Map<string, AssetSlot>();
  for (const match of content.matchAll(PLACEHOLDER)) {
    const name = match[1]!;
    if (slots.has(name) || match.index === undefined) continue;
    const lineStart = content.lastIndexOf("\n", match.index) + 1;
    const lineEnd = content.indexOf("\n", match.index);
    slots.set(name, {
      name,
      path,
      aspect: inferSlotAspect(content, match.index),
      context: content.slice(lineStart, lineEnd === -1 ? undefined : lineEnd).trim().slice(0, 200),
    });
  }
  return [...slots.values()];
}

export function replacePlaceholder(content: string, name: string, localPath: string) {
  return content.replace(new RegExp(`asset:${name}(?![a-z0-9-])`, "g"), localPath);
}
