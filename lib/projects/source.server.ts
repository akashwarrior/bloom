import "server-only";

import { createHash } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import type { RevisionAuthorType } from "@/generated/prisma/enums";

import prisma from "@/lib/prisma";
import { normalizeProjectPath } from "@/lib/projects/path";
import type { MessageBoundary } from "@/ai/context/checkpoint";
import {
  createProjectFileObjectKey,
  getProjectFile,
  putProjectFile,
} from "@/lib/storage";

import type { RuntimeFile } from "@/lib/runtime/protocol";
import {
  MAX_SOURCE_BYTES,
  MAX_SOURCE_FILE_BYTES,
  MAX_SOURCE_FILES,
} from "@/lib/runtime/source-limits";

export class ProjectSourceNotFound extends Error {}

type CommitProjectRevisionInput = {
  projectId: string;
  expectedRevisionId: string | null;
  files: RuntimeFile[];
  authorType: RevisionAuthorType;
  summary?: string;
};

function sha256(content: string | Uint8Array) {
  return createHash("sha256").update(content).digest("hex");
}

function sourceManifest(files: Array<{ path: string; sha256: string }>) {
  return files
    .map((file) => `${file.path}\0${file.sha256}`)
    .sort()
    .join("\n");
}

function normalizeFiles(files: RuntimeFile[]) {
  if (files.length === 0 || files.length > MAX_SOURCE_FILES) {
    throw new Error("Project has an invalid number of files");
  }

  const normalized = files.map((file) => {
    const path = normalizeProjectPath(file.path);
    const binary = file.encoding === "base64";
    const content = binary ? Buffer.from(file.content, "base64") : file.content;
    const size = Buffer.byteLength(content);
    if (size > MAX_SOURCE_FILE_BYTES) {
      throw new Error(`${path} exceeds the 1 MB file limit`);
    }
    return { path, content, size, sha256: sha256(content), mediaType: binary ? "application/octet-stream" : "text/plain" };
  });

  if (new Set(normalized.map((file) => file.path)).size !== normalized.length) {
    throw new Error("Project contains duplicate file paths");
  }

  const totalSize = normalized.reduce((total, file) => total + file.size, 0);
  if (totalSize > MAX_SOURCE_BYTES) {
    throw new Error("Project exceeds the 20 MB source limit");
  }

  return normalized.sort((a, b) => a.path.localeCompare(b.path));
}

type NormalizedProjectFile = ReturnType<typeof normalizeFiles>[number];

/** Uploads every content-addressed blob the project does not have yet. */
async function uploadMissingProjectFiles(
  projectId: string,
  normalized: NormalizedProjectFile[],
) {
  const hashes = normalized.map((file) => file.sha256);
  const existingBlobs = await prisma.projectFileBlob.findMany({
    where: { projectId, sha256: { in: hashes } },
    select: { id: true, sha256: true },
  });
  const existingByHash = new Map(
    existingBlobs.map((blob) => [blob.sha256, blob.id]),
  );

  const missingByHash = new Map<string, NormalizedProjectFile>();
  for (const file of normalized) {
    if (!existingByHash.has(file.sha256)) {
      missingByHash.set(file.sha256, file);
    }
  }
  const missing = [...missingByHash.values()];

  await Promise.all(
    missing.map((file) =>
      putProjectFile(
        createProjectFileObjectKey(projectId, file.sha256),
        file.content,
        file.mediaType,
      ),
    ),
  );

  return { existingByHash, missing };
}

export async function prepareProjectRevision({
  projectId,
  expectedRevisionId,
  parentRevisionId = expectedRevisionId,
  files,
  authorType,
  summary = "Updated project",
}: CommitProjectRevisionInput & { parentRevisionId?: string | null }) {
  const normalized = normalizeFiles(files);
  const { existingByHash, missing } = await uploadMissingProjectFiles(
    projectId,
    normalized,
  );

  return async (tx: Prisma.TransactionClient) => {
    const project = await tx.project.findUnique({
      where: { id: projectId },
      select: { currentRevisionId: true },
    });

    if (!project || project.currentRevisionId !== expectedRevisionId) {
      throw new Error("Project changed while this revision was being created");
    }

    if (parentRevisionId) {
      const parent = await tx.projectRevision.findFirst({
        where: { id: parentRevisionId, projectId },
        select: {
          id: true,
          createdAt: true,
          files: {
            orderBy: { path: "asc" },
            select: {
              path: true,
              blob: { select: { sha256: true } },
            },
          },
        },
      });
      if (!parent) {
        throw new ProjectSourceNotFound("Project revision not found");
      }

      // A message can finish without changing files after checkout (for
      // example, editing a message and getting the same result). Reuse the
      // parent instead of recording an identical revision.
      const parentManifest = sourceManifest(
        parent.files.map(({ path, blob }) => ({ path, sha256: blob.sha256 })),
      );
      if (sourceManifest(normalized) === parentManifest) {
        await publishProjectHead(tx, projectId, expectedRevisionId, parent.id);
        return { id: parent.id, createdAt: parent.createdAt };
      }
    }

    const blobByHash = new Map(existingByHash);
    await Promise.all(
      missing.map(async (file) => {
        const blob = await tx.projectFileBlob.upsert({
          where: {
            projectId_sha256: {
              projectId,
              sha256: file.sha256,
            },
          },
          update: {},
          create: {
            projectId,
            sha256: file.sha256,
            objectKey: createProjectFileObjectKey(projectId, file.sha256),
            size: file.size,
            mediaType: file.mediaType,
          },
          select: { id: true, sha256: true },
        });
        blobByHash.set(blob.sha256, blob.id);
      }),
    );

    const revision = await tx.projectRevision.create({
      data: {
        projectId,
        parentRevisionId,
        authorType,
        summary,
      },
      select: { id: true, createdAt: true },
    });

    await tx.revisionFile.createMany({
      data: normalized.map((file) => {
        const blobId = blobByHash.get(file.sha256);
        if (!blobId) {
          throw new Error(`Missing stored blob for ${file.path}`);
        }
        return {
          revisionId: revision.id,
          path: file.path,
          blobId,
        };
      }),
    });

    await publishProjectHead(tx, projectId, expectedRevisionId, revision.id);
    return revision;
  };
}

export async function publishProjectHead(
  tx: Prisma.TransactionClient,
  projectId: string,
  expectedRevisionId: string | null,
  revisionId: string | null,
) {
  const updated = await tx.project.updateMany({
    where: { id: projectId, currentRevisionId: expectedRevisionId },
    data: { currentRevisionId: revisionId, updatedAt: new Date() },
  });
  if (updated.count !== 1) {
    throw new Error("The project version changed. Try again.");
  }
}

export async function commitProjectRevision(input: CommitProjectRevisionInput) {
  const publish = await prepareProjectRevision(input);
  return prisma.$transaction(publish);
}

export async function getProjectBaselineRevisionId(projectId: string) {
  const baseline = await prisma.projectRevision.findFirst({
    where: {
      projectId,
      authorType: "SYSTEM",
      parentRevisionId: null,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true },
  });

  return baseline?.id ?? null;
}

export async function getRevisionBeforeMessage(
  projectId: string,
  boundary: MessageBoundary,
) {
  const previousAssistant = await prisma.chatMessage.findFirst({
    where: {
      projectId,
      role: "ASSISTANT",
      OR: [
        { createdAt: { lt: boundary.createdAt } },
        { createdAt: boundary.createdAt, id: { lt: boundary.id } },
      ],
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { revisionId: true },
  });

  if (previousAssistant?.revisionId) {
    return previousAssistant.revisionId;
  }

  // Editing or deleting the first message returns to the scaffold the project
  // started from. A SYSTEM baseline is the recorded form of that state.
  return getProjectBaselineRevisionId(projectId);
}

export async function getCurrentProjectRevisionId(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { currentRevisionId: true },
  });
  return project?.currentRevisionId ?? null;
}

const BINARY_MEDIA_TYPE = "application/octet-stream";

/** The requested revision, or the project's current one. Undefined when the project does not exist. */
async function resolveRevisionId(projectId: string, revisionId?: string) {
  if (revisionId) return revisionId;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { currentRevisionId: true },
  });
  return project ? project.currentRevisionId : undefined;
}

async function findRevisionFiles(projectId: string, revisionId: string) {
  const revision = await prisma.projectRevision.findFirst({
    where: { id: revisionId, projectId },
    select: {
      id: true,
      files: {
        orderBy: { path: "asc" },
        select: {
          path: true,
          blob: { select: { objectKey: true, sha256: true, size: true, mediaType: true } },
        },
      },
    },
  });
  if (!revision) throw new ProjectSourceNotFound("Project revision not found");
  return revision;
}

function readBlob(blob: { objectKey: string; mediaType: string }) {
  return getProjectFile(blob.objectKey, blob.mediaType === BINARY_MEDIA_TYPE ? "base64" : "utf-8");
}

/** Every file of a revision with its content. A project without a revision has no files. */
export async function getProjectRevisionFiles(projectId: string, revisionId?: string) {
  const targetRevisionId = await resolveRevisionId(projectId, revisionId);
  if (targetRevisionId === undefined) throw new Error("Project not found");
  if (!targetRevisionId) return { revisionId: null, files: [] };
  const revision = await findRevisionFiles(projectId, targetRevisionId);
  const files = await Promise.all(
    revision.files.map(async ({ path, blob }) => ({
      path,
      content: await readBlob(blob),
      ...(blob.mediaType === BINARY_MEDIA_TYPE ? { encoding: "base64" as const } : {}),
      size: blob.size,
      mediaType: blob.mediaType,
    })),
  );
  return { revisionId: revision.id, files };
}

/**
 * Paths and content hashes for a revision. Change detection can compare these
 * against a container snapshot without downloading every file from storage.
 */
export async function getProjectRevisionFileHashes(projectId: string, revisionId?: string) {
  const targetRevisionId = await resolveRevisionId(projectId, revisionId);
  if (targetRevisionId === undefined) throw new Error("Project not found");
  if (!targetRevisionId) return { revisionId: null, files: [] };
  const revision = await findRevisionFiles(projectId, targetRevisionId);
  return {
    revisionId: revision.id,
    files: revision.files.map(({ path, blob }) => ({ path, sha256: blob.sha256 })),
  };
}

export async function getProjectRevisionTree(projectId: string, revisionId?: string) {
  const targetRevisionId = await resolveRevisionId(projectId, revisionId);
  if (!targetRevisionId) throw new ProjectSourceNotFound("Project revision not found");
  const revision = await findRevisionFiles(projectId, targetRevisionId);
  return {
    revisionId: revision.id,
    files: revision.files.map(({ path, blob }) => ({ path, size: blob.size, mediaType: blob.mediaType })),
  };
}

export async function getProjectRevisionFile(projectId: string, inputPath: string, revisionId?: string) {
  const path = normalizeProjectPath(inputPath);
  const targetRevisionId = await resolveRevisionId(projectId, revisionId);
  if (!targetRevisionId) throw new ProjectSourceNotFound("Project revision not found");
  const file = await prisma.revisionFile.findFirst({
    where: { revisionId: targetRevisionId, path, revision: { projectId } },
    select: { path: true, blob: { select: { objectKey: true, size: true, mediaType: true } } },
  });
  if (!file) throw new ProjectSourceNotFound("Project file not found");
  return {
    path: file.path,
    content: await readBlob(file.blob),
    size: file.blob.size,
    mediaType: file.blob.mediaType,
    revisionId: targetRevisionId,
  };
}

export async function checkoutProjectRevision(projectId: string, revisionId: string) {
  return prisma.$transaction(async (tx) => {
    const project = await tx.project.findUnique({
      where: { id: projectId },
      select: { currentRevisionId: true },
    });
    if (!project) throw new Error("Project not found");

    const revision = await tx.projectRevision.findFirst({
      where: { id: revisionId, projectId },
      select: { id: true },
    });
    if (!revision) throw new ProjectSourceNotFound("Project revision not found");
    await publishProjectHead(tx, projectId, project.currentRevisionId, revisionId);
    await tx.projectContextCheckpoint.deleteMany({ where: { projectId } });
    return revision;
  });
}
