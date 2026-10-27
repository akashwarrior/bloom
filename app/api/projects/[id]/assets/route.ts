import type { NextRequest } from "next/server";
import type { SupportedChatAttachmentType } from "@/lib/chat-attachments";

import { randomUUID } from "node:crypto";
import z from "zod/v4";
import prisma from "@/lib/prisma";
import { getAssetUrl } from "@/lib/assets";
import {
  MAX_CHAT_ATTACHMENTS,
  MAX_CHAT_ATTACHMENT_SIZE,
  MAX_CHAT_ATTACHMENTS_SIZE,
  SUPPORTED_CHAT_ATTACHMENT_TYPES,
} from "@/lib/chat-attachments";
import {
  createAssetObjectKey,
  createAssetUploadUrl,
  validateStoredImage,
} from "@/lib/storage";
import { AssetStatus } from "@/generated/prisma/enums";

const projectIdSchema = z.cuid2();
const assetIdSchema = z.uuid();

const createAssetsSchema = z.strictObject({
  files: z
    .array(
      z.strictObject({
        filename: z.string().trim().min(1).max(255),
        mediaType: z.enum(SUPPORTED_CHAT_ATTACHMENT_TYPES),
        size: z.int().positive().max(MAX_CHAT_ATTACHMENT_SIZE),
      }),
    )
    .min(1)
    .max(MAX_CHAT_ATTACHMENTS),
});

const finalizeAssetsSchema = z.strictObject({
  assetIds: z
    .array(assetIdSchema)
    .min(1)
    .max(MAX_CHAT_ATTACHMENTS)
    .refine((ids) => new Set(ids).size === ids.length),
});

type RouteContext = {
  params: Promise<{ id: string }>;
};

function invalidAttachmentsResponse() {
  return Response.json({ error: "Invalid attachments" }, { status: 400 });
}

function toFilePart(asset: {
  id: string;
  filename: string;
  mediaType: string;
}) {
  return {
    type: "file" as const,
    filename: asset.filename,
    mediaType: asset.mediaType,
    url: getAssetUrl(asset.id),
  };
}

async function getOwnedProject(projectId: string, userId: string) {
  return prisma.project.findFirst({
    where: { id: projectId, userId },
    select: { id: true },
  });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const userId = request.headers.get("user-id") as string;
  const { id: rawProjectId } = await context.params;
  const parsedProjectId = projectIdSchema.safeParse(rawProjectId);

  if (!parsedProjectId.success) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  const projectId = parsedProjectId.data;
  const [project, requestBody] = await Promise.all([
    getOwnedProject(projectId, userId),
    request.json().catch(() => undefined),
  ]);

  if (!project) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  const parsedBody = createAssetsSchema.safeParse(requestBody);
  if (
    !parsedBody.success ||
    parsedBody.data.files.reduce((total, file) => total + file.size, 0) >
      MAX_CHAT_ATTACHMENTS_SIZE
  ) {
    return invalidAttachmentsResponse();
  }

  const assets = parsedBody.data.files.map((file) => {
    const id = randomUUID();
    return {
      ...file,
      id,
      objectKey: createAssetObjectKey(projectId, id, file.mediaType),
    };
  });

  try {
    const uploadUrls = await Promise.all(
      assets.map((asset) =>
        createAssetUploadUrl(asset.objectKey, asset.mediaType, asset.size),
      ),
    );

    await prisma.asset.createMany({
      data: assets.map((asset) => ({
        id: asset.id,
        projectId,
        objectKey: asset.objectKey,
        filename: asset.filename,
        mediaType: asset.mediaType,
        size: asset.size,
      })),
    });

    return Response.json(
      {
        assets: assets.map((asset, index) => ({
          id: asset.id,
          uploadUrl: uploadUrls[index],
          headers: {
            "Content-Type": asset.mediaType,
          },
        })),
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Failed to prepare asset uploads", error);
    return Response.json(
      { error: "Failed to prepare attachments" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const userId = request.headers.get("user-id") as string;
  const { id: rawProjectId } = await context.params;
  const parsedProjectId = projectIdSchema.safeParse(rawProjectId);

  if (!parsedProjectId.success) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  const projectId = parsedProjectId.data;
  const [project, requestBody] = await Promise.all([
    getOwnedProject(projectId, userId),
    request.json().catch(() => undefined),
  ]);

  if (!project) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  const parsedBody = finalizeAssetsSchema.safeParse(requestBody);
  if (!parsedBody.success) {
    return invalidAttachmentsResponse();
  }

  const { assetIds } = parsedBody.data;
  const assets = await prisma.asset.findMany({
    where: {
      id: { in: assetIds },
      projectId,
    },
    select: {
      id: true,
      objectKey: true,
      filename: true,
      mediaType: true,
      size: true,
      status: true,
    },
  });

  if (
    assets.length !== assetIds.length ||
    assets.some(
      (asset) =>
        asset.status !== AssetStatus.PENDING &&
        asset.status !== AssetStatus.READY,
    )
  ) {
    return invalidAttachmentsResponse();
  }

  const pendingAssets = assets.filter(
    (asset) => asset.status === AssetStatus.PENDING,
  );

  try {
    const validatedAssets = await Promise.all(
      pendingAssets.map(async (asset) => {
        const storedImage = await validateStoredImage(
          asset.objectKey,
          asset.mediaType as SupportedChatAttachmentType,
        );
        return { asset, storedImage };
      }),
    );

    const invalidAssets = validatedAssets.filter(
      ({ storedImage }) =>
        !storedImage || storedImage.size > MAX_CHAT_ATTACHMENT_SIZE,
    );

    const mismatchedAssets = validatedAssets.filter(
      ({ asset, storedImage }) =>
        storedImage && storedImage.size !== asset.size,
    );

    const totalSize =
      assets
        .filter((asset) => asset.status === AssetStatus.READY)
        .reduce((total, asset) => total + asset.size, 0) +
      validatedAssets.reduce(
        (total, { storedImage }) => total + (storedImage?.size ?? 0),
        0,
      );

    if (
      invalidAssets.length > 0 ||
      mismatchedAssets.length > 0 ||
      totalSize > MAX_CHAT_ATTACHMENTS_SIZE
    ) {
      const failedAssetIds = [
        ...new Set(
          [...invalidAssets, ...mismatchedAssets].map(
            ({ asset }) => asset.id,
          ),
        ),
      ];
      if (failedAssetIds.length > 0) {
        await prisma.asset.updateMany({
          where: {
            id: { in: failedAssetIds },
            projectId,
          },
          data: { status: AssetStatus.FAILED },
        });
      }
      return invalidAttachmentsResponse();
    }

    await prisma.$transaction(
      validatedAssets.map(({ asset, storedImage }) =>
        prisma.asset.update({
          where: {
            id: asset.id,
            projectId,
            status: AssetStatus.PENDING,
            claimedAt: null,
          },
          data: {
            size: storedImage!.size,
            status: AssetStatus.READY,
          },
        }),
      ),
    );

    const assetById = new Map(assets.map((asset) => [asset.id, asset]));
    return Response.json({
      files: assetIds.map((assetId) => toFilePart(assetById.get(assetId)!)),
    });
  } catch (error) {
    console.error("Failed to finalize asset uploads", error);
    return Response.json(
      { error: "Attachments are not ready" },
      { status: 409 },
    );
  }
}
