"use client";

import type { ElementSelection } from "@/ai/message/metadata";
import type { UserInputResponse } from "@/ai/tools/request-user-input";
import type {
  ChatRun,
  FailedChatRun,
  ProjectChatMessage,
  ProjectChatSnapshot,
} from "@/lib/project-chat/protocol";
import { applyChatBranch, type ChatBranch } from "@/lib/project-chat/branch";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Suspense,
  use,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useChat } from "@ai-sdk/react";
import { Provider as WorkbenchStateProvider } from "jotai";
import { useQueryClient } from "@tanstack/react-query";
import { DefaultChatTransport } from "ai";
import {
  ArrowDownLeftIcon,
  ChevronDownIcon,
  FolderKanbanIcon,
  HistoryIcon,
  LogOutIcon,
  SettingsIcon,
} from "lucide-react";
import { toast } from "sonner";

import { BloomLogo } from "@/components/bloom-logo";
import { ChatMessages } from "@/components/chat-messages";
import { ProjectVersions } from "@/components/project-versions";
import { ProjectWorkbench } from "@/components/project-workbench";
import {
  PreviewAddressBar,
  WorkbenchViewSwitch,
} from "@/components/workbench-controls";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useRenameProject } from "@/hooks/use-projects";
import { refreshProject } from "@/lib/projects/query";
import { billingQueryKey } from "@/hooks/use-billing";
import { useCompletionAlert } from "@/hooks/use-completion-alert";
import { OUT_OF_CREDITS } from "@/lib/billing";
import { ensureResponseOk } from "@/lib/http";
import { authClient } from "@/lib/auth-client";
import {
  CHAT_ATTACHMENT_ACCEPT,
  MAX_CHAT_ATTACHMENTS,
  MAX_CHAT_ATTACHMENTS_SIZE,
  MAX_CHAT_ATTACHMENT_SIZE,
  type ChatFilePart,
} from "@/lib/assets";
import {
  discardProjectAsset,
  uploadProjectAssets,
} from "@/lib/projects/uploads.client";
import {
  answeredUserInput,
  getMessageFiles,
  getMessageText,
  type EditingMessage,
} from "@/lib/project-chat/message";
import {
  ELEMENT_SELECTED_EVENT,
  MAX_SELECTIONS,
  SEND_TO_CHAT_EVENT,
  selectionKey,
  type SendToChatDetail,
} from "@/lib/design-mode/selection";
import ChatSessionErrorBoundary from "./chat-session-error-boundary";
import {
  PromptInputAddButton,
  PromptInputContextUsage,
  PromptInputMeta,
  PromptInputMeter,
} from "@/components/prompt-input/prompt-controls";
import { PromptInputDictation } from "@/components/prompt-input/prompt-dictation";
import {
  PromptInput,
  PromptInputAttachments,
  PromptInputBody,
  PromptInputActions,
  PromptInputQueue,
  PromptInputSelections,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  type PromptMessage,
} from "@/components/prompt-input/prompt-input";

type ProjectChatProps = {
  projectId: string;
  projectTitle: string;
  initialMessages: Promise<ProjectChatMessage[]>;
  user: {
    name: string;
    email: string;
    image?: string | null;
  };
};

function isFilePart(value: unknown): value is ChatFilePart {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { type?: unknown }).type === "file" &&
    typeof (value as { url?: unknown }).url === "string" &&
    typeof (value as { mediaType?: unknown }).mediaType === "string"
  );
}

type SubmissionReceipt = {
  id: string;
  accepted: boolean;
  error?: Error;
  onAccepted?: () => void;
};

function projectChatTransport(endpoint: string) {
  let receipt: SubmissionReceipt | undefined;
  let submitted: SubmissionReceipt | undefined;
  let onAccepted: (() => void) | undefined;
  let stopped = false;
  const transport = new DefaultChatTransport<ProjectChatMessage>({
    api: endpoint,
    prepareReconnectToStreamRequest: () => ({ api: `${endpoint}/stream` }),
    prepareSendMessagesRequest: ({ messageId, messages, trigger, body }) => {
      const requestId = crypto.randomUUID();
      receipt = { id: requestId, accepted: false, onAccepted };
      submitted ??= receipt;
      onAccepted = undefined;
      stopped = false;
      return {
        body: body?.retryRunId
          ? { requestId, retryRunId: body.retryRunId }
          : {
              requestId,
              submission: { trigger, messageId, message: messages.at(-1) },
            },
      };
    },
  });
  return {
    transport,
    receipt: () => receipt,
    // The request the composer sent. A request the chat sends by itself afterwards has its own receipt.
    submitted: () => submitted,
    reset(accept?: () => void) {
      receipt = submitted = undefined;
      onAccepted = accept;
    },
    // A stopped run is not continued by the chat itself; the user's next request or answer clears this.
    continues: () => !stopped,
    setStopped(value: boolean) {
      stopped = value;
    },
    accept(requestId: string | undefined) {
      if (!receipt || receipt.id !== requestId || receipt.accepted) return;
      receipt.accepted = true;
      receipt.onAccepted?.();
    },
  };
}

type ProjectChatSessionProps = {
  projectId: string;
  initialMessages: Promise<ProjectChatMessage[]>;
};

/** The transport reports a rejected request with its raw response body as the message. */
function parseChatError(error: Error): { message: string; code?: string } {
  try {
    const body = JSON.parse(error.message) as { error?: unknown; code?: unknown };
    if (typeof body.error === "string") {
      return { message: body.error, code: typeof body.code === "string" ? body.code : undefined };
    }
  } catch {
    // Not a JSON error body.
  }
  return { message: error.message || "Chat request failed" };
}

function latestContextUsage(messages: ProjectChatMessage[]) {
  for (let index = messages.length - 1; index >= 0; index--) {
    if (messages[index].role !== "assistant") continue;
    const part = messages[index].parts.findLast(
      (part) => part.type === "data-context-usage",
    );
    if (part) return part.data;
  }
  return undefined;
}

function ProjectChatSession({
  projectId,
  initialMessages: initialMessagesPromise,
}: ProjectChatSessionProps) {
  const initialMessages = use(initialMessagesPromise);
  const [editingMessage, setEditingMessage] = useState<EditingMessage | null>(
    null,
  );
  const [failedRuns, setFailedRuns] = useState<FailedChatRun[]>([]);
  const [run, setRun] = useState<ChatRun | null>(null);
  const [settling, setSettling] = useState(false);
  const [selections, setSelections] = useState<ElementSelection[]>([]);
  const [focusComposer, setFocusComposer] = useState(true);
  const draftSelectionsRef = useRef<ElementSelection[]>([]);
  const activeRunId = useRef<string | null>(null);
  const pendingStop = useRef<string | null>(null);
  const reconciliation = useRef<Promise<ChatRun | null> | null>(null);
  const reconciliationOrder = useRef({ requested: 0, applied: 0 });
  const applyStreamBranch = useRef<((branch: ChatBranch) => void) | null>(null);
  const client = useQueryClient();
  const router = useRouter();
  const alertCompletion = useCompletionAlert();
  const endpoint = `/api/projects/${projectId}/chat`;

  const connection = useMemo(() => projectChatTransport(endpoint), [endpoint]);

  const requestStop = useCallback(
    async (runId: string) => {
      try {
        const response = await fetch(`${endpoint}/stop`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ runId }),
        });
        if (response.status === 409) return;
        await ensureResponseOk(response, "Failed to stop run");
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to stop run",
        );
      }
    },
    [endpoint],
  );

  const {
    messages,
    sendMessage,
    status,
    regenerate,
    setMessages,
    addToolOutput,
    resumeStream,
  } = useChat<ProjectChatMessage>({
    id: projectId,
    messages: initialMessages,
    transport: connection.transport,
    resume: true,
    sendAutomaticallyWhen: ({ messages }) =>
      connection.continues() && answeredUserInput(messages),
    onData(part) {
      if (part.type === "data-run") {
        const { branch } = part.data;
        if (branch) {
          const order = reconciliationOrder.current;
          order.applied = ++order.requested;
          applyStreamBranch.current?.(branch);
        }
        activeRunId.current = part.data.id;
        connection.accept(part.data.requestId);
        if (pendingStop.current === part.data.requestId) {
          pendingStop.current = null;
          void requestStop(part.data.id);
        }
      }
    },
    onError(error) {
      const sent = connection.receipt();
      if (sent) sent.error = error;
      const { message, code } = parseChatError(error);
      if (code === OUT_OF_CREDITS) {
        toast.error(message, {
          action: { label: "Get credits", onClick: () => router.push("/dashboard/billing") },
        });
      } else {
        toast.error(message);
      }
    },
    onFinish({ isAbort, isDisconnect, isError }) {
      if (!isAbort && !isDisconnect && !isError) {
        alertCompletion("Bloom finished", "Your project is ready to preview.");
        void client.invalidateQueries({ queryKey: billingQueryKey });
      }
      setSettling(true);
      reconciliation.current = reconcile()
        .then((result) => {
          setSettling(false);
          return result;
        })
        .catch(() => null);
    },
  });

  useLayoutEffect(() => {
    applyStreamBranch.current = (branch) => {
      setMessages((current) => applyChatBranch(current, branch));
      // The attempts made on the message's earlier text went with the edit.
      if (branch.editedMessage)
        setFailedRuns((runs) =>
          runs.filter((run) => run.targetMessageId !== branch.messageId),
        );
    };
    return () => {
      applyStreamBranch.current = null;
    };
  }, [setMessages]);

  // Only completed steps persist usage. Pre-step estimates can carry a previous step's breakdown.
  const usage = latestContextUsage(messages);
  const streaming = status === "streaming" || status === "submitted";

  const reconcile = useCallback(
    async (signal?: AbortSignal) => {
      const order = reconciliationOrder.current;
      const sequence = ++order.requested;
      const currentReceipt = connection.receipt();
      const response = await fetch(endpoint, { cache: "no-store", signal });
      await ensureResponseOk(response, "Failed to check chat status");
      const result = (await response.json()) as ProjectChatSnapshot;
      if (
        signal?.aborted ||
        sequence < order.applied ||
        currentReceipt !== connection.receipt()
      )
        return null;
      order.applied = sequence;
      connection.accept(result.run?.requestId);
      setRun(result.run);
      setFailedRuns(result.failedRuns);
      activeRunId.current =
        result.run?.status === "RUNNING" ? result.run.id : null;
      if (result.run && pendingStop.current === result.run.requestId) {
        pendingStop.current = null;
        if (result.run.status === "RUNNING") void requestStop(result.run.id);
      }
      if (result.messages) {
        setMessages(result.messages);
        void refreshProject(client, projectId);
      }
      return result.run;
    },
    [client, connection, endpoint, projectId, requestStop, setMessages],
  );

  useEffect(() => {
    const controller = new AbortController();
    void reconcile(controller.signal).catch(() => {});
    return () => controller.abort();
  }, [reconcile]);

  useEffect(() => {
    if (streaming || (!settling && run?.status !== "RUNNING")) return;
    const controller = new AbortController();
    const check = async () => {
      try {
        const current = await reconcile(controller.signal);
        if (controller.signal.aborted) return;
        setSettling(false);
        if (current?.status === "RUNNING") await resumeStream();
      } catch {
        // Keep checking when there is no stream and the status request fails.
      }
      if (!controller.signal.aborted) timer = window.setTimeout(check, 2_000);
    };
    let timer = window.setTimeout(check, 2_000);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [reconcile, resumeStream, run?.status, settling, streaming]);

  const stopRun = async () => {
    connection.setStopped(true);
    if (activeRunId.current) return requestStop(activeRunId.current);
    const sent = connection.receipt();
    if (sent && !sent.accepted && !sent.error) {
      pendingStop.current = sent.id;
      return;
    }
    const current = await reconcile().catch(() => null);
    if (current?.status === "RUNNING") await requestStop(current.id);
  };

  const busy = streaming || settling || run?.status === "RUNNING";
  const retryRun = async () => {
    if (!run?.canRetry || busy) return;
    await sendMessage(undefined, { body: { retryRunId: run.id } });
  };

  useEffect(() => {
    function onSendToChat(event: Event) {
      const { text, selections } = (event as CustomEvent<SendToChatDetail>)
        .detail;
      if (busy) {
        toast.info("Bloom is still working. Try again when it finishes.");
        return;
      }
      sendMessage({ text, metadata: { selections } });
    }

    window.addEventListener(SEND_TO_CHAT_EVENT, onSendToChat);
    return () => window.removeEventListener(SEND_TO_CHAT_EVENT, onSendToChat);
  }, [busy, sendMessage]);

  useEffect(() => {
    function onElementSelected(event: Event) {
      const selection = (event as CustomEvent<ElementSelection>).detail;
      if (!selection) return;

      setSelections((current) => {
        const key = selectionKey(selection);
        if (current.some((item) => selectionKey(item) === key)) {
          return current;
        }
        return [...current, selection].slice(-MAX_SELECTIONS);
      });
    }

    window.addEventListener(ELEMENT_SELECTED_EVENT, onElementSelected);
    return () =>
      window.removeEventListener(ELEMENT_SELECTED_EVENT, onElementSelected);
  }, []);

  const startEditingMessage = useCallback(
    (message: ProjectChatMessage) => {
      if (!editingMessage) {
        draftSelectionsRef.current = selections;
      }
      setFocusComposer(false);
      setEditingMessage({
        id: message.id,
        text: getMessageText(message),
        files: getMessageFiles(message),
        ...(message.metadata ? { metadata: message.metadata } : {}),
      });
      setSelections(message.metadata?.selections ?? []);
    },
    [editingMessage, selections],
  );

  const cancelEditingMessage = useCallback(() => {
    setEditingMessage(null);
    setSelections(draftSelectionsRef.current);
    setFocusComposer(true);
  }, []);

  const deleteMessage = useCallback(
    async (messageId: string) => {
      const response = await fetch(
        `/api/projects/${projectId}/chat/messages/${messageId}`,
        { method: "DELETE" },
      );

      await ensureResponseOk(response, "Failed to delete message");

      const deleteIndex = messages.findIndex(
        (message) => message.id === messageId,
      );

      if (deleteIndex !== -1) {
        const removedIds = new Set(
          messages.slice(deleteIndex).map(({ id }) => id),
        );

        const remaining = messages.slice(0, deleteIndex);
        setMessages(remaining);
        if (editingMessage && removedIds.has(editingMessage.id)) {
          cancelEditingMessage();
        }
      }

      void refreshProject(client, projectId);
      setRun(null);
      toast.success("Message deleted");
    },
    [
      cancelEditingMessage,
      client,
      editingMessage,
      messages,
      projectId,
      setMessages,
    ],
  );

  const upload = useCallback(
    async (
      file: File,
      {
        signal,
        onProgress,
      }: { signal: AbortSignal; onProgress: (progress: number) => void },
    ) => {
      const [part] = await uploadProjectAssets(projectId, [file], {
        signal,
        onProgress,
      });
      return part;
    },
    [projectId],
  );

  const discard = useCallback(
    (entry: { result?: unknown }) => {
      if (!isFilePart(entry.result)) return;
      void discardProjectAsset(projectId, entry.result).catch(() => undefined);
    },
    [projectId],
  );

  const send = async ({
    text,
    files,
    selections: messageSelections,
  }: PromptMessage) => {
    const parts = files.flatMap((file) =>
      isFilePart(file.result) ? [file.result] : [],
    );
    const fileParts = parts.length > 0 ? { files: parts } : {};
    const selected = messageSelections ?? [];
    const metadata =
      selected.length > 0
        ? { ...(editingMessage?.metadata ?? {}), selections: selected }
        : editingMessage?.metadata?.selections
          ? { selections: undefined }
          : undefined;
    const metadataPart = metadata ? { metadata } : {};

    connection.reset(editingMessage ? cancelEditingMessage : undefined);
    reconciliation.current = null;
    await sendMessage({
      text,
      ...fileParts,
      ...(editingMessage ? { messageId: editingMessage.id } : {}),
      ...metadataPart,
    });
    await reconciliation.current;
    const sent = connection.submitted();
    if (!sent?.accepted && sent?.error) throw sent.error;
  };

  return (
    <>
      <ChatMessages
        projectId={projectId}
        failedRuns={failedRuns}
        messages={messages}
        busy={busy}
        editingMessageId={editingMessage?.id ?? null}
        onDelete={deleteMessage}
        onEdit={startEditingMessage}
        onRegenerate={regenerate}
        onSubmitUserInput={(toolCallId, output: UserInputResponse) => {
          connection.setStopped(false);
          return addToolOutput({
            tool: "requestUserInput",
            toolCallId,
            output,
          });
        }}
      />

      <div
        key="composer"
        className="mx-auto w-full max-w-3xl px-4 pb-3"
        onKeyDown={(event) => {
          if (
            event.key !== "Escape" ||
            event.defaultPrevented ||
            event.repeat ||
            event.nativeEvent.isComposing ||
            event.nativeEvent.keyCode === 229 ||
            !event.currentTarget.contains(event.target as Node) ||
            event.currentTarget.querySelector("[data-dictating]")
          )
            return;
          if (!busy && !editingMessage) return;
          event.preventDefault();
          if (busy) void stopRun();
          else cancelEditingMessage();
        }}
      >
        {settling && !streaming && (
          <p role="status" className="mb-2 px-3 text-xs text-muted-foreground">
            Checking whether the run was saved…
          </p>
        )}
        {run?.canRetry && !busy && (
          <div className="mb-2 flex items-center justify-between gap-3 rounded-lg bg-muted/60 px-3 py-1.5 text-xs">
            <span>
              {run.error}
              {run.resultRevisionId &&
                " Changes were saved as a partial version."}
            </span>
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={() => void retryRun()}
            >
              Retry run
            </Button>
          </div>
        )}
        {editingMessage ? (
          <div className="mb-2 flex items-center justify-between gap-3 rounded-lg bg-muted/60 px-3 py-1.5 text-xs text-muted-foreground">
            <span>Editing message</span>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              disabled={busy}
              onClick={cancelEditingMessage}
            >
              Cancel
            </Button>
          </div>
        ) : null}

        <PromptInput
          key={editingMessage?.id ?? "new"}
          status={busy && !streaming ? "submitted" : status}
          onStop={() => void stopRun()}
          onSubmit={send}
          accept={CHAT_ATTACHMENT_ACCEPT}
          maxFiles={MAX_CHAT_ATTACHMENTS}
          maxFileSize={MAX_CHAT_ATTACHMENT_SIZE}
          maxTotalSize={MAX_CHAT_ATTACHMENTS_SIZE}
          defaultValue={editingMessage?.text ?? ""}
          initialFiles={editingMessage?.files}
          upload={upload}
          onDiscard={discard}
          selections={selections}
          onSelectionsChange={setSelections}
          maxLength={8000}
          draftKey={editingMessage ? undefined : projectId}
        >
          <PromptInputQueue />
          <PromptInputSelections />

          <PromptInputBody className="ring-1 ring-border focus-within:ring-2">
            <PromptInputAttachments />

            <PromptInputTools>
              <PromptInputAddButton />
            </PromptInputTools>

            <PromptInputTextarea
              autoFocus={editingMessage !== null || focusComposer}
              placeholder={
                editingMessage
                  ? "Edit your message"
                  : "Describe what you want to generate"
              }
            />

            <PromptInputActions>
              <PromptInputMeter />
              <PromptInputDictation />
              <PromptInputSubmit />
            </PromptInputActions>
          </PromptInputBody>
          <PromptInputMeta>
            <PromptInputContextUsage usage={usage} />
          </PromptInputMeta>
        </PromptInput>
      </div>
    </>
  );
}

function ProjectChatSessionFallback() {
  return (
    <>
      <div className="flex w-full max-w-2xl flex-1 flex-col gap-5 p-4 pt-8">
        <Skeleton className="h-16 w-3/5 self-end rounded-2xl" />
        <Skeleton className="h-24 w-4/5 rounded-2xl" />
        <Skeleton className="h-12 w-2/5 self-end rounded-2xl" />
      </div>
      <div className="z-10 w-full max-w-2xl shrink-0 p-3 pt-0">
        <Skeleton className="h-28 w-full rounded-xl" />
      </div>
    </>
  );
}

export function ProjectChat(props: ProjectChatProps) {
  return (
    <WorkbenchStateProvider key={props.projectId}>
      <ProjectWorkspace {...props} />
    </WorkbenchStateProvider>
  );
}

function ProjectWorkspace({
  projectId,
  projectTitle,
  initialMessages,
  user,
}: ProjectChatProps) {
  const router = useRouter();
  const renameProject = useRenameProject();
  const isSavingTitle = renameProject.isPending;
  const cancelTitleSaveRef = useRef(false);
  const titleRef = useRef(projectTitle);
  const [titleDraft, setTitleDraft] = useState(projectTitle);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);

  const saveTitle = async () => {
    if (isSavingTitle) return;

    const nextTitle = titleDraft.trim();
    if (!nextTitle || nextTitle === titleRef.current) {
      setTitleDraft(titleRef.current);
      return;
    }

    try {
      const project = await renameProject.mutateAsync({
        id: projectId,
        title: nextTitle,
      });
      titleRef.current = project.title;
      setTitleDraft(project.title);
      toast.success("Project renamed");
    } catch (error) {
      setTitleDraft(titleRef.current);
      toast.error(
        error instanceof Error ? error.message : "Failed to rename project",
      );
    }
  };

  const signOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);

    try {
      await authClient.signOut({
        fetchOptions: {
          onSuccess() {
            router.replace("/");
            router.refresh();
          },
          onError() {
            toast.error("Failed to sign out");
          },
        },
      });
    } catch {
      toast.error("Failed to sign out");
    } finally {
      setIsSigningOut(false);
    }
  };

  const avatarFallback = user.name.charAt(0).toUpperCase() || "U";

  return (
    <main className="flex h-svh flex-col overflow-hidden bg-muted">
      <header className="flex h-14 w-full items-center border-b bg-card px-4">
        <Button
          size="icon"
          variant="ghost"
          aria-label="Back to projects"
          className="group/logo relative"
          nativeButton={false}
          render={<Link href="/dashboard/projects" prefetch={false} />}
        >
          <BloomLogo
            animated
            className="group-hover/logo:opacity-0 duration-150"
          />

          <ArrowDownLeftIcon className="opacity-0 group-hover/logo:opacity-100 transition-[transform,opacity] absolute group-hover/logo:rotate-45 duration-200" />
        </Button>

        <Separator
          orientation="vertical"
          className="mx-2 my-auto h-full max-h-2/5 rounded-full"
        />

        <div className="w-58 flex items-center justify-start">
          <Input
            value={titleDraft}
            aria-label="Project name"
            aria-busy={isSavingTitle}
            maxLength={80}
            disabled={isSavingTitle}
            className="field-sizing-content w-fit max-w-56 border-none hover:cursor-pointer hover:bg-muted focus-within:hover:cursor-text focus-within:hover:bg-background"
            onChange={(event) => setTitleDraft(event.target.value)}
            onFocus={(event) => event.currentTarget.select()}
            onBlur={() => {
              if (cancelTitleSaveRef.current) {
                cancelTitleSaveRef.current = false;
                return;
              }

              void saveTitle();
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                cancelTitleSaveRef.current = true;
                setTitleDraft(titleRef.current);
                event.currentTarget.blur();
              } else if (event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.blur();
              }
            }}
          />
        </div>

        <Separator
          orientation="vertical"
          className="mx-2 my-auto h-full max-h-2/5 rounded-full"
        />

        <Button
          type="button"
          variant="ghost"
          onClick={() => setVersionsOpen(true)}
        >
          <HistoryIcon />
          Versions
        </Button>

        <Separator
          orientation="vertical"
          className="mx-4 my-auto h-full max-h-2/5 rounded-full"
        />

        <WorkbenchViewSwitch />

        <Separator
          orientation="vertical"
          className="mx-4 my-auto h-full max-h-2/5 rounded-full"
        />

        <PreviewAddressBar projectId={projectId} />

        <div className="flex items-center gap-2 ml-auto">
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button size="lg" variant="ghost" />}>
              <Avatar className="size-7">
                <AvatarImage src={user.image || undefined} alt={user.name} />
                <AvatarFallback>{avatarFallback}</AvatarFallback>
              </Avatar>
              <ChevronDownIcon className="size-3.5 text-muted-foreground" />
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" sideOffset={6} className="w-64">
              <DropdownMenuGroup>
                <DropdownMenuLabel className="flex items-center gap-2 p-2">
                  <Avatar className="size-9">
                    <AvatarImage
                      src={user.image || undefined}
                      alt={user.name}
                    />
                    <AvatarFallback>{avatarFallback}</AvatarFallback>
                  </Avatar>
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-foreground">
                      {user.name}
                    </span>
                    <span className="block truncate font-normal">
                      {user.email}
                    </span>
                  </span>
                </DropdownMenuLabel>

                <DropdownMenuSeparator />

                <DropdownMenuItem
                  render={<Link href="/dashboard/projects" prefetch={false} />}
                >
                  <FolderKanbanIcon />
                  Projects
                </DropdownMenuItem>
                <DropdownMenuItem
                  render={<Link href="/dashboard/settings" prefetch={false} />}
                >
                  <SettingsIcon />
                  Settings
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                <DropdownMenuItem
                  variant="destructive"
                  disabled={isSigningOut}
                  onClick={() => void signOut()}
                >
                  <LogOutIcon />
                  {isSigningOut ? "Signing out..." : "Sign out"}
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <ProjectWorkbench
        projectId={projectId}
        chat={
          <ChatSessionErrorBoundary>
            <Suspense fallback={<ProjectChatSessionFallback />}>
              <ProjectChatSession
                projectId={projectId}
                initialMessages={initialMessages}
              />
            </Suspense>
          </ChatSessionErrorBoundary>
        }
      />

      <ProjectVersions
        projectId={projectId}
        open={versionsOpen}
        onOpenChange={setVersionsOpen}
      />
    </main>
  );
}
