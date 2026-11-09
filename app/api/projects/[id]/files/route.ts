import { z } from "zod";

import { HttpError, parseSearchParams, route } from "@/lib/http.server";
import { requireProject } from "@/lib/projects/access.server";
import { normalizeProjectPath } from "@/lib/projects/path";
import {
  getProjectRevisionFile,
  getProjectRevisionTree,
  ProjectSourceNotFound,
} from "@/lib/projects/source.server";

const querySchema = z.strictObject({
  path: z.string().max(500).optional(),
  revision: z.string().max(64).optional(),
});

function normalizedPath(path: string | undefined) {
  if (path === undefined) return undefined;
  try {
    return normalizeProjectPath(path);
  } catch {
    throw new HttpError(400, "Invalid file path");
  }
}

/** The file tree of a revision (the current one by default), or one file's content with `?path=`. */
export const GET = route(async (request, { params }: RouteContext<"/api/projects/[id]/files">) => {
  const query = parseSearchParams(request, querySchema, "Invalid file request");
  const path = normalizedPath(query.path);
  const project = await requireProject(request, (await params).id);
  const revisionId = query.revision ?? project.currentRevisionId;
  if (!revisionId) {
    if (path) throw new HttpError(404, "Project file not found");
    return Response.json({ revisionId: null, files: [] });
  }
  try {
    return Response.json(path
      ? await getProjectRevisionFile(project.id, path, revisionId)
      : await getProjectRevisionTree(project.id, revisionId));
  } catch (error) {
    if (error instanceof ProjectSourceNotFound) throw new HttpError(404, error.message);
    throw error;
  }
});
