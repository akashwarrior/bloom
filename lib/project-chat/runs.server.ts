import "server-only";

import prisma from "@/lib/prisma";

const heartbeatMs = 5_000;
const leaseMs = 90_000;

export function nextChatRunLease() {
  return new Date(Date.now() + leaseMs);
}

type ActiveRun = {
  runId?: string;
  controller: AbortController;
  startHeartbeat: (runId: string, expiresAt: Date) => void;
};

const local = globalThis as typeof globalThis & {
  bloomActiveRuns?: Map<string, ActiveRun>;
};

const activeRuns = (local.bloomActiveRuns ??= new Map());

export function activeChatRun(projectId: string) {
  return activeRuns.get(projectId);
}

export function registerChatRun(projectId: string) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let finished = false;

  const run: ActiveRun = {
    controller,
    startHeartbeat(runId, expiresAt) {
      run.runId = runId;
      const heartbeat = async () => {
        try {
          const nextExpiry = nextChatRunLease();
          const [active] = await prisma.chatRun.updateManyAndReturn({
            where: { id: runId, status: "RUNNING", leaseExpiresAt: { gt: new Date() } },
            data: { leaseExpiresAt: nextExpiry },
            select: { stopRequestedAt: true },
          });
          if (!active) {
            controller.abort();
            return;
          }
          expiresAt = nextExpiry;
          if (active.stopRequestedAt) controller.abort();
        } catch {
          if (Date.now() >= expiresAt.getTime()) {
            controller.abort();
            return;
          }
        }
        if (!finished) timer = setTimeout(heartbeat, heartbeatMs);
      };
      timer = setTimeout(heartbeat, heartbeatMs);
    },
  };
  activeRuns.set(projectId, run);
  return {
    run,
    unregister() {
      finished = true;
      clearTimeout(timer);
      if (activeRuns.get(projectId) === run) activeRuns.delete(projectId);
    },
  };
}

export async function recoverInterruptedRun(projectId: string) {
  const now = new Date();
  const where = {
    projectId,
    status: "RUNNING" as const,
    OR: [
      { leaseExpiresAt: { lte: now } },
      { leaseExpiresAt: null, createdAt: { lte: new Date(now.getTime() - leaseMs) } },
    ],
  };
  await prisma.$transaction([
    prisma.chatRun.updateMany({
      where: { ...where, stopRequestedAt: { not: null } },
      data: { status: "STOPPED", leaseExpiresAt: null, finishedAt: new Date(), error: "You stopped this run." },
    }),
    prisma.chatRun.updateMany({
      where,
      data: { status: "FAILED", leaseExpiresAt: null, finishedAt: new Date(), error: "The run was interrupted. You can retry." },
    }),
  ]);
}

export function getActiveChatRunId(projectId: string) {
  return prisma.chatRun.findFirst({
    where: { projectId, status: "RUNNING", leaseExpiresAt: { gt: new Date() } },
    select: { id: true },
  });
}

export async function settleFailedRun(runId: string, error: string, cleanup?: () => Promise<unknown>) {
  const where = { id: runId, status: "RUNNING" as const, leaseExpiresAt: { gt: new Date() } };
  if (!(await prisma.chatRun.findFirst({ where, select: { id: true } }))) return;
  if (cleanup) await cleanup().catch(console.error);
  await prisma.$transaction([
    prisma.chatRun.updateMany({
      where: { ...where, stopRequestedAt: { not: null } },
      data: { status: "STOPPED", leaseExpiresAt: null, finishedAt: new Date(), error: "You stopped this run." },
    }),
    prisma.chatRun.updateMany({
      where,
      data: { status: "FAILED", leaseExpiresAt: null, finishedAt: new Date(), error },
    }),
  ]);
}
