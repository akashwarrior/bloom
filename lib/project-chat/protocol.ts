import type { UIMessage } from "ai";
import type { DataPart } from "@/ai/message/data-part";
import type { Metadata } from "@/ai/message/metadata";
import type { ToolSet } from "@/ai/tools";
import type { ChatRunStatus } from "@/generated/prisma/enums";

export type ProjectChatMessage = UIMessage<Metadata, DataPart, ToolSet>;

export type ChatRun = {
  id: string;
  requestId: string;
  status: ChatRunStatus;
  error: string | null;
  resultRevisionId: string | null;
  canRetry: boolean;
  startedAt: number;
  finishedAt: number | null;
};

export type FailedChatRun = Pick<ChatRun, "id" | "startedAt" | "status" | "error"> & {
  targetMessageId: string;
  finishedAt: number;
};

export type ProjectChatSnapshot = {
  run: ChatRun | null;
  failedRuns: FailedChatRun[];
  revisionId: string | null;
  messages?: ProjectChatMessage[];
};
