import "server-only";

import { directionDigest } from "@/lib/design/direction";
import { DESIGN_STATE_PATH, readDesignState } from "@/lib/design/write-design-system.server";
import prisma from "@/lib/prisma";
import { getProjectRevisionFile } from "@/lib/project-source.server";

/**
 * Short summaries of the directions already written for this person's other
 * projects, newest first. The design director reads them so a new project does
 * not land where an earlier one did. Best effort: any failure yields none.
 */
export async function recentDirectionDigests(projectId: string, limit = 5): Promise<string[]> {
  try {
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { userId: true } });
    if (!project) return [];
    const others = await prisma.project.findMany({
      where: { userId: project.userId, id: { not: projectId }, currentRevisionId: { not: null } },
      orderBy: { updatedAt: "desc" },
      take: limit * 2,
      select: { id: true },
    });
    const states = await Promise.all(others.map(async ({ id }) => {
      const file = await getProjectRevisionFile(id, DESIGN_STATE_PATH).catch(() => null);
      return file ? readDesignState([{ path: DESIGN_STATE_PATH, content: file.content }]) : null;
    }));
    return states
      .flatMap((state) => (state?.direction ? [directionDigest(state.direction)] : []))
      .slice(0, limit);
  } catch {
    return [];
  }
}
