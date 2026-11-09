import { HttpError, route } from "@/lib/http.server";
import { requireProject } from "@/lib/projects/access.server";
import { checkoutProjectRevision } from "@/lib/projects/source.server";
import { prepareProjectRuntime } from "@/lib/runtime/runtime-service.server";
import { withWorkspace } from "@/lib/runtime/workspace-owner.server";

export const maxDuration = 300;

export const POST = route(async (request, { params }: RouteContext<"/api/projects/[id]/revisions/[revisionId]/restore">) => {
  const { id, revisionId } = await params;
  const project = await requireProject(request, id);
  return withWorkspace(project.id, async (workspaceSignal) => {
    workspaceSignal.throwIfAborted();
    const revision = await checkoutProjectRevision(project.id, revisionId).catch((error: unknown) => {
      throw new HttpError(409, error instanceof Error ? error.message : "Failed to restore version");
    });
    await prepareProjectRuntime(project.id, undefined, AbortSignal.any([workspaceSignal, AbortSignal.timeout(120_000)]))
      .catch(console.error);
    return Response.json(revision);
  });
});
