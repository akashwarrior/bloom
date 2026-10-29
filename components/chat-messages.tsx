import { STATUS, type DataPart } from "@/ai/message/data-part";
import type { Metadata } from "@/ai/message/metadata";
import type { ToolSet } from "@/ai/tools";
import type { UserInputResponse } from "@/ai/tools/request-user-input";
import type { FileUIPart, UIMessage } from "ai";
import Image from "next/image";
import { memo, useCallback, useState } from "react";
import {
  AlertOctagonIcon,
  CircleIcon,
  CopyIcon,
  FileIcon,
  MousePointerClickIcon,
  PencilIcon,
  RefreshCcwIcon,
  TrashIcon,
} from "lucide-react";
import { Markdown } from "./markdown";
import { toast } from "sonner";

import { BloomLogo } from "@/components/bloom-logo";
import {
  Attachment,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
  AttachmentTrigger,
} from "@/components/ui/attachment";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import { Loader } from "@/components/ui/loader";
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker";
import {
  Message,
  MessageContent,
  MessageFooter,
} from "@/components/ui/message";
import { SlidingNumber } from "@/components/ui/sliding-number";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { getMessageFiles, getMessageText, isImageMediaType } from "@/lib/chat-message";
import { selectionKey, selectionLabel } from "@/lib/element-selection";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "./resoning";

type ChatMessage = UIMessage<Metadata, DataPart, ToolSet>;
type ChatMessagePart = ChatMessage["parts"][number];
type FilePart = Extract<ChatMessagePart, FileUIPart>;
type FileActionType =
  | "data-read-file"
  | "data-create-files"
  | "data-edit-file"
  | "data-file-changes";
type ToolActivityPart = Extract<
  ChatMessagePart,
  {
    type:
    | "tool-exploreProject"
    | "tool-generateAsset"
    | "tool-webScrape"
    | "tool-webSearch"
    | "tool-listFiles"
    | "tool-searchCode"
    | "tool-readFiles"
    | "tool-submitDesignBrief"
    | "tool-submitDesignStudy"
    | "tool-chooseInspiration"
    | "tool-finishBuild"
    | "tool-toolInputError";
  }
>;
type UserInputPart = Extract<
  ChatMessagePart,
  { type: "tool-requestUserInput" }
>;

type ChatMessagesProps = {
  messages: ChatMessage[];
  busy: boolean;
  editingMessageId: string | null;
  onDelete: (messageId: string) => Promise<void>;
  onEdit: (message: ChatMessage) => void;
  onRegenerate: ({ messageId }: { messageId: string }) => Promise<void>;
  onSubmitUserInput: (
    toolCallId: string,
    output: UserInputResponse,
  ) => void | PromiseLike<void>;
};

function getFileActionLabel(
  type: FileActionType,
  state: "loading" | "complete" | "error",
) {
  const labels = {
    "data-create-files": {
      loading: "Creating",
      complete: "Created",
      error: "Failed to create",
    },
    "data-read-file": {
      loading: "Reading",
      complete: "Read",
      error: "Failed to read",
    },
    "data-edit-file": {
      loading: "Editing",
      complete: "Edited",
      error: "Failed to edit",
    },
    "data-file-changes": {
      loading: "Applying",
      complete: "Saved",
      error: "Failed to apply",
    },
  } as const;

  return labels[type][state];
}

function isToolActivityPart(part: ChatMessagePart): part is ToolActivityPart {
  return (
    part.type === "tool-exploreProject" ||
    part.type === "tool-generateAsset" ||
    part.type === "tool-listFiles" ||
    part.type === "tool-searchCode" ||
    part.type === "tool-readFiles" ||
    part.type === "tool-webSearch" ||
    part.type === "tool-webScrape" ||
    part.type === "tool-submitDesignBrief" ||
    part.type === "tool-submitDesignStudy" ||
    part.type === "tool-chooseInspiration" ||
    part.type === "tool-finishBuild"
  );
}

function getToolFailureMessage(part: ToolActivityPart) {
  if (part.state !== "output-available") return null;

  const output: unknown = part.output;
  if (
    typeof output !== "object" ||
    output === null ||
    !("status" in output) ||
    output.status !== "error" ||
    !("error" in output) ||
    typeof output.error !== "object" ||
    output.error === null ||
    !("message" in output.error) ||
    typeof output.error.message !== "string"
  ) {
    return null;
  }

  return output.error.message;
}

function getToolActivityLabel(
  part: ToolActivityPart,
  state: "loading" | "complete" | "error",
) {
  if (part.type === "tool-generateAsset") {
    const role = part.input?.role;
    const subject = typeof role === "string" ? role : "website asset";
    return state === "loading"
      ? `Generating ${subject}`
      : state === "complete"
        ? `Generated ${subject}`
        : `Generation of ${subject} failed`;
  }

  if (part.type === "tool-searchCode") {
    const query = part.input?.query;
    const subject = typeof query === "string" ? `“${query}”` : "project code";
    return state === "loading"
      ? `Searching for ${subject}`
      : state === "complete"
        ? `Searched for ${subject}`
        : `Search for ${subject} failed`;
  }

  if (part.type === "tool-readFiles") {
    const count = part.input?.files?.length;
    const subject = typeof count === "number" ? `${count} ${count === 1 ? "file" : "files"}` : "project files";
    return state === "loading"
      ? `Reading ${subject}`
      : state === "complete"
        ? `Read ${subject}`
        : `Reading ${subject} failed`;
  }

  if (part.type === "tool-webScrape") {
    const target = part.input?.url || "the current page";
    const screenshots = Boolean(part.input?.include_screenshots);
    const preview = target.startsWith("/");
    return state === "loading"
      ? preview
        ? `Capturing and reviewing ${target}`
        : screenshots
          ? `Scraping and capturing ${target}`
          : `Scraping ${target}`
      : state === "complete"
        ? `Scraped ${target}`
        : `Web scrape of ${target} failed`;
  }

  if (part.type === "tool-webSearch") {
    const query = part.input?.query;
    const subject = typeof query === "string" ? query : "the web";
    return state === "loading"
      ? `Searching for ${subject}`
      : state === "complete"
        ? `Searched for ${subject}`
        : "Web search failed";
  }

  if (part.type === "tool-submitDesignStudy") {
    const rejected = part.state === "output-available" && part.output.status === "rejected";
    return state === "loading"
      ? "Connecting reference evidence to the design"
      : state === "complete"
        ? rejected ? "Revising the reference study" : "Established the design concept"
        : "Reference study failed";
  }

  if (part.type === "tool-submitDesignBrief") {
    const brand = part.input?.brand?.name;
    const subject = typeof brand === "string" ? `design system for ${brand}` : "design system";
    const output: unknown = part.state === "output-available" ? part.output : null;
    const rejected = typeof output === "object" && output !== null && "status" in output && output.status === "rejected";
    return state === "loading"
      ? `Locking the ${subject}`
      : state === "complete"
        ? rejected ? `Revising the ${subject}` : `Locked the ${subject}`
        : `Design brief failed`;
  }

  if (part.type === "tool-chooseInspiration") {
    return state === "loading"
      ? "Choosing frames from the design library"
      : state === "complete"
        ? "Chose frames from the design library"
        : "Design library failed";
  }

  if (part.type === "tool-finishBuild") {
    const output: unknown = part.state === "output-available" ? part.output : null;
    const status = typeof output === "object" && output !== null && "status" in output ? output.status : null;
    return state === "loading"
      ? "Checking the build against the design"
      : state === "complete"
        ? status === "passed" ? "Design checks passed" : "Design checks found gaps"
        : "Design check failed";
  }

  const labels = {
    "tool-exploreProject": {
      loading: "Exploring the project",
      complete: "Explored the project",
      error: "Project exploration failed",
    },
    "tool-listFiles": {
      loading: "Discovering project files",
      complete: "Discovered project files",
      error: "File discovery failed",
    },
  } as const;

  return labels[part.type][state];
}

type MessageAttachmentProps = {
  part: FilePart;
  compact?: boolean;
  editing?: boolean;
};

const MessageAttachment = memo(function MessageAttachment({
  part,
  compact = false,
  editing = false,
}: MessageAttachmentProps) {
  const filename = part.filename || "Attachment";
  const isImage = isImageMediaType(part.mediaType);

  return (
    <Attachment
      {...(compact ? { size: "sm" as const } : {})}
      className={cn(
        compact ? "w-64" : "max-w-40",
        editing && "ring-2 ring-bloom ring-offset-2 ring-offset-background",
      )}
    >
      <AttachmentMedia variant={isImage ? "image" : "icon"}>
        {isImage ? (
          <Image
            src={part.url}
            alt={filename}
            fill
            unoptimized
            sizes={compact ? "32px" : "40px"}
            className="size-full object-cover"
          />
        ) : (
          <FileIcon />
        )}
      </AttachmentMedia>

      <AttachmentContent>
        <AttachmentTitle>{filename}</AttachmentTitle>
        <AttachmentDescription>{part.mediaType}</AttachmentDescription>
      </AttachmentContent>

      <AttachmentTrigger
        render={
          <a
            href={part.url}
            download={part.filename}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open ${filename}`}
          />
        }
      />
    </Attachment>
  );
});

type MessageActionsProps = {
  message: ChatMessage;
  busy: boolean;
  onCopy: (message: ChatMessage) => Promise<void>;
  onDelete: (messageId: string) => void;
  onEdit: (message: ChatMessage) => void;
  onRegenerate: (messageId: string) => Promise<void>;
};

function MessageActions({
  message,
  busy,
  onCopy,
  onDelete,
  onEdit,
  onRegenerate,
}: MessageActionsProps) {
  return (
    <MessageFooter
      className={cn(
        message.role === "user" &&
        "opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100",
      )}
    >
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label="Copy message"
        onClick={() => void onCopy(message)}
      >
        <CopyIcon />
      </Button>

      {message.role === "user" ? (
        <>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="Delete message"
            disabled={busy}
            onClick={() => onDelete(message.id)}
          >
            <TrashIcon />
          </Button>

          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="Edit message"
            disabled={busy}
            onClick={() => onEdit(message)}
          >
            <PencilIcon />
          </Button>
        </>
      ) : (
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label="Regenerate response"
          disabled={busy}
          onClick={() => void onRegenerate(message.id)}
        >
          <RefreshCcwIcon />
        </Button>
      )}
    </MessageFooter>
  );
}

type AssistantMessagePartProps = {
  part: ChatMessagePart;
  busy: boolean;
  onSubmitUserInput: (
    toolCallId: string,
    output: UserInputResponse,
  ) => void | PromiseLike<void>;
};

type DraftAnswer = {
  selectedOptionId?: string;
  text?: string;
};

const UserInputRequest = memo(function UserInputRequest({
  part,
  busy,
  onSubmit,
}: {
  part: UserInputPart;
  busy: boolean;
  onSubmit: (
    toolCallId: string,
    output: UserInputResponse,
  ) => void | PromiseLike<void>;
}) {
  const [drafts, setDrafts] = useState<Record<string, DraftAnswer>>({});
  const [submitting, setSubmitting] = useState(false);

  if (part.state === "output-available") {
    return (
      <div className="my-1.5 space-y-1.5">
        <Marker role="status">
          <MarkerIcon className="grid size-4 place-items-center">
            <CircleIcon className="size-2 fill-current" />
          </MarkerIcon>
          <MarkerContent>Answered agent question</MarkerContent>
        </Marker>
        <div className="ml-5 space-y-1 rounded-lg border bg-muted/30 px-3 py-2 text-xs">
          {part.output.answers.map((answer) => {
            const question = part.input.questions.find(
              (item) => item.id === answer.questionId,
            );
            const option = question?.options?.find(
              (item) => item.id === answer.selectedOptionId,
            );
            return (
              <p key={answer.questionId}>
                <span className="text-muted-foreground">
                  {question?.header || answer.questionId}:
                </span>{" "}
                {answer.text || option?.label || answer.selectedOptionId}
              </p>
            );
          })}
        </div>
      </div>
    );
  }

  if (part.state === "output-error" || part.state === "output-denied") {
    return (
      <Marker role="status">
        <MarkerIcon className="grid size-4 place-items-center">
          <AlertOctagonIcon className="text-destructive" />
        </MarkerIcon>
        <MarkerContent className="text-destructive">
          Could not submit the answer
        </MarkerContent>
      </Marker>
    );
  }

  if (part.state !== "input-available") {
    return (
      <Marker role="status">
        <MarkerIcon className="grid size-4 place-items-center">
          <Loader size={14} className="text-bloom" />
        </MarkerIcon>
        <MarkerContent className="shimmer shimmer-color-bloom">
          Preparing a question
        </MarkerContent>
      </Marker>
    );
  }

  const ready = part.input.questions.every((question) => {
    const draft = drafts[question.id];
    return Boolean(draft?.selectedOptionId || draft?.text?.trim());
  });

  const submit = async () => {
    if (!ready || submitting || busy) return;
    const answers = part.input.questions.map((question) => {
      const draft = drafts[question.id] ?? {};
      return {
        questionId: question.id,
        ...(draft.selectedOptionId
          ? { selectedOptionId: draft.selectedOptionId }
          : {}),
        ...(draft.text?.trim() ? { text: draft.text.trim() } : {}),
      };
    });

    setSubmitting(true);
    try {
      await onSubmit(part.toolCallId, { answers });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to submit answer",
      );
      setSubmitting(false);
    }
  };

  return (
    <div className="my-2 space-y-4 rounded-xl border bg-muted/30 p-3">
      {part.input.questions.map((question) => {
        const draft = drafts[question.id] ?? {};
        return (
          <fieldset key={question.id} className="space-y-2">
            <legend className="text-xs font-medium text-muted-foreground">
              {question.header}
            </legend>
            <p className="text-sm font-medium text-foreground">
              {question.question}
            </p>

            {question.options && (
              <div className="grid gap-2 sm:grid-cols-2">
                {question.options.map((option) => {
                  const selected = draft.selectedOptionId === option.id;
                  return (
                    <Button
                      key={option.id}
                      type="button"
                      variant={selected ? "secondary" : "outline"}
                      className="h-auto min-h-9 justify-start whitespace-normal px-3 py-2 text-left"
                      aria-pressed={selected}
                      disabled={submitting || busy}
                      onClick={() =>
                        setDrafts((current) => ({
                          ...current,
                          [question.id]: { selectedOptionId: option.id },
                        }))
                      }
                    >
                      <span>
                        <span className="block">{option.label}</span>
                        {option.description && (
                          <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                            {option.description}
                          </span>
                        )}
                      </span>
                    </Button>
                  );
                })}
              </div>
            )}

            {question.allowFreeText && (
              <Textarea
                value={draft.text ?? ""}
                rows={question.options ? 2 : 3}
                className="min-h-14 resize-none bg-background"
                placeholder={
                  question.options ? "Or describe another choice…" : "Your answer…"
                }
                aria-label={`${question.header} answer`}
                disabled={submitting || busy}
                onChange={(event) =>
                  setDrafts((current) => ({
                    ...current,
                    [question.id]: { text: event.target.value },
                  }))
                }
              />
            )}
          </fieldset>
        );
      })}

      <Button
        type="button"
        disabled={!ready || submitting || busy}
        onClick={() => void submit()}
      >
        {submitting ? "Submitting…" : "Continue"}
      </Button>
    </div>
  );
});

const AssistantMessagePart = memo(function AssistantMessagePart({
  part,
  busy,
  onSubmitUserInput,
}: AssistantMessagePartProps) {
  if (part.type === "file") {
    return <MessageAttachment part={part} compact />;
  }

  if (part.type === "text") {
    return (
      <Markdown mode={part.state === "streaming" ? "streaming" : "static"}>
        {part.text}
      </Markdown>
    );
  }

  if (part.type === "reasoning") {
    const streaming = part.state === "streaming";

    return (
      <Reasoning isStreaming={streaming}>
        <ReasoningTrigger>
          {streaming ? "Thinking..." : "Thought"}
        </ReasoningTrigger>
        <ReasoningContent className="my-1.25 ml-1.5 border-l-2 px-3">
          {part.text}
        </ReasoningContent>
      </Reasoning>
    );
  }

  if (part.type === "data-design-progress") {
    const loading = part.data.status === STATUS.LOADING;
    const complete = part.data.status === STATUS.COMPLETE;
    return (
      <Marker role="status">
        <MarkerIcon className="grid size-4 place-items-center">
          {loading ? (
            <Loader size={14} className="text-bloom" />
          ) : complete ? (
            <CircleIcon className="size-2 fill-current" />
          ) : (
            <AlertOctagonIcon className="text-destructive" />
          )}
        </MarkerIcon>
        <MarkerContent
          className={cn(
            loading && "shimmer shimmer-color-bloom",
            !loading && !complete && "text-destructive",
          )}
        >
          <span className="flex min-w-0 flex-col">
            <span>{part.data.label}</span>
            {part.data.detail && (
              <span className="text-xs text-muted-foreground">
                {part.data.detail}
              </span>
            )}
          </span>
        </MarkerContent>
      </Marker>
    );
  }

  if (part.type === "data-context-compaction") {
    return (
      <Marker variant="separator">
        <MarkerContent>Conversation compacted</MarkerContent>
      </Marker>
    );
  }

  if (part.type === "tool-requestUserInput") {
    return (
      <UserInputRequest
        part={part}
        busy={busy}
        onSubmit={onSubmitUserInput}
      />
    );
  }

  if (
    part.type === "tool-generateAsset" &&
    part.state === "output-available" &&
    !("error" in part.output)
  ) {
    const output = part.output;
    return (
      <div className="my-1.5 flex w-full flex-col gap-2 overflow-hidden">
        <Marker role="status">
          <MarkerIcon className="grid size-4 place-items-center">
            <CircleIcon className="size-2 fill-current" />
          </MarkerIcon>
          <MarkerContent>{getToolActivityLabel(part, "complete")}</MarkerContent>
        </Marker>
        <a
          href={output.preview.url}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-5 block max-w-xl overflow-hidden rounded-xl border bg-muted transition-opacity hover:opacity-90"
        >
          <Image
            src={output.preview.url}
            alt={`Generated ${part.input?.role || output.filename}`}
            width={960}
            height={600}
            unoptimized
            className="max-h-96 w-full object-contain"
          />
          <span className="block border-t px-2 py-1 text-xs text-muted-foreground">
            {output.filename} · {output.kind}
            {output.cached ? " · reused" : ""}
          </span>
        </a>
      </div>
    );
  }

  if (
    part.type === "tool-webScrape" &&
    part.state === "output-available" &&
    !("error" in part.output)
  ) {
    const output = part.output;
    const target = part.input?.url || "the captured page";

    return (
      <div className="my-1.5 space-y-2 overflow-hidden flex flex-col w-full">
        <Marker role="status">
          <MarkerIcon className="grid size-4 place-items-center">
            <CircleIcon className="size-2 fill-current" />
          </MarkerIcon>
          <MarkerContent>
            {getToolActivityLabel(part, "complete")}
          </MarkerContent>
        </Marker>
        {output.screenshots.length > 0 && (
          <div className="flex w-full gap-2 overflow-x-auto scrollbar-thin scrollbar-gutter-stable">
            {output.screenshots.map((screenshot, index) => (
              <a
                key={screenshot.url}
                href={screenshot.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block min-w-1/2 overflow-hidden rounded-xl border bg-muted transition-opacity hover:opacity-90"
              >
                <Image
                  src={screenshot.url}
                  alt={`${screenshot.name}: browser capture ${index + 1} of ${target}`}
                  width={960}
                  height={600}
                  unoptimized
                  className="h-auto max-h-80 w-full object-contain"
                />
                <span className="block border-t px-2 py-1 text-xs text-muted-foreground">
                  {screenshot.name} · {screenshot.scrollY}px
                </span>
              </a>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (isToolActivityPart(part)) {
    const outputError = getToolFailureMessage(part);
    const failed =
      part.state === "output-error" ||
      part.state === "output-denied" ||
      outputError !== null;
    const complete = part.state === "output-available" && !outputError;
    const state = failed ? "error" : complete ? "complete" : "loading";

    return (
      <Marker role="status">
        <MarkerIcon className="grid size-4 place-items-center">
          {state === "loading" ? (
            <Loader size={14} className="text-bloom" />
          ) : state === "complete" ? (
            <CircleIcon className="size-2 fill-current" />
          ) : (
            <AlertOctagonIcon className="text-destructive" />
          )}
        </MarkerIcon>
        <MarkerContent
          className={cn(
            state === "loading" && "shimmer shimmer-color-bloom",
            state === "error" && "text-destructive",
          )}
        >
          <span className="flex min-w-0 flex-col">
            <span>{getToolActivityLabel(part, state)}</span>
            {outputError && (
              <span className="text-xs text-destructive">{outputError}</span>
            )}
          </span>
        </MarkerContent>
      </Marker>
    );
  }

  if (
    part.type === "data-read-file" ||
    part.type === "data-create-files" ||
    part.type === "data-edit-file" ||
    part.type === "data-file-changes"
  ) {
    const loading = part.data.status === STATUS.LOADING;
    const complete = part.data.status === STATUS.COMPLETE;
    const state = loading ? "loading" : complete ? "complete" : "error";
    const action = getFileActionLabel(part.type, state);
    const fileCount = part.data.files.length;
    const singleFile = fileCount === 1 ? part.data.files[0]?.path : null;
    const summary =
      part.type === "data-file-changes" ? part.data.summary : undefined;
    const warning =
      part.type === "data-file-changes" ? part.data.warning : undefined;

    return (
      <Marker role="status">
        <MarkerIcon className="grid size-4 place-items-center">
          {loading ? (
            <Loader size={14} className="text-bloom" />
          ) : complete ? (
            <CircleIcon className="size-2 fill-current" />
          ) : (
            <AlertOctagonIcon className="text-destructive" />
          )}
        </MarkerIcon>

        <MarkerContent
          className={cn(
            loading && "shimmer shimmer-color-bloom",
            state === "error" && "text-destructive",
          )}
        >
          <span className="flex min-w-0 flex-col">
            {summary && <span>{summary}</span>}
            {singleFile ? (
              <span className={cn("flex min-w-0 gap-1", summary && "text-xs text-muted-foreground")}>
                {action}
                <span className="truncate font-mono">{singleFile}</span>
              </span>
            ) : (
              <span className={cn("flex gap-0.75", summary && "text-xs text-muted-foreground")}>
                {action}
                <SlidingNumber value={fileCount} />
                {fileCount === 1 ? "file" : "files"}
              </span>
            )}
            {warning && (
              <span className="max-w-2xl text-xs text-amber-700 dark:text-amber-400">
                {warning}
              </span>
            )}
          </span>
        </MarkerContent>
      </Marker>
    );
  }

  if (part.type === "data-shell") {
    const loading = part.data.status === STATUS.LOADING;
    const complete = part.data.status === STATUS.COMPLETE;
    const label = part.data.purpose || [part.data.command, ...part.data.args].join(" ");

    return (
      <Marker role="status">
        <MarkerIcon className="grid size-4 place-items-center">
          {loading ? (
            <Loader size={14} className="text-bloom" />
          ) : complete ? (
            <CircleIcon className="size-2 fill-current" />
          ) : (
            <AlertOctagonIcon className="text-destructive" />
          )}
        </MarkerIcon>
        <MarkerContent
          className={cn(
            loading && "shimmer shimmer-color-bloom",
            !loading && !complete && "text-destructive",
          )}
        >
          <span className="flex flex-col">
            <span>{loading ? label : complete ? `${label} completed` : `${label} failed`}</span>
            {!loading && part.data.durationMs !== undefined && (
              <span className="text-xs text-muted-foreground">
                {(part.data.durationMs / 1000).toFixed(1)}s
                {part.data.exitCode !== undefined ? ` · exit ${part.data.exitCode}` : ""}
                {part.data.outputTruncated ? " · output shortened" : ""}
              </span>
            )}
          </span>
        </MarkerContent>
      </Marker>
    );
  }

  return null;
});

type ChatMessageItemProps = {
  message: ChatMessage;
  busy: boolean;
  editing: boolean;
  showActions: boolean;
  onCopy: (message: ChatMessage) => Promise<void>;
  onDelete: (messageId: string) => void;
  onEdit: (message: ChatMessage) => void;
  onRegenerate: (messageId: string) => Promise<void>;
  onSubmitUserInput: (
    toolCallId: string,
    output: UserInputResponse,
  ) => void | PromiseLike<void>;
};

const ChatMessageItem = memo(function ChatMessageItem({
  message,
  busy,
  editing,
  showActions,
  onCopy,
  onDelete,
  onEdit,
  onRegenerate,
  onSubmitUserInput,
}: ChatMessageItemProps) {
  const isUserMessage = message.role === "user";
  const attachments = isUserMessage ? getMessageFiles(message) : [];
  const text = isUserMessage ? getMessageText(message) : "";
  const selections = isUserMessage ? message.metadata?.selections ?? [] : [];

  return (
    <Message align={isUserMessage ? "end" : "start"}>
      <MessageContent className={cn("gap-1.5", isUserMessage && "group py-2")}>
        {isUserMessage ? (
          <>
            {attachments.length > 0 && (
              <AttachmentGroup className="max-w-full">
                {attachments.map((part, index) => (
                  <MessageAttachment
                    key={`${message.id}:file:${index}`}
                    part={part}
                    editing={editing}
                  />
                ))}
              </AttachmentGroup>
            )}

            {selections.length > 0 && (
              <div className="flex max-w-full flex-wrap justify-end gap-1.5">
                {selections.map((selection) => (
                  <span
                    key={selectionKey(selection)}
                    title={selection.text || selection.selector}
                    className="inline-flex max-w-56 items-center gap-1 rounded-md bg-bloom/10 px-1.5 py-0.5 text-xs font-medium text-bloom"
                  >
                    <MousePointerClickIcon className="size-3 shrink-0" />
                    <span className="truncate">{selectionLabel(selection)}</span>
                  </span>
                ))}
              </div>
            )}

            {text && (
              <Bubble>
                <BubbleContent
                  className={cn(
                    "relative overflow-visible rounded-2xl bg-bloom! ring-2 ring-offset-2 ring-offset-background transition-shadow",
                    editing ? "ring-bloom" : "ring-transparent",
                  )}
                >
                  <svg
                    aria-hidden="true"
                    width="18"
                    height="14"
                    viewBox="0 0 18 14"
                    className="absolute right-[2.5px] -bottom-px z-10 translate-x-1/2 fill-bloom"
                  >
                    <path d="M0.866025 8.80383L11.2583 0.803833C11.2583 0.803833 12.0621 9.5 17.2583 13.1961C12.0621 13.1961 0.866025 8.80383 0.866025 8.80383Z" />
                  </svg>
                  {text}
                </BubbleContent>
              </Bubble>
            )}
          </>
        ) : (
          <Bubble variant="ghost">
            <BubbleContent>
              {message.parts.map((part, index) => (
                <AssistantMessagePart
                  key={`${message.id}:${part.type}:${index}`}
                  part={part}
                  busy={busy}
                  onSubmitUserInput={onSubmitUserInput}
                />
              ))}
            </BubbleContent>
          </Bubble>
        )}

        {showActions && (
          <MessageActions
            message={message}
            busy={busy}
            onCopy={onCopy}
            onDelete={onDelete}
            onEdit={onEdit}
            onRegenerate={onRegenerate}
          />
        )}
      </MessageContent>
    </Message>
  );
});

export const ChatMessages = memo(function ChatMessages({
  messages,
  busy,
  editingMessageId,
  onDelete,
  onEdit,
  onRegenerate,
  onSubmitUserInput,
}: ChatMessagesProps) {
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);


  const copyMessage = useCallback(async (message: ChatMessage) => {
    const text = getMessageText(message);

    if (!text) {
      toast.error("This message has no text to copy");
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      toast.success("Message copied");
    } catch {
      toast.error("Failed to copy message");
    }
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!deleteId || busy || isDeleting) return;

    setIsDeleting(true);
    try {
      await onDelete(deleteId);
      setDeleteId(null);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete message",
      );
    } finally {
      setIsDeleting(false);
    }
  }, [busy, deleteId, isDeleting, onDelete]);

  const regenerateMessage = useCallback(
    async (messageId: string) => {
      if (busy) return;

      try {
        await onRegenerate({ messageId });
      } catch {
        toast.error("Failed to regenerate message");
      }
    },
    [busy, onRegenerate],
  );

  return (
    <>
      <div className="scrollbar-thin scrollbar-gutter-stable flex size-full min-h-0 flex-col-reverse overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-4">
            <BloomLogo className="size-10 text-foreground motion-safe:animate-[bloom-spin_24s_linear_infinite]" />
            <p className="max-w-2/3 text-center text-sm text-muted-foreground">
              Describe what you want Bloom to create or change.
            </p>
          </div>
        ) : (
          <div className="mt-auto w-full max-w-2xl self-center p-4 pb-10">
            {messages.map((message, index) => (
              <ChatMessageItem
                key={message.id}
                message={message}
                busy={busy}
                editing={editingMessageId === message.id}
                showActions={!busy || index !== messages.length - 1}
                onCopy={copyMessage}
                onDelete={setDeleteId}
                onEdit={onEdit}
                onRegenerate={regenerateMessage}
                onSubmitUserInput={onSubmitUserInput}
              />
            ))}
          </div>
        )}
      </div>

      <AlertDialog
        open={deleteId !== null}
        onOpenChange={(open) => {
          if (!open && !isDeleting) setDeleteId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this message?</AlertDialogTitle>
            <AlertDialogDescription>
              This message and every message after it will be permanently
              deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isDeleting}
              onClick={(event) => {
                event.preventDefault();
                void confirmDelete();
              }}
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
});
