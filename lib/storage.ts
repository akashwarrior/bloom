import "server-only";

import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { SupportedChatAttachmentType } from "@/lib/chat-attachments";
import { IMAGE_FILE_EXTENSIONS } from "@/lib/assets";

const UPLOAD_URL_TTL_SECONDS = 5 * 60;
const DOWNLOAD_URL_TTL_SECONDS = 24 * 60 * 60;

const FILE_EXTENSIONS: Record<SupportedChatAttachmentType, string> = IMAGE_FILE_EXTENSIONS;

type StorageConfig = {
  bucket: string;
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
};

const globalForStorage = globalThis as typeof globalThis & {
  bloomStorageClient?: S3Client;
};

function getStorageConfig(): StorageConfig {
  const config = {
    bucket:
      process.env.S3_BUCKET ??
      process.env.AWS_BUCKET ??
      "project-assets",
    endpoint: process.env.S3_ENDPOINT ?? process.env.AWS_ENDPOINT,
    region: process.env.S3_REGION ?? process.env.AWS_REGION ?? "us-east-1",
    accessKeyId:
      process.env.S3_ACCESS_KEY_ID ?? process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey:
      process.env.S3_SECRET_ACCESS_KEY ??
      process.env.AWS_SECRET_ACCESS_KEY,
  };

  const missing = Object.entries(config).reduce<string[]>(
    (keys, [key, value]) => {
      if (!value) keys.push(key);
      return keys;
    },
    [],
  );

  if (missing.length > 0) {
    throw new Error(
      `Missing object storage configuration: ${missing.join(", ")}`,
    );
  }

  return config as StorageConfig;
}

function getStorageClient() {
  if (globalForStorage.bloomStorageClient) {
    return globalForStorage.bloomStorageClient;
  }

  const config = getStorageConfig();
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: true,
    requestChecksumCalculation: "WHEN_REQUIRED",
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  globalForStorage.bloomStorageClient = client;
  return client;
}

export function createAssetObjectKey(
  projectId: string,
  assetId: string,
  mediaType: SupportedChatAttachmentType,
) {
  return `${projectId}/${assetId}.${FILE_EXTENSIONS[mediaType]}`;
}

export async function createAssetUploadUrl(
  objectKey: string,
  mediaType: SupportedChatAttachmentType,
  size: number,
) {
  const { bucket } = getStorageConfig();

  return getSignedUrl(
    getStorageClient(),
    new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      ContentType: mediaType,
      ContentLength: size,
    }),
    { expiresIn: UPLOAD_URL_TTL_SECONDS },
  );
}

export async function createAssetDownloadUrl(objectKey: string): Promise<string> {
  const { bucket } = getStorageConfig();
  return getSignedUrl(
    getStorageClient(),
    new GetObjectCommand({
      Bucket: bucket,
      Key: objectKey,
    }),
    { expiresIn: DOWNLOAD_URL_TTL_SECONDS },
  );
}

export async function putAssetObject(
  objectKey: string,
  mediaType: SupportedChatAttachmentType,
  bytes: Uint8Array,
) {
  const { bucket } = getStorageConfig();
  await getStorageClient().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      Body: bytes,
      ContentType: mediaType,
      ContentLength: bytes.byteLength,
    }),
  );
}

export function createProjectFileObjectKey(
  projectId: string,
  sha256: string,
) {
  return `project-files/${projectId}/blobs/${sha256}`;
}

export async function putProjectFile(
  objectKey: string,
  content: string,
  mediaType = "text/plain; charset=utf-8",
) {
  const { bucket } = getStorageConfig();
  await getStorageClient().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      Body: content,
      ContentType: mediaType,
    }),
  );
}

export async function getProjectFile(objectKey: string) {
  const { bucket } = getStorageConfig();
  const object = await getStorageClient().send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: objectKey,
    }),
  );

  if (!object.Body) {
    throw new Error("Project file has no content");
  }

  return object.Body.transformToString("utf-8");
}

function hasExpectedImageSignature(
  bytes: Uint8Array,
  mediaType: SupportedChatAttachmentType,
) {
  switch (mediaType) {
    case "image/jpeg":
      return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    case "image/png":
      return (
        bytes[0] === 0x89 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x4e &&
        bytes[3] === 0x47 &&
        bytes[4] === 0x0d &&
        bytes[5] === 0x0a &&
        bytes[6] === 0x1a &&
        bytes[7] === 0x0a
      );
    case "image/gif": {
      const signature = String.fromCharCode(...bytes.slice(0, 6));
      return signature === "GIF87a" || signature === "GIF89a";
    }
    case "image/webp":
      return (
        String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
        String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
      );
    case "image/avif":
      return String.fromCharCode(...bytes.slice(4, 12)).includes("ftypavif");
    case "image/svg+xml": {
      const prefix = new TextDecoder().decode(bytes.slice(0, 512));
      return /^(?:\uFEFF|\s)*(?:<\?xml[\s\S]*?\?>\s*)?<svg\b/i.test(prefix);
    }
  }
}

export async function validateStoredImage(
  objectKey: string,
  expectedMediaType: SupportedChatAttachmentType,
) {
  const { bucket } = getStorageConfig();
  const client = getStorageClient();
  const head = await client.send(
    new HeadObjectCommand({
      Bucket: bucket,
      Key: objectKey,
    }),
  );

  const mediaType = head.ContentType?.split(";", 1)[0]?.toLowerCase();
  const size = head.ContentLength;
  if (!size || mediaType !== expectedMediaType) {
    return null;
  }

  const object = await client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      Range: "bytes=0-15",
    }),
  );
  const bytes = await object.Body?.transformToByteArray();

  if (!bytes || !hasExpectedImageSignature(bytes, expectedMediaType)) {
    return null;
  }

  return { size };
}

export async function deleteStoredObjects(objectKeys: string[]) {
  if (objectKeys.length === 0) return;

  const { bucket } = getStorageConfig();
  const client = getStorageClient();

  const batches: string[][] = [];
  for (let index = 0; index < objectKeys.length; index += 1000) {
    batches.push(objectKeys.slice(index, index + 1000));
  }

  const results = await Promise.all(
    batches.map((batch) =>
      client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: {
            Objects: batch.map((Key) => ({ Key })),
            Quiet: true,
          },
        }),
      ),
    ),
  );

  for (const result of results) {
    if (result.Errors && result.Errors.length > 0) {
      throw new Error("Object storage failed to delete one or more assets");
    }
  }
}

export async function getAssetObjectBytes(objectKey: string) {
  const { bucket } = getStorageConfig();

  const object = await getStorageClient().send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: objectKey,
    }),
  );

  if (!object.Body) {
    throw new Error("Stored asset has no content");
  }

  return object.Body.transformToByteArray();
}
