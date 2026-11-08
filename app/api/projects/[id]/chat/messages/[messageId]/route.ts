import { HttpError, route } from "@/lib/http.server";
import prisma from "@/lib/prisma";
import { deleteMessageBranch } from "@/lib/project-chat/messages.server";
import { requireProject } from "@/lib/projects/access.server";
import { getRevisionBeforeMessage, publishProjectHead } from "@/lib/projects/source.server";
import { prepareProjectRuntime } from "@/lib/runtime/runtime-service.server";
import { withWorkspace } from "@/lib/runtime/workspace-owner.server";

export const maxDuration = 300;

/** Deletes a user message and every turn after it, returning the files to the version before it. */
export const DELETE = route(async (request, { params }: RouteContext<"/api/projects/[id]/chat/messages/[messageId]">) => {
  const { id, messageId } = await params;
  const project = await requireProject(request, id);
  return withWorkspace(project.id, async (workspaceSignal) => {
    const message = await prisma.chatMessage.findFirst({
      where: { id: messageId, projectId: project.id, role: "USER" },
      select: { id: true, createdAt: true },
    });
    if (!message) throw new HttpError(404, "Message not found");

    const revisionId = await getRevisionBeforeMessage(project.id, message);
    workspaceSignal.throwIfAborted();
    await prisma.$transaction(async (tx) => {
      await deleteMessageBranch(tx, project.id, message, true);
      const head = await tx.project.findUniqueOrThrow({ where: { id: project.id }, select: { currentRevisionId: true } });
      await publishProjectHead(tx, project.id, head.currentRevisionId, revisionId);
    });
    await prepareProjectRuntime(project.id, undefined, AbortSignal.any([workspaceSignal, AbortSignal.timeout(120_000)]))
      .catch(console.error);
    return Response.json({ revisionId });
  });
});
