import { HttpError, requireUserId, route } from "@/lib/http.server";
import prisma from "@/lib/prisma";
import { createAssetDownloadUrl } from "@/lib/storage";

export const GET = route(async (request, { params }: RouteContext<"/api/assets/[assetId]">) => {
  const userId = await requireUserId(request);
  const asset = await prisma.asset.findFirst({
    where: { id: (await params).assetId, status: "READY", project: { userId } },
    select: { objectKey: true },
  });
  if (!asset) throw new HttpError(404, "Asset not found");
  return new Response(null, {
    status: 307,
    headers: {
      Location: await createAssetDownloadUrl(asset.objectKey),
      "Cache-Control": "private, no-store",
    },
  });
});
