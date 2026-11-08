import { z } from "zod";

import { HttpError, parseJson, route } from "@/lib/http.server";
import prisma from "@/lib/prisma";
import { activeChatRun } from "@/lib/project-chat/runs.server";
import { requireProject } from "@/lib/projects/access.server";

const stopSchema = z.strictObject({ runId: z.uuid() });

export const POST = route(async (request, { params }: RouteContext<"/api/projects/[id]/chat/stop">) => {
  const project = await requireProject(request, (await params).id);
  const { runId } = await parseJson(request, stopSchema, "Invalid run ID");
  const updated = await prisma.chatRun.updateMany({
    where: { id: runId, projectId: project.id, status: "RUNNING", leaseExpiresAt: { gt: new Date() } },
    data: { stopRequestedAt: new Date() },
  });
  if (!updated.count) throw new HttpError(409, "This run has already ended.");
  const active = activeChatRun(project.id);
  if (active?.runId === runId) active.controller.abort();
  return new Response(null, { status: 204 });
});
