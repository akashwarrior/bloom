import { evenlySelectItems } from "./evenly-select-items.ts";

function isReference(filename: string) {
  return /public-reference/i.test(filename);
}

function isPreview(filename: string) {
  return /current-preview/i.test(filename);
}

/** Preserve both sides of visual comparisons when compaction has to drop files. */
export function selectBalancedVisualEvidence<
  T extends { filename: string },
>(items: readonly T[], limit: number): T[] {
  if (limit <= 0) return [];
  if (items.length <= limit) return [...items];

  const references = items.filter((item) => isReference(item.filename));
  const previews = items.filter((item) => isPreview(item.filename));
  const others = items.filter(
    (item) => !isReference(item.filename) && !isPreview(item.filename),
  );
  if (references.length === 0 && previews.length === 0) {
    return evenlySelectItems(items, limit);
  }

  // Anchor-first: public refs carry the design thesis. When only one
  // side exists (e.g. refs before the first preview scrape), keep that side
  // first instead of evenly sampling across unrelated generated assets.
  if (references.length > 0 && previews.length === 0) {
    const refQuota = Math.min(references.length, Math.max(limit - 2, Math.ceil(limit * 0.7)));
    const selected = new Set<T>([
      ...references.slice(0, refQuota),
      ...evenlySelectItems(others, limit - Math.min(references.length, refQuota)),
    ]);
    // references.slice keeps source (chronological) order so the anchor
    // (first successful public scrape) survives.
    return items.filter((item) => selected.has(item));
  }
  if (previews.length > 0 && references.length === 0) {
    const previewQuota = Math.min(previews.length, Math.max(limit - 2, Math.ceil(limit * 0.7)));
    const selected = new Set<T>([
      ...previews.slice(-previewQuota),
      ...evenlySelectItems(others, limit - Math.min(previews.length, previewQuota)),
    ]);
    return items.filter((item) => selected.has(item));
  }

  const perRole = Math.floor(limit / 2);
  const selected = new Set<T>([
    ...evenlySelectItems(references, perRole),
    ...evenlySelectItems(previews, perRole),
  ]);
  const remainingSlots = limit - selected.size;
  if (remainingSlots > 0) {
    const remaining = items.filter((item) => !selected.has(item));
    for (const item of evenlySelectItems(remaining, remainingSlots)) {
      selected.add(item);
    }
  }

  return items.filter((item) => selected.has(item));
}
