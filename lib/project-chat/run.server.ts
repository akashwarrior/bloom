import "server-only";
import { getRequestProject } from "@/lib/projects/access.server";
import { isDeepStrictEqual } from "node:util";

import {
  getActiveChatRunId,
  nextChatRunLease,
  settleFailedRun,
  recoverInterruptedRun,
  registerChatRun,
} from "@/lib/project-chat/runs.server";
import { chatStreams, chatUnavailable, resumeChatStream, streamResponse } from "@/lib/project-chat/streams.server";
import {
  deleteMessageBranch,
  getCanonicalMessages,
  getProjectMessages,
  messageAssetIds,
  messageBoundaryFilter,
  parseStoredMessages,
  storedMessageSelect,
} from "@/lib/project-chat/messages.server";
import type { ProjectChatMessage, ProjectChatSnapshot } from "@/lib/project-chat/protocol";
import { acquireWorkspace, workspaceBusy } from "@/lib/runtime/workspace-owner.server";

import { createUIMessageStream, createUIMessageStreamResponse, safeValidateUIMessages } from "ai";
import { z } from "zod";

import { BuildSession } from "@/ai/build-session";
import { dataPartSchemas } from "@/ai/message/data-part";
import { metadataSchema } from "@/ai/message/metadata";
import { validateUserInputResponse } from "@/ai/tools/request-user-input";
import { Prisma } from "@/generated/prisma/client";
import { AssetStatus, ChatMessageRole } from "@/generated/prisma/enums";
import {
  prepareContextCheckpointForStorage,
} from "@/ai/context/agent-context.server";
import {
  normalizeSubmittedMessageAssets,
  resolveMessageAssetsForModel,
} from "@/ai/context/message-assets.server";
import {
  filterEmptyReasoningPartsForStorage,
  getMessageText,
  streamFinalReply,
  visibleAssistantParts,
} from "@/lib/project-chat/message";
import {
  checkpointCanSeedGeneration,
  shouldPersistContextCheckpoint,
} from "@/ai/context/checkpoint";
import prisma from "@/lib/prisma";
import {
  prepareProjectRevision,
  publishProjectHead,
  ProjectSourceNotFound,
  getProjectRevisionFile,
  getProjectRevisionFiles,
  getRevisionBeforeMessage,
} from "@/lib/projects/source.server";
import {
  createRequestTraceLogger,
  type RequestTraceLogger,
} from "@/ai/trace-logger.server";
import {
  captureProjectSourceSnapshot,
  markRuntimeRevision,
  changedWorkspacePaths,
  ensureProjectBaseline,
  prepareProjectRuntime,
  reloadCommittedRuntime,
} from "@/lib/runtime/runtime-service.server";

import { streamProjectAgent, type AgentOutcome } from "./agent.server";
import { getChatBranch, replacedDesign, submissionSchema, type ChatSubmission } from "./branch";
import { getActivityDetails, getRunParts, isActivityDetail, type ActivityMarker } from "./activity";
import { DESIGN_STATE_PATH } from "@/ai/design/write-design-system.server";
import { assertCanGenerate, chargeGeneration } from "@/lib/billing.server";
import { errorResponse, HttpError } from "@/lib/http.server";

const latestRunOrder = [{ createdAt: "desc" }, { id: "desc" }] satisfies Prisma.ChatRunOrderByWithRelationInput[];
const chatRequestSchema = z.union([
  z.strictObject({ requestId: z.uuid(), submission: submissionSchema }),
  z.strictObject({ requestId: z.uuid(), retryRunId: z.uuid() }),
]);

type RouteContext = {
  params: Promise<{ id: string }>;
};

function invalidMessageResponse() {
  return Response.json({ error: "Invalid message" }, { status: 400 });
}

function canRetryRun(run: { status: string; targetMessageId: string | null; submission: unknown }) {
  return Boolean(run.targetMessageId && run.submission && (run.status === "FAILED" || run.status === "STOPPED"));
}

function findProjectMessage(
  projectId: string,
  messageId: string,
  role: ChatMessageRole,
) {
  return prisma.chatMessage.findFirst({
    where: { id: messageId, projectId, role },
    select: { id: true, createdAt: true, modelParts: role === ChatMessageRole.ASSISTANT },
  });
}

async function stageUserInputContinuation(
  projectId: string,
  submittedMessage: ProjectChatMessage,
  logger: RequestTraceLogger,
): Promise<ProjectChatMessage | null> {
  const reject = async (reason: string, data?: Record<string, unknown>) => {
    await logger.write("message.continuation_rejected", {
      messageId: submittedMessage.id,
      reason,
      ...data,
    });
    return null;
  };

  if (submittedMessage.role !== "assistant") return reject("not-assistant");

  const storedRecord = await prisma.chatMessage.findFirst({
    where: {
      id: submittedMessage.id,
      projectId,
      role: ChatMessageRole.ASSISTANT,
    },
    select: storedMessageSelect,
  });
  if (!storedRecord) return reject("message-not-found");

  let storedMessage: ProjectChatMessage | undefined;
  try {
    [storedMessage] = await parseStoredMessages(
      [storedRecord],
      "Stored continuation message failed validation",
    );
  } catch {
    return reject("stored-message-invalid");
  }
  if (!storedMessage) return reject("stored-message-missing");

  // Earlier requestUserInput calls in this assistant message are already
  // answered, and the client resends them with every continuation.
  const pendingToolCallIds = new Set(
    storedMessage.parts.flatMap((part) =>
      part.type === "tool-requestUserInput" && part.state === "input-available"
        ? [part.toolCallId]
        : [],
    ),
  );

  if (pendingToolCallIds.size === 0) return reject("no-pending-input");

  const submittedOutputs = new Map(
    submittedMessage.parts.flatMap((part) =>
      part.type === "tool-requestUserInput" &&
        part.state === "output-available" &&
        pendingToolCallIds.has(part.toolCallId)
        ? [[part.toolCallId, part.output] as const]
        : [],
    ),
  );

  if (submittedOutputs.size !== pendingToolCallIds.size) {
    return reject("answers-incomplete", {
      pendingToolCallIds: [...pendingToolCallIds],
      answeredToolCallIds: [...submittedOutputs.keys()],
    });
  }

  const parts = storedMessage.parts.map((part) => {
    if (
      part.type !== "tool-requestUserInput" ||
      part.state !== "input-available" ||
      !submittedOutputs.has(part.toolCallId)
    ) {
      return part;
    }

    return {
      ...part,
      state: "output-available" as const,
      output: validateUserInputResponse(
        part.input,
        submittedOutputs.get(part.toolCallId),
      ),
    };
  });

  return { ...storedMessage, parts };
}

async function savePartialProjectRevision({
  projectId, runId, baseRevisionId, expectedRevisionId, logger, workspaceSignal, verificationFailure,
}: {
  projectId: string;
  runId: string;
  verificationFailure: string | null;
  baseRevisionId: string;
  expectedRevisionId: string;
  logger: RequestTraceLogger;
  workspaceSignal: AbortSignal;
}) {
  const runWhere = () => ({
    id: runId, projectId, status: "RUNNING" as const, leaseExpiresAt: { gt: new Date() },
  });
  if (!(await prisma.chatRun.findFirst({ where: runWhere(), select: { id: true } }))) {
    return false;
  }

  // The generation signal can already be aborted. Saving the final workspace
  // still needs its own deadline while the run owns the workspace.
  const saveSignal = AbortSignal.any([workspaceSignal, AbortSignal.timeout(120_000)]);
  const changedPaths = await changedWorkspacePaths(projectId, baseRevisionId, saveSignal);
  if (!changedPaths.length) return false;

  const publish = await prepareProjectRevision({
    projectId, expectedRevisionId,
    files: await captureProjectSourceSnapshot(projectId, saveSignal),
    authorType: "AGENT", summary: "Partial agent changes",
  });

  const result = await prisma.$transaction(async (tx) => {
    saveSignal.throwIfAborted();
    const [run] = await tx.chatRun.updateManyAndReturn({
      where: runWhere(),
      data: { status: "FAILED", leaseExpiresAt: null },
      select: { stopRequestedAt: true },
    });
    if (!run) return null;

    const revision = await publish(tx);
    const saved = revision.id !== expectedRevisionId;
    const stopped = Boolean(run.stopRequestedAt);
    const error = stopped ? "You stopped this run." : verificationFailure ?? "This run ended before completion.";
    await tx.chatRun.update({
      where: { id: runId },
      data: {
        status: stopped ? "STOPPED" : "FAILED",
        finishedAt: new Date(),
        resultRevisionId: saved ? revision.id : null,
        error,
      },
    });
    if (saved) await tx.projectContextCheckpoint.deleteMany({ where: { projectId } });
    return { revisionId: revision.id, saved };
  });
  if (!result) return false;

  await markRuntimeRevision(projectId, result.revisionId);
  if (result.saved) {
    await logger.write("revision.partial_saved", { revisionId: result.revisionId, changedPaths });
  }
  return true;
}

export async function getProjectChat(request: Request, { params }: RouteContext) {
  const { id } = await params;
  const project = await getRequestProject(request, id);
  if (!project) return Response.json({ error: "Project not found" }, { status: 404 });
  await recoverInterruptedRun(id);
  const result = await prisma.$transaction(async (tx) => {
    const [run, head, attempts] = await Promise.all([
      tx.chatRun.findFirst({
        where: { projectId: id },
        orderBy: latestRunOrder,
        select: {
          id: true, requestId: true, status: true, error: true, submission: true,
          targetMessageId: true, resultRevisionId: true, createdAt: true, finishedAt: true,
        },
      }),
      tx.project.findUnique({
        where: { id, userId: project.userId },
        select: { currentRevisionId: true },
      }),
      tx.chatRun.findMany({
        where: { projectId: id, status: { in: ["FAILED", "STOPPED"] }, targetMessageId: { not: null }, finishedAt: { not: null } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true, targetMessageId: true, createdAt: true, finishedAt: true, status: true, error: true },
      }),
    ]);
    if (!head) return null;
    const messages = run?.status === "RUNNING"
      ? undefined
      : await getProjectMessages(id, project.userId, tx);
    const summary = run && {
      id: run.id,
      requestId: run.requestId,
      status: run.status,
      error: run.error,
      resultRevisionId: run.resultRevisionId,
      canRetry: canRetryRun(run),
      startedAt: run.createdAt.getTime(),
      finishedAt: run.finishedAt?.getTime() ?? null,
    };
    const failedRuns = attempts.flatMap(attempt => attempt.targetMessageId && attempt.finishedAt ? [{
      id: attempt.id, targetMessageId: attempt.targetMessageId, status: attempt.status, error: attempt.error,
      startedAt: attempt.createdAt.getTime(), finishedAt: attempt.finishedAt.getTime(),
    }] : []);
    return { messages, failedRuns, run: summary, revisionId: head.currentRevisionId } satisfies ProjectChatSnapshot;
  }, { isolationLevel: "RepeatableRead" });
  if (!result) return Response.json({ error: "Project not found" }, { status: 404 });
  return Response.json(result, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function startProjectChat(request: Request, { params }: RouteContext) {
  const { id } = await params;
  const project = await getRequestProject(request, id);
  if (!project) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }
  const parsedBody = chatRequestSchema.safeParse(await request.json().catch(() => undefined));
  if (!parsedBody.success) return invalidMessageResponse();

  const { requestId } = parsedBody.data;
  await recoverInterruptedRun(id);
  const existing = await prisma.chatRun.findUnique({
    where: { projectId_requestId: { projectId: id, requestId } },
    select: { id: true, status: true },
  });
  if (existing) {
    if (existing.status === "RUNNING") {
      try {
        const response = await resumeChatStream(existing.id, request.signal);
        if (response.status !== 204) return response;
      } catch {
        return chatUnavailable();
      }
    }
    return Response.json({ error: "This request was already accepted.", runId: existing.id }, { status: 409 });
  }

  if (await getActiveChatRunId(id)) return workspaceBusy();
  const lease = await acquireWorkspace(id);
  if (!lease) return workspaceBusy();
  const { run, unregister } = registerChatRun(id);
  const handleLeaseLost = () => run.controller.abort(lease.signal.reason);
  lease.signal.addEventListener("abort", handleLeaseLost, { once: true });
  if (lease.signal.aborted) handleLeaseLost();
  const finish = async () => {
    lease.signal.removeEventListener("abort", handleLeaseLost);
    unregister();
    await lease.release();
  };
  let streaming = false;
  try {
    let body: ChatSubmission;
    if ("retryRunId" in parsedBody.data) {
      const latestRun = await prisma.chatRun.findFirst({
        where: { projectId: id },
        orderBy: latestRunOrder,
        select: { id: true, status: true, targetMessageId: true, submission: true },
      });
      if (latestRun?.id !== parsedBody.data.retryRunId || !canRetryRun(latestRun)) {
        return Response.json({ error: "This turn is no longer available to retry." }, { status: 409 });
      }
      const retry = submissionSchema.safeParse(latestRun.submission);
      if (!retry.success) {
        return Response.json({ error: "This turn is no longer available to retry." }, { status: 409 });
      }
      body = retry.data;
    } else {
      body = parsedBody.data.submission;
    }
    let context: Awaited<ReturnType<typeof chatStreams>>["context"];
    try {
      ({ context } = await chatStreams());
    } catch {
      return chatUnavailable();
    }
    const response = await serveProjectChat({
      id, userId: project.userId, body, context, run, requestId, finish, workspaceSignal: lease.signal,
    });
    streaming = response.headers.get("content-type")?.startsWith("text/event-stream") ?? false;
    return response;
  } catch (error) {
    if (error instanceof HttpError) return errorResponse(error.status, error.message, error.details);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return workspaceBusy();
    }
    console.error("Failed to start chat run", error);
    return Response.json({ error: "Failed to start chat. You can retry." }, { status: 500 });
  } finally {
    if (!streaming) {
      try {
        if (run.runId) {
          await settleFailedRun(run.runId, "Failed to start chat. You can retry.").catch(console.error);
        }
      } finally {
        await finish();
      }
    }
  }
}

async function serveProjectChat({
  id, userId, body, context, run, requestId, finish, workspaceSignal,
}: {
  id: string;
  userId: string;
  body: ChatSubmission;
  context: Awaited<ReturnType<typeof chatStreams>>["context"];
  run: ReturnType<typeof registerChatRun>["run"];
  requestId: string;
  finish: () => Promise<void>;
  workspaceSignal: AbortSignal;
}) {
  const signal = run.controller.signal;
  const logger = createRequestTraceLogger(id);
  const rejectRequest = async (errorCode: string, error?: unknown) => {
    await logger.write("request.rejected", { errorCode, error });
    return invalidMessageResponse();
  };

  if (body.trigger === "regenerate-message" && !body.messageId) {
    return rejectRequest("MISSING_MESSAGE_ID");
  }

  const validation = await safeValidateUIMessages<ProjectChatMessage>({
    messages: [body.message],
    metadataSchema,
    dataSchemas: dataPartSchemas,
  });

  if (!validation.success || validation.data.length === 0) {
    return rejectRequest(
      "INVALID_MESSAGE",
      validation.success ? undefined : validation.error,
    );
  }
  const requestMessages = validation.data;

  await logger.write("messages.validated", {
    trigger: body.trigger,
    messageId: body.messageId,
    messageCount: requestMessages.length,
  });

  let lastMessage = requestMessages.at(-1)!;
  if (lastMessage.role === "system") return invalidMessageResponse();
  const isRegeneration = body.trigger === "regenerate-message";
  const isUserSubmission = !isRegeneration && lastMessage.role === "user";
  const isUserInputContinuation = !isRegeneration && lastMessage.role === "assistant";

  if (!isUserInputContinuation) await assertCanGenerate(userId);

  if (isUserInputContinuation) {
    try {
      const continuedMessage = await stageUserInputContinuation(id, lastMessage, logger);
      if (!continuedMessage) {
        return invalidMessageResponse();
      }
      lastMessage = continuedMessage;
    } catch (error) {
      console.error("Failed to persist user-input continuation", error);
      await logger.write("message.continuation_error", { error });
      return invalidMessageResponse();
    }
  }

  if (isUserSubmission) {
    const normalizedMessage = await normalizeSubmittedMessageAssets(id, lastMessage);
    if (!normalizedMessage) {
      return invalidMessageResponse();
    }
    lastMessage = normalizedMessage;
  }

  requestMessages[requestMessages.length - 1] = lastMessage;

  const submittedAssetIds = isUserSubmission ? messageAssetIds([lastMessage]) : [];

  const branchMessageRole = isRegeneration
    ? ChatMessageRole.ASSISTANT
    : isUserSubmission && body.messageId
      ? ChatMessageRole.USER
      : null;
  const branchMessage = branchMessageRole && body.messageId
    ? await findProjectMessage(id, body.messageId, branchMessageRole)
    : null;

  if (branchMessageRole && !branchMessage) {
    return Response.json({ error: "Message not found" }, { status: 404 });
  }

  if (isUserSubmission && branchMessage && branchMessage.id !== lastMessage.id) {
    return invalidMessageResponse();
  }

  const regeneratedMessage = isRegeneration ? branchMessage : null;
  const editedMessage = isUserSubmission ? branchMessage : null;
  const branchBoundary = regeneratedMessage ?? editedMessage;
  const submission = { ...body, message: lastMessage };
  const branch = branchBoundary ? getChatBranch(submission) : undefined;
  const revisionBeforeEdit = editedMessage ? await getRevisionBeforeMessage(id, editedMessage) : null;
  const leaseExpiresAt = nextChatRunLease();
  const runRecord = await prisma.$transaction(async (tx) => {
    if (isUserSubmission) {
      if (submittedAssetIds.length) {
        const claimed = await tx.asset.updateMany({
          where: { id: { in: submittedAssetIds }, projectId: id, status: AssetStatus.READY },
          data: { claimedAt: new Date() },
        });
        if (claimed.count !== submittedAssetIds.length) {
          throw new Error("One or more attachments are unavailable");
        }
      }
      if (editedMessage) {
        // An edit takes effect when it is sent. The message is replaced, and the turns, attempts
        // and file changes that followed it are removed whether or not this run finishes.
        await deleteMessageBranch(tx, id, editedMessage, false);
        await tx.chatMessage.update({
          where: { id: editedMessage.id, projectId: id },
          data: {
            parts: lastMessage.parts as unknown as Prisma.InputJsonValue,
            metadata: lastMessage.metadata === undefined
              ? Prisma.DbNull
              : lastMessage.metadata as Prisma.InputJsonValue,
          },
        });
        const head = await tx.project.findUniqueOrThrow({ where: { id }, select: { currentRevisionId: true } });
        await publishProjectHead(tx, id, head.currentRevisionId, revisionBeforeEdit);
      } else {
        const existing = await tx.chatMessage.findUnique({
          where: { id: lastMessage.id },
          select: { id: true, createdAt: true, projectId: true, role: true, parts: true, metadata: true },
        });
        if (existing) {
          if (existing.projectId !== id || existing.role !== ChatMessageRole.USER ||
              !isDeepStrictEqual(existing.parts, lastMessage.parts) ||
              !isDeepStrictEqual(existing.metadata ?? null, lastMessage.metadata ?? null)) {
            throw new Error("Message already exists");
          }
          const newer = await tx.chatMessage.findFirst({
            where: {
              projectId: id,
              ...messageBoundaryFilter(existing, "after"),
            },
            select: { id: true },
          });
          if (newer) throw new Error("This message already has a later turn");
        } else {
          await tx.chatMessage.create({
            data: {
              id: lastMessage.id, projectId: id, role: ChatMessageRole.USER,
              parts: lastMessage.parts as unknown as Prisma.InputJsonValue,
              metadata: lastMessage.metadata === undefined
                ? Prisma.DbNull
                : lastMessage.metadata as Prisma.InputJsonValue,
            },
          });
        }
      }
    }
    return tx.chatRun.create({
      data: {
        projectId: id, requestId, leaseExpiresAt,
        targetMessageId: branchMessage?.id ?? lastMessage.id,
        // An applied edit is an ordinary turn, so retrying it runs the message again without branching.
        submission: JSON.parse(JSON.stringify(
          editedMessage ? { trigger: body.trigger, message: lastMessage } : submission,
        )) as Prisma.InputJsonValue,
      },
      select: { id: true, createdAt: true },
    });
  });
  run.startHeartbeat(runRecord.id, leaseExpiresAt);

  const prepareContext = async () => {
    const currentRevisionId = await ensureProjectBaseline(id, signal);
    const expectedRevisionId = currentRevisionId;
    const baselineRevisionId = branchBoundary
      ? (await getRevisionBeforeMessage(id, branchBoundary)) ?? currentRevisionId
      : currentRevisionId;

    const checkpointRecord = await prisma.projectContextCheckpoint.findUnique({
      where: { projectId: id },
      select: {
        projectId: true,
        throughMessageId: true,
        checkpointMessages: true,
        retainedAssetIds: true,
        throughMessage: {
          select: { id: true, createdAt: true, projectId: true },
        },
      },
    });
    const generationBoundary = branchBoundary ?? undefined;
    const checkpointIsCanonical = checkpointRecord?.throughMessage.projectId === id &&
      (!isUserInputContinuation || checkpointRecord.throughMessageId !== lastMessage.id) &&
      checkpointCanSeedGeneration(
        checkpointRecord.throughMessage,
        generationBoundary,
      );

    const storedContextCheckpoint = checkpointIsCanonical ? checkpointRecord : null;

    const [canonicalMessages, canonicalUserMessages] = await Promise.all([
      getCanonicalMessages(id, {
        before: generationBoundary,
        after: checkpointIsCanonical ? checkpointRecord.throughMessage : undefined,
        errorMessage: "Stored project messages failed validation",
      }),
      getCanonicalMessages(id, {
        role: ChatMessageRole.USER,
        latest: true,
        before: generationBoundary,
        errorMessage: "Stored project user messages failed validation",
      }),
    ]);

    if (editedMessage) canonicalMessages.push(lastMessage);
    if (isUserInputContinuation) {
      const index = canonicalMessages.findIndex(({ id }) => id === lastMessage.id);
      if (index !== canonicalMessages.length - 1 || index < 0) throw new Error("The questionnaire is no longer the latest message.");
      canonicalMessages[index] = lastMessage;
    }
    const candidateAssetIds = [
      ...new Set([
        ...(storedContextCheckpoint?.retainedAssetIds ?? []),
        ...messageAssetIds(canonicalMessages),
      ]),
    ];
    const requiredAssetIds = messageAssetIds(editedMessage ? [lastMessage] : canonicalUserMessages.slice(-1));
    const needsSource = canonicalMessages.some((message) => message.metadata?.selections?.length);
    const [resolvedMessageAssets, baseFiles] = await Promise.all([
      resolveMessageAssetsForModel(id, canonicalMessages),
      needsSource
        ? getProjectRevisionFiles(id, baselineRevisionId).then(({ files }) => files)
        : getProjectRevisionFile(id, DESIGN_STATE_PATH, baselineRevisionId).then(
          (file) => [file],
          (error: unknown) => {
            if (error instanceof ProjectSourceNotFound) return [];
            throw error;
          },
        ),
    ]);
    const modelUIMessages = resolvedMessageAssets.messages;
    const modelAssetsByUrl = resolvedMessageAssets.assetsByModelUrl;
    const baseRevisionId = baselineRevisionId;
    await prepareProjectRuntime(
      id,
      { revisionId: baseRevisionId, ...(needsSource ? { files: baseFiles } : {}) },
      signal,
    );
    await logger.write("generation.prepared", {
      baseRevisionId, messageCount: modelUIMessages.length,
    });
    return {
      baseRevisionId, expectedRevisionId, baseFiles,
      storedContextCheckpoint, candidateAssetIds, requiredAssetIds, modelUIMessages, modelAssetsByUrl,
    };
  };
  let prepared: Awaited<ReturnType<typeof prepareContext>> | undefined;

  const outcome: AgentOutcome = {
    generationFailed: false,
    failedSourceTools: new Set(),
    finalAgentModelMessages: [],
    completedAgentStep: false,
    compactedThisRun: false,
    agentGenerationEnded: false,
  };
  const session = new BuildSession();
  let savedReply = "";
  let finishedActivity: ActivityMarker | undefined;
  const activity: ActivityMarker = {
    type: "data-activity", id: runRecord.id,
    data: { runId: runRecord.id, startedAt: runRecord.createdAt.getTime(), finishedAt: null },
  };

  const events = await context.createNewResumableStream(runRecord.id, () => createUIMessageStreamResponse({
    keepAliveMs: 15_000,
    stream: createUIMessageStream({
      originalMessages: requestMessages,
      onError: (error) => {
        outcome.generationFailed = true;
        console.error("Chat generation failed", error);
        logger.track(logger.write("stream.error", { error }));
        return "Generation was interrupted. You can retry this run.";
      },
      execute: async ({ writer }) => {
        writer.write({ type: "data-run", data: { id: runRecord.id, requestId, branch }, transient: true });

        writer.write({ type: "start" });
        writer.write(activity);
        prepared = await prepareContext();
        signal.throwIfAborted();
        await streamProjectAgent({
          id, writer, signal, logger, session, outcome, requestMessages, ...prepared,
          previousDesign: regeneratedMessage ? replacedDesign(regeneratedMessage.modelParts) : null,
        });
      },
      onEnd: async ({
        responseMessage,
        isAborted,
        isContinuation,
        finishReason,
      }) => {
        const currentParts = getRunParts(responseMessage.parts, runRecord.id);
        const finalText = getMessageText({ parts: visibleAssistantParts(currentParts) }).trim();
        const awaitingUserInput = currentParts.some(
          (part) => part.type === "tool-requestUserInput" &&
            part.state === "input-available",
        );
        const semanticallyComplete =
          awaitingUserInput ||
          (outcome.agentGenerationEnded && outcome.agentFinishReason === "stop" &&
            finalText.length > 0);
        if (!isAborted && !semanticallyComplete) {
          outcome.generationFailed = true;
          await logger.write("generation.incomplete", {
            finishReason: outcome.agentFinishReason ?? finishReason,
            finalTextCharacters: finalText.length,
            awaitingUserInput,
          });
        }
        await logger.write("stream.ended", {
          finishReason,
          isAborted,
          messageId: responseMessage.id,
          finalTextCharacters: finalText.length,
          awaitingUserInput,
        });

        try {
          signal.throwIfAborted();
          if (isAborted || outcome.generationFailed || !prepared) {
            throw new Error("The agent did not finish.");
          }
          const { baseRevisionId, expectedRevisionId } = prepared;
          const changedPaths = await changedWorkspacePaths(id, baseRevisionId, signal);
          if (!session.verificationIsCurrent &&
              (changedPaths.length > 0 || outcome.failedSourceTools.size > 0)) {
            throw new Error("The agent did not finish the source changes.");
          }
          const publish = changedPaths.length
            ? await prepareProjectRevision({
              projectId: id, expectedRevisionId, parentRevisionId: baseRevisionId,
              files: await captureProjectSourceSnapshot(id, signal), authorType: "AGENT",
            })
            : null;
          const checkpoint = shouldPersistContextCheckpoint({
            compactedThisRun: outcome.compactedThisRun,
            completedAgentStep: outcome.completedAgentStep,
            generationFailed: outcome.generationFailed,
            aborted: isAborted,
          }) ? await prepareContextCheckpointForStorage({
            projectId: id, messages: outcome.finalAgentModelMessages,
          }).catch(() => null) : null;

          const result = await prisma.$transaction(async (tx) => {
            signal.throwIfAborted();
            const committed = await tx.chatRun.updateMany({
              where: {
                id: runRecord.id,
                status: "RUNNING",
                stopRequestedAt: null,
                leaseExpiresAt: { gt: new Date() },
              },
              data: { status: "COMMITTED", leaseExpiresAt: null },
            });
            if (committed.count !== 1) throw new Error("The run has already ended.");
            if (!isUserInputContinuation) await chargeGeneration(tx, userId, runRecord.id);
            const revisionId = publish ? (await publish(tx)).id : baseRevisionId;
            if (!publish) await publishProjectHead(tx, id, expectedRevisionId, revisionId);
            if (regeneratedMessage) await deleteMessageBranch(tx, id, regeneratedMessage, true);
            const finishedAt = new Date();
            const modelParts = filterEmptyReasoningPartsForStorage(responseMessage.parts).map(part =>
              part.type === "data-activity" && part.data.runId === runRecord.id
                ? { ...part, data: { ...part.data, finishedAt: finishedAt.getTime() } }
                : part,
            );
            const assistantData = {
              revisionId,
              parts: visibleAssistantParts(modelParts).filter(part => !isActivityDetail(part)) as unknown as Prisma.InputJsonValue,
              modelParts: modelParts as unknown as Prisma.InputJsonValue,
              metadata: responseMessage.metadata as Prisma.InputJsonValue | undefined,
            };
            if (isUserInputContinuation && isContinuation) {
              await tx.chatMessage.update({
                where: { id: lastMessage.id, projectId: id, role: ChatMessageRole.ASSISTANT },
                data: assistantData,
              });
            } else {
              await tx.chatMessage.create({
                data: { projectId: id, id: responseMessage.id, role: ChatMessageRole.ASSISTANT, ...assistantData },
              });
            }
            if (checkpoint) {
              const data = { throughMessageId: responseMessage.id, ...checkpoint };
              await tx.projectContextCheckpoint.upsert({
                where: { projectId: id },
                create: { projectId: id, ...data },
                update: data,
              });
            } else if (branchBoundary || isUserInputContinuation) {
              await tx.projectContextCheckpoint.deleteMany({ where: { projectId: id } });
            }
            await tx.chatRun.update({
              where: { id: runRecord.id },
              data: { resultRevisionId: revisionId, responseMessageId: responseMessage.id, finishedAt, submission: Prisma.DbNull },
            });
            return { revisionId, finishedAt };
          });
          const resultRevisionId = result.revisionId;
          finishedActivity = { ...activity, data: { ...activity.data, finishedAt: result.finishedAt.getTime() } };
          if (!awaitingUserInput) savedReply = finalText;
          await markRuntimeRevision(id, resultRevisionId);
          await logger.write("response.persisted", { revisionId: resultRevisionId, changedPaths });
        } catch (error) {
          await logger.write("response.incomplete", { error });
          await prisma.chatRun.updateMany({
            where: { id: runRecord.id, status: "RUNNING" },
            data: { failedActivity: getActivityDetails(responseMessage.parts, runRecord.id) as unknown as Prisma.InputJsonValue },
          }).catch(console.error);
          const saved = prepared && !workspaceSignal.aborted && await savePartialProjectRevision({
            projectId: id, runId: runRecord.id, logger, workspaceSignal,
            verificationFailure: session.lastVerificationFailure,
            baseRevisionId: prepared.baseRevisionId,
            expectedRevisionId: prepared.expectedRevisionId,
          }).catch(async (saveError) => {
            await logger.write("revision.partial_save_failed", { error: saveError });
            return false;
          });

          if (!saved) {
            await settleFailedRun(
              runRecord.id,
              session.lastVerificationFailure ?? "The run ended before completion. The last saved version is still available.",
              workspaceSignal.aborted ? undefined : () => reloadCommittedRuntime(id, workspaceSignal),
            ).catch(console.error);
          }
        } finally {
          await finish();
          await logger.flush();
        }
      },
    }).pipeThrough(streamFinalReply(() => savedReply, () => finishedActivity)),
  }).body!.pipeThrough(new TextDecoderStream()));

  if (!events) return chatUnavailable();
  return streamResponse(events);
}
