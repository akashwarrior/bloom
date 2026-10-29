import { readFile } from "node:fs/promises";
import path from "node:path";

import { BLOCK_DIRECTORY, BLOCK_FILES } from "@/lib/design/blocks-catalog";

/** Reads the block sources from templates/blocks for writing into a project. */
export async function loadBlockSources() {
  const root = path.join(process.cwd(), "templates", "blocks");
  return Promise.all(
    BLOCK_FILES.map(async (file) => ({
      path: `${BLOCK_DIRECTORY}/${file}`,
      content: await readFile(path.join(root, file), "utf8"),
    })),
  );
}
