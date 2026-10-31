import "server-only";

import { randomUUID } from "node:crypto";
import prisma from "@/lib/prisma";
import { getActiveChatRunId } from "@/lib/project-chat/runs.server";
import { usesVercelSandbox } from "./provider";

type WorkspaceOwner = { projectId: string };
type WorkspaceLease = { signal: AbortSignal; release: () => void | Promise<void> };

const local = globalThis as typeof globalThis & {
  bloomWorkspaceOwner?: WorkspaceOwner;
};

export function workspaceOwner() {
  return local.bloomWorkspaceOwner;
}

function acquireLocalWorkspace(projectId: string): WorkspaceLease | null {
  if (local.bloomWorkspaceOwner) return null;
  const owner = { projectId };
  local.bloomWorkspaceOwner = owner;
  return {
    signal: new AbortController().signal,
    release() {
      if (local.bloomWorkspaceOwner === owner) delete local.bloomWorkspaceOwner;
    },
  };
}

const leaseMs = 90_000;

async function acquireSandboxWorkspace(projectId: string): Promise<WorkspaceLease | null> {
  const token = randomUUID();
  const acquired = await prisma.$executeRaw`
    INSERT INTO "ProjectWorkspaceLease" ("projectId", "token", "expiresAt")
    SELECT id, ${token}, (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + ${leaseMs} * interval '1 millisecond'
    FROM "Project" WHERE id = ${projectId}
    ON CONFLICT ("projectId") DO UPDATE SET "token" = EXCLUDED."token", "expiresAt" = EXCLUDED."expiresAt"
    WHERE "ProjectWorkspaceLease"."expiresAt" <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
  `;
  if (!acquired) return null;

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  let deadline = Date.now() + leaseMs;
  let released = false;
  const renew = async () => {
    try {
      const renewed = await prisma.$executeRaw`
        UPDATE "ProjectWorkspaceLease"
        SET "expiresAt" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + ${leaseMs} * interval '1 millisecond'
        WHERE "projectId" = ${projectId} AND "token" = ${token}
          AND "expiresAt" > (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
      `;
      if (!renewed) {
        controller.abort(new Error("The sandbox workspace lease expired"));
        return;
      }
      deadline = Date.now() + leaseMs;
    } catch {
      if (Date.now() >= deadline) {
        controller.abort(new Error("The sandbox workspace lease could not be renewed"));
        return;
      }
    }
    if (!released) timer = setTimeout(renew, 10_000);
  };
  timer = setTimeout(renew, 10_000);

  return {
    signal: controller.signal,
    async release() {
      released = true;
      clearTimeout(timer);
      await prisma.projectWorkspaceLease.deleteMany({ where: { projectId, token } }).catch(console.error);
    },
  };
}

export function acquireWorkspace(projectId: string) {
  return usesVercelSandbox ? acquireSandboxWorkspace(projectId) : acquireLocalWorkspace(projectId);
}

export function workspaceBusy() {
  return Response.json(
    { error: "The workspace is busy. Try again when the current operation finishes." },
    { status: 409 },
  );
}

export async function withWorkspace(projectId: string, run: (signal: AbortSignal) => Promise<Response>) {
  const lease = await acquireWorkspace(projectId);
  if (!lease) return workspaceBusy();
  try {
    if (await getActiveChatRunId(projectId)) return workspaceBusy();
    return await run(lease.signal);
  } finally {
    await lease.release();
  }
}
