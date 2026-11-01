import type { NextRequest } from "next/server";

import prisma from "@/lib/prisma";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const userId = request.headers.get("user-id") as string;
  const { id } = await context.params;

  const project = await prisma.project.findFirst({
    where: { id, userId },
    select: {
      currentRevisionId: true,
      revisions: {
        where: { authorType: { not: "SYSTEM" } },
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
      },
    },
  });

  if (!project) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  const visibleCurrentRevisionId = project.currentRevisionId
    ? (
      await prisma.projectRevision.findFirst({
        where: {
          id: project.currentRevisionId,
          projectId: id,
          authorType: { not: "SYSTEM" },
        },
        select: { id: true },
      })
    )?.id ?? null
    : null;

  return Response.json({
    currentRevisionId: visibleCurrentRevisionId,
    revisions: project.revisions.map(({ _count, ...revision }) => ({
      ...revision,
      fileCount: _count.files,
    })),
  });
}
