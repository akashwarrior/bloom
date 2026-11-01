import type { NextRequest } from "next/server";

import prisma from "@/lib/prisma";
import {
  getProjectRuntimeState,
  prepareProjectRuntime,
} from "@/lib/runtime/runtime-service.server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function ownedProject(request: NextRequest, id: string) {
  const userId = request.headers.get("user-id") as string;
  return prisma.project.findFirst({
    where: { id, userId },
    select: { id: true },
  });
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  if (!(await ownedProject(request, id))) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  try {
    return Response.json(await getProjectRuntimeState(id, request.signal));
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to read runtime",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  if (!(await ownedProject(request, id))) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  try {
    return Response.json(
      await prepareProjectRuntime(id, undefined, request.signal),
    );
  } catch (error) {
    console.error("Failed to prepare project runtime", error);
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to prepare runtime",
      },
      { status: 500 },
    );
  }
}
