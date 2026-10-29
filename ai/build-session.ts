import type { DesignBrief } from "@/lib/design/brief";
import type { ResolvedFonts } from "@/lib/design/design-system";
import type { DesignProfile, PageDna } from "@/lib/design/dna";
import type { DesignViolation } from "@/lib/design/lint";
import type { DirectionId } from "@/lib/design/directions";
import type { DesignStudy } from "@/lib/design/study";
import { LIBRARY_BRANDS } from "../lib/design/library/copy.ts";
import { randomShadcnTheme, type ShadcnTheme } from "../lib/design/shadcn-theme.ts";
import { drawCandidates, type LibraryCandidates } from "../lib/design/library/patterns.ts";
import { findAssetSlots, replacePlaceholder, type AssetSlot } from "../lib/design/asset-slots.ts";

/**
 * site:   marketing/brand page: an evidence-grounded original, or an adaptation of a site the user named
 * clone:  faithful reproduction of a specific URL
 * app:    original product UI (dashboard, tool, game) without reference research
 * edit:   change to an existing project
 * answer: explanation or discussion only
 */

export type Workflow = "site" | "clone" | "app" | "edit" | "answer";

export type ReferenceFrame = {
  number: number;
  assetId: string;
  assetUrl: string;
  scrollY: number;
  scrollPercentage: number;
};

export type ReferenceCapture = {
  url: string;
  host: string;
  brand: string;
  title: string;
  pageHeight: number;
  viewportHeight: number;
  dna: PageDna;
  dnaText: string;
  frames: ReferenceFrame[];
  headings: string[];
  /** Large images/videos visible on the page (product shots, illustrations, mockups). */
  largeMedia: number;
  /** Share of the first screen that is artwork, photography or dense media rather than flat fills. */
  heroImagery: number;
  /** Per-frame composition notes written from the screenshots. */
  frameNotes: Record<number, string>;
  fonts: Array<{
    family: string;
    weight: string;
    style: string;
    format?: string;
    unicodeRange?: string;
    localPath: string;
  }>;
};

export type PreviewReview = {
  step: number;
  dna: PageDna;
  profile: DesignProfile | null;
  gaps: string[];
};


export class BuildSession {
  readonly workflow: Workflow;
  readonly cloneTarget: string | null;
  /** The site the user asked the new site to look like (site workflow only). */
  readonly reference: string | null;
  readonly references: ReferenceCapture[] = [];
  /** The curated art direction of an original site, once the brief is accepted. */
  direction: DirectionId | null = null;
  designStudy: DesignStudy | null = null;
  /** Design-library patterns chosen for an original site, hero first, close last. */
  libraryPatterns: string[] = [];
  /** The random slate of library patterns this build may choose from, drawn once per run. */
  readonly libraryCandidates: LibraryCandidates = drawCandidates();
  /** shadcn create preset suggested to the brief (create's Shuffle), drawn once per run. */
  readonly suggestedTheme: ShadcnTheme = randomShadcnTheme();
  /** shadcn create preset applied with the accepted brief. */
  shadcnTheme: (ShadcnTheme & { code: string; iconImport: string }) | null = null;
  studyRejections = 0;
  /** The user's latest request, for explicit theme or color wishes. */
  requestText = "";
  failedScrapes = 0;
  brief: DesignBrief | null = null;
  briefFonts: ResolvedFonts | null = null;
  briefRejections = 0;
  generatedAssets: Array<{ name: string; localPath: string; role: string }> = [];
  violations = new Map<string, DesignViolation[]>();
  lastValidation: "passed" | "failed" | "skipped" | "timed-out" | "unavailable" | null = null;
  lastTscError: string | null = null;
  writtenPaths = new Set<string>();
  /** File contents before this run first touched them; lint compares against these. */
  baselines = new Map<string, string | null>();
  /** True when the project already carries a generated design system (globals.css marker). */
  designSystemPresent = false;
  stepNumber = 0;
  lastEditStep = -1;
  reviews: PreviewReview[] = [];
  viewedFrames = new Set<number>();
  finishAttempts = 0;
  lastFinishStep = -1;
  finishPassed = false;
  finishReport: string[] = [];
  /** Set when a required workflow tool keeps failing for infrastructure reasons. */
  abortReason: string | null = null;
  toolFailures = new Map<string, number>();
  briefInFlight = false;
  /** Image placeholders ("asset:<name>") per source path, waiting for generated images. */
  assetSlots = new Map<string, AssetSlot[]>();

  constructor(workflow: Workflow, cloneTarget: string | null = null, reference: string | null = null) {
    this.workflow = workflow;
    this.cloneTarget = cloneTarget;
    this.reference = workflow === "site" ? reference : null;
  }

  /** A site with an original concept rather than fidelity to a user-named reference. */
  get original() {
    return this.workflow === "site" && !this.reference;
  }

  get gated() {
    return this.workflow === "site" || this.workflow === "clone" || this.workflow === "app";
  }

  get anchor(): ReferenceCapture | null {
    if (!this.brief?.anchor.url) return this.references[0] ?? null;
    return this.findReference(this.brief.anchor.url) ?? this.references[0] ?? null;
  }

  get comparisonAnchor(): ReferenceCapture | null {
    return this.original ? null : this.anchor;
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
    return {
      brands: [...new Set([...this.references.map((reference) => reference.brand), ...(this.libraryPatterns.length > 0 ? LIBRARY_BRANDS : [])])],
      headings: this.references.flatMap((reference) => reference.headings),
      ownBrand: this.brief?.brand.name ?? null,
    };
  }

  openViolations() {
    return [...this.violations.values()].flat();
  }

  requiredReferences() {
    if (this.workflow === "app") return 0;
    if (this.workflow === "clone") return this.failedScrapes >= 2 ? 0 : 1;
    if (this.failedScrapes >= 3) return Math.min(1, this.references.length);
    return 1;
  }

  /** Planned sections whose component file has not been written yet. */
  pendingSections() {
    if (!this.brief) return [];
    const written = [...this.writtenPaths];
    return this.brief.sections.filter(
      (section) => !written.some((path) => sectionFileMatches(path, section.id)),
    );
  }

  /** The planned section a written path implements, if any. */
  sectionForPath(path: string) {
    return this.brief?.sections.find((section) => sectionFileMatches(path, section.id)) ?? null;
  }

  recordEdit() {
    this.lastEditStep = this.stepNumber;
  }

  get requestedTheme(): "light" | "dark" | null {
    if (/\bdark\b/i.test(this.requestText)) return "dark";
    if (/\blight\b/i.test(this.requestText)) return "light";
    return null;
  }

  trackAssetSlots(path: string, content: string | null) {
    const slots = content === null || path.startsWith("components/blocks/") ? [] : findAssetSlots(path, content);
    if (slots.length > 0) this.assetSlots.set(path, slots);
    else this.assetSlots.delete(path);
  }

  resolveAssetSlots(content: string) {
    const paths = new Map(this.generatedAssets.map((asset) => [asset.name, asset.localPath]));
    for (const [name, localPath] of paths) content = replacePlaceholder(content, name, localPath);
    return content;
  }

  /** One entry per placeholder name still waiting for an image, with every file that uses it. */
  pendingAssetSlots() {
    const byName = new Map<string, AssetSlot & { paths: string[] }>();
    for (const slots of this.assetSlots.values()) {
      for (const slot of slots) {
        const existing = byName.get(slot.name);
        if (existing) existing.paths.push(slot.path);
        else byName.set(slot.name, { ...slot, paths: [slot.path] });
      }
    }
    return [...byName.values()];
  }

  /** Records an infrastructure failure of a gated tool; three in a row set abortReason. */
  recordToolFailure(tool: string, message: string) {
    const count = (this.toolFailures.get(tool) ?? 0) + 1;
    this.toolFailures.set(tool, count);
    if (count >= 3) {
      this.abortReason = `${tool} failed ${count} times in a row: ${message}`;
    }
  }

  recordToolSuccess(tool: string) {
    this.toolFailures.delete(tool);
  }
}

function sectionFileMatches(path: string, sectionId: string) {
  const file = path.split("/").at(-1)?.replace(/\.(?:tsx|jsx)$/, "").toLowerCase() ?? "";
  const id = sectionId.toLowerCase();
  return path.startsWith("components/") && !path.startsWith("components/blocks/") &&
    (file === id || file === `${id}-section` || file === `${id}section` || file.startsWith(`${id}-`));
}

export function normalizeReferenceUrl(url: string) {
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
