import { z } from "zod";

import { elementSelectionSchema } from "@/ai/message/metadata";
import { patchElementSource } from "@/lib/design-mode/patch";
import { DESIGN_PROPS } from "@/lib/design-mode/styles";
import { errorResponse, HttpError, parseJson, route } from "@/lib/http.server";
import { requireProject } from "@/lib/projects/access.server";
import { getCurrentProjectRevisionId } from "@/lib/projects/source.server";
import {
  applyProjectChanges,
  captureProjectSourceSnapshot,
  checkpointProjectRuntime,
  prepareProjectRuntime,
  reloadCommittedRuntime,
} from "@/lib/runtime/runtime-service.server";
import { withWorkspace } from "@/lib/runtime/workspace-owner.server";

export const maxDuration = 300;

const editSchema = z.strictObject({
  selection: elementSelectionSchema,
  revisionId: z.string(),
  edits: z.partialRecord(z.enum(DESIGN_PROPS), z.string().max(120)),
  text: z.strictObject({ from: z.string().max(2_000), to: z.string().max(2_000) }).optional(),
});

/** Applies a visual edit from the element inspector to the source and saves it as a new version. */
export const POST = route(async (request, { params }: RouteContext<"/api/projects/[id]/design-edit">) => {
  const project = await requireProject(request, (await params).id);
  return withWorkspace(project.id, async (workspaceSignal) => {
    const signal = AbortSignal.any([request.signal, workspaceSignal]);
    const currentRevisionId = await getCurrentProjectRevisionId(project.id);
    if (!currentRevisionId) throw new HttpError(409, "Generate the site first, then edit it.");
    const edit = await parseJson(request, editSchema, "Invalid design edit");
    if (edit.revisionId !== currentRevisionId) {
      throw new HttpError(409, "This selection is based on an older version. Select the element again.");
    }

    try {
      await prepareProjectRuntime(project.id, undefined, signal);
      const patch = patchElementSource(await captureProjectSourceSnapshot(project.id, signal), edit);
      if (!patch.ok) return errorResponse(422, patch.error, { fallback: true });

      await applyProjectChanges(
        project.id,
        [{ type: "create", path: patch.path, content: patch.content }],
        { signal, typecheck: false },
      );
      const checkpoint = await checkpointProjectRuntime(project.id, "USER", {
        baseRevisionId: currentRevisionId,
        signal,
        typecheck: false,
      });
      return Response.json({
        path: patch.path,
        line: patch.line,
        classes: patch.classes,
        revisionId: checkpoint.revisionId,
      });
    } catch (error) {
      await reloadCommittedRuntime(project.id, workspaceSignal).catch(console.error);
      console.error("Failed to apply design edit", error);
      return errorResponse(500, error instanceof Error ? error.message : "Failed to apply the edit");
    }
  });
});
