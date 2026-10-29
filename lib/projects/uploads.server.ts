import "server-only";

import { randomUUID } from "node:crypto";

import { AssetSource, AssetStatus } from "@/generated/prisma/enums";
import type { Asset } from "@/generated/prisma/client";
import {
  getAssetUrl,
  MAX_CHAT_ATTACHMENT_SIZE,
  MAX_CHAT_ATTACHMENTS_SIZE,
  type SupportedChatAttachmentType,
} from "@/lib/assets";
import prisma from "@/lib/prisma";
import {
  createAssetObjectKey,
  createAssetUploadUrl,
  deleteStoredObjects,
  validateStoredAttachment,
} from "@/lib/storage";

const staleAfterMs = 24 * 60 * 60 * 1_000;

export async function discardProjectUpload(
  asset: Pick<Asset, "id" | "projectId" | "objectKey" | "status" | "updatedAt">,
) {
  const where = {
    id: asset.id,
    projectId: asset.projectId,
    source: AssetSource.UPLOAD,
    claimedAt: null,
  };
  const reserved = await prisma.asset.updateMany({
    where: { ...where, status: asset.status, updatedAt: asset.updatedAt },
    data: { status: AssetStatus.DELETING },
  });
  if (!reserved.count) return false;
  try {
    await deleteStoredObjects([asset.objectKey]);
  } catch (error) {
    await prisma.asset.updateMany({
      where: { ...where, status: AssetStatus.DELETING },
      data: { status: AssetStatus.FAILED },
    }).catch(() => undefined);
    throw error;
  }
  await prisma.asset.deleteMany({ where: { ...where, status: AssetStatus.DELETING } });
  return true;
}

export async function expireProjectUploads(projectId: string) {
  const assets = await prisma.asset.findMany({
    where: {
      projectId,
      source: AssetSource.UPLOAD,
      claimedAt: null,
      updatedAt: { lt: new Date(Date.now() - staleAfterMs) },
    },
    orderBy: { updatedAt: "asc" },
    take: 8,
    select: { id: true, projectId: true, objectKey: true, status: true, updatedAt: true },
  });
  await Promise.allSettled(assets.map(discardProjectUpload));
}

type UploadRequest = { filename: string; mediaType: SupportedChatAttachmentType; size: number };

/** Reserves pending assets and returns a signed upload URL for each. */
export async function createProjectUploads(projectId: string, files: UploadRequest[]) {
  const assets = files.map((file) => {
    const id = randomUUID();
    return { ...file, id, objectKey: createAssetObjectKey(projectId, id, file.mediaType) };
  });
  const uploadUrls = await Promise.all(
    assets.map((asset) => createAssetUploadUrl(asset.objectKey, asset.mediaType, asset.size)),
  );
  await prisma.asset.createMany({
    data: assets.map(({ id, objectKey, filename, mediaType, size }) => ({
      id, projectId, objectKey, filename, mediaType, size,
    })),
  });
  return assets.map((asset, index) => ({
    id: asset.id,
    uploadUrl: uploadUrls[index],
    headers: { "Content-Type": asset.mediaType },
  }));
}

/**
 * Checks each uploaded object against what was reserved (type signature, size, total size) and marks
 * the assets ready. Returns null, marking bad uploads failed, when any of them does not match.
 */
export async function finalizeProjectUploads(projectId: string, assetIds: string[]) {
  const assets = await prisma.asset.findMany({
    where: { id: { in: assetIds }, projectId },
    select: { id: true, objectKey: true, filename: true, mediaType: true, size: true, status: true },
  });
  if (assets.length !== assetIds.length ||
      assets.some((asset) => asset.status !== AssetStatus.PENDING && asset.status !== AssetStatus.READY)) {
    return null;
  }

  const pending = await Promise.all(
    assets
      .filter((asset) => asset.status === AssetStatus.PENDING)
      .map(async (asset) => ({
        asset,
        stored: await validateStoredAttachment(asset.objectKey, asset.mediaType as SupportedChatAttachmentType),
      })),
  );
  const failedIds = pending
    .filter(({ asset, stored }) => !stored || stored.size > MAX_CHAT_ATTACHMENT_SIZE || stored.size !== asset.size)
    .map(({ asset }) => asset.id);
  const totalSize = assets
    .filter((asset) => asset.status === AssetStatus.READY)
    .reduce((total, asset) => total + asset.size, 0) +
    pending.reduce((total, { stored }) => total + (stored?.size ?? 0), 0);

  if (failedIds.length || totalSize > MAX_CHAT_ATTACHMENTS_SIZE) {
    if (failedIds.length) {
      await prisma.asset.updateMany({
        where: { id: { in: failedIds }, projectId, status: AssetStatus.PENDING, claimedAt: null },
        data: { status: AssetStatus.FAILED },
      });
    }
    return null;
  }

  await prisma.$transaction(pending.map(({ asset, stored }) =>
    prisma.asset.update({
      where: { id: asset.id, projectId, status: AssetStatus.PENDING, claimedAt: null },
      data: { size: stored!.size, status: AssetStatus.READY },
    }),
  ));

  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  return assetIds.map((id) => {
    const { filename, mediaType, size } = byId.get(id)!;
    return { type: "file" as const, filename, mediaType, url: getAssetUrl(id), size };
  });
}
