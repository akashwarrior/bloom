import { readFile } from "node:fs/promises";
import path from "node:path";

import { tool } from "ai";
import z from "zod/v4";

import type { ReferenceFrame } from "@/ai/build-session";
import type { ToolParams } from "@/ai/tools";
import { toolFailure, toolOutputSchema } from "@/ai/tools/schemas";
import { buildPageDna } from "@/lib/design/dna";
import { LIBRARY_HEADLINES, LIBRARY_TEXT } from "@/lib/design/library/copy";
import { candidatesForPrompt, findPattern, patternDetails } from "@/lib/design/library/patterns";
import { LIBRARY_URL } from "@/lib/design/study";
import { resolveGeneratedImageForModel, storeGeneratedImageAsset } from "@/lib/generated-assets.server";
import { modelAssetFilename } from "@/lib/model-asset-reference";

const EXAMPLES_PER_PATTERN = 2;

const outputSchema = toolOutputSchema(
  z.strictObject({
    status: z.literal("success"),
    reference: z.string(),
    frames: z.array(z.strictObject({
      number: z.number().int().positive(),
      pattern: z.string(),
      url: z.string().startsWith("/api/assets/"),
    })),
    patterns: z.string(),
  }),
);

export const chooseInspiration = ({ projectId, session, logger }: Pick<ToolParams, "projectId" | "session" | "logger">) =>
  tool({
    description:
      "Original sites only; skip this for a named reference, clone, or edit. Pick the frames of this page from this build's slate of Bloom design-library patterns: one hero, 2-3 sections in page order, and one closing frame. Returns real example images of each pattern; every section of the page will adapt one of these frames.\n\n" +
      candidatesForPrompt(session.libraryCandidates),
    inputSchema: z.strictObject({
      hero: z.enum(session.libraryCandidates.hero as [string, ...string[]]).describe("Pattern for the hero frame."),
      sections: z.array(z.enum(session.libraryCandidates.section as [string, ...string[]])).min(2).max(3).describe("Patterns for the frames after the hero, in page order."),
      close: z.enum(session.libraryCandidates.close as [string, ...string[]]).describe("Pattern for the closing frame before the footer."),
      reason: z.string().trim().min(20).max(400).describe("Why these frames fit this product and audience, and which candidates were ruled out by their Not for."),
    }),
    outputSchema,
    execute: async ({ hero, sections, close, reason }) => {
      try {
        if (!session.original) throw new Error("The design library is used for original sites only.");
        const chosen = [...new Set([hero, ...sections, close])].map((id) => findPattern(id)!);
        const library = path.join(process.cwd(), "lib", "design", "library", "images");
        const frames: Array<ReferenceFrame & { pattern: string }> = [];
        const notes: Record<number, string> = {};
        for (const [index, pattern] of chosen.entries()) {
          const scrollPercentage = chosen.length > 1 ? Math.round((index / (chosen.length - 1)) * 100) : 0;
          const examples = [...pattern.examples].sort(() => Math.random() - 0.5).slice(0, EXAMPLES_PER_PATTERN);
          for (const example of examples) {
            const stored = await storeGeneratedImageAsset({
              projectId,
              filename: `library-${pattern.id}-${example}.webp`,
              mediaType: "image/webp",
              bytes: await readFile(path.join(library, `${example}.webp`)),
            });
            const number = frames.length + 1;
            frames.push({ number, assetId: stored.id, assetUrl: stored.url, scrollY: index * 1080, scrollPercentage, pattern: pattern.id });
            notes[number] = `${pattern.name} [${pattern.id}]: ${pattern.composition}`;
          }
        }
        const dna = { ...buildPageDna({ frames: [], profile: null, pageHeight: 1080, viewportHeight: 1080 }), theme: "mixed" as const, lightShare: 0.5 };
        const details = chosen.map(patternDetails).join("\n\n");
        session.recordReference({
          url: LIBRARY_URL,
          host: new URL(LIBRARY_URL).hostname,
          brand: "bloom-design-library",
          title: "Bloom design library",
          pageHeight: 1080 * chosen.length,
          viewportHeight: 1080,
          dna,
          dnaText: `${Object.entries(notes).map(([number, note]) => `- frame ${number}: ${note}`).join("\n")}\n\n${details}`,
          frames: frames.map(({ number, assetId, assetUrl, scrollY, scrollPercentage }) => ({ number, assetId, assetUrl, scrollY, scrollPercentage })),
          headings: [...LIBRARY_HEADLINES, ...Object.values(LIBRARY_TEXT).flatMap((lines) => [...lines, lines.join(" ")])],
          largeMedia: chosen.filter((pattern) => pattern.heroImagery >= 0.35).length,
          heroImagery: chosen[0]!.heroImagery,
          frameNotes: notes,
          fonts: [],
        });
        session.libraryPatterns = chosen.map((pattern) => pattern.id);
        await logger.write("design_library.chosen", { patterns: session.libraryPatterns, reason, frames: frames.length });
        return {
          status: "success" as const,
          reference: LIBRARY_URL,
          frames: frames.map((frame) => ({ number: frame.number, pattern: frame.pattern, url: frame.assetUrl })),
          patterns: details,
        };
      } catch (error) {
        return toolFailure(
          "DESIGN_LIBRARY_FAILED",
          error,
          session.original
            ? "Choose pattern ids from this build's candidates and try once more."
            : "This tool is for original sites only. Skip the design library and use the anchor's captured frames.",
        );
      }
    },
    toModelOutput: async ({ output }) => {
      if ("error" in output) return { type: "text" as const, value: JSON.stringify(output) };
      const resolved = await Promise.all(output.frames.map(async (frame) => ({
        frame,
        image: await resolveGeneratedImageForModel(projectId, frame.url).catch(() => null),
      })));
      return {
        type: "content" as const,
        value: [
          { type: "text" as const, text: `Library frames for this page (reference ${output.reference}). Each section you plan adapts one of these frames by number: same composition, scale, texture and restraint, with this product's content. The images show other companies' products: none of their words, names, labels, numbers or logos may appear on this page. Write every headline, button and UI label fresh for this product.\n\n${output.patterns}` },
          ...resolved.flatMap(({ frame, image }) => [
            { type: "text" as const, text: `Frame ${frame.number} [${frame.pattern}]:` },
            ...(image
              ? [{
                type: "file" as const,
                data: { type: "data" as const, data: image.data },
                mediaType: image.mediaType,
                filename: modelAssetFilename(image.assetId, `library-frame-${frame.number}.webp`),
              }]
              : []),
          ]),
        ],
      };
    },
  });
