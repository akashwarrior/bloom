import type { ProjectChatMessage } from "./protocol";

export type ChatPart = ProjectChatMessage["parts"][number];
export type ActivityMarker = Extract<ChatPart, { type: "data-activity" }>;

export function isActivityDetail(part: ChatPart) {
  return (part.type.startsWith("tool-") && part.type !== "tool-requestUserInput") ||
    part.type === "dynamic-tool" || part.type === "data-shell" ||
    part.type === "data-file-changes" || part.type === "data-asset-progress" ||
    part.type === "data-context-compaction";
}

export function getRunParts(parts: ChatPart[], runId: string) {
  const start = parts.findIndex(part => part.type === "data-activity" && part.data.runId === runId);
  if (start < 0) return [];
  const next = parts.findIndex((part, index) => index > start && part.type === "data-activity");
  return parts.slice(start + 1, next < 0 ? undefined : next);
}

export function getActivityDetails(parts: ChatPart[], runId: string) {
  return getRunParts(parts, runId).filter(isActivityDetail);
}
