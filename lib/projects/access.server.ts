import "server-only";

import prisma from "@/lib/prisma";
import { HttpError, requireUserId } from "@/lib/http.server";
import { auth } from "@/lib/auth";

export function getOwnedProject(projectId: string, userId: string) {
  return prisma.project.findFirst({
    where: { id: projectId, userId },
    select: { id: true, userId: true, title: true, currentRevisionId: true },
  });
}

/** The signed-in user's project, or null when there is no session or the project is not theirs. */
export async function getRequestProject(request: Request, projectId: string) {
  const session = await auth.api.getSession({ headers: request.headers });
  return session ? getOwnedProject(projectId, session.user.id) : null;
}

export async function requireProject(request: Request, projectId: string) {
  const project = await getOwnedProject(projectId, await requireUserId(request));
  if (!project) throw new HttpError(404, "Project not found");
  return project;
}

export const projectSummarySelect = {
  id: true,
  title: true,
  createdAt: true,
  updatedAt: true,
} as const;
