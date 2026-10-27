import type { NextRequest } from "next/server";

import z from "zod/v4";
import prisma from "@/lib/prisma";
import { deleteStoredObjects } from "@/lib/storage";
import { AssetStatus } from "@/generated/prisma/enums";

const projectIdSchema = z.cuid2();
const assetIdSchema = z.uuid();

type RouteContext = {
  params: Promise<{ id: string; assetId: string }>;
};

export async function DELETE(request: NextRequest, context: RouteContext) {
  const userId = request.headers.get("user-id") as string;
  const { id: rawProjectId, assetId: rawAssetId } = await context.params;
  const parsedProjectId = projectIdSchema.safeParse(rawProjectId);
  const parsedAssetId = assetIdSchema.safeParse(rawAssetId);

  if (!parsedProjectId.success || !parsedAssetId.success) {
    return Response.json({ error: "Asset not found" }, { status: 404 });
  }

  const asset = await prisma.asset.findFirst({
    where: {
      id: parsedAssetId.data,
      projectId: parsedProjectId.data,
      claimedAt: null,
      project: { userId },
    },
    select: {
      id: true,
      objectKey: true,
      status: true,
    },
  });

  if (!asset || asset.status === AssetStatus.DELETING) {
    return Response.json({ error: "Asset not found" }, { status: 404 });
  }

  const reserved = await prisma.asset.updateMany({
    where: {
      id: asset.id,
      projectId: parsedProjectId.data,
      claimedAt: null,
      status: asset.status,
    },
    data: { status: AssetStatus.DELETING },
  });

  if (reserved.count !== 1) {
    return Response.json({ error: "Asset not found" }, { status: 404 });
  }

  try {
    await deleteStoredObjects([asset.objectKey]);
    await prisma.asset.deleteMany({
      where: {
        id: asset.id,
        projectId: parsedProjectId.data,
        claimedAt: null,
        status: AssetStatus.DELETING,
      },
    });
    return new Response(null, { status: 204 });
  } catch (error) {
    await prisma.asset
      .updateMany({
        where: {
          id: asset.id,
          projectId: parsedProjectId.data,
          claimedAt: null,
          status: AssetStatus.DELETING,
        },
        data: { status: asset.status },
      })
      .catch(() => undefined);

    console.error("Failed to delete asset", error);
    return Response.json(
      { error: "Failed to delete asset" },
      { status: 500 },
    );
  }
}
