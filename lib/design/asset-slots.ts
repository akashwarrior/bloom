type AssetAspect = "1:1" | "3:4" | "4:3" | "4:5" | "5:4" | "16:9";

export type AssetSlot = {
  name: string;
  path: string;
  aspect: AssetAspect;
};

const PLACEHOLDER = /asset:([a-z0-9][a-z0-9-]{0,60})/g;

const ASPECTS: AssetAspect[] = ["1:1", "3:4", "4:3", "4:5", "5:4", "16:9"];

function aspectValue(aspect: AssetAspect) {
  const [width, height] = aspect.split(":").map(Number);
  return width! / height!;
}

function closestAspect(width: number, height: number): AssetAspect {
  const target = width / height;
  return ASPECTS.reduce((best, aspect) =>
    Math.abs(aspectValue(aspect) - target) < Math.abs(aspectValue(best) - target) ? aspect : best);
}

/** Aspect ratio of the JSX frame a placeholder sits in, from its aspect utility classes. */
function inferSlotAspect(content: string, index: number): AssetAspect {
  const open = content.lastIndexOf("<", index);
  if (open === -1 || content.slice(open, index).includes(">")) return "4:3";
  const close = content.indexOf(">", index);
  const tag = content.slice(open, close === -1 ? index + 400 : close + 1);
  const ratio = /aspect-\[?(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\]?/.exec(tag);
  if (ratio) return closestAspect(Number(ratio[1]), Number(ratio[2]));
  if (/\baspect-video\b/.test(tag)) return "16:9";
  if (/\baspect-square\b/.test(tag)) return "1:1";
  return "4:3";
}

/** Image placeholders ("asset:<name>") written into a source file, waiting for generated images. */
export function findAssetSlots(path: string, content: string): AssetSlot[] {
  const slots = new Map<string, AssetSlot>();
  for (const match of content.matchAll(PLACEHOLDER)) {
    const name = match[1]!;
    if (slots.has(name) || match.index === undefined) continue;
    slots.set(name, {
      name,
      path,
      aspect: inferSlotAspect(content, match.index),
    });
  }
  return [...slots.values()];
}

export function replacePlaceholder(content: string, name: string, localPath: string) {
  return content.replace(new RegExp(`asset:${name}(?![a-z0-9-])`, "g"), localPath);
}
