import { z } from "zod";

import { metadataSchema } from "../../ai/message/metadata.ts";
import type { ProjectChatMessage } from "./protocol";

export const submissionSchema = z.strictObject({
  message: z.unknown(),
  trigger: z.enum(["submit-message", "regenerate-message"]),
  messageId: z.string().min(1).max(128).optional(),
});

export type ChatSubmission = z.infer<typeof submissionSchema>;

const editedMessageSchema = z.object({
  id: z.string(),
  role: z.literal("user"),
  metadata: metadataSchema.transform((metadata) => metadata ?? undefined),
  parts: z.array(z.discriminatedUnion("type", [
    z.object({ type: z.literal("text"), text: z.string() }),
    z.object({
      type: z.literal("file"),
      url: z.string(),
      mediaType: z.string(),
      filename: z.string().optional(),
      size: z.number().optional(),
    }),
  ])),
});

export const chatBranchSchema = z.object({
  messageId: z.string(),
  editedMessage: editedMessageSchema.optional(),
});

export type ChatBranch = z.infer<typeof chatBranchSchema>;

export function getChatBranch(submission: ChatSubmission): ChatBranch | undefined {
  const { messageId } = submission;
  if (!messageId) return undefined;
  if (submission.trigger === "regenerate-message") return { messageId };

  const edited = editedMessageSchema.safeParse(submission.message);
  if (edited.success && edited.data.id === messageId) {
    return { messageId, editedMessage: edited.data };
  }
}

export function applyChatBranch(messages: ProjectChatMessage[], branch: ChatBranch) {
  const index = messages.findIndex(({ id }) => id === branch.messageId);
  if (index === -1) return messages;

  const prefix = messages.slice(0, index);
  return branch.editedMessage ? [...prefix, branch.editedMessage] : prefix;
}

const appliedDesignPart = z.object({
  type: z.literal("tool-designSite"),
  state: z.literal("output-available"),
  input: z.object({ focus: z.string().optional() }).optional(),
  output: z.object({ status: z.literal("success") }),
});

const desktopPreviewPart = z.object({
  type: z.literal("tool-webScrape"),
  state: z.literal("output-available"),
  input: z.object({ url: z.string().regex(/^\/(?!\/)/), viewport: z.literal("desktop"), actions: z.array(z.unknown()).max(0).optional() }),
  output: z.object({ screenshots: z.array(z.object({ url: z.string().startsWith("/api/assets/") })).nonempty() }),
});

/** Evidence from the replaced reply only. A focused edit keeps its design. */
export function replacedDesign(parts: unknown) {
  if (!Array.isArray(parts)) return null;
  let design: { focus: string; screenshot: string | null } | null = null;
  for (const part of parts) {
    if (part?.type === "tool-designSite") {
      const applied = appliedDesignPart.safeParse(part);
      if (applied.success) design = { focus: applied.data.input?.focus ?? "", screenshot: null };
    } else if (design && part?.type === "tool-webScrape") {
      const preview = desktopPreviewPart.safeParse(part);
      if (preview.success) design.screenshot = preview.data.output.screenshots[0]!.url;
    }
  }
  return design;
}
