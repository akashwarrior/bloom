import type { NextRequest } from "next/server";

import prisma from "@/lib/prisma";
import { checkoutProjectRevision } from "@/lib/project-source.server";

type RouteContext = {
  params: Promise<{ id: string; revisionId: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const userId = request.headers.get("user-id") as string;
  const { id, revisionId } = await context.params;

  const project = await prisma.project.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (!project) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  try {
    const revision = await checkoutProjectRevision({
      projectId: id,
      revisionId,
    });
    return Response.json(revision);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to restore version";
    return Response.json({ error: message }, { status: 409 });
  }
}
