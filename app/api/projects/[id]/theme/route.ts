import type { NextRequest } from "next/server";
import { z } from "zod";

import { applyManualTheme, getProjectTheme } from "@/lib/design/manual-theme.server";
import { shadcnThemeSchema } from "@/lib/design/shadcn-theme";
import prisma from "@/lib/prisma";

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function ownedProjectId(request: NextRequest, context: RouteContext) {
  const parsed = z.cuid2().safeParse((await context.params).id);
  if (!parsed.success) return null;
  const project = await prisma.project.findFirst({
    where: { id: parsed.data, userId: request.headers.get("user-id") as string },
    select: { id: true, currentRevisionId: true },
  });
  return project;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const project = await ownedProjectId(request, context);
  if (!project) return Response.json({ error: "Project not found" }, { status: 404 });
  return Response.json(await getProjectTheme(project.id));
}

export async function POST(request: NextRequest, context: RouteContext) {
  const project = await ownedProjectId(request, context);
  if (!project) return Response.json({ error: "Project not found" }, { status: 404 });
  if (!project.currentRevisionId) {
    return Response.json({ error: "Generate the site first, then change its theme." }, { status: 409 });
  }
  const parsed = shadcnThemeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid theme" }, { status: 400 });

  try {
    return Response.json(await applyManualTheme(project.id, parsed.data, request.signal));
  } catch (error) {
    console.error("Failed to apply theme", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to apply theme" },
      { status: 500 },
    );
  }
}
