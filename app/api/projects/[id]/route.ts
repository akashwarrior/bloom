import { z } from "zod";

import { parseJson, route } from "@/lib/http.server";
import prisma from "@/lib/prisma";
import { projectSummarySelect, requireProject } from "@/lib/projects/access.server";
import { clearRuntimeRevision, removeProjectRuntime } from "@/lib/runtime/runtime-service.server";
import { withWorkspace } from "@/lib/runtime/workspace-owner.server";
import { deleteStoredObjects } from "@/lib/storage";

const renameSchema = z.strictObject({
  title: z.string().trim().min(1).max(120),
});

export const PATCH = route(async (request, { params }: RouteContext<"/api/projects/[id]">) => {
  const project = await requireProject(request, (await params).id);
  const { title } = await parseJson(request, renameSchema);
  const updated = await prisma.project.update({
    where: { id: project.id },
    data: { title },
    select: projectSummarySelect,
  });
  return Response.json(updated);
});

export const DELETE = route(async (request, { params }: RouteContext<"/api/projects/[id]">) => {
  const project = await requireProject(request, (await params).id);
  return withWorkspace(project.id, async (signal) => {
    const { assets, fileBlobs } = await prisma.project.findUniqueOrThrow({
      where: { id: project.id },
      select: { assets: { select: { objectKey: true } }, fileBlobs: { select: { objectKey: true } } },
    });
    signal.throwIfAborted();
    await removeProjectRuntime(project.id);
    signal.throwIfAborted();
    await prisma.$transaction([
      // File blobs deliberately use RESTRICT so a referenced blob cannot be
      // removed accidentally. Clear this project's revision links first so
      // the project cascade can then remove both revisions and blobs safely.
      prisma.revisionFile.deleteMany({ where: { revision: { projectId: project.id } } }),
      prisma.project.delete({ where: { id: project.id } }),
    ]);
    await deleteStoredObjects([...assets, ...fileBlobs].map(({ objectKey }) => objectKey))
      .catch((error) => console.error("Failed to delete project objects", error));
    clearRuntimeRevision(project.id);
    return new Response(null, { status: 204 });
  });
});
