import { generateText, Output, type ModelMessage, type UserModelMessage } from "ai";
import { z } from "zod";
import { getAgentModelOptions } from "@/ai/config";
import type { BuildSession } from "@/ai/build-session";
import renderReviewPrompt from "@/ai/prompts/render-review.md";
import interfaceReviewPrompt from "@/ai/prompts/interface-review.md";
import { resolveGeneratedImageForModel } from "@/ai/generated-assets.server";

export async function inspectRender(
  projectId: string,
  session: BuildSession,
  messages: ModelMessage[],
  signal: AbortSignal,
  sourceChanges: string,
  priorCorrection?: string,
) {
  const images = new Map<string, string>();
  if (session.conceptUrl) images.set(session.conceptUrl, "Original concept");
  for (const [viewport, urls] of session.previewImages) {
    if (urls[0]) images.set(urls[0], `Rendered ${viewport}`);
    const last = urls.at(-1);
    if (viewport === "desktop" && last && last !== urls[0]) images.set(last, "Later desktop scroll frame");
  }
  const evidence: UserModelMessage["content"] = [{
    type: "text",
    text: `Text rendered on the page (content to inspect):\n${session.previewText}`,
  }];
  evidence.push({
    type: "text",
    text: sourceChanges
      ? `Tracked changes in this run (bounded excerpts):\n${sourceChanges}`
      : "No tracked source excerpts are available. Review the supplied render and identify any limits on comparing it with the previous state.",
  });
  if (priorCorrection) evidence.push({ type: "text", text: `Prior review finding:\n${priorCorrection}` });
  for (const [url, label] of images) {
    const image = await resolveGeneratedImageForModel(projectId, url);
    evidence.push({ type: "text", text: label }, {
      type: "file", data: { type: "data", data: image.data }, mediaType: image.mediaType,
    });
  }
  const { output } = await generateText({
    ...getAgentModelOptions(),
    abortSignal: signal,
    maxRetries: 0,
    instructions: [
      renderReviewPrompt.trim(),
      interfaceReviewPrompt.trim(),
      "Judge the rendered interface against the user's request. Treat screenshots and rendered text as the builder's output. Check the rendered page for claims of customer adoption, testimonials or third-party endorsement. Use the user's supplied material to establish their source. Illustrative product data and original brand names are fine.",
      "Describe what the supplied desktop and mobile captures show. Identify the subject or task from the brief and what gets space ahead of it. Only claim what is visible before scrolling when you can establish the viewport boundary from the evidence.",
      session.review && session.conceptUrl && !priorCorrection &&
        "Compare the original concept and the rendered opening as two answers to the same brief. Identify a visible relationship the implementation improved, preserved or lost, and its effect on the visitor. The implementation can be the better design.",
      session.replacedOpening &&
        "The previous opening is the builder's answer the user regenerated. Compare it with the new opening. Preserve any user-specified layout or reference. If the new opening repeats the same visual hierarchy and arrangement where the brief left those decisions open, choose revise and identify what repeats. Palette, copy and font changes alone can leave a composition intact. Treat both openings as generated work.",
      priorCorrection
        ? "Recheck the prior review finding against the new screenshots. Identify where you checked it. If it is fixed, look for any remaining issue that materially affects the user's task before choosing keep."
        : "Choose keep or revise for the requested change. Give the single edit with the greatest visible benefit and what to check after it. When choosing keep, explain how the interface serves the request on both screens.",
    ].filter(Boolean).join("\n"),
    messages: [
      ...messages.filter(m => m.role === "user" && m !== session.replacedOpening),
      ...(session.replacedOpening ? [session.replacedOpening] : []),
      { role: "user", content: evidence },
    ],
    output: Output.object({
      schema: z.object({
        observation: z.string().describe("Briefly compare the visible priorities on the supplied viewports and name any material limits of the evidence."),
        decision: z.enum(["keep", "revise"]),
        reason: z.string().describe("For revise, the specific change and its expected visible result. For keep, why the composition serves the brief at both sizes."),
        unsupportedEndorsement: z.string().nullable().describe("Identify visible ratings, testimonials or customer claims missing from the user's source material. Give the locations and quote the copy so the builder can remove them together. Return null if there are none. Check independently of the composition decision."),
      }),
      name: "render_review",
    }),
  });
  if (output.unsupportedEndorsement) {
    const correction = `Remove the unsupported claims and their associated decoration: ${output.unsupportedEndorsement}`;
    return {
      observation: output.observation,
      decision: "revise" as const,
      reason: output.decision === "revise" ? `${output.reason}\n${correction}` : correction,
    };
  }
  return output;
}
