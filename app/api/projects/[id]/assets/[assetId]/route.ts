import { HttpError, route } from "@/lib/http.server";
import prisma from "@/lib/prisma";
import { requireProject } from "@/lib/projects/access.server";
import { discardProjectUpload } from "@/lib/projects/uploads.server";

export const DELETE = route(async (request, { params }: RouteContext<"/api/projects/[id]/assets/[assetId]">) => {
  const { id, assetId } = await params;
  const project = await requireProject(request, id);
  const asset = await prisma.asset.findFirst({
    where: { id: assetId, projectId: project.id, source: "UPLOAD", claimedAt: null, status: { not: "DELETING" } },
    select: { id: true, projectId: true, updatedAt: true, objectKey: true, status: true },
  });
  if (!asset || !(await discardProjectUpload(asset))) throw new HttpError(404, "Asset not found");
  return new Response(null, { status: 204 });
});
