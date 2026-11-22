import { generateText, Output } from "ai";
import z from "zod/v4";

import type { PreviewShot } from "@/ai/build-session";
import { getAgentModelOptions } from "@/ai/config";
import type { ToolParams } from "@/ai/tools";
import { resolveGeneratedImageForModel } from "@/lib/generated-assets.server";

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
  "- Narrow screen. Was the composition reorganized as the direction describes, with comfortable touch targets and no horizontal overflow?",
  "- Distinctiveness. Would a visitor remember this page, or mistake it for others in its category?",
  "",
  "## How to review",
  "- Hold the page to the standard of work a good studio would put in its portfolio. Being free of errors is not enough to ship.",
  "- Judge against this direction and against craft. Do not propose a different aesthetic, and do not ask for content the brief never wanted. Never ask for statistics, testimonials, logos or other proof that would have to be invented.",
  "- Report only what you can see in the captures. A full-page capture is scaled down; rely on the full-size viewport captures for detail and do not report blur or small text that scaling explains.",
  "- Be specific and constructive. Each issue names the place, the observation and the exact change. Prefer the few changes that would most improve the page over a long list.",
  "- The builder cannot see your images or ask you questions; your words are all it gets.",
].join("\n");

type CriticInput = Pick<ToolParams, "projectId" | "signal" | "logger"> & {
  request: string;
  designDoc: string;
  round: number;
  shots: { desktop: PreviewShot[]; mobile: PreviewShot[] };
};

/**
 * Has a fresh model review the built page against its direction. Returns null
 * when no capture can be loaded, so a review outage never blocks a build.
 */
export async function runDesignCritic({ projectId, signal, logger, request, designDoc, round, shots }: CriticInput): Promise<DesignCritique | null> {
  const load = async (viewport: "desktop" | "mobile") =>
    (await Promise.all(shots[viewport].map(async (shot) => {
      const image = await resolveGeneratedImageForModel(projectId, shot.url).catch(() => null);
      return image ? [{ label: `${viewport}: ${shot.label}`, image }] : [];
    }))).flat();
  const images = [...await load("desktop"), ...await load("mobile")];
  if (images.length === 0) return null;

  const { output } = await generateText({
    ...getAgentModelOptions(),
    abortSignal: signal,
    instructions,
    output: Output.object({
      schema: critiqueSchema,
      name: "design_review",
      description: "An art director's review of the built page against its design direction.",
    }),
    messages: [{
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
            round > 1
              ? `## Review round ${round}\nThe builder has revised the page after an earlier review. Judge the page as it is now.`
              : "## Review",
            "The captures follow.",
          ].join("\n"),
        },
        ...images.flatMap(({ label, image }) => [
          { type: "text" as const, text: label },
          { type: "file" as const, data: { type: "data" as const, data: image.data }, mediaType: image.mediaType },
        ]),
      ],
    }],
  });

  await logger.write("design_critic.reviewed", {
    round,
    images: images.length,
    verdict: output.verdict,
    issues: output.issues.length,
    firstImpression: output.firstImpression,
  });
  return output;
}

/** The review as blocking items for the builder, most important first. */
export function critiqueBlockers(critique: DesignCritique) {
  return critique.issues.map((issue) => `[design review, ${issue.severity}] ${issue.where}: ${issue.problem} Fix: ${issue.fix}`);
}
