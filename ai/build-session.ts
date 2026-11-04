import type { UserModelMessage } from "ai";
import type { DesignDirection } from "@/ai/design/direction";

import type { DesignNotes } from "@/ai/design/design-skill";

export type PreviewShot = { url: string; label: string };

export type PreviewInteraction = {
  url: string;
  viewport: "mobile" | "tablet" | "desktop";
  actions: Array<{ selector: string; fill: string | null }>;
  expectVisible: string;
};

type PreviewViewport = "desktop" | "mobile";

export class BuildSession {
  /** The study rendered for the direction being applied; it becomes the saved study once that direction is written. */
  conceptUrl: string | null = null;
  appliedConceptUrl: string | null = null;
  replacedOpening?: UserModelMessage;
  review: { focus: string; interaction: string | null } | null = null;
  readonly previewImages = new Map<PreviewViewport, string[]>();
  previewText = "";
  /** The project route the builder last captured; finishBuild captures it again after the final edit. */
  previewUrl: string | null = null;
  /** The last interaction that reached its expected result; finishBuild replays it on the final source. */
  interaction: PreviewInteraction | null = null;
  designReferences: DesignNotes["inspiration"] = [];
  /** The art direction written for this project, when it has one. */
  appliedDirection: DesignDirection | null = null;
  /** True once `designSite` applied a design in this run; the finished page then gets a design review. */
  designedThisRun = false;
  /** DESIGN.md as written by the latest `designSite`, handed to the builder with the tool result. */
  designDoc: string | null = null;
  /** True from `designSite` returning until the model's next step: calls made in the same step could not have read the direction. */
  designResultUnread = false;
  /** Model steps left before the run is cut off; tools stop starting work that cannot finish. */
  stepsLeft = Number.POSITIVE_INFINITY;
  /** The desktop captures the last design review looked at. */
  reviewedShots: PreviewShot[] = [];
  /** How many design reviews this run has already received. */
  critiqueRounds = 0;
  /** Whether the latest design review asked for revisions. */
  revisionsRequested = false;
  /** File contents before this run first touched them; lint compares against these. */
  baselines = new Map<string, string | null>();
  /** Increments on every source write; previews are only current for the same version. */
  #editVersion = 0;
  #previewedVersion: Record<PreviewViewport, number> = { desktop: -1, mobile: -1 };
  #previewShots: Record<PreviewViewport, PreviewShot[]> = { desktop: [], mobile: [] };
  /** The last page route edited in this run; finishBuild verifies it without relying on a design brief. */
  #lastPagePath: string | null = null;
  /** The edit version that passed a full project typecheck. */
  #typecheckedVersion = -1;
  #interactionVersion = -1;
  #verifiedVersion = -1;
  lastVerificationFailure: string | null = null;

  get verificationIsCurrent() {
    return this.#verifiedVersion === this.#editVersion;
  }

  recordVerification() {
    this.#verifiedVersion = this.#editVersion;
    this.lastVerificationFailure = null;
  }

  recordEdit() {
    this.#editVersion += 1;
  }

  get editVersion() {
    return this.#editVersion;
  }

  recordPreview(viewport: PreviewViewport, shots: PreviewShot[] = [], url?: string) {
    if (url) this.previewUrl = url;
    this.#previewedVersion[viewport] = this.#editVersion;
    this.#previewShots[viewport] = shots;
    this.previewImages.set(viewport, shots.map((shot) => shot.url));
  }

  /** Screenshots of the latest capture of a viewport, for the design review. */
  previewShots(viewport: PreviewViewport) {
    return this.#previewShots[viewport];
  }

  recordInteraction(interaction?: PreviewInteraction) {
    if (interaction) this.interaction = interaction;
    this.#interactionVersion = this.#editVersion;
  }

  get interactionIsCurrent() {
    return this.#interactionVersion === this.#editVersion;
  }

  /** Remembers the page route the main agent actually edited, not a route invented by the design tool. */
  recordPagePath(path: string, exists: boolean) {
    if (!/^app\/(?:.*\/)?page\.tsx$/.test(path)) return;
    if (exists) this.#lastPagePath = path;
    else if (this.#lastPagePath === path) this.#lastPagePath = null;
  }

  get lastPagePath() {
    return this.#lastPagePath;
  }

  get hasEdits() {
    return this.#editVersion > 0;
  }

  /** A full typecheck passed for the current source version; later edits invalidate it. */
  get typecheckIsCurrent() {
    return this.#typecheckedVersion === this.#editVersion;
  }

  recordTypecheckPassed() {
    this.#typecheckedVersion = this.#editVersion;
  }

  previewIsCurrent(viewport: PreviewViewport) {
    return this.#previewedVersion[viewport] === this.#editVersion;
  }
}
