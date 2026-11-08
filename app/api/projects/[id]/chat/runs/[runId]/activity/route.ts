import { HttpError, route } from "@/lib/http.server";
import prisma from "@/lib/prisma";
import { getActivityDetails, type ChatPart } from "@/lib/project-chat/activity";
import { requireProject } from "@/lib/projects/access.server";

export const GET = route(async (request, { params }: RouteContext<"/api/projects/[id]/chat/runs/[runId]/activity">) => {
  const { id, runId } = await params;
  const project = await requireProject(request, id);
  const run = await prisma.chatRun.findFirst({
    where: { id: runId, projectId: project.id, status: { not: "RUNNING" } },
    select: { failedActivity: true, responseMessage: { select: { modelParts: true } } },
  });
  if (!run) throw new HttpError(404, "Run not found");
  const parts = run.responseMessage
    ? getActivityDetails(run.responseMessage.modelParts as ChatPart[], runId)
    : run.failedActivity ?? [];
  return Response.json({ parts }, { headers: { "Cache-Control": "private, no-store" } });
});
