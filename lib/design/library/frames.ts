import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

/** The pseudo-reference that carries the chosen design-library frames. */
export const LIBRARY_URL = "https://library.bloom/frames";

/** How many library frames one build sees at most. */
export const LIBRARY_FRAME_COUNT = 10;

/** Directory holding the reference images. Add or remove .webp files freely. */
export function libraryImagesDirectory() {
  return path.join(process.cwd(), "lib", "design", "library", "images");
}

/**
 * Image ids currently on disk, from filenames without the .webp extension.
 * There is no manifest and no fixed naming scheme: any lowercase .webp file
 * is included, so adding or deleting files changes the library immediately.
 * Numeric names sort naturally (2 before 10) for a stable, readable order.
 */
export function libraryImageIds(directory = libraryImagesDirectory()) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.length > ".webp".length && entry.name.endsWith(".webp"))
    .map((entry) => entry.name.slice(0, -".webp".length))
    .sort((a, b) => a.localeCompare(b, "en", { numeric: true, sensitivity: "base" }));
}

/**
 * Uniform random sample without replacement. The caller stores the result,
 * so one build always sees the same frames even when the tool is called
 * again. When the library is smaller than `count`, every image is returned.
 */
export function drawLibraryFrames(
  count = LIBRARY_FRAME_COUNT,
  random: () => number = Math.random,
  directory = libraryImagesDirectory(),
  exclude: Iterable<string> = [],
) {
  const excluded = new Set(exclude);
  const ids = libraryImageIds(directory).filter((id) => !excluded.has(id));
  const shuffled = [...ids];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swap]] = [shuffled[swap]!, shuffled[index]!];
  }
  return shuffled.slice(0, Math.min(Math.max(count, 1), shuffled.length));
}
