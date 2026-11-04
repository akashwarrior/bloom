"use client";

import type { ElementSelection, Metadata } from "@/ai/message/metadata";
import type { FileUIPart } from "ai";
import Image from "next/image";
import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { AnimatePresence, motion, type Transition } from "motion/react";
import {
  ArrowUpIcon,
  CircleAlertIcon,
  FileIcon,
  LoaderCircleIcon,
  MicIcon,
  MousePointerClickIcon,
  PlusIcon,
  SquareIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  BYTES_PER_MB,
  CHAT_ATTACHMENT_ACCEPT,
  getDataUrlSize,
  isSupportedChatAttachmentType,
  MAX_CHAT_ATTACHMENTS,
  MAX_CHAT_ATTACHMENT_SIZE,
  MAX_CHAT_ATTACHMENTS_SIZE,
} from "@/lib/chat-attachments";
import { cn } from "@/lib/utils";
import { isImageMediaType, type EditingMessage } from "@/lib/chat-message";
import {
  ELEMENT_SELECTED_EVENT,
  selectionKey,
  selectionLabel,
} from "@/lib/element-selection";

const MAX_SELECTIONS = 8;

const MODES = [
  { value: "BUILD", label: "Build", description: "Make changes directly" },
  { value: "PLAN", label: "Plan", description: "Discuss before building" },
] as const satisfies readonly {
  value: Metadata["mode"];
  label: string;
  description: string;
}[];

const MAX_ATTACHMENT_MB = MAX_CHAT_ATTACHMENT_SIZE / BYTES_PER_MB;
const MAX_ATTACHMENTS_MB = MAX_CHAT_ATTACHMENTS_SIZE / BYTES_PER_MB;

const PREVIEW_TILE_TRANSITION: Transition = {
  type: "spring",
  stiffness: 500,
  damping: 35,
};

const PREVIEW_ROW_TRANSITION: Transition = {
  duration: 0.16,
  ease: [0.22, 1, 0.36, 1],
};

type AttachmentStatus = "uploading" | "ready" | "error";

type AttachmentUploader = (
  files: File[],
  signal?: AbortSignal,
) => Promise<FileUIPart[]>;

type AttachmentDiscarder = (file: FileUIPart) => Promise<void>;

type ComposerAttachment = {
  id: string;
  filename: string;
  mediaType: string;
  size?: number;
  localFile?: File;
  part?: FileUIPart;
  status: AttachmentStatus;
};

function createAttachmentId() {
  return crypto.randomUUID();
}

function createEditingAttachments(files: FileUIPart[]): ComposerAttachment[] {
  return files.map((part) => {
    const size = part.url.startsWith("data:")
      ? getDataUrlSize(part.url)
      : undefined;

    return {
      id: createAttachmentId(),
      filename: part.filename || "Attachment",
      mediaType: part.mediaType,
      ...(size === undefined ? {} : { size }),
      part,
      status: "ready",
    };
  });
}

function createPendingAttachment(file: File): ComposerAttachment {
  return {
    id: createAttachmentId(),
    filename: file.name || "Attachment",
    mediaType: file.type,
    size: file.size,
    localFile: file,
    status: "uploading",
  };
}

function markAttachmentReady(attachment: ComposerAttachment, part: FileUIPart) {
  const readyAttachment: ComposerAttachment = {
    ...attachment,
    part,
    status: "ready",
  };

  delete readyAttachment.localFile;
  return readyAttachment;
}

function getFileValidationError(files: File[], currentSize: number) {
  const unsupportedFile = files.find(
    ({ type }) => !isSupportedChatAttachmentType(type),
  );
  if (unsupportedFile) {
    return `${unsupportedFile.name} is not a supported file type`;
  }

  const oversizedFile = files.find(
    ({ size }) => size > MAX_CHAT_ATTACHMENT_SIZE,
  );
  if (oversizedFile) {
    return `${oversizedFile.name} exceeds the ${MAX_ATTACHMENT_MB} MB file limit`;
  }

  const selectedSize = files.reduce((total, { size }) => total + size, 0);
  if (currentSize + selectedSize > MAX_CHAT_ATTACHMENTS_SIZE) {
    return `Attachments cannot exceed ${MAX_ATTACHMENTS_MB} MB in total`;
  }

  return null;
}

function handleEditorKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
  if (
    event.key === "Enter" &&
    !event.shiftKey &&
    !event.nativeEvent.isComposing
  ) {
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }
}

type FilePreviewTileProps = {
  attachment: ComposerAttachment;
  disabled: boolean;
  onRemove: (id: string) => void;
};

const FilePreviewTile = memo(function FilePreviewTile({
  attachment,
  disabled,
  onRemove,
}: FilePreviewTileProps) {
  const { id, filename, localFile, mediaType, part, status } = attachment;
  const [localPreviewUrl] = useState(() =>
    localFile && isImageMediaType(localFile.type)
      ? URL.createObjectURL(localFile)
      : undefined,
  );

  useEffect(
    () => () => {
      if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    },
    [localPreviewUrl],
  );

  const previewUrl = localPreviewUrl ?? part?.url;

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={PREVIEW_TILE_TRANSITION}
      className={cn(
        "group/preview relative size-16 shrink-0 overflow-hidden rounded-lg border bg-muted",
        status === "error" && "border-destructive",
      )}
    >
      {isImageMediaType(mediaType) && previewUrl ? (
        <Image
          src={previewUrl}
          alt={filename}
          fill
          unoptimized
          decoding="async"
          className="size-full object-cover"
        />
      ) : (
        <div className="flex size-full flex-col items-center justify-center gap-1.5 p-2 text-muted-foreground">
          <FileIcon className="size-5" />
          <span className="w-full truncate text-center text-[10px]">
            {filename}
          </span>
        </div>
      )}

      {status !== "ready" && (
        <span
          role="status"
          aria-label={
            status === "uploading"
              ? `Preparing ${filename}`
              : `Failed to prepare ${filename}`
          }
          className={cn(
            "absolute bottom-1 left-1 grid size-5 place-items-center rounded-full bg-background/90 shadow-sm backdrop-blur-sm",
            status === "error" && "text-destructive",
          )}
        >
          {status === "uploading" ? (
            <LoaderCircleIcon className="size-3 animate-spin" />
          ) : (
            <CircleAlertIcon className="size-3" />
          )}
        </span>
      )}

      <button
        type="button"
        disabled={disabled}
        aria-label={`Remove ${filename}`}
        onClick={() => onRemove(id)}
        className={cn(
          "absolute top-1 right-1 z-10 grid size-5 place-items-center rounded-full",
          "bg-background/90 text-foreground shadow-sm backdrop-blur-sm",
          "opacity-100 outline-none transition-opacity",
          "disabled:pointer-events-none disabled:opacity-50",
          "focus-visible:ring-2 focus-visible:ring-ring",
          "sm:opacity-0 sm:group-hover/preview:opacity-100 sm:focus-visible:opacity-100",
        )}
      >
        <XIcon className="size-3" strokeWidth={2.5} />
      </button>
    </motion.div>
  );
});

type FilePreviewsProps = {
  attachments: ComposerAttachment[];
  disabled: boolean;
  onRemove: (id: string) => void;
};

const FilePreviews = memo(function FilePreviews({
  attachments,
  disabled,
  onRemove,
}: FilePreviewsProps) {
  return (
    <AnimatePresence initial={false}>
      {attachments.length > 0 && (
        <motion.div
          initial={{ scaleY: 0, opacity: 0 }}
          animate={{ scaleY: 1, opacity: 1 }}
          exit={{ scaleY: 0, opacity: 0 }}
          transition={PREVIEW_ROW_TRANSITION}
          className="scroll-fade-x scrollbar-none flex h-20 origin-top items-center gap-2 overflow-x-auto border-b px-2"
        >
          <AnimatePresence initial={false}>
            {attachments.map((attachment) => (
              <FilePreviewTile
                key={attachment.id}
                attachment={attachment}
                disabled={disabled}
                onRemove={onRemove}
              />
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

type ChatInputHeaderProps = {
  attachments: ComposerAttachment[];
  selections: ElementSelection[];
  disabled: boolean;
  editing: boolean;
  onCancelEdit: () => void;
  onRemoveAttachment: (id: string) => void;
  onRemoveSelection: (key: string) => void;
};

const ChatInputHeader = memo(function ChatInputHeader({
  attachments,
  selections,
  disabled,
  editing,
  onCancelEdit,
  onRemoveAttachment,
  onRemoveSelection,
}: ChatInputHeaderProps) {
  if (!editing && attachments.length === 0 && selections.length === 0) return null;

  return (
    <>
      {editing && (
        <div className="flex items-center gap-2 border-b px-3 py-2 text-xs font-medium text-bloom">
          <span className="size-1.5 rounded-full bg-bloom" />
          Editing message
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className="ml-auto size-6"
            aria-label="Cancel editing"
            disabled={disabled}
            onClick={onCancelEdit}
          >
            <XIcon />
          </Button>
        </div>
      )}

      {selections.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-b px-2 py-2">
          {selections.map((selection) => (
            <span
              key={selectionKey(selection)}
              title={selection.text || selection.selector}
              className="inline-flex max-w-56 items-center gap-1 rounded-md bg-bloom/10 py-0.5 pr-0.5 pl-1.5 text-xs font-medium text-bloom"
            >
              <MousePointerClickIcon className="size-3 shrink-0" />
              <span className="truncate">{selectionLabel(selection)}</span>
              <button
                type="button"
                disabled={disabled}
                aria-label={`Remove ${selectionLabel(selection)}`}
                onClick={() => onRemoveSelection(selectionKey(selection))}
                className="grid size-4 shrink-0 place-items-center rounded-sm outline-none hover:bg-bloom/15 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              >
                <XIcon className="size-3" strokeWidth={2.5} />
              </button>
            </span>
          ))}
        </div>
      )}

      <FilePreviews
        attachments={attachments}
        disabled={disabled}
        onRemove={onRemoveAttachment}
      />
    </>
  );
});

type ChatInputEditorProps = {
  editing: boolean;
  value: string;
  onChange: (value: string) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
};

function ChatInputEditor({
  editing,
  value,
  onChange,
  textareaRef,
}: ChatInputEditorProps) {
  return (
    <Textarea
      autoFocus
      ref={textareaRef}
      value={value}
      placeholder={
        editing ? "Edit your message" : "Describe what you want to generate"
      }
      className="field-sizing-content max-h-52 resize-none border-none! p-3 text-sm ring-0!"
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={handleEditorKeyDown}
    />
  );
}

type ComposerState =
  | "idle"
  | "blocked"
  | "ready"
  | "uploading"
  | "submitting"
  | "streaming";

type ComposerIntent = "draft" | "edit";

function getComposerState(
  busy: boolean,
  submitting: boolean,
  uploading: boolean,
  canSubmit: boolean,
  hasContent: boolean,
): ComposerState {
  if (busy) return "streaming";
  if (submitting) return "submitting";
  if (uploading) return "uploading";
  if (canSubmit) return "ready";
  return hasContent ? "blocked" : "idle";
}

function useFocusEditingTextarea(
  textareaRef: RefObject<HTMLTextAreaElement | null>,
  editing: boolean,
) {
  useEffect(() => {
    if (!editing) return;

    const frame = requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      textarea.focus();
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    });

    return () => cancelAnimationFrame(frame);
  }, [editing, textareaRef]);
}

type ChatInputToolbarProps = {
  attachmentCount: number;
  composerState: ComposerState;
  intent: ComposerIntent;
  mode: Metadata["mode"];
  onFilesSelected: (files: File[]) => void | Promise<void>;
  onModeChange: (mode: Metadata["mode"]) => void;
  onStop: () => void;
};

const ChatInputToolbar = memo(function ChatInputToolbar({
  attachmentCount,
  composerState,
  intent,
  mode,
  onFilesSelected,
  onModeChange,
  onStop,
}: ChatInputToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const busy = composerState === "streaming";
  const isSubmitting = composerState === "submitting";
  const isUploading = composerState === "uploading";
  const disabled = busy || isSubmitting;
  const hasContent = composerState !== "idle";
  const canSubmit = composerState === "ready";
  const editing = intent === "edit";

  return (
    <div className="flex w-full items-center gap-1 border-t p-1.5 text-muted-foreground">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={CHAT_ATTACHMENT_ACCEPT}
        aria-label="Choose attachments"
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? []);
          event.currentTarget.value = "";
          void onFilesSelected(files);
        }}
      />

      <Button
        type="button"
        size="icon"
        variant="ghost"
        aria-label="Add attachments"
        disabled={
          disabled || isUploading || attachmentCount >= MAX_CHAT_ATTACHMENTS
        }
        onClick={() => fileInputRef.current?.click()}
      >
        {isUploading ? (
          <LoaderCircleIcon className="animate-spin" />
        ) : (
          <PlusIcon />
        )}
      </Button>

      <Select
        items={MODES}
        value={mode}
        modal={false}
        disabled={disabled}
        onValueChange={(value) => onModeChange(value as Metadata["mode"])}
      >
        <SelectTrigger
          className="ml-auto border-none text-xs"
          render={<Button type="button" size="sm" variant="ghost" />}
        >
          <SelectValue className="capitalize" />
        </SelectTrigger>

        <SelectContent align="end" sideOffset={5}>
          <SelectGroup>
            {MODES.map(({ value, label, description }) => (
              <SelectItem
                key={value}
                value={value}
                className="flex h-fit flex-col items-start"
              >
                <span>{label}</span>
                <span className="text-xs text-muted-foreground">
                  {description}
                </span>
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>

      <Button
        type="button"
        size="icon"
        variant="ghost"
        aria-label="Use microphone"
        disabled={disabled}
      >
        <MicIcon />
      </Button>

      <Button
        type={busy ? "button" : "submit"}
        size="icon"
        variant={busy || hasContent || isSubmitting ? "default" : "secondary"}
        className="relative rounded-full"
        aria-label={
          busy
            ? "Stop generating"
            : isSubmitting
              ? "Sending message"
              : editing
                ? "Save edited message"
                : "Send message"
        }
        disabled={busy ? false : !canSubmit}
        onClick={busy ? onStop : undefined}
      >
        {busy ? (
          <SquareIcon className="size-3.5 fill-current" />
        ) : isSubmitting ? (
          <LoaderCircleIcon className="size-4 animate-spin" />
        ) : (
          <ArrowUpIcon className="size-4.25" />
        )}
      </Button>
    </div>
  );
});

type ChatInputProps = {
  className?: string;
  busy?: boolean;
  editingMessage?: EditingMessage | null;
  onCancelEdit?: () => void;
  uploadAttachments: AttachmentUploader;
  discardAttachment: AttachmentDiscarder;
  stop: () => Promise<void>;
  sendMessage: (message: {
    text: string;
    messageId?: string;
    files?: FileUIPart[];
    metadata: Metadata;
  }) => Promise<void>;
};

type ChatInputSessionProps = ChatInputProps & {
  initialMode: Metadata["mode"];
  onDraftModeChange: (mode: Metadata["mode"]) => void;
};

type ChatInputComposerProps = {
  attachments: ComposerAttachment[];
  selections: ElementSelection[];
  onRemoveSelection: (key: string) => void;
  className?: string;
  composerState: ComposerState;
  intent: ComposerIntent;
  mode: Metadata["mode"];
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
  onCancelEdit: () => void;
  onFilesSelected: (files: File[]) => void | Promise<void>;
  onModeChange: (mode: Metadata["mode"]) => void;
  onRemoveAttachment: (id: string) => void;
  onStop: () => void;
  onSubmit: (event: React.SubmitEvent<HTMLFormElement>) => void;
  onValueChange: (value: string) => void;
};

function ChatInputComposer({
  attachments,
  selections,
  onRemoveSelection,
  className,
  composerState,
  intent,
  mode,
  textareaRef,
  value,
  onCancelEdit,
  onFilesSelected,
  onModeChange,
  onRemoveAttachment,
  onStop,
  onSubmit,
  onValueChange,
}: ChatInputComposerProps) {
  const controlsDisabled =
    composerState === "streaming" || composerState === "submitting";
  const isUploading = composerState === "uploading";
  const isEditing = intent === "edit";

  return (
    <form
      className={cn(
        "w-full rounded-xl ring-1 ring-border transition-shadow focus-within:ring-2",
        className,
      )}
      onSubmit={onSubmit}
    >
      <ChatInputHeader
        attachments={attachments}
        selections={selections}
        onRemoveSelection={onRemoveSelection}
        disabled={controlsDisabled || isUploading}
        editing={isEditing}
        onCancelEdit={onCancelEdit}
        onRemoveAttachment={onRemoveAttachment}
      />

      <ChatInputEditor
        textareaRef={textareaRef}
        value={value}
        editing={isEditing}
        onChange={onValueChange}
      />

      <ChatInputToolbar
        attachmentCount={attachments.length}
        composerState={composerState}
        intent={intent}
        mode={mode}
        onFilesSelected={onFilesSelected}
        onModeChange={onModeChange}
        onStop={onStop}
      />
    </form>
  );
}

function ChatInputSession({
  className,
  busy = false,
  editingMessage,
  onCancelEdit,
  uploadAttachments,
  discardAttachment,
  stop,
  sendMessage,
  initialMode,
  onDraftModeChange,
}: ChatInputSessionProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const uploadOperationRef = useRef(0);
  const uploadAbortRef = useRef<AbortController | null>(null);
  const temporaryPartsRef = useRef(new Map<string, FileUIPart>());
  const submitLockRef = useRef(false);
  const mountedRef = useRef(false);
  const discardAttachmentRef = useRef(discardAttachment);

  const [value, setValue] = useState(() => editingMessage?.text ?? "");
  const [attachments, setAttachments] = useState(() =>
    createEditingAttachments(editingMessage?.files ?? []),
  );
  const [selections, setSelections] = useState<ElementSelection[]>(
    () => editingMessage?.metadata?.selections ?? [],
  );
  const [mode, setMode] = useState(initialMode);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    function onSelected(event: Event) {
      const selection = (event as CustomEvent<ElementSelection>).detail;
      setSelections((current) =>
        current.some((item) => selectionKey(item) === selectionKey(selection))
          ? current
          : [...current, selection].slice(-MAX_SELECTIONS),
      );
      textareaRef.current?.focus();
    }

    window.addEventListener(ELEMENT_SELECTED_EVENT, onSelected);
    return () => window.removeEventListener(ELEMENT_SELECTED_EVENT, onSelected);
  }, []);

  const removeSelection = useCallback((key: string) => {
    setSelections((current) =>
      current.filter((selection) => selectionKey(selection) !== key),
    );
  }, []);

  const isEditing = editingMessage != null;
  const isUploading = attachments.some(({ status }) => status === "uploading");
  const hasAttachmentError = attachments.some(
    ({ status }) => status === "error",
  );
  const hasContent = value.trim().length > 0 || attachments.length > 0;
  const canSubmit =
    hasContent && !busy && !isSubmitting && !isUploading && !hasAttachmentError;
  const composerState = getComposerState(
    busy,
    isSubmitting,
    isUploading,
    canSubmit,
    hasContent,
  );
  const intent: ComposerIntent = isEditing ? "edit" : "draft";

  useEffect(() => {
    discardAttachmentRef.current = discardAttachment;
  }, [discardAttachment]);

  useFocusEditingTextarea(textareaRef, isEditing);

  const discardParts = useCallback((parts: Iterable<FileUIPart>) => {
    const discard = discardAttachmentRef.current;

    for (const part of parts) {
      void discard(part).catch(() => undefined);
    }
  }, []);

  const discardTemporaryParts = useCallback(() => {
    const parts = [...temporaryPartsRef.current.values()];
    temporaryPartsRef.current.clear();
    discardParts(parts);
  }, [discardParts]);

  const invalidateUpload = useCallback(() => {
    uploadOperationRef.current += 1;
    uploadAbortRef.current?.abort();
    uploadAbortRef.current = null;
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      invalidateUpload();
      discardTemporaryParts();
    };
  }, [discardTemporaryParts, invalidateUpload]);

  const cancelEdit = useCallback(() => {
    invalidateUpload();
    discardTemporaryParts();
    setValue("");
    setAttachments([]);
    setSelections([]);
    onCancelEdit?.();
  }, [discardTemporaryParts, invalidateUpload, onCancelEdit]);

  const removeAttachment = useCallback(
    (id: string) => {
      const temporaryPart = temporaryPartsRef.current.get(id);
      temporaryPartsRef.current.delete(id);
      if (temporaryPart) discardParts([temporaryPart]);

      setAttachments((current) =>
        current.filter((attachment) => attachment.id !== id),
      );
    },
    [discardParts],
  );

  const addAttachments = useCallback(
    async (selectedFiles: File[]) => {
      if (selectedFiles.length === 0 || busy || isSubmitting || isUploading) {
        return;
      }

      const availableSlots = MAX_CHAT_ATTACHMENTS - attachments.length;
      if (availableSlots <= 0) {
        toast.error(`You can attach up to ${MAX_CHAT_ATTACHMENTS} files`);
        return;
      }

      if (selectedFiles.length > availableSlots) {
        toast.info(
          `Only the first ${availableSlots} ${availableSlots === 1 ? "file was" : "files were"
          } added`,
        );
      }

      const files = selectedFiles.slice(0, availableSlots);
      const currentSize = attachments.reduce(
        (total, attachment) => total + (attachment.size ?? 0),
        0,
      );
      const validationError = getFileValidationError(files, currentSize);

      if (validationError) {
        toast.error(validationError);
        return;
      }

      const operationId = ++uploadOperationRef.current;
      const controller = new AbortController();
      const pendingAttachments = files.map(createPendingAttachment);
      const pendingIds = new Set(pendingAttachments.map(({ id }) => id));

      uploadAbortRef.current = controller;
      setAttachments((current) => [...current, ...pendingAttachments]);

      try {
        const parts = await uploadAttachments(files, controller.signal);

        if (uploadOperationRef.current !== operationId) {
          discardParts(parts);
          return;
        }

        if (parts.length !== pendingAttachments.length) {
          discardParts(parts);
          throw new Error("Attachment upload returned an unexpected result");
        }

        const partById = new Map(
          pendingAttachments.map(
            ({ id }, index) => [id, parts[index]!] as const,
          ),
        );

        for (const [id, part] of partById) {
          temporaryPartsRef.current.set(id, part);
        }

        setAttachments((current) =>
          current.map((attachment) => {
            const part = partById.get(attachment.id);
            return part ? markAttachmentReady(attachment, part) : attachment;
          }),
        );
      } catch {
        if (
          uploadOperationRef.current === operationId &&
          !controller.signal.aborted
        ) {
          toast.error("Failed to add attachments");
          setAttachments((current) =>
            current.map((attachment) =>
              pendingIds.has(attachment.id)
                ? { ...attachment, status: "error" }
                : attachment,
            ),
          );
        }
      } finally {
        if (uploadAbortRef.current === controller) {
          uploadAbortRef.current = null;
        }
      }
    },
    [
      attachments,
      busy,
      discardParts,
      isSubmitting,
      isUploading,
      uploadAttachments,
    ],
  );

  const changeMode = useCallback(
    (nextMode: Metadata["mode"]) => {
      setMode(nextMode);
      if (!isEditing) onDraftModeChange(nextMode);
    },
    [isEditing, onDraftModeChange],
  );

  const submitMessage = useCallback(async () => {
    if (!canSubmit || submitLockRef.current) return;

    const text = value.trim();
    const files = attachments.flatMap(({ part }) => (part ? [part] : []));
    if (files.length !== attachments.length) return;

    submitLockRef.current = true;
    setIsSubmitting(true);

    const temporaryParts = new Map(temporaryPartsRef.current);
    temporaryPartsRef.current.clear();
    setValue("");
    setAttachments([]);
    setSelections([]);

    try {
      const request = sendMessage({
        text,
        ...(editingMessage ? { messageId: editingMessage.id } : {}),
        ...(files.length > 0 ? { files } : {}),
        metadata: {
          ...editingMessage?.metadata,
          mode,
          selections: selections.length > 0 ? selections : undefined,
        },
      });

      if (editingMessage) onCancelEdit?.();
      await request;
    } catch {
      if (!mountedRef.current) {
        discardParts(temporaryParts.values());
        return;
      }

      for (const [id, part] of temporaryParts) {
        temporaryPartsRef.current.set(id, part);
      }

      setValue(value);
      setAttachments(attachments);
      setSelections(selections);
      toast.error("Message couldn't be sent. Please try again.");
    } finally {
      submitLockRef.current = false;
      setIsSubmitting(false);
    }
  }, [
    attachments,
    canSubmit,
    discardParts,
    editingMessage,
    mode,
    onCancelEdit,
    selections,
    sendMessage,
    value,
  ]);

  const stopGeneration = useCallback(() => {
    void stop().catch(() => {
      toast.error("Failed to stop the response");
    });
  }, [stop]);

  const handleSubmit = useCallback(
    (event: React.SubmitEvent<HTMLFormElement>) => {
      event.preventDefault();
      void submitMessage();
    },
    [submitMessage],
  );

  return (
    <ChatInputComposer
      attachments={attachments}
      selections={selections}
      onRemoveSelection={removeSelection}
      className={className}
      composerState={composerState}
      intent={intent}
      mode={mode}
      textareaRef={textareaRef}
      value={value}
      onCancelEdit={cancelEdit}
      onFilesSelected={addAttachments}
      onModeChange={changeMode}
      onRemoveAttachment={removeAttachment}
      onStop={stopGeneration}
      onSubmit={handleSubmit}
      onValueChange={setValue}
    />
  );
}

export const ChatInput = memo(function ChatInput(props: ChatInputProps) {
  const [draftMode, setDraftMode] = useState<Metadata["mode"]>("BUILD");
  const editingMessage = props.editingMessage;
  const sessionKey = editingMessage ? `edit:${editingMessage.id}` : "draft";

  return (
    <ChatInputSession
      key={sessionKey}
      {...props}
      initialMode={editingMessage?.metadata?.mode ?? draftMode}
      onDraftModeChange={setDraftMode}
    />
  );
});
