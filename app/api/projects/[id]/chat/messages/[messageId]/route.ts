import type { NextRequest } from "next/server";

import { z } from "zod/v4";
import prisma from "@/lib/prisma";
import { getRevisionBeforeMessage } from "@/lib/project-source.server";

const projectIdSchema = z.cuid2();
const messageIdSchema = z.string().trim().min(1).max(128);

type RouteContext = {
  params: Promise<{
    id: string;
    messageId: string;
  }>;
};

export async function DELETE(request: NextRequest, context: RouteContext) {
  const userId = request.headers.get("user-id") as string;
  const params = await context.params;
  const parsedProjectId = projectIdSchema.safeParse(params.id);
  const parsedMessageId = messageIdSchema.safeParse(params.messageId);

  if (!parsedProjectId.success || !parsedMessageId.success) {
    return Response.json({ error: "Message not found" }, { status: 404 });
  }

  const projectId = parsedProjectId.data;
  const messageId = parsedMessageId.data;

  const message = await prisma.chatMessage.findFirst({
    where: {
      id: messageId,
      projectId,
      role: "USER",
      project: { userId },
    },
    select: {
      id: true,
      createdAt: true,
    },
  });

  if (!message) {
    return Response.json({ error: "Message not found" }, { status: 404 });
  }

  const revisionToRestore = await getRevisionBeforeMessage(projectId, message);

  await prisma.$transaction([
    prisma.chatMessage.deleteMany({
      where: {
        projectId,
        OR: [
          { id: message.id },
          { createdAt: { gt: message.createdAt } },
          {
            createdAt: message.createdAt,
            id: { gt: message.id },
          },
        ],
      },
    }),
    prisma.project.update({
      where: { id: projectId, userId },
      data: {
        currentRevisionId: revisionToRestore,
        updatedAt: new Date(),
      },
    }),
  ]);

  return new Response(null, { status: 204 });
}
