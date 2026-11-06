import "server-only";

import type { ModelMessage } from "ai";

import prisma from "@/lib/prisma";
import {
  getAssetIdFromUrl,
  getAssetUrl,
  MAX_CHAT_ATTACHMENTS,
  MAX_CHAT_ATTACHMENTS_SIZE,
  isSupportedChatAttachmentType,
} from "@/lib/assets";
import { getAssetObjectBytes } from "@/lib/storage";
import { modelAssetFilename } from "@/ai/context/asset-reference";
import { AssetStatus } from "@/generated/prisma/enums";
import { messageAssetIds } from "@/lib/project-chat/messages.server";
import type { ProjectChatMessage } from "@/lib/project-chat/protocol";

export async function normalizeSubmittedMessageAssets(
  projectId: string,
  message: ProjectChatMessage,
): Promise<ProjectChatMessage | null> {
  const fileParts = message.parts.filter((part) => part.type === "file");
  if (fileParts.length === 0) return message;
  if (fileParts.length > MAX_CHAT_ATTACHMENTS) return null;

  const assetIds = fileParts.map((part) => getAssetIdFromUrl(part.url));
  if (
    assetIds.some((assetId) => !assetId) ||
    new Set(assetIds).size !== assetIds.length
  ) {
    return null;
  }

  const trustedAssetIds = assetIds as string[];
  const assets = await prisma.asset.findMany({
    where: {
      id: { in: trustedAssetIds },
      projectId,
      status: AssetStatus.READY,
    },
    select: {
      id: true,
      filename: true,
      mediaType: true,
      size: true,
    },
  });

  if (
    assets.length !== trustedAssetIds.length ||
    assets.some((asset) => !isSupportedChatAttachmentType(asset.mediaType)) ||
    assets.reduce((total, asset) => total + asset.size, 0) >
    MAX_CHAT_ATTACHMENTS_SIZE
  ) {
    return null;
  }

  const assetById = new Map(assets.map((asset) => [asset.id, asset]));
  return {
    ...message,
    parts: message.parts.map((part) => {
      if (part.type !== "file") return part;

      const assetId = getAssetIdFromUrl(part.url)!;
      const asset = assetById.get(assetId)!;
      return {
        ...part,
        url: getAssetUrl(asset.id),
        filename: asset.filename,
        mediaType: asset.mediaType,
        size: asset.size,
      };
    }),
  };
}

type ResolvedModelAsset = {
  id: string;
  bytes: Uint8Array;
  filename: string;
  mediaType: string;
};

export type ResolvedMessageAssets = {
  messages: ProjectChatMessage[];
  assetsByModelUrl: Map<string, ResolvedModelAsset>;
};

function modelAssetUrl(assetId: string) {
  return `https://bloom.local-asset.invalid/${assetId}`;
}

export async function resolveMessageAssetsForModel(
  projectId: string,
  messages: ProjectChatMessage[],
): Promise<ResolvedMessageAssets> {
  const assetIds = messageAssetIds(messages);

  if (assetIds.length === 0) {
    return { messages, assetsByModelUrl: new Map() };
  }

  const assets = await prisma.asset.findMany({
    where: {
      id: { in: assetIds },
      projectId,
      status: AssetStatus.READY,
    },
    select: {
      id: true,
      objectKey: true,
      filename: true,
      mediaType: true,
    },
  });

  if (assets.length !== assetIds.length) {
    throw new Error("A stored message references an unavailable asset");
  }

  const hydratedAssets = await Promise.all(
    assets.map(async (asset) => ({
      ...asset,
      modelUrl: modelAssetUrl(asset.id),
      bytes: await getAssetObjectBytes(asset.objectKey),
    })),
  );
  const assetById = new Map(hydratedAssets.map((asset) => [asset.id, asset]));
  const assetsByModelUrl = new Map(
    hydratedAssets.map((asset) => [
      asset.modelUrl,
      {
        id: asset.id,
        bytes: asset.bytes,
        filename: asset.filename,
        mediaType: asset.mediaType,
      },
    ]),
  );

  return {
    messages: messages.map((message) => ({
      ...message,
      parts: message.parts.map((part) => {
        if (part.type !== "file") return part;

        const assetId = getAssetIdFromUrl(part.url);
        if (!assetId) return part;

        const asset = assetById.get(assetId)!;
        return {
          ...part,
          url: asset.modelUrl,
          filename: modelAssetFilename(asset.id, asset.filename),
          mediaType: asset.mediaType,
        };
      }),
    })),
    assetsByModelUrl,
  };
}

export function hydrateModelMessageAssets(
  messages: ModelMessage[],
  assetsByModelUrl: Map<string, ResolvedModelAsset>,
): ModelMessage[] {
  if (assetsByModelUrl.size === 0) return messages;

  return messages.map((message) => {
    if (
      (message.role !== "user" && message.role !== "assistant") ||
      !Array.isArray(message.content)
    ) {
      return message;
    }

    return {
      ...message,
      content: message.content.map((part) => {
        if (
          part.type !== "file" ||
          typeof part.data !== "object" ||
          part.data === null ||
          !("type" in part.data) ||
          part.data.type !== "url" ||
          !("url" in part.data) ||
          !(part.data.url instanceof URL)
        ) {
          return part;
        }

        const asset = assetsByModelUrl.get(part.data.url.toString());
        if (!asset) return part;

        return {
          ...part,
          data: { type: "data" as const, data: asset.bytes },
          filename: modelAssetFilename(asset.id, asset.filename),
          mediaType: asset.mediaType,
        };
      }),
    } as ModelMessage;
  });
}
