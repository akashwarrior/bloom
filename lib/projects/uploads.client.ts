"use client";

import {
  getAssetIdFromUrl,
  type ChatFilePart,
} from "@/lib/assets";

type PreparedAsset = {
  id: string;
  uploadUrl: string;
  headers: Record<string, string>;
};

export type UploadProjectAssetsOptions = {
  signal?: AbortSignal;
  onProgress?: (progress: number) => void;
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

function parseFileParts(value: unknown): ChatFilePart[] | null {
  if (!isObject(value) || !Array.isArray(value.files)) return null;

  const files: ChatFilePart[] = [];
  for (const file of value.files) {
    if (
      !isObject(file) ||
      file.type !== "file" ||
      typeof file.filename !== "string" ||
      typeof file.mediaType !== "string" ||
      typeof file.url !== "string" ||
      (file.size !== undefined &&
        (typeof file.size !== "number" ||
          !Number.isFinite(file.size) ||
          file.size < 0))
    ) {
      return null;
    }

    files.push({
      type: "file",
      filename: file.filename,
      mediaType: file.mediaType,
      url: file.url,
      ...(typeof file.size === "number" ? { size: file.size } : {}),
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

function uploadWithProgress(
  url: string,
  headers: Record<string, string>,
  file: File,
  signal: AbortSignal | undefined,
  onProgress: (loaded: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    let settled = false;

    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", abort);
      callback();
    };
    const abort = () => {
      request.abort();
      finish(() =>
        reject(new DOMException("Upload aborted", "AbortError")),
      );
    };

    request.open("PUT", url);
    for (const [name, value] of Object.entries(headers)) {
      request.setRequestHeader(name, value);
    }
    request.upload.onprogress = (event) => {
      if (settled || !event.lengthComputable) return;
      onProgress(event.loaded);
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        finish(resolve);
      } else {
        finish(() =>
          reject(new Error(`Attachment upload failed (${request.status})`)),
        );
      }
    };
    request.onerror = () => {
      finish(() => reject(new Error("Failed to upload attachments")));
    };
    request.onabort = () => {
      finish(() =>
        reject(new DOMException("Upload aborted", "AbortError")),
      );
    };

    if (signal?.aborted) {
      finish(() =>
        reject(new DOMException("Upload aborted", "AbortError")),
      );
      return;
    }

    signal?.addEventListener("abort", abort, { once: true });
    request.send(file);
  });
}

export async function discardProjectAsset(
  projectId: string,
  file: ChatFilePart,
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
  { signal, onProgress }: UploadProjectAssetsOptions = {},
): Promise<ChatFilePart[]> {
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
  const loadedBytes = files.map(() => 0);
  const totalBytes = files.reduce((total, file) => total + file.size, 0);
  const reportProgress = () => {
    if (!onProgress || totalBytes <= 0) return;
    const loaded = loadedBytes.reduce((total, bytes) => total + bytes, 0);
    onProgress(Math.min(99, Math.round((loaded / totalBytes) * 100)));
  };
  let completed = false;

  try {
    const uploadResults = await Promise.allSettled(
      preparedAssets.map((asset, index) =>
        uploadWithProgress(
          asset.uploadUrl,
          asset.headers,
          files[index],
          signal,
          (loaded) => {
            loadedBytes[index] = loaded;
            reportProgress();
          },
        ),
      ),
    );

    if (uploadResults.some((result) => result.status === "rejected")) {
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

    onProgress?.(100);
    completed = true;
    return finalizedFiles;
  } finally {
    if (!completed) {
      await discardAssetIds(projectId, assetIds);
    }
  }
}
