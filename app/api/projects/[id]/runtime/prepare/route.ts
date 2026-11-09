import { errorResponse, route } from "@/lib/http.server";
import { requireProject } from "@/lib/projects/access.server";
import {
  ensureProjectBaseline,
  getProjectRuntimeState,
  prepareProjectRuntime,
} from "@/lib/runtime/runtime-service.server";
import { withWorkspace } from "@/lib/runtime/workspace-owner.server";

export const maxDuration = 300;

function runtimeError(error: unknown, fallback: string) {
  return errorResponse(500, error instanceof Error ? error.message : fallback);
}

export const GET = route(async (request, { params }: RouteContext<"/api/projects/[id]/runtime/prepare">) => {
  const project = await requireProject(request, (await params).id);
  return getProjectRuntimeState(project.id, request.signal)
    .then((state) => Response.json(state), (error) => runtimeError(error, "Failed to read runtime"));
});

export const POST = route(async (request, { params }: RouteContext<"/api/projects/[id]/runtime/prepare">) => {
  const project = await requireProject(request, (await params).id);
  return withWorkspace(project.id, async (workspaceSignal) => {
    const signal = AbortSignal.any([request.signal, workspaceSignal]);
    try {
      const revisionId = await ensureProjectBaseline(project.id, signal);
      return Response.json(await prepareProjectRuntime(project.id, { revisionId }, signal));
    } catch (error) {
      console.error("Failed to prepare project runtime", error);
      return runtimeError(error, "Failed to prepare runtime");
    }
  });
});
