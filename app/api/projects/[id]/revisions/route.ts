import { route } from "@/lib/http.server";
import prisma from "@/lib/prisma";
import { requireProject } from "@/lib/projects/access.server";

export const GET = route(async (request, { params }: RouteContext<"/api/projects/[id]/revisions">) => {
  const project = await requireProject(request, (await params).id);
  const revisions = await prisma.projectRevision.findMany({
    where: { projectId: project.id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 100,
    select: {
      id: true,
      parentRevisionId: true,
      authorType: true,
      summary: true,
      createdAt: true,
      _count: { select: { files: true } },
    },
  });
  return Response.json({
    currentRevisionId: project.currentRevisionId,
    revisions: revisions.map(({ _count, ...revision }) => ({ ...revision, fileCount: _count.files })),
  });
});
