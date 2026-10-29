import z from "zod/v4";
import { lintSourceChange } from "./lint.ts";

export const designStudySchema = z.strictObject({
  audience: z.string().trim().min(20).max(300),
  thesis: z.string().trim().min(30).max(500).describe("An original visual idea tied to this audience and product, not a style label."),
  references: z.array(z.strictObject({
    url: z.url(),
    frame: z.number().int().min(1).max(40),
    observation: z.string().trim().min(30).max(400).describe("Visible geometry in this exact frame: hierarchy, scale, alignment, negative space, media integration. No copied headings."),
    principle: z.string().trim().min(20).max(300).describe("Why that composition works, independent of its brand or subject."),
    adaptation: z.string().trim().min(30).max(400).describe("Where and how this principle becomes a different composition for the requested product."),
    avoid: z.string().trim().min(15).max(300).describe("What will NOT transfer: proprietary art, copy, claims, irrelevant content, or incompatible styling."),
  })).max(6),
  hero: z.strictObject({
    composition: z.string().trim().min(30).max(500),
    focalPoint: z.string().trim().min(20).max(300),
    mobile: z.string().trim().min(30).max(400).describe("How the composition changes on a narrow viewport; not simply 'responsive'."),
  }),
  rhythm: z.string().trim().min(30).max(500).describe("How subsequent sections contrast in scale, density and layout while sustaining one coherent visual idea."),
});

export type DesignStudy = z.infer<typeof designStudySchema>;

/** The pseudo-reference that carries the chosen design-library frames. */
export const LIBRARY_URL = "https://library.bloom/frames";

export function referenceKey(url: string) {
  const parsed = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
  return `${parsed.hostname.toLowerCase().replace(/^www\./, "")}${parsed.pathname.replace(/\/+$/, "")}`;
}

export function validateDesignStudy(
  study: DesignStudy,
  captures: Array<{ url: string; frames: Array<{ number: number }>; headings?: string[] }>,
) {
  const problems: string[] = [];
  const capturedHosts = new Set(captures.map((capture) => new URL(capture.url).hostname.replace(/^www\./, "")));
  const citedHosts = new Set<string>();
  for (const source of study.references) {
    const capture = captures.find((candidate) => referenceKey(candidate.url) === referenceKey(source.url));
    if (!capture) {
      problems.push(`Reference ${source.url} was not captured. Cite only captured references.`);
      continue;
    }
    if (!capture.frames.some((frame) => frame.number === source.frame)) {
      problems.push(`${source.url} has no frame ${source.frame}. Use a frame from its capture.`);
      continue;
    }
    citedHosts.add(new URL(capture.url).hostname.replace(/^www\./, ""));
  }
  if (citedHosts.size < Math.min(2, capturedHosts.size)) {
    problems.push(`Ground the study in ${Math.min(2, capturedHosts.size)} different captured sites, with a cited frame and a concrete adaptation from each.`);
  }
  const originalIntent = [study.thesis, ...Object.values(study.hero), study.rhythm, ...study.references.map((source) => source.adaptation)];
  const copied = lintSourceChange({
    path: "components/design-study.tsx",
    before: null,
    after: originalIntent.map((text) => JSON.stringify(text)).join("\n"),
    reference: { brands: [], headings: captures.flatMap((capture) => capture.headings ?? []) },
  }).filter((violation) => violation.kind === "copied-copy");
  for (const violation of copied) problems.push(`The proposed concept repeats reference copy: ${violation.fix} Transfer geometry, not the source headline.`);
  return problems;
}

export function formatDesignStudy(study: DesignStudy) {
  return [
    "## Design reasoning",
    `Audience: ${study.audience}`,
    `Thesis: ${study.thesis}`,
    ...study.references.map((source) => [
      `### ${source.url}, frame ${source.frame}`,
      `Observed: ${source.observation}`,
      `Principle: ${source.principle}`,
      `Adaptation: ${source.adaptation}`,
      `Do not transfer: ${source.avoid}`,
    ].join("\n")),
    `Hero composition: ${study.hero.composition}`,
    `Focal point: ${study.hero.focalPoint}`,
    `Mobile recomposition: ${study.hero.mobile}`,
    `Page rhythm: ${study.rhythm}`,
    ...(study.references.length === 0 ? ["Reference research was unavailable; this is an unbenchmarked original concept."] : []),
  ].join("\n\n");
}

const GALLERY_HOST = /^(?:https?:\/\/)?(?:[\w-]+\.)*(?:dribbble\.com|behance\.net|kage\.design|norrly\.io|ondisplay\.website|land-book\.com|landing\.love|lapa\.ninja|godly\.website|awwwards\.com|siteinspire\.com|onepagelove\.com|saaslandingpage\.com|mobbin\.com|pinterest\.\w+|medium\.com|getdesign\.md|webdesignhot\.com|deeezy\.com|themeforest\.net|framer\.com\/marketplace|figma\.com|vercel\.app|github\.com)(?:[/:?#]|$)/i;

/** Design galleries, marketplaces, articles and code hosts: they show other sites, not a product's own design. */
export function isGalleryUrl(url: string) {
  return GALLERY_HOST.test(url.trim());
}
