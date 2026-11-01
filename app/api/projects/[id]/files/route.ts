import type { NextRequest } from "next/server";
import { z } from "zod/v4";

import prisma from "@/lib/prisma";
import { normalizeProjectPath } from "@/lib/project-path";
import {
  getProjectRevisionFile,
  getProjectRevisionFiles,
  getProjectRevisionTree,
} from "@/lib/project-source.server";
import {
  captureProjectSourceSnapshot,
  prepareProjectRuntime,
} from "@/lib/runtime/runtime-service.server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const querySchema = z.strictObject({
  path: z.string().max(500).optional(),
  revision: z.cuid2().optional(),
  contents: z.enum(["1"]).optional(),
});

export async function GET(request: NextRequest, context: RouteContext) {
  const userId = request.headers.get("user-id") as string;
  const { id } = await context.params;
  const query = querySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );

  if (!query.success) {
    return Response.json({ error: "Invalid file request" }, { status: 400 });
  }

  const project = await prisma.project.findFirst({
    where: { id, userId },
    select: { id: true, currentRevisionId: true },
  });
  if (!project) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  try {
    if (!query.data.revision && project.currentRevisionId === null) {
      await prepareProjectRuntime(
        id,
        { revisionId: null, files: [] },
        request.signal,
      );
      const files = await captureProjectSourceSnapshot(id, request.signal);

      if (query.data.path) {
        const path = normalizeProjectPath(query.data.path);
        const file = files.find((candidate) => candidate.path === path);
        if (!file) throw new Error("Project file not found");
        return Response.json({
          path,
          content: file.content,
          size: Buffer.byteLength(file.content),
          mediaType: "text/plain",
          revisionId: null,
        });
      }

      const sourceFiles = files.map((file) => ({
        ...file,
        size: Buffer.byteLength(file.content),
        mediaType: "text/plain",
      }));

      return Response.json({
        revisionId: null,
        files: query.data.contents
          ? sourceFiles
          : sourceFiles.map(({ path, size, mediaType }) => ({
            path,
            size,
            mediaType,
          })),
      });
    }

    const result = query.data.path
      ? await getProjectRevisionFile(id, query.data.path, query.data.revision)
      : query.data.contents
        ? await getProjectRevisionFiles(id, query.data.revision)
      : await getProjectRevisionTree(id, query.data.revision);
    return Response.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to read project files";
    return Response.json({ error: message }, { status: 404 });
  }
}
