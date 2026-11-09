import { STATUS, type DataPart } from "@/ai/message/data-part";
import type { UserInputResponse } from "@/ai/tools/request-user-input";
import type { FileUIPart } from "ai";
import type { ProjectChatMessage as ChatMessage } from "@/lib/project-chat/protocol";
import Image from "next/image";
import { Fragment, memo, useCallback, useState } from "react";
import {
  AlertOctagonIcon,
  CircleIcon,
  CopyIcon,
  DraftingCompassIcon,
  FileIcon,
  FilePenIcon,
  FileTextIcon,
  FolderSearchIcon,
  MousePointerClickIcon,
  PencilIcon,
  RefreshCcwIcon,
  SearchIcon,
  TrashIcon,
} from "lucide-react";
import { ChatRunActivity } from "./chat-run-activity";
import { getActivityDetails, isActivityDetail } from "@/lib/project-chat/activity";
import type { FailedChatRun } from "@/lib/project-chat/protocol";
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
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { getMessageFiles, getMessageText, isImageMediaType } from "@/lib/project-chat/message";
import { selectionKey, selectionLabel } from "@/lib/design-mode/selection";
import { NumberFlow } from "./ui/number-flow";
import {
  Trace,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "@/components/ui/trace"


type ChatMessagePart = ChatMessage["parts"][number];
type FilePart = Extract<ChatMessagePart, FileUIPart>;
type ToolActivityPart = Extract<
  ChatMessagePart,
  {
    type:
    | "tool-exploreProject"
    | "tool-finishBuild"
    | "tool-generateAsset"
    | "tool-webScrape"
    | "tool-webSearch"
    | "tool-listFiles"
    | "tool-searchCode"
    | "tool-readFiles"
    | "tool-uiDocs"
    | "tool-designSite";
  }
>;
type UserInputPart = Extract<
  ChatMessagePart,
  { type: "tool-requestUserInput" }
>;

type ChatMessagesProps = {
  projectId: string;
  failedRuns: FailedChatRun[];
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

function getFileActionLabel(state: "loading" | "complete" | "error") {
  const labels = {
    loading: "Applying",
    complete: "Saved",
    error: "Failed to apply",
  } as const;

  return labels[state];
}

function isToolActivityPart(part: ChatMessagePart): part is ToolActivityPart {
  return (
    part.type === "tool-exploreProject" ||
    part.type === "tool-finishBuild" ||
    part.type === "tool-generateAsset" ||
    part.type === "tool-listFiles" ||
    part.type === "tool-searchCode" ||
    part.type === "tool-readFiles" ||
    part.type === "tool-uiDocs" ||
    part.type === "tool-webSearch" ||
    part.type === "tool-webScrape" ||
    part.type === "tool-designSite"
  );
}

function getToolActivityIcon(part: ToolActivityPart) {
  if (part.type === "tool-readFiles" || part.type === "tool-uiDocs") return <FileTextIcon />;
  if (part.type === "tool-listFiles") return <FolderSearchIcon />;
  if (part.type === "tool-searchCode") return <SearchIcon />;
  if (part.type === "tool-designSite") return <DraftingCompassIcon />;
  return null;
}

function getToolFailureMessage(part: ToolActivityPart) {
  if (part.state !== "output-available") return null;

  if (part.type === "tool-finishBuild" && "status" in part.output && part.output.status === "failed") {
    return part.output.blocking[0] ?? "Build verification did not pass.";
  }

  const output: unknown = part.output;
  if (
    typeof output !== "object" ||
    output === null ||
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
    const assets = Array.isArray(part.input?.assets) ? part.input.assets : [];
    const total = assets.length;
    const single = total === 1 && typeof assets[0]?.name === "string"
      ? assets[0].name
      : null;
    const subject = total > 1 ? `${total} assets` : single ?? "website assets";

    if (state === "loading") return `Generating ${subject}`;

    const output =
      part.state === "output-available" && !("error" in part.output)
        ? part.output
        : null;
    if (!output) return `Generation of ${subject} failed`;

    const results = output.assets;
    if (results.length === 0) {
      return state === "error" ? `Generation of ${subject} failed` : `Generated ${subject}`;
    }

    const failed = results.filter((asset) => asset.status === "error").length;
    const succeeded = results.length - failed;
    const resultSubject =
      results.length > 1
        ? `${succeeded} of ${results.length} assets`
        : results[0]?.name ?? single ?? "website asset";

    return failed > 0 && succeeded === 0
      ? `Failed to generate ${subject}`
      : `Generated ${resultSubject}`;
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

  if (part.type === "tool-uiDocs") {
    const names = (part.input?.pages ?? []).flatMap((page) => typeof page?.name === "string" ? [page.name] : []);
    const subject = names.length > 0 ? `component docs for ${names.join(", ")}` : "component docs";
    return state === "loading"
      ? `Reading ${subject}`
      : state === "complete"
        ? `Read ${subject}`
        : `Reading ${subject} failed`;
  }

  if (part.type === "tool-webScrape") {
    const target = part.input?.url || "the current page";
    const preview = target.startsWith("/");
    return state === "loading"
      ? preview
        ? `Capturing preview for ${target}`
        : `Scraping and capturing ${target}`
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

  if (part.type === "tool-designSite") {
    const output: unknown = part.state === "output-available" ? part.output : null;
    const failed = typeof output === "object" && output !== null && "status" in output && output.status === "error";
    return state === "loading"
      ? "Designing the site"
      : state === "complete"
        ? failed ? "Site design failed" : "Designed the site"
        : "Site design failed";
  }

  if (part.type === "tool-listFiles") {
    return state === "loading"
      ? `Searching ${part.input?.patterns}`
      : (!part.output || "error" in part.output)
        ? `Search for ${part.input?.patterns} failed`
        : `Explored ${part.output.files.length} files`
  }

  const labels = {
    "tool-finishBuild": {
      loading: "Verifying the build",
      complete: "Build verification passed",
      error: "Build verification failed",
    },
    "tool-exploreProject": {
      loading: "Discovering the project",
      complete: "Discovered the project",
      error: "Project discovery failed",
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

type GeneratedAssetImage = {
  name: string;
  url: string;
};

const GeneratedAssetGroup = memo(function GeneratedAssetGroup({
  assets,
}: {
  assets: GeneratedAssetImage[];
}) {
  return (
    <AttachmentGroup className="max-w-full gap-2">
      {assets.map((asset) => (
        <Attachment key={asset.name} orientation="vertical">
          <AttachmentMedia variant="image">
            <Image
              src={asset.url}
              alt={asset.name}
              fill
              unoptimized
              sizes="32px"
              className="size-full object-cover"
            />
          </AttachmentMedia>

          <AttachmentContent>
            <AttachmentTitle>{asset.name}</AttachmentTitle>
          </AttachmentContent>

          <AttachmentTrigger
            render={
              <a
                href={asset.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Open ${asset.name}`}
              />
            }
          />
        </Attachment>
      ))}
    </AttachmentGroup>
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
  assetProgress?: DataPart["asset-progress"];
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
  assetProgress,
  onSubmitUserInput,
}: AssistantMessagePartProps) {
  if (part.type === "text") {
    return (
      <Bubble variant="ghost">
        <BubbleContent>
          <Markdown mode={part.state === "streaming" ? "streaming" : "static"}>
            {part.text}
          </Markdown>
        </BubbleContent>
      </Bubble>
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
    const assets = part.output.assets;
    const successful = assets.flatMap((asset) =>
      asset.status === "success"
        ? [{ name: asset.name, url: asset.url }]
        : [],
    );
    const failed = assets.flatMap((asset) =>
      asset.status === "error"
        ? [{ name: asset.name, message: asset.error.message }]
        : [],
    );
    const state = successful.length > 0 ? "complete" : "error";

    return (
      <div className="my-1.5 flex w-full flex-col gap-2 overflow-hidden">
        <Marker role="status">
          <MarkerIcon className="grid size-4 place-items-center">
            {state === "complete" ? (
              <CircleIcon className="size-2 fill-current" />
            ) : (
              <AlertOctagonIcon className="text-destructive" />
            )}
          </MarkerIcon>
          <MarkerContent className={cn(state === "error" && "text-destructive")}>
            {getToolActivityLabel(part, state)}
          </MarkerContent>
        </Marker>
        {successful.length > 0 && (
          <GeneratedAssetGroup assets={successful} />
        )}
        {failed.map((asset) => (
          <Marker key={asset.name} role="status">
            <MarkerIcon className="grid size-4 place-items-center">
              <AlertOctagonIcon className="size-3.5 text-destructive" />
            </MarkerIcon>
            <MarkerContent className="text-destructive">
              <span className="flex min-w-0 flex-col">
                <span>{asset.name} failed</span>
                <span className="text-xs">{asset.message}</span>
              </span>
            </MarkerContent>
          </Marker>
        ))}
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
            <CircleIcon />
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
                  {screenshot.name}
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
    const toolIcon = getToolActivityIcon(part);
    const verification = part.type === "tool-finishBuild" && part.state === "output-available" && "verified" in part.output
      ? part.output
      : null;
    const review = verification?.verified.find(check => check.startsWith("Visual review: "));

    return (
      <Marker role="status">
        <MarkerIcon
          className={cn(
            "grid size-4 place-items-center",
            state === "loading" && "text-bloom",
            state === "error" && "text-destructive",
          )}
        >
          {toolIcon ?? (state === "loading" ? (
            <Loader size={14} className="text-bloom" />
          ) : state === "complete" ? (
            <CircleIcon className="size-2 fill-current" />
          ) : (
            <AlertOctagonIcon className="text-destructive" />
          ))}
        </MarkerIcon>
        <MarkerContent
          className={cn(
            state === "loading" && "shimmer shimmer-color-bloom",
            state === "error" && "text-destructive",
          )}
        >
          <span className="flex min-w-0 flex-col">
            <span>
              {getToolActivityLabel(part, state)}
              {state === "loading" && assetProgress && (
                <> · {assetProgress.processed} of {assetProgress.total} processed</>
              )}
            </span>
            {outputError && (
              <span className="text-xs text-destructive">{outputError}</span>
            )}
            {review && <span className="text-xs text-muted-foreground">{review}</span>}
            {verification?.status === "passed" && verification.warnings?.map(warning => (
              <span key={warning} className="text-xs text-muted-foreground">{warning}</span>
            ))}
          </span>
        </MarkerContent>
      </Marker>
    );
  }

  if (part.type === "data-file-changes") {
    const loading = part.data.status === STATUS.LOADING;
    const complete = part.data.status === STATUS.COMPLETE;
    const state = loading ? "loading" : complete ? "complete" : "error";
    const action = getFileActionLabel(state);
    const fileCount = part.data.files.length;
    const singleFile = fileCount === 1 ? part.data.files[0]?.path : null;

    return (
      <Trace>
        <TraceLine status={loading ? "running" : !complete ? "error" : undefined}>
          <TraceIcon>
            {loading ? (
              <Loader size={14} className="text-bloom" />
            ) : complete ? (
              <FilePenIcon />
            ) : (
              <AlertOctagonIcon />
            )}
          </TraceIcon>
          <TraceTitle>
            {action}{" "}
            {singleFile ? (
              singleFile
            ) : loading ? (
              <>
                <NumberFlow value={fileCount} />
                {" "}{fileCount === 1 ? "file" : "files"}
              </>
            ) : (
              fileCount + " " + (fileCount === 1 ? "file" : "files")
            )}
          </TraceTitle>
        </TraceLine>
      </Trace>
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

function AssistantParts({ parts, busy, onSubmitUserInput }: {
  parts: ChatMessagePart[];
} & Pick<AssistantMessagePartProps, "busy" | "onSubmitUserInput">) {
  const progress = new Map(parts.flatMap(part => part.type === "data-asset-progress"
    ? [[part.data.toolCallId, part.data] as const] : []));
  return parts.map((part, index) => <AssistantMessagePart
    key={"toolCallId" in part ? part.toolCallId : `${part.type}:${index}`}
    part={part}
    busy={busy}
    assetProgress={part.type === "tool-generateAsset" ? progress.get(part.toolCallId) : undefined}
    onSubmitUserInput={onSubmitUserInput}
  />);
}

type ChatMessageItemProps = {
  projectId: string;
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
  projectId,
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
  const grouped = message.parts.some(part => part.type === "data-activity");
  const renderParts = (parts: ChatMessagePart[]) => (
    <AssistantParts parts={parts} busy={busy} onSubmitUserInput={onSubmitUserInput} />
  );

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
                    "relative overflow-visible rounded-2xl ring-2 ring-offset-2 ring-offset-background transition-shadow",
                    editing ? "ring-primary" : "ring-transparent",
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
          message.parts.map((part, index) => {
            if (part.type === "data-activity") {
              return <ChatRunActivity
                key={part.data.runId}
                projectId={projectId}
                activity={part.data}
                liveParts={part.data.finishedAt === null ? getActivityDetails(message.parts, part.data.runId) : undefined}
                renderParts={renderParts}
              />;
            }
            if (grouped && isActivityDetail(part)) return null;
            return <AssistantMessagePart key={`${part.type}:${index}`} part={part} busy={busy} onSubmitUserInput={onSubmitUserInput} />;
          })
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
  projectId, failedRuns,
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
            <BloomLogo className="size-10 text-foreground motion-safe:animate-[spin_24s_linear_infinite]" />
            <p className="max-w-2/3 text-center text-sm text-muted-foreground">
              Describe what you want Bloom to create or change.
            </p>
          </div>
        ) : (
          <div className="mt-auto w-full max-w-2xl self-center p-4 pb-10">
            {messages.map((message, index) => (
              <Fragment key={message.id}>
                <ChatMessageItem
                  projectId={projectId}
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
                {failedRuns.filter(run => run.targetMessageId === message.id).map(run => (
                  <div key={run.id} className="my-2">
                    <ChatRunActivity projectId={projectId}
                      activity={{ runId: run.id, startedAt: run.startedAt, finishedAt: run.finishedAt }}
                      outcome={run.status === "STOPPED" ? "Stopped" : "Failed"}
                      renderParts={parts => <AssistantParts parts={parts} busy={busy} onSubmitUserInput={onSubmitUserInput} />}
                    />
                    {run.error && <p className="text-xs text-muted-foreground">{run.error}</p>}
                  </div>
                ))}
              </Fragment>
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
