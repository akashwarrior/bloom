import { readFile } from "node:fs/promises";
import path from "node:path";

import type { BuildSession } from "@/ai/build-session";
import type { DesignPass, InspirationFrame } from "@/ai/design/design-pass";
import { buildPageDna } from "@/lib/design/dna";
import { LIBRARY_HEADLINES, LIBRARY_TEXT } from "@/lib/design/library/copy";
import {
  drawLibraryFrames,
  LIBRARY_FRAME_COUNT,
  LIBRARY_URL,
  libraryImagesDirectory,
} from "@/lib/design/library/frames";
import { storeGeneratedImageAsset } from "@/lib/generated-assets.server";
import type { RequestTraceLogger } from "@/lib/request-trace-logger.server";

type InspirationSample = {
  batch: number;
  reference: string;
  frames: InspirationFrame[];
  remainingBatches: number;
  remainingFrames: number;
};

function exhaustedSample(
  designPass: DesignPass,
  remainingBatches: number,
  remainingFrames: number,
): InspirationSample {
  return {
    batch: designPass.nextBatch,
    reference: LIBRARY_URL,
    frames: [],
    remainingBatches,
    remainingFrames,
  };
}

/**
 * Samples a fresh batch of design-library frames, never repeating an image the
 * current pass has already seen. Frames are stored as project assets so the
 * nested design model can look at them and Bloom can record them as inspiration
 * references in DESIGN.md.
 */
export async function sampleInspiration({
  projectId,
  session,
  designPass,
  logger,
}: {
  projectId: string;
  session: BuildSession;
  designPass: DesignPass;
  logger: RequestTraceLogger;
}): Promise<InspirationSample> {
  const batch = designPass.nextBatch;
  if (designPass.remainingBatches === 0) {
    return exhaustedSample(designPass, 0, designPass.remainingFrames);
  }

  const remainingFrames = designPass.remainingFrames;
  const remainingBatches = designPass.remainingBatches;
  if (remainingFrames === 0) return exhaustedSample(designPass, remainingBatches, remainingFrames);

  const directory = libraryImagesDirectory();
  const ids = drawLibraryFrames(
    Math.min(LIBRARY_FRAME_COUNT, remainingFrames),
    Math.random,
    directory,
    designPass.seen,
  );
  if (ids.length === 0) return exhaustedSample(designPass, remainingBatches, remainingFrames);

  const frames: InspirationFrame[] = [];
  for (const [index, imageId] of ids.entries()) {
    const number = designPass.frameNumber(index);
    const stored = await storeGeneratedImageAsset({
      projectId,
      filename: `library-frame-${number}-${imageId}.webp`,
      mediaType: "image/webp",
      bytes: await readFile(path.join(directory, `${imageId}.webp`)),
    });
    frames.push({
      number,
      imageId,
      batch,
      assetId: stored.id,
      assetUrl: stored.url,
    });
  }

  designPass.recordBatch(frames);
  recordLibraryReference(session, designPass);
  await logger.write("design_inspiration.sampled", {
    batch,
    frames: frames.map((frame) => ({ number: frame.number, imageId: frame.imageId })),
    totalFrames: designPass.totalFrames,
  });

  return {
    batch,
    reference: LIBRARY_URL,
    frames,
    remainingBatches: designPass.remainingBatches,
    remainingFrames: designPass.remainingFrames,
  };
}

/**
 * One aggregate reference keeps the sampled frames visible to the existing
 * copy checks and to the design notes, while frame numbers stay global across
 * fresh batches.
 */
function recordLibraryReference(session: BuildSession, designPass: DesignPass) {
  const frames = designPass.allFrames();
  if (frames.length === 0) return;
  const dna = {
    ...buildPageDna({ frames: [], profile: null, pageHeight: 1080 }),
    theme: "mixed" as const,
    lightShare: 0.5,
  };
  session.recordReference({
    url: LIBRARY_URL,
    host: new URL(LIBRARY_URL).hostname,
    brand: "bloom-design-library",
    dna,
    headings: [...LIBRARY_HEADLINES, ...Object.values(LIBRARY_TEXT).flatMap((lines) => [...lines, lines.join(" ")])],
  });
}
