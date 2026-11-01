import "server-only";

import { randomUUID } from "node:crypto";

import { AssetSource, AssetStatus } from "@/generated/prisma/enums";
import {
  getAssetIdFromUrl,
  getAssetUrl,
  IMAGE_FILE_EXTENSIONS,
  MAX_CHAT_ATTACHMENT_SIZE,
  type SupportedChatAttachmentType,
} from "@/lib/assets";
import prisma from "@/lib/prisma";
import {
  createAssetObjectKey,
  deleteStoredObjects,
  getAssetObjectBytes,
  putAssetObject,
} from "@/lib/storage";

const PROJECT_GENERATED_ASSET_DIRECTORY = "bloom-generated-assets";

export type ProjectGeneratedImageMediaType =
  keyof typeof IMAGE_FILE_EXTENSIONS;

function isProjectGeneratedImageMediaType(
  mediaType: string,
): mediaType is ProjectGeneratedImageMediaType {
  return Object.hasOwn(IMAGE_FILE_EXTENSIONS, mediaType);
}

function generatedProjectAssetPaths(
  assetId: string,
  mediaType: ProjectGeneratedImageMediaType,
) {
  const filename = `${assetId}.${IMAGE_FILE_EXTENSIONS[mediaType]}`;
  return {
    projectPath: `public/${PROJECT_GENERATED_ASSET_DIRECTORY}/${filename}`,
    localPath: `/${PROJECT_GENERATED_ASSET_DIRECTORY}/${filename}`,
  };
}

type GeneratedImageInput = {
  projectId: string;
  filename: string;
  mediaType: SupportedChatAttachmentType;
  bytes: Uint8Array;
  cacheKey?: string;
};

export async function storeGeneratedImageAsset({
  projectId,
  filename,
  mediaType,
  bytes,
  cacheKey,
}: GeneratedImageInput) {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_CHAT_ATTACHMENT_SIZE) {
    throw new Error("Generated image exceeds the supported asset size");
  }

  const id = randomUUID();
  const objectKey = createAssetObjectKey(projectId, id, mediaType);
  await putAssetObject(objectKey, mediaType, bytes);

  try {
    await prisma.asset.create({
      data: {
        id,
        projectId,
        objectKey,
        filename,
        mediaType,
        size: bytes.byteLength,
        source: AssetSource.GENERATED,
        status: AssetStatus.READY,
        claimedAt: new Date(),
        cacheKey,
      },
    });
  } catch (error) {
    await deleteStoredObjects([objectKey]).catch(() => undefined);
    throw error;
  }

  return {
    id,
    url: getAssetUrl(id),
    filename,
    mediaType,
    size: bytes.byteLength,
  };
}

export async function findGeneratedProjectAsset({
  projectId,
  cacheKey,
}: {
  projectId: string;
  cacheKey: string;
}) {
  const asset = await prisma.asset.findFirst({
    where: {
      projectId,
      source: AssetSource.GENERATED,
      status: AssetStatus.READY,
      cacheKey,
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      filename: true,
      mediaType: true,
      size: true,
    },
  });

  if (!asset || !isProjectGeneratedImageMediaType(asset.mediaType)) return null;
  return {
    assetId: asset.id,
    previewUrl: getAssetUrl(asset.id),
    filename: asset.filename,
    mediaType: asset.mediaType,
    size: asset.size,
    ...generatedProjectAssetPaths(asset.id, asset.mediaType),
  };
}

export async function storeGeneratedProjectAsset({
  projectId,
  cacheKey,
  suggestedName,
  mediaType,
  bytes,
}: {
  projectId: string;
  cacheKey: string;
  suggestedName: string;
  mediaType: ProjectGeneratedImageMediaType;
  bytes: Uint8Array;
}) {
  if (!/^[a-f0-9]{24}$/.test(cacheKey)) {
    throw new Error("Generated asset cache key is invalid");
  }

  const stored = await storeGeneratedImageAsset({
    projectId,
    filename: `${suggestedName}.${IMAGE_FILE_EXTENSIONS[mediaType]}`,
    mediaType,
    bytes,
    cacheKey,
  });

  return {
    assetId: stored.id,
    previewUrl: stored.url,
    filename: stored.filename,
    mediaType,
    size: stored.size,
    ...generatedProjectAssetPaths(stored.id, mediaType),
  };
}

export async function generatedProjectRuntimeFiles(projectId: string, assetIds?: string[]) {
  const assets = await prisma.asset.findMany({
    where: {
      projectId,
      ...(assetIds ? { id: { in: assetIds } } : {}),
      source: AssetSource.GENERATED,
      status: AssetStatus.READY,
      cacheKey: { not: null },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      objectKey: true,
      mediaType: true,
    },
  });

  return Promise.all(
    assets.flatMap((asset) =>
      isProjectGeneratedImageMediaType(asset.mediaType)
        ? [{ ...asset, mediaType: asset.mediaType }]
        : [],
    ).map(async (asset) => ({
      path: generatedProjectAssetPaths(asset.id, asset.mediaType).projectPath,
      content: Buffer.from(
        await getAssetObjectBytes(asset.objectKey),
      ).toString("base64"),
      encoding: "base64" as const,
    })),
  );
}

export async function resolveGeneratedImageForModel(
  projectId: string,
  assetUrl: string,
  allowUploadedImage = false,
) {
  const assetId = getAssetIdFromUrl(assetUrl);
  if (!assetId) throw new Error("Generated image has an invalid asset URL");

  const asset = await prisma.asset.findFirst({
    where: {
      id: assetId,
      projectId,
      source: allowUploadedImage ? undefined : AssetSource.GENERATED,
      mediaType: { in: Object.keys(IMAGE_FILE_EXTENSIONS) },
      status: AssetStatus.READY,
    },
    select: {
      objectKey: true,
      filename: true,
      mediaType: true,
    },
  });

  if (!asset) throw new Error("Generated image is unavailable");

  return {
    assetId,
    filename: asset.filename,
    mediaType: asset.mediaType,
    data: await getAssetObjectBytes(asset.objectKey),
  };
}
