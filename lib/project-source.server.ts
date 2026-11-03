import "server-only";

import { createHash } from "node:crypto";
import type { RevisionAuthorType } from "@/generated/prisma/enums";

import prisma from "@/lib/prisma";
import { normalizeProjectPath } from "@/lib/project-path";
import type { MessageBoundary } from "@/lib/context-checkpoint";
import {
  createProjectFileObjectKey,
  getProjectFile,
  putProjectFile,
} from "@/lib/storage";

type ProjectSourceFile = {
  path: string;
  content: string;
};

type CommitProjectRevisionInput = {
  projectId: string;
  expectedRevisionId: string | null;
  files: ProjectSourceFile[];
  authorType: RevisionAuthorType;
};

const MAX_FILE_SIZE = 1_000_000;
const MAX_PROJECT_SIZE = 20_000_000;
const MAX_PROJECT_FILES = 500;

function sha256(content: string) {
  return createHash("sha256").update(content).digest("hex");
}

function normalizeFiles(files: ProjectSourceFile[]) {
  if (files.length === 0 || files.length > MAX_PROJECT_FILES) {
    throw new Error("Project has an invalid number of files");
  }

  const normalized = files.map((file) => {
    const path = normalizeProjectPath(file.path);
    const size = Buffer.byteLength(file.content);
    if (size > MAX_FILE_SIZE) {
      throw new Error(`${path} exceeds the 1 MB file limit`);
    }
    return { path, content: file.content, size, sha256: sha256(file.content) };
  });

  if (new Set(normalized.map((file) => file.path)).size !== normalized.length) {
    throw new Error("Project contains duplicate file paths");
  }

  const totalSize = normalized.reduce((total, file) => total + file.size, 0);
  if (totalSize > MAX_PROJECT_SIZE) {
    throw new Error("Project exceeds the 20 MB source limit");
  }

  return normalized.sort((a, b) => a.path.localeCompare(b.path));
}

export async function commitProjectRevision({
  projectId,
  expectedRevisionId,
  files,
  authorType,
}: CommitProjectRevisionInput) {
  const normalized = normalizeFiles(files);

  const storedFiles = await Promise.all(
    normalized.map(async (file) => {
      const objectKey = createProjectFileObjectKey(projectId, file.sha256);
      await putProjectFile(objectKey, file.content);
      return { ...file, objectKey };
    }),
  );

  return prisma.$transaction(async (tx) => {
    const project = await tx.project.findUnique({
      where: { id: projectId },
      select: { currentRevisionId: true },
    });

    if (!project || project.currentRevisionId !== expectedRevisionId) {
      throw new Error("Project changed while this revision was being created");
    }

    const blobs = await Promise.all(
      storedFiles.map((file) =>
        tx.projectFileBlob.upsert({
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
            objectKey: file.objectKey,
            size: file.size,
          },
          select: { id: true, sha256: true },
        }),
      ),
    );
    const blobByHash = new Map(blobs.map((blob) => [blob.sha256, blob.id]));

    const revision = await tx.projectRevision.create({
      data: {
        projectId,
        parentRevisionId: expectedRevisionId,
        authorType,
        summary: "Updated project",
        files: {
          create: storedFiles.map((file) => ({
            path: file.path,
            blobId: blobByHash.get(file.sha256)!,
          })),
        },
      },
      select: { id: true, createdAt: true },
    });

    const updated = await tx.project.updateMany({
      where: {
        id: projectId,
        currentRevisionId: expectedRevisionId,
      },
      data: {
        currentRevisionId: revision.id,
        updatedAt: new Date(),
      },
    });

    if (updated.count !== 1) {
      throw new Error("Project changed while this revision was being created");
    }

    return revision;
  });
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
    select: {
      revisionId: true,
      revision: { select: { authorType: true } },
    },
  });

  return previousAssistant?.revision?.authorType === "SYSTEM"
    ? null
    : previousAssistant?.revisionId ?? null;
}

const FILE_BLOB_SELECT = {
  select: {
    objectKey: true,
    size: true,
    mediaType: true,
  },
} as const;

/** The requested revision, or the project's current one. Null when the project does not exist. */
async function resolveProjectRevision(projectId: string, revisionId?: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { currentRevisionId: true },
  });
  return project ? { targetRevisionId: revisionId ?? project.currentRevisionId } : null;
}

export async function getProjectRevisionFiles(
  projectId: string,
  revisionId?: string,
) {
  const resolved = await resolveProjectRevision(projectId, revisionId);
  if (!resolved) {
    throw new Error("Project not found");
  }
  const { targetRevisionId } = resolved;

  const revision = targetRevisionId ? await prisma.projectRevision.findFirst({
    where: {
      id: targetRevisionId,
      projectId,
    },
    select: {
      id: true,
      files: {
        orderBy: { path: "asc" },
        select: {
          path: true,
          blob: FILE_BLOB_SELECT,
        },
      },
    },
  }) : { files: [], id: null };

  if (!revision) {
    throw new Error("Project revision not found");
  }

  const files = await Promise.all(
    revision.files.map(async ({ path, blob }) => ({
      path,
      content: await getProjectFile(blob.objectKey),
      size: blob.size,
      mediaType: blob.mediaType,
    })),
  );

  return { revisionId: revision.id || null, files };
}

export async function getProjectRevisionTree(
  projectId: string,
  revisionId?: string,
) {
  const targetRevisionId = (await resolveProjectRevision(projectId, revisionId))?.targetRevisionId;

  if (!targetRevisionId) {
    throw new Error("Project revision not found");
  }

  const revision = await prisma.projectRevision.findFirst({
    where: { id: targetRevisionId, projectId },
    select: {
      id: true,
      files: {
        orderBy: { path: "asc" },
        select: {
          path: true,
          blob: {
            select: {
              size: true,
              mediaType: true,
            },
          },
        },
      },
    },
  });

  if (!revision) throw new Error("Project revision not found");

  return {
    revisionId: revision.id,
    files: revision.files.map(({ path, blob }) => ({ path, ...blob })),
  };
}

export async function getProjectRevisionFile(
  projectId: string,
  inputPath: string,
  revisionId?: string,
) {
  const path = normalizeProjectPath(inputPath);
  const targetRevisionId = (await resolveProjectRevision(projectId, revisionId))?.targetRevisionId;

  if (!targetRevisionId) {
    throw new Error("Project revision not found");
  }

  const file = await prisma.revisionFile.findFirst({
    where: {
      revisionId: targetRevisionId,
      path,
      revision: { projectId },
    },
    select: {
      path: true,
      blob: FILE_BLOB_SELECT,
    },
  });

  if (!file) throw new Error("Project file not found");

  return {
    path: file.path,
    content: await getProjectFile(file.blob.objectKey),
    size: file.blob.size,
    mediaType: file.blob.mediaType,
    revisionId: targetRevisionId,
  };
}

type CheckoutProjectRevisionInput = {
  projectId: string;
  revisionId: string | null;
  expectedRevisionId?: string | null;
};

export async function checkoutProjectRevision({
  projectId,
  revisionId,
  expectedRevisionId,
}: CheckoutProjectRevisionInput) {
  return prisma.$transaction(async (tx) => {
    const project = await tx.project.findUnique({
      where: { id: projectId },
      select: { currentRevisionId: true },
    });
    if (!project) throw new Error("Project not found");

    if (revisionId) {
      const revision = await tx.projectRevision.findFirst({
        where: {
          id: revisionId,
          projectId,
          authorType: { not: "SYSTEM" },
        },
        select: { id: true },
      });
      if (!revision) throw new Error("Project revision not found");
    }

    const updated = await tx.project.updateMany({
      where: {
        id: projectId,
        ...(expectedRevisionId === undefined
          ? {}
          : { currentRevisionId: expectedRevisionId }),
      },
      data: {
        currentRevisionId: revisionId,
        updatedAt: new Date(),
      },
    });

    if (updated.count !== 1) {
      throw new Error("Project changed while this version was being selected");
    }

    return {
      id: revisionId,
      currentRevisionId: revisionId,
      previousRevisionId: project.currentRevisionId,
    };
  });
}
