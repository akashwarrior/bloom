"use client";

import type { FileUIPart } from "ai";

import { getAssetIdFromUrl } from "@/lib/assets";

type PreparedAsset = {
  id: string;
  uploadUrl: string;
  headers: Record<string, string>;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    isObject(value) &&
    Object.values(value).every((entry) => typeof entry === "string")
  );
}

function parsePreparedAssets(value: unknown): PreparedAsset[] | null {
  if (!isObject(value) || !Array.isArray(value.assets)) return null;

  const assets: PreparedAsset[] = [];
  for (const asset of value.assets) {
    if (
      !isObject(asset) ||
      typeof asset.id !== "string" ||
      typeof asset.uploadUrl !== "string" ||
      !URL.canParse(asset.uploadUrl) ||
      !isStringRecord(asset.headers)
    ) {
      return null;
    }

    assets.push({
      id: asset.id,
      uploadUrl: asset.uploadUrl,
      headers: asset.headers,
    });
  }

  return assets;
}

function parseFileParts(value: unknown): FileUIPart[] | null {
  if (!isObject(value) || !Array.isArray(value.files)) return null;

  const files: FileUIPart[] = [];
  for (const file of value.files) {
    if (
      !isObject(file) ||
      file.type !== "file" ||
      typeof file.filename !== "string" ||
      typeof file.mediaType !== "string" ||
      typeof file.url !== "string"
    ) {
      return null;
    }

    files.push({
      type: "file",
      filename: file.filename,
      mediaType: file.mediaType,
      url: file.url,
    });
  }

  return files;
}

async function discardAssetIds(projectId: string, assetIds: string[]) {
  await Promise.allSettled(
    assetIds.map((assetId) =>
      fetch(`/api/projects/${projectId}/assets/${assetId}`, {
        method: "DELETE",
        keepalive: true,
      }),
    ),
  );
}

export async function discardProjectAsset(
  projectId: string,
  file: FileUIPart,
) {
  const assetId = getAssetIdFromUrl(file.url);
  if (!assetId) return;

  const response = await fetch(
    `/api/projects/${projectId}/assets/${assetId}`,
    {
      method: "DELETE",
      keepalive: true,
    },
  );

  if (!response.ok && response.status !== 404) {
    throw new Error("Failed to discard attachment");
  }
}

export async function uploadProjectAssets(
  projectId: string,
  files: File[],
  signal?: AbortSignal,
): Promise<FileUIPart[]> {
  const createResponse = await fetch(`/api/projects/${projectId}/assets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      files: files.map((file) => ({
        filename: file.name,
        mediaType: file.type,
        size: file.size,
      })),
    }),
    signal,
  });

  if (!createResponse.ok) {
    throw new Error("Failed to prepare attachments");
  }

  const preparedAssets = parsePreparedAssets(
    await createResponse.json().catch(() => undefined),
  );
  if (!preparedAssets || preparedAssets.length !== files.length) {
    throw new Error("Invalid attachment upload response");
  }

  const assetIds = preparedAssets.map((asset) => asset.id);
  let completed = false;

  try {
    const uploadResults = await Promise.allSettled(
      preparedAssets.map((asset, index) =>
        fetch(asset.uploadUrl, {
          method: "PUT",
          headers: asset.headers,
          body: files[index],
          signal,
        }),
      ),
    );

    if (
      uploadResults.some(
        (result) => result.status === "rejected" || !result.value.ok,
      )
    ) {
      throw new Error("Failed to upload attachments");
    }

    const finalizeResponse = await fetch(
      `/api/projects/${projectId}/assets`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetIds }),
        signal,
      },
    );

    if (!finalizeResponse.ok) {
      throw new Error("Failed to finalize attachments");
    }

    const finalizedFiles = parseFileParts(
      await finalizeResponse.json().catch(() => undefined),
    );
    if (
      !finalizedFiles ||
      finalizedFiles.length !== files.length ||
      finalizedFiles.some(
        (file, index) =>
          getAssetIdFromUrl(file.url) !== preparedAssets[index].id,
      )
    ) {
      throw new Error("Invalid finalized attachment response");
    }

    completed = true;
    return finalizedFiles;
  } finally {
    if (!completed) {
      await discardAssetIds(projectId, assetIds);
    }
  }
}
