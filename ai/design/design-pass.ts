/** How many fresh samples the design director may request in one pass. */
export const MAX_INSPIRATION_BATCHES = 3;
/** Total frames across every batch; keeps the nested model's image budget bounded. */
export const MAX_INSPIRATION_FRAMES = 24;

export type InspirationFrame = {
  /** Global frame number across batches. */
  number: number;
  /** Source image id from the design library. */
  imageId: string;
  batch: number;
  assetId: string;
  assetUrl: string;
};

export type InspirationBatch = {
  batch: number;
  frames: InspirationFrame[];
};

/**
 * The mutable state of one `designSite` attempt. A retry starts a fresh pass so
 * it gets its own inspiration budget; the applied design stays untouched until
 * the new pass succeeds.
 */
export class DesignPass {
  readonly #seen = new Set<string>();
  readonly #batches: InspirationBatch[] = [];
  #totalFrames = 0;

  get nextBatch() {
    return this.#batches.length + 1;
  }

  get remainingBatches() {
    return Math.max(0, MAX_INSPIRATION_BATCHES - this.#batches.length);
  }

  get remainingFrames() {
    return Math.max(0, MAX_INSPIRATION_FRAMES - this.#totalFrames);
  }

  get totalFrames() {
    return this.#totalFrames;
  }

  get seen(): ReadonlySet<string> {
    return this.#seen;
  }

  frameNumber(index: number) {
    return this.#totalFrames + index + 1;
  }

  recordBatch(frames: InspirationFrame[]) {
    for (const frame of frames) this.#seen.add(frame.imageId);
    this.#batches.push({ batch: this.nextBatch, frames });
    this.#totalFrames += frames.length;
  }

  allFrames() {
    return this.#batches.flatMap((batch) => batch.frames);
  }
}
