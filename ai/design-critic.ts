import { generateText, Output, type UserModelMessage } from "ai";
import sharp from "sharp";
import { z } from "zod";

import type { PreviewShot } from "@/ai/build-session";
import { getAgentModelOptions } from "@/ai/config";
import type { ToolParams } from "@/ai/tools";
import { resolveGeneratedImageForModel } from "@/ai/generated-assets.server";

/** How many reviews one run may receive before the page ships with its remaining notes. */
export const MAX_CRITIQUE_ROUNDS = 2;

const issueSchema = z.strictObject({
  where: z.string().describe("Where on the page, named so someone who cannot see the image can find it: the region, its position, and the viewport (desktop, mobile or both)."),
  problem: z.string().describe("What is wrong, as observed in the capture."),
  fix: z.string().describe("The concrete change that resolves it: what to resize, move, remove, realign or rebuild, with values where they help."),
  severity: z.enum(["major", "minor"]).describe("major: a designer would not ship with this. minor: polish."),
});

const critiqueSchema = z.strictObject({
  firstImpression: z.string().describe("What a visitor takes away in the first five seconds, and whether that matches the direction's idea."),
  keep: z.array(z.string()).max(4).describe("What already works and must survive the revisions."),
  issues: z.array(issueSchema).max(6).describe("The changes with the highest leverage, most important first. Empty when the page is ready."),
  unsupportedClaims: z.string().nullable().describe("Visible ratings, testimonials, customer or usage counts, press mentions or endorsements that the user's request does not supply, and prices, fees, rates, guarantees or regulatory and security claims stated as facts about the product (\"No fees\", \"FDIC insured\", \"$8 a month\") when the request neither supplies them nor asks for that content. Quote the copy and say where each sits so the builder can remove them together. Null when there are none. Illustrative product data, an original brand name and clearly illustrative figures in a section the user asked for are fine. Check this independently of the verdict."),
  verdict: z.enum(["ship", "revise"]).describe("revise when any major issue remains; ship otherwise."),
});

export type DesignCritique = z.infer<typeof critiqueSchema>;

const instructions = [
  "You are an independent design reviewer with the eye of a senior art director. You are shown the brief, the design direction written for it, and captures of the page as built. You did not build it and have no stake in it. Judge what is on the screen.",
  "",
  "## What you judge",
  "- Fidelity to the direction. Is the idea visible in the first viewport? Is the signature present and well made? Do composition, type, color, shape and imagery match what was written, or is this a familiar page wearing the direction's colors?",
  "- Hierarchy. Is it obvious what to look at first, second and third? Is the contrast of scale and weight strong enough to do that?",
  "- Composition and rhythm. Do regions differ in scale, density and structure, or repeat one block? Is space used deliberately, with tight groups and open pauses? Is anything stranded, crowded or arbitrarily centered?",
  "- Typography. Sizes, weights, line-height, letter-spacing and line length as specified; no awkward wraps, orphans, or text too small or too faint to read.",
  "- Color. Distribution as the strategy describes; the strongest color as rare as intended; every text legible on its surface.",
  "- Craft. Edges aligned to a grid, consistent gaps, images present, sharp and cropped on purpose, nothing clipped, overlapping or overflowing, no unstyled or broken parts.",
  "- Function. Is anything a visitor needs clipped, hidden, overlapped or out of reach on either viewport? Is any text too small or too faint to read on its surface?",
  "- Truthfulness. Does the page show ratings, testimonials, customer counts, press mentions or endorsements the user did not supply, or state a price, fee, rate, guarantee or regulatory claim about the product that the user did not supply? Report them under unsupportedClaims.",
  "- Narrow screen. Was the composition reorganized as the direction describes, with comfortable touch targets and no horizontal overflow?",
  "- Distinctiveness. Would a visitor remember this page, or mistake it for others in its category?",
  "",
  "## How to review",
  "- The direction states intent; it is not a specification to audit. A page that carries the idea and looks good ships, even where line breaks, sizes, counts or positions differ from what was written. Never ask for a change only because the page departs from the direction's wording or measurements.",
  "- Ask for a change only when you are confident a visitor would see the page as better afterwards. A major issue is something a visitor notices within seconds: content that is covered, clipped, illegible or missing, a broken layout, or a page that ignores the idea. When the page is good and you are weighing preferences, the verdict is ship.",
  "- Legibility outranks everything in the direction. Never ask for an element to overlap, cross or sit on top of text, and report any text that is covered.",
  "- Judge against this direction and against craft. Do not propose a different aesthetic, and do not ask for content the brief never wanted. Never ask for statistics, ratings, testimonials, customer counts, logos or other proof that would have to be invented, even where the direction mentions them: the builder is forbidden from fabricating them and an earlier check removes them, so their absence is correct and is never an issue.",
  "- Report only what you can see in the captures. A full-page capture is scaled down; do not report blur or small text that scaling explains.",
  "- Be specific and constructive. Each issue names the place, the observation and the exact change. Prefer the few changes that would most improve the page over a long list.",
  "- The builder cannot see your images or ask you questions; your words are all it gets.",
].join("\n");

/** The top of a full-page capture, cut to one screen: 16:9 on desktop, a tall phone on mobile. Null when the page is no taller than that. */
async function firstScreen(data: Uint8Array, viewport: "desktop" | "mobile") {
  const { width, height } = await sharp(data).metadata();
  if (!width || !height) return null;
  const screen = Math.round(width * (viewport === "desktop" ? 9 / 16 : 2.16));
  if (height <= screen * 1.15) return null;
  return new Uint8Array(await sharp(data).extract({ left: 0, top: 0, width, height: screen }).webp({ quality: 88 }).toBuffer());
}

type CriticInput = Pick<ToolParams, "projectId" | "signal" | "logger"> & {
  request: string;
  designDoc: string;
  round: number;
  shots: { desktop: PreviewShot[]; mobile: PreviewShot[] };
  /** The text rendered on the page, for checking copy and claims the captures show too small to read. */
  pageText: string;
  /** Desktop captures from the previous review, so a later round can tell whether the revisions made the page worse. */
  before?: PreviewShot[];
  /** The opening the user rejected by regenerating, when there is one. */
  replacedOpening?: UserModelMessage;
};

/**
 * Has a fresh model review the built page against its direction. Returns null
 * when no capture can be loaded, so a review outage never blocks a build.
 */
export async function runDesignCritic({ projectId, signal, logger, request, designDoc, round, shots, pageText, before = [], replacedOpening }: CriticInput): Promise<DesignCritique | null> {
  const load = async (viewport: "desktop" | "mobile") =>
    (await Promise.all(shots[viewport].map(async (shot, index) => {
      const image = await resolveGeneratedImageForModel(projectId, shot.url).catch(() => null);
      if (!image) return [];
      const whole = { label: `${viewport}: ${shot.label}`, image };
      // A full-page capture is scaled down to fit; the first screen is also shown at its real size.
      const first = index === 0 ? await firstScreen(image.data, viewport).catch(() => null) : null;
      return first ? [{ label: `${viewport}: first screen at full size`, image: { ...image, data: first, mediaType: "image/webp" } }, whole] : [whole];
    }))).flat();
  const images = [...await load("desktop"), ...await load("mobile")];
  if (images.length === 0) return null;
  const earlier = round > 1
    ? (await Promise.all(before.map(async (shot) => {
      const image = await resolveGeneratedImageForModel(projectId, shot.url).catch(() => null);
      return image ? [{ label: `before the revisions, desktop: ${shot.label}`, image }] : [];
    }))).flat()
    : [];

  const { output } = await generateText({
    ...getAgentModelOptions(),
    abortSignal: signal,
    instructions: replacedOpening
      ? `${instructions}\n- The first message shows the opening the user rejected by regenerating. If the new page repeats its visual hierarchy and arrangement where the brief left those open, report that as a major issue; a change of palette, copy or font alone leaves the composition intact.`
      : instructions,
    output: Output.object({
      schema: critiqueSchema,
      name: "design_review",
      description: "An art director's review of the built page against its design direction.",
    }),
    messages: [...(replacedOpening ? [replacedOpening] : []), {
      role: "user",
      content: [
        {
          type: "text",
          text: [
            "## What the user asked for",
            request.trim() || "(the request is in the direction below)",
            "",
            "## The design direction (DESIGN.md)",
            designDoc,
            "",
            "## Text rendered on the page",
            pageText.slice(0, 12_000) || "(not captured)",
            "",
            round > 1
              ? `## Review round ${round}\nThe builder revised the page after your earlier review. The first captures show the page before those revisions. Check two things only: whether a revision covered, clipped, broke or removed something that was fine before, and whether an earlier major issue is plainly still there. Where the page was better before, ask for that part to be put back as it was. Raise nothing new.`
              : "## Review",
            "The captures follow.",
          ].join("\n"),
        },
        ...[...earlier, ...images].flatMap(({ label, image }) => [
          { type: "text" as const, text: label },
          { type: "file" as const, data: { type: "data" as const, data: image.data }, mediaType: image.mediaType },
        ]),
      ],
    }],
  });

  await logger.write("design_critic.reviewed", { status: output.verdict, attempt: round });
  return output;
}

/** The review as blocking items for the builder, most important first. */
export function critiqueBlockers(critique: DesignCritique) {
  return [
    ...(critique.unsupportedClaims ? [`Remove the unsupported claims and their associated decoration: ${critique.unsupportedClaims}`] : []),
    ...critique.issues.map((issue) => `[design review, ${issue.severity}] ${issue.where}: ${issue.problem} Fix: ${issue.fix}`),
  ];
}
