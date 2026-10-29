"use client";

import type { DataPart } from "@/ai/message/data-part";
import type { Metadata } from "@/ai/message/metadata";
import type { ToolSet } from "@/ai/tools";
import type { UserInputResponse } from "@/ai/tools/request-user-input";
import type { FileUIPart, UIMessage } from "ai";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Suspense,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useChat } from "@ai-sdk/react";
import { useQueryClient } from "@tanstack/react-query";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";
import {
  ChevronDownIcon,
  FolderKanbanIcon,
  Globe2Icon,
  HistoryIcon,
  LogOutIcon,
  MessageCircleIcon,
  MessageSquareQuoteIcon,
  MousePointer2Icon,
  SettingsIcon,
} from "lucide-react";
import { toast } from "sonner";

import { BloomLogo } from "@/components/bloom-logo";
import { ChatInput } from "@/components/chat-input";
import { ChatMessages } from "@/components/chat-messages";
import { AnimatedBackground } from "@/components/ui/animated-background";
import { ProjectVersions } from "@/components/project-versions";
import { ProjectWorkbench } from "@/components/project-workbench";
import { ThemePanel } from "@/components/theme-panel";
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
import { projectsQueryKey } from "@/hooks/use-projects";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { getMessageFiles, getMessageText, type EditingMessage } from "@/lib/chat-message";
import {
  discardProjectAsset,
  uploadProjectAssets,
} from "@/lib/project-assets.client";
import { SEND_TO_CHAT_EVENT, type SendToChatDetail } from "@/lib/element-selection";
import ChatSessionErrorBoundary from "./chat-session-error-boundary";

export type ProjectChatMessage = UIMessage<Metadata, DataPart, ToolSet>;

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

const TABS = [
  { label: "Agentic", value: "web", icon: MessageCircleIcon },
  { label: "Manual", value: "all", icon: MousePointer2Icon },
] as const;

async function getResponseError(response: Response, fallback: string) {
  const body: unknown = await response.json().catch(() => null);

  if (
    body &&
    typeof body === "object" &&
    "error" in body &&
    typeof body.error === "string"
  ) {
    return body.error;
  }

  return fallback;
}

type ProjectChatSessionProps = {
  projectId: string;
  initialMessages: Promise<ProjectChatMessage[]>;
};

function ProjectChatSession({
  projectId,
  initialMessages: initialMessagesPromise,
}: ProjectChatSessionProps) {
  const initialMessages = use(initialMessagesPromise);
  const [editingMessage, setEditingMessage] = useState<EditingMessage | null>(
    null,
  );

  const transport = useMemo(
    () =>
      new DefaultChatTransport<ProjectChatMessage>({
        api: `/api/projects/${projectId}/chat`,
        prepareSendMessagesRequest: ({ id, messageId, messages, trigger }) => ({
          body: {
            id,
            trigger,
            messageId,
            messages: messages.slice(-1),
          },
        }),
      }),
    [projectId],
  );

  const {
    messages,
    sendMessage,
    stop: stopChat,
    status,
    regenerate,
    setMessages,
    addToolOutput,
  } = useChat<ProjectChatMessage>({
    id: projectId,
    messages: initialMessages,
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    onError(error) {
      toast.error(error.message || "Chat request failed");
    },
    onFinish() {
      window.dispatchEvent(new Event("bloom:revision-changed"));
    },
  });

  const busy = status === "streaming" || status === "submitted";

  useEffect(() => {
    function onSendToChat(event: Event) {
      const { text, selections } = (event as CustomEvent<SendToChatDetail>).detail;
      if (busy) {
        toast.info("Bloom is still working. Try again when it finishes.");
        return;
      }
      void sendMessage({ text, metadata: { mode: "BUILD", selections } });
    }

    window.addEventListener(SEND_TO_CHAT_EVENT, onSendToChat);
    return () => window.removeEventListener(SEND_TO_CHAT_EVENT, onSendToChat);
  }, [busy, sendMessage]);

  const deleteMessage = useCallback(
    async (messageId: string) => {
      const response = await fetch(
        `/api/projects/${projectId}/chat/messages/${messageId}`,
        { method: "DELETE" },
      );

      if (!response.ok) {
        throw new Error(
          await getResponseError(response, "Failed to delete message"),
        );
      }

      const deleteIndex = messages.findIndex(
        (message) => message.id === messageId,
      );

      if (deleteIndex !== -1) {
        const removedIds = new Set(
          messages.slice(deleteIndex).map(({ id }) => id),
        );

        setMessages(messages.slice(0, deleteIndex));
        setEditingMessage((current) =>
          current && removedIds.has(current.id) ? null : current,
        );
      }

      toast.success("Message deleted");
    },
    [messages, projectId, setMessages],
  );

  const startEditingMessage = useCallback((message: ProjectChatMessage) => {
    setEditingMessage({
      id: message.id,
      text: getMessageText(message),
      files: getMessageFiles(message),
      ...(message.metadata ? { metadata: message.metadata } : {}),
    });
  }, []);

  const cancelEditingMessage = useCallback(() => {
    setEditingMessage(null);
  }, []);

  const uploadAttachments = useCallback(
    (files: File[], signal?: AbortSignal) =>
      uploadProjectAssets(projectId, files, signal),
    [projectId],
  );

  const discardAttachment = useCallback(
    (file: FileUIPart) => discardProjectAsset(projectId, file),
    [projectId],
  );

  return (
    <>
      <ChatMessages
        messages={messages}
        busy={busy}
        editingMessageId={editingMessage?.id ?? null}
        onDelete={deleteMessage}
        onEdit={startEditingMessage}
        onRegenerate={regenerate}
        onSubmitUserInput={(toolCallId, output: UserInputResponse) =>
          addToolOutput({
            tool: "requestUserInput",
            toolCallId,
            output,
          })
        }
      />

      <div className="z-10 w-full max-w-2xl shrink-0 p-3 pt-0">
        <ChatInput
          busy={busy}
          stop={stopChat}
          sendMessage={sendMessage}
          uploadAttachments={uploadAttachments}
          discardAttachment={discardAttachment}
          editingMessage={editingMessage}
          onCancelEdit={cancelEditingMessage}
        />
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

export function ProjectChat({
  projectId,
  projectTitle,
  initialMessages,
  user,
}: ProjectChatProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const cancelTitleSaveRef = useRef(false);
  const titleRef = useRef(projectTitle);
  const [titleDraft, setTitleDraft] = useState(projectTitle);
  const [isSavingTitle, setIsSavingTitle] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [tab, setTab] = useState<(typeof TABS)[number]["value"]>(TABS[0].value);

  const saveTitle = async () => {
    if (isSavingTitle) return;

    const nextTitle = titleDraft.trim();
    if (!nextTitle || nextTitle === titleRef.current) {
      setTitleDraft(titleRef.current);
      return;
    }

    setIsSavingTitle(true);

    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: nextTitle }),
      });

      if (!response.ok) {
        throw new Error(
          await getResponseError(response, "Failed to rename project"),
        );
      }

      titleRef.current = nextTitle;
      setTitleDraft(nextTitle);
      void queryClient.invalidateQueries({ queryKey: projectsQueryKey });
      toast.success("Project renamed");
    } catch (error) {
      setTitleDraft(titleRef.current);
      toast.error(
        error instanceof Error ? error.message : "Failed to rename project",
      );
    } finally {
      setIsSavingTitle(false);
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
    <main className="flex h-svh flex-col overflow-hidden">
      <header className="flex h-14 w-full shrink-0 items-center px-4 shadow-sm">
        <Button
          size="icon"
          variant="ghost"
          className="group"
          aria-label="Back to projects"
          nativeButton={false}
          render={<Link href="/dashboard/projects" prefetch={false} />}
        >
          <BloomLogo />
        </Button>

        <Separator
          orientation="vertical"
          className="mx-2 my-auto h-full max-h-2/5 rounded-full"
        />

        <AnimatedBackground
          defaultValue={TABS[0].value}
          onValueChange={(value) => setTab(value as typeof tab)}
          className="h-full rounded-lg bg-bloom-soft"
        >
          {TABS.map(({ icon: Icon, label, value }) => (
            <div key={value} data-id={value} className="group">
              <button
                type="button"
                className="flex items-center gap-1 px-3 py-1.5 text-[13px] font-medium transition-colors duration-300 group-data-checked:text-bloom"
              >
                <Icon size={15} />
                {label}
              </button>
            </div>
          ))}
        </AnimatedBackground>

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

        <Input
          value={titleDraft}
          aria-label="Project name"
          aria-busy={isSavingTitle}
          maxLength={80}
          disabled={isSavingTitle}
          className="field-sizing-content mx-auto w-fit max-w-56 border-none hover:cursor-pointer hover:bg-muted focus-within:hover:cursor-text focus-within:hover:bg-background"
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

        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost">
            <MessageSquareQuoteIcon />
            Feedback
          </Button>

          <Button type="button" variant="secondary">
            <Globe2Icon />
            Deploy
          </Button>

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

      <div className="flex min-h-0 w-full flex-1 overflow-hidden">
        {tab === "all" ? (
          <div className="relative flex min-w-0 flex-1 flex-col items-center overflow-hidden">
            <ThemePanel projectId={projectId} />
          </div>
        ) : null}
        <div className={cn("relative flex min-w-0 flex-1 flex-col items-center overflow-hidden", tab === "all" && "hidden")}>
          <ChatSessionErrorBoundary>
            <Suspense fallback={<ProjectChatSessionFallback />}>
              <ProjectChatSession
                projectId={projectId}
                initialMessages={initialMessages}
              />
            </Suspense>
          </ChatSessionErrorBoundary>
        </div>

        <div className="h-full min-w-2/3 flex-1 overflow-hidden p-2">
          <ProjectWorkbench projectId={projectId} />
        </div>
      </div>

      <ProjectVersions
        projectId={projectId}
        open={versionsOpen}
        onOpenChange={setVersionsOpen}
      />
    </main>
  );
}
