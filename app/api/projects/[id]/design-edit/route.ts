import type { NextRequest } from "next/server";
import { z } from "zod/v4";

import { elementSelectionSchema } from "@/ai/message/metadata";
import { patchElementSource } from "@/lib/design-mode/patch";
import { DESIGN_PROPS } from "@/lib/design-mode/styles";
import prisma from "@/lib/prisma";
import {
  applyProjectChanges,
  captureProjectSourceSnapshot,
  checkpointProjectRuntime,
  prepareProjectRuntime,
} from "@/lib/runtime/runtime-service.server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const requestSchema = z.strictObject({
  selection: elementSelectionSchema,
  edits: z.partialRecord(z.enum(DESIGN_PROPS), z.string().max(120)),
  text: z.strictObject({ from: z.string().max(2_000), to: z.string().max(2_000) }).optional(),
});

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const project = await prisma.project.findFirst({
    where: { id, userId: request.headers.get("user-id") as string },
    select: { id: true, currentRevisionId: true },
  });
  if (!project) return Response.json({ error: "Project not found" }, { status: 404 });
  if (!project.currentRevisionId) {
    return Response.json({ error: "Generate the site first, then edit it." }, { status: 409 });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid design edit" }, { status: 400 });

  try {
    await prepareProjectRuntime(project.id, undefined, request.signal);
    const files = await captureProjectSourceSnapshot(project.id, request.signal);
    const patch = patchElementSource(files, parsed.data);
    if (!patch.ok) return Response.json({ error: patch.error, fallback: true }, { status: 422 });

    await applyProjectChanges(
      project.id,
      [{ type: "create", path: patch.path, content: patch.content }],
      { signal: request.signal, typecheck: false },
    );
    const checkpoint = await checkpointProjectRuntime(project.id, "USER", { typecheck: false });
    return Response.json({
      path: patch.path,
      line: patch.line,
      classes: patch.classes,
      revisionId: checkpoint.revisionId,
    });
  } catch (error) {
    console.error("Failed to apply design edit", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to apply the edit" },
      { status: 500 },
    );
  }
}
