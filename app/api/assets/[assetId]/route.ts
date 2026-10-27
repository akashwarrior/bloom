import type { NextRequest } from "next/server";

import z from "zod/v4";
import prisma from "@/lib/prisma";
import { createAssetDownloadUrl } from "@/lib/storage";
import { AssetStatus } from "@/generated/prisma/enums";

const assetIdSchema = z.uuid();

type RouteContext = {
  params: Promise<{ assetId: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const userId = request.headers.get("user-id") as string;
  const { assetId: rawAssetId } = await context.params;
  const parsedAssetId = assetIdSchema.safeParse(rawAssetId);

  if (!parsedAssetId.success) {
    return Response.json({ error: "Asset not found" }, { status: 404 });
  }

  const asset = await prisma.asset.findFirst({
    where: {
      id: parsedAssetId.data,
      status: AssetStatus.READY,
      project: { userId },
    },
    select: { objectKey: true },
  });

  if (!asset) {
    return Response.json({ error: "Asset not found" }, { status: 404 });
  }

  try {
    const signedUrl = await createAssetDownloadUrl(asset.objectKey);
    return new Response(null, {
      status: 307,
      headers: {
        Location: signedUrl,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Failed to create asset download URL", error);
    return Response.json(
      { error: "Failed to load asset" },
      { status: 500 },
    );
  }
}
