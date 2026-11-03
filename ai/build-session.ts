import type { ResolvedPreset } from "@/lib/design/shadcn-theme";
import type { PageDna } from "@/lib/design/dna";
import type { DesignViolation } from "@/lib/design/lint";
import { LIBRARY_BRANDS } from "../lib/design/library/copy.ts";
import { findAssetSlots, replacePlaceholder, type AssetSlot } from "../lib/design/asset-slots.ts";
import { LIBRARY_URL } from "../lib/design/library/frames.ts";

export type ReferenceCapture = {
  url: string;
  host: string;
  brand: string;
  dna: PageDna;
  headings: string[];
};

export type AppliedDesign = {
  /** The applied shadcn preset, including the resolved tokens used by the page and generated assets. */
  theme: ResolvedPreset;
};

type PreviewViewport = "desktop" | "mobile";

export class BuildSession {
  /** New projects must run `designSite` before writing UI files. */
  readonly requiresDesign: boolean;
  readonly references: ReferenceCapture[] = [];
  /** The user's latest request, used to exempt effects or fonts they asked for. */
  requestText = "";
  appliedDesign: AppliedDesign | null = null;
  violations = new Map<string, DesignViolation[]>();
  /** File contents before this run first touched them; lint compares against these. */
  baselines = new Map<string, string | null>();
  /** Set when a required design tool keeps failing for infrastructure reasons. */
  abortReason: string | null = null;
  #generatedAssets: Array<{ name: string; localPath: string }> = [];
  #toolFailures = new Map<string, number>();
  /** Image placeholders ("asset:<name>") per source path, waiting for generated images. */
  #assetSlots = new Map<string, AssetSlot[]>();
  /** Increments on every source write; previews are only current for the same version. */
  #editVersion = 0;
  #previewedVersion: Record<PreviewViewport, number> = { desktop: -1, mobile: -1 };
  /** The last page route edited in this run; finishBuild verifies it without relying on a design brief. */
  #lastPagePath: string | null = null;

  constructor(options: { requiresDesign?: boolean } = {}) {
    this.requiresDesign = options.requiresDesign ?? false;
  }

  findReference(url: string) {
    const key = normalizeReferenceUrl(url);
    return this.references.find((reference) => normalizeReferenceUrl(reference.url) === key) ?? null;
  }

  recordReference(capture: ReferenceCapture) {
    const existing = this.references.findIndex(
      (reference) => normalizeReferenceUrl(reference.url) === normalizeReferenceUrl(capture.url),
    );
    if (existing >= 0) {
      this.references[existing] = capture;
      return;
    }
    this.references.push(capture);
  }

  referenceCopy() {
    if (this.references.length === 0) return null;
    const library = this.references.some((reference) => reference.url === LIBRARY_URL);
    return {
      brands: [...new Set([...this.references.map((reference) => reference.brand), ...(library ? LIBRARY_BRANDS : [])])],
      headings: this.references.flatMap((reference) => reference.headings),
    };
  }

  openViolations() {
    return [...this.violations.values()].flat();
  }

  trackAssetSlots(path: string, content: string | null) {
    const slots = content === null ? [] : findAssetSlots(path, content);
    if (slots.length > 0) this.#assetSlots.set(path, slots);
    else this.#assetSlots.delete(path);
  }

  resolveAssetSlots(content: string) {
    const paths = new Map(this.#generatedAssets.map((asset) => [asset.name, asset.localPath]));
    for (const [name, localPath] of paths) content = replacePlaceholder(content, name, localPath);
    return content;
  }

  recordGeneratedAsset(asset: { name: string; localPath: string }) {
    this.#generatedAssets.push(asset);
  }

  /** One entry per placeholder name still waiting for an image, with every file that uses it. */
  pendingAssetSlots() {
    const byName = new Map<string, AssetSlot & { paths: string[] }>();
    for (const slots of this.#assetSlots.values()) {
      for (const slot of slots) {
        const existing = byName.get(slot.name);
        if (existing) existing.paths.push(slot.path);
        else byName.set(slot.name, { ...slot, paths: [slot.path] });
      }
    }
    return [...byName.values()];
  }

  recordEdit() {
    this.#editVersion += 1;
  }

  recordPreview(viewport: PreviewViewport) {
    this.#previewedVersion[viewport] = this.#editVersion;
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

  previewIsCurrent(viewport: PreviewViewport) {
    return this.#previewedVersion[viewport] === this.#editVersion;
  }

  /** Records an infrastructure failure of a required design tool; three in a row set abortReason. */
  recordToolFailure(tool: string, message: string) {
    const count = (this.#toolFailures.get(tool) ?? 0) + 1;
    this.#toolFailures.set(tool, count);
    if (count >= 3) {
      this.abortReason = `${tool} failed ${count} times in a row: ${message}`;
    }
  }

  recordToolSuccess(tool: string) {
    this.#toolFailures.delete(tool);
  }
}

function normalizeReferenceUrl(url: string) {
  try {
    const parsed = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    return `${parsed.hostname.replace(/^www\./, "").toLowerCase()}${parsed.pathname.replace(/\/+$/, "")}`;
  } catch {
    return url.trim().toLowerCase();
  }
}

export function brandFromHost(host: string) {
  const parts = host.replace(/^www\./, "").split(".");
  const generic = new Set(["app", "web", "home", "get", "try", "go", "my"]);
  const stem = parts.length > 2 && generic.has(parts[0]!) ? parts[1]! : parts[0]!;
  return stem.toLowerCase();
}
