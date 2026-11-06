import "server-only";
import { safeValidateUIMessages } from "ai";
import { ChatMessageRole } from "@/generated/prisma/enums";
import { Prisma } from "@/generated/prisma/client";
import type { MessageBoundary } from "@/ai/context/checkpoint";
import { metadataSchema } from "@/ai/message/metadata";
import { dataPartSchemas } from "@/ai/message/data-part";
import { getAssetIdFromUrl } from "@/lib/assets";
import { getMessageFiles, visibleAssistantParts } from "@/lib/project-chat/message";
import prisma from "@/lib/prisma";

import { getChatBranch, submissionSchema } from "./branch";
import type { ProjectChatMessage } from "./protocol";

export async function getProjectMessages(
  projectId: string,
  userId: string,
  db: Prisma.TransactionClient,
  before?: MessageBoundary,
): Promise<ProjectChatMessage[]> {
  const messages = await db.chatMessage.findMany({
    where: {
      projectId,
      project: { userId },
      ...(before ? messageBoundaryFilter(before, "before") : {}),
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, role: true, parts: true, metadata: true },
  });

  return messages.map((row) => {
    const message = toProjectChatMessage(row);
    return message.role === "assistant" ? { ...message, parts: visibleAssistantParts(message.parts) } : message;
  });
}

export function getInitialProjectMessages(projectId: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const run = await tx.chatRun.findFirst({
      where: {
        projectId,
        project: { userId },
        status: "RUNNING",
        leaseExpiresAt: { gt: new Date() },
      },
      select: {
        submission: true,
        targetMessage: { select: { id: true, projectId: true, createdAt: true } },
      },
    });
    const submission = submissionSchema.safeParse(run?.submission);
    const branch = submission.success ? getChatBranch(submission.data) : undefined;
    const target = run?.targetMessage;
    if (!branch || target?.id !== branch.messageId || target.projectId !== projectId) {
      return getProjectMessages(projectId, userId, tx);
    }

    const prefix = await getProjectMessages(projectId, userId, tx, target);
    return branch.editedMessage ? [...prefix, branch.editedMessage] : prefix;
  }, { isolationLevel: "RepeatableRead" });
}

export const storedMessageSelect = {
  id: true,
  role: true,
  parts: true,
  metadata: true,
  modelParts: true,
} as const;

export function messageBoundaryFilter(
  boundary: MessageBoundary,
  direction: "before" | "after",
) {
  const before = direction === "before";

  return {
    OR: [
      { createdAt: before ? { lt: boundary.createdAt } : { gt: boundary.createdAt } },
      {
        createdAt: boundary.createdAt,
        id: before ? { lt: boundary.id } : { gt: boundary.id },
      },
    ],
  };
}

export function messageAssetIds(messages: ProjectChatMessage[]) {
  return [
    ...new Set(
      messages.flatMap((message) =>
        getMessageFiles(message).flatMap((part) => {
          const assetId = getAssetIdFromUrl(part.url);
          return assetId ? [assetId] : [];
        }),
      ),
    ),
  ];
}

export async function deleteMessageBranch(
  tx: Prisma.TransactionClient,
  projectId: string,
  boundary: MessageBoundary,
  includeBoundary: boolean,
) {
  await tx.chatMessage.deleteMany({
    where: {
      projectId,
      OR: [
        ...(includeBoundary ? [{ id: boundary.id }] : []),
        ...messageBoundaryFilter(boundary, "after").OR,
      ],
    },
  });
  // An edited message keeps its row, so the attempts made on its earlier text are detached here.
  if (!includeBoundary) {
    await tx.chatRun.updateMany({
      where: { projectId, targetMessageId: boundary.id, status: { in: ["FAILED", "STOPPED"] } },
      data: { targetMessageId: null },
    });
  }
  // The message relation clears retry targets when their branch is removed.
  await tx.chatRun.updateMany({
    where: { projectId, targetMessageId: null, submission: { not: Prisma.DbNull } },
    data: { submission: Prisma.DbNull },
  });
}

function toProjectChatMessage(row: { id: string; role: ChatMessageRole; parts: unknown; metadata: unknown }): ProjectChatMessage {
  const parts = row.parts as ProjectChatMessage["parts"];
  return {
    id: row.id,
    role: row.role === ChatMessageRole.USER ? "user" : "assistant",
    parts,
    ...(row.metadata != null ? { metadata: row.metadata as ProjectChatMessage["metadata"] } : {}),
  };
}

export async function parseStoredMessages(
  rows: (Parameters<typeof toProjectChatMessage>[0] & { modelParts?: unknown })[],
  errorMessage: string,
): Promise<ProjectChatMessage[]> {
  // Branch and checkpoint boundaries can leave no messages to validate.
  if (rows.length === 0) return [];
  const validation = await safeValidateUIMessages<ProjectChatMessage>({
    messages: rows.map(row => toProjectChatMessage({ ...row, parts: row.modelParts ?? row.parts })),
    metadataSchema,
    dataSchemas: dataPartSchemas,
  });
  if (!validation.success) throw new Error(errorMessage);
  return validation.data;
}

export async function getCanonicalMessages(
  projectId: string,
  options: {
    role?: ChatMessageRole;
    latest?: boolean;
    before?: MessageBoundary;
    after?: MessageBoundary;
    errorMessage: string;
  },
): Promise<ProjectChatMessage[]> {
  const { role, before, after, errorMessage, latest } = options;
  const order = latest ? "desc" : "asc";
  const storedMessages = await prisma.chatMessage.findMany({
    where: {
      projectId,
      ...(role ? { role } : {}),
      ...((before || after)
        ? {
          AND: [
            ...(before
              ? [messageBoundaryFilter(before, "before")]
              : []),
            ...(after ? [messageBoundaryFilter(after, "after")] : []),
          ],
        }
        : {}),
    },
    orderBy: [{ createdAt: order }, { id: order }],
    ...(latest ? { take: 1 } : {}),
    select: storedMessageSelect,
  });

  return parseStoredMessages(storedMessages, errorMessage);
}
