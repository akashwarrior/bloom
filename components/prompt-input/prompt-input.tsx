"use client"

import {
  IconArrowUp,
  IconFileText,
  IconPaperclip,
  IconPlayerStopFilled,
  IconPointer,
  IconRefresh,
  IconX,
} from "@tabler/icons-react"
import { cn } from "cn"
import Image from "next/image"

import type { ElementSelection } from "@/ai/message/metadata"
import {
  MAX_SELECTIONS,
  selectionKey,
  selectionLabel,
} from "@/lib/design-mode/selection"
import { useSizeMorph } from "@/lib/motion"
import { projectDraftKey } from "@/lib/prompt-draft"

import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
  AttachmentTrigger,
} from "@/components/ui/attachment"
import { Button } from "@/components/ui/button"
import { useMergedRef } from "@/hooks/use-merged-ref"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Kbd } from "@/components/ui/kbd"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

import { haptic } from "./haptics"
import { formatBytes, insertText, isImeEnter } from "./text"
import {
  usePromptFiles,
  type PromptFile,
  type PromptFileOptions,
} from "./use-prompt-files"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from "react";

type PromptStatus = "ready" | "submitted" | "streaming" | "error"

type PromptMessage = {
  text: string
  files: PromptFile[]
  selections?: ElementSelection[]
}

type QueuedMessage = PromptMessage & { id: string }

type PromptInputContextValue = {
  text: string
  setText: (value: string) => void
  expanded: boolean
  setExpanded: (value: boolean) => void
  textareaRef: RefObject<HTMLTextAreaElement | null>
  groupRef: RefObject<HTMLDivElement | null>
  status: PromptStatus
  busy: boolean
  disabled: boolean
  maxLength?: number
  maxFiles?: number
  pasteLimit: number | false
  files: PromptFile[]
  selections: ElementSelection[]
  addFiles: (files: File[], extra?: { pasted?: string }) => void
  removeFile: (id: string) => void
  retryFile: (id: string) => void
  removeSelection: (key: string) => void
  openFileDialog: () => void
  queue: QueuedMessage[]
  removeQueued: (id: string) => void
  sendQueuedNow: (id: string) => void
  submit: () => void
  stop?: () => void
  dragging: boolean
  announce: (message: string) => void
  canSubmit: boolean
  blockedReason: string | null
}

const PromptInputContext = createContext<PromptInputContextValue | null>(
  null
)

function usePromptInput(part = "usePromptInput") {
  const context = useContext(PromptInputContext)
  if (!context) {
    throw new Error(`${part} must be used within <PromptInput>.`)
  }
  return context
}

function subscribeCoarse(callback: () => void) {
  if (typeof window.matchMedia !== "function") return () => { }
  const query = window.matchMedia("(pointer: coarse)")
  query.addEventListener("change", callback)
  return () => query.removeEventListener("change", callback)
}

function readCoarse() {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches
  )
}

function useCoarsePointer() {
  return useSyncExternalStore(subscribeCoarse, readCoarse, () => false)
}

function shake(element: HTMLElement | null) {
  if (!element) return
  element.removeAttribute("data-shake")
  void element.offsetWidth
  element.setAttribute("data-shake", "")
  setTimeout(() => element.removeAttribute("data-shake"), 400)
}

function hasFiles(event: DragEvent | React.DragEvent) {
  return Array.from(event.dataTransfer?.types ?? []).includes("Files")
}

function readDraft(key: string) {
  try {
    return window.localStorage.getItem(projectDraftKey(key)) ?? ""
  } catch {
    return ""
  }
}

function writeDraft(key: string, value: string) {
  try {
    if (value) window.localStorage.setItem(projectDraftKey(key), value)
    else window.localStorage.removeItem(projectDraftKey(key))
  } catch { }
}

let queued = 0

type PromptInputProps = Omit<
  React.ComponentProps<"form">,
  "onSubmit" | "defaultValue"
> &
  PromptFileOptions & {
    onSubmit: (message: PromptMessage) => void | Promise<unknown>
    status?: PromptStatus
    onStop?: () => void
    selections?: ElementSelection[]
    onSelectionsChange?: (selections: ElementSelection[]) => void
    value?: string
    defaultValue?: string
    onValueChange?: (value: string) => void
    pasteLimit?: number | false
    maxLength?: number
    draftKey?: string
    disabled?: boolean
  }

function PromptInput({
  onSubmit,
  status = "ready",
  onStop,
  selections: controlledSelections,
  onSelectionsChange,
  value,
  defaultValue = "",
  onValueChange,
  pasteLimit = 5000,
  maxLength,
  draftKey,
  disabled = false,
  accept,
  maxFiles = 10,
  maxFileSize,
  maxTotalSize,
  initialFiles,
  upload,
  onReject,
  onDiscard,
  className,
  children,
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop,
  ...props
}: PromptInputProps) {
  const [ownText, setOwnText] = useState(defaultValue)
  const text = value ?? ownText
  const [ownSelections, setOwnSelections] = useState<ElementSelection[]>([])
  const selections = controlledSelections ?? ownSelections
  const [expanded, setExpanded] = useState(false)
  const [queue, setQueue] = useState<QueuedMessage[]>([])
  const [dragging, setDragging] = useState(false)
  const [announcement, setAnnouncement] = useState("")
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const groupRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const dragDepth = useRef(0)
  const busy = status === "submitted" || status === "streaming"

  const announce = useCallback((message: string) => {
    setAnnouncement((current) =>
      current === message ? `${message} ` : message
    )
  }, [])

  const setText = useCallback(
    (next: string) => {
      if (value === undefined) setOwnText(next)
      onValueChange?.(next)
    },
    [value, onValueChange]
  )

  const setSelections = useCallback(
    (next: ElementSelection[]) => {
      if (controlledSelections === undefined) setOwnSelections(next)
      onSelectionsChange?.(next)
    },
    [controlledSelections, onSelectionsChange]
  )

  const removeSelection = useCallback(
    (key: string) => {
      setSelections(
        selections.filter((selection) => selectionKey(selection) !== key)
      )
    },
    [selections, setSelections]
  )

  const files = usePromptFiles({
    accept,
    maxFiles,
    maxFileSize,
    maxTotalSize,
    initialFiles,
    upload,
    onReject: (file, reason) => {
      announce(`${file.name || "File"} not added. ${reason}.`)
      onReject?.(file, reason)
    },
    onDiscard,
  })

  const setTextRef = useRef(setText)
  useEffect(() => {
    setTextRef.current = setText
  })

  useEffect(() => {
    if (!draftKey) return
    const draft = readDraft(draftKey)
    if (draft) setTextRef.current(draft)
  }, [draftKey])

  useEffect(() => {
    if (draftKey) writeDraft(draftKey, text)
  }, [draftKey, text])

  const addFiles = useCallback(
    (incoming: File[], extra?: { pasted?: string }) => {
      if (incoming.length === 0) return
      const { accepted } = files.add(incoming, extra)
      if (accepted.length > 0) {
        announce(
          extra?.pasted !== undefined
            ? "Long paste added as an attachment"
            : `${accepted.length} ${accepted.length === 1 ? "file" : "files"} attached`
        )
      }
    },
    [files, announce]
  )

  const restore = useCallback(
    (message: PromptMessage) => {
      const current = textareaRef.current?.value ?? ""
      setText(current ? `${message.text}\n${current}` : message.text)
      files.restore(message.files)
      if (message.selections?.length) {
        const restoredKeys = new Set(message.selections.map(selectionKey))
        setSelections(
          [
            ...message.selections,
            ...selections.filter(
              (selection) => !restoredKeys.has(selectionKey(selection))
            ),
          ].slice(0, MAX_SELECTIONS)
        )
      }
      announce("Couldn’t send. Your message is back in the box.")
    },
    [files, selections, setSelections, setText, announce]
  )

  const deliver = useCallback(
    (message: PromptMessage) => {
      try {
        const result = onSubmit(message)
        if (result && typeof result.then === "function") {
          result.then(
            () => files.release(message.files),
            () => restore(message)
          )
        } else {
          files.release(message.files)
        }
      } catch {
        restore(message)
      }
    },
    [onSubmit, restore, files]
  )

  const queueRef = useRef(queue)
  useEffect(() => {
    queueRef.current = queue
  }, [queue])

  const discardFiles = files.discard
  useEffect(
    () => () => {
      for (const item of queueRef.current) discardFiles(item.files)
    },
    [discardFiles]
  )

  const drainQueue = useCallback(() => {
    const [first, ...rest] = queueRef.current
    if (!first) return
    queueRef.current = rest
    setQueue(rest)
    deliver(first)
  }, [deliver])

  useEffect(() => {
    if (!busy) drainQueue()
  }, [busy, drainQueue])

  const uploading = files.files.some((file) => file.state === "uploading")
  const failed = files.files.some(
    (file) => file.state === "error" && file.retryable
  )
  const ready = files.files.filter((file) => file.state === "done")
  const over = maxLength !== undefined && text.length > maxLength
  const empty = !text.trim() && ready.length === 0
  const blockedReason = over
    ? `Your message is over ${maxLength!.toLocaleString()} characters`
    : uploading
      ? "Waiting for files to finish uploading"
      : failed
        ? "Retry or remove the files that didn’t upload"
        : null

  const canSubmit = !disabled && !empty && !blockedReason

  const submit = useCallback(() => {
    const field = textareaRef.current
    if (!canSubmit) {
      haptic("success")
      shake(groupRef.current)
      field?.focus()
      if (blockedReason) announce(blockedReason)
      return
    }
    haptic("tap")
    const selected = selections
    const message: PromptMessage = {
      text: text.trim(),
      files: files.take(),
      ...(selected.length > 0 ? { selections: selected } : {}),
    }
    setText("")
    if (selected.length > 0) setSelections([])
    if (draftKey) writeDraft(draftKey, "")
    if (busy) {
      queued += 1
      setQueue((list) => [...list, { ...message, id: `queued-${queued}` }])
      announce("Message queued. It sends when the reply finishes.")
    } else {
      deliver(message)
      announce("Message sent")
    }
    field?.focus()
  }, [
    canSubmit,
    blockedReason,
    text,
    files,
    busy,
    draftKey,
    setText,
    setSelections,
    selections,
    deliver,
    announce,
  ])

  const stop = useMemo(
    () =>
      onStop
        ? () => {
          haptic("tap")
          onStop()
          announce("Stopped")
          textareaRef.current?.focus()
        }
        : undefined,
    [onStop, announce]
  )

  const sendQueuedNow = useCallback(
    (id: string) => {
      const item = queueRef.current.find((entry) => entry.id === id)
      if (!item) return
      if (!busy) {
        const next = queueRef.current.filter((entry) => entry.id !== id)
        queueRef.current = next
        setQueue(next)
        deliver(item)
        return
      }
      setQueue((list) => [
        item,
        ...list.filter((entry) => entry.id !== id),
      ])
      onStop?.()
    },
    [busy, deliver, onStop]
  )

  const context: PromptInputContextValue = {
    text,
    setText,
    expanded,
    setExpanded,
    textareaRef,
    groupRef,
    status,
    busy,
    disabled,
    maxLength,
    maxFiles,
    pasteLimit,
    files: files.files,
    selections,
    addFiles,
    removeFile: files.remove,
    retryFile: files.retry,
    removeSelection,
    openFileDialog: () => inputRef.current?.click(),
    queue,
    removeQueued: (id) => {
      const item = queueRef.current.find((entry) => entry.id === id)
      if (item) discardFiles(item.files)
      const next = queueRef.current.filter((entry) => entry.id !== id)
      queueRef.current = next
      setQueue(next)
    },
    sendQueuedNow,
    submit,
    stop,
    dragging,
    announce,
    canSubmit,
    blockedReason,
  }

  return (
    <PromptInputContext.Provider value={context}>
      <form
        data-slot="prompt-input"
        data-status={status}
        className={cn(
          "relative flex flex-col gap-2 [--composer-radius:var(--radius-xl)] [--composer-radius-inner:calc(var(--composer-radius)-1px)] [--composer-radius-outer:calc(var(--composer-radius)+--spacing(1.5))] rounded-(--composer-radius)",
          className
        )}
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
        onDragEnter={(event) => {
          onDragEnter?.(event)
          if (disabled || !hasFiles(event)) return
          dragDepth.current++
          setDragging(true)
        }}
        onDragOver={(event) => {
          onDragOver?.(event)
          if (hasFiles(event)) event.preventDefault()
        }}
        onDragLeave={(event) => {
          onDragLeave?.(event)
          dragDepth.current = Math.max(0, dragDepth.current - 1)
          if (dragDepth.current === 0) setDragging(false)
        }}
        onDrop={(event) => {
          onDrop?.(event)
          if (!hasFiles(event)) return
          event.preventDefault()
          dragDepth.current = 0
          setDragging(false)
          if (disabled) return
          addFiles(Array.from(event.dataTransfer.files))
          textareaRef.current?.focus()
        }}
        {...props}
      >
        {children}
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={accept}
          tabIndex={-1}
          aria-hidden="true"
          className="hidden"
          onChange={(event) => {
            addFiles(Array.from(event.currentTarget.files ?? []))
            event.currentTarget.value = ""
            textareaRef.current?.focus()
          }}
        />
        <span role="status" className="sr-only">
          {announcement}
        </span>
      </form>
    </PromptInputContext.Provider>
  )
}

function PromptInputBody({
  className,
  children,
  onMouseDown,
  ...props
}: React.ComponentProps<"div">) {
  const context = usePromptInput("PromptInputBody")
  const morphRef = useSizeMorph<HTMLDivElement>({ axis: "height", duration: 240 })
  const setRef = useMergedRef(context.groupRef, morphRef)

  return (
    <div
      ref={setRef}
      data-slot="prompt-input-body"
      data-layout={context.expanded ? "expanded" : "compact"}
      data-disabled={context.disabled ? "" : undefined}
      className={cn(
        "group/composer relative flex cursor-text flex-wrap items-center rounded-(--composer-radius) bg-background p-1 transition-shadow duration-150 ease-out-cubic data-morphing:overflow-clip data-shake:motion-safe:animate-button-shake motion-reduce:transition-none dark:bg-input/30 forced-colors:border data-disabled:cursor-not-allowed data-disabled:opacity-50",
        className
      )}
      onMouseDown={(event) => {
        onMouseDown?.(event)
        const target = event.target as HTMLElement
        if (
          event.defaultPrevented ||
          target.closest("button, a, input, textarea, [role=button], [tabindex]")
        ) {
          return
        }
        event.preventDefault()
        context.textareaRef.current?.focus()
      }}
      {...props}
    >
      {children}

      {context.dragging ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center gap-2 rounded-(--composer-radius) border-2 border-dashed border-ring bg-background/90 text-sm text-muted-foreground motion-safe:animate-in motion-safe:animation-duration-150 motion-safe:fade-in-0"
        >
          <IconPaperclip className="size-4 text-foreground" />
          Drop files to attach
        </div>
      ) : null}
    </div>
  )
}

function PromptInputTextarea({
  className,
  autoFocus,
  onKeyDown,
  onPaste,
  placeholder = "Ask anything",
  ...props
}: React.ComponentProps<"textarea">) {
  const context = usePromptInput("PromptInputTextarea")
  const coarse = useCoarsePointer()
  const {
    textareaRef,
    text,
    files,
    expanded,
    setExpanded,
  } = context

  useEffect(() => {
    if (!autoFocus) return
    const frame = requestAnimationFrame(() => {
      const field = textareaRef.current
      if (!field) return
      field.focus({ preventScroll: true })
      field.setSelectionRange(field.value.length, field.value.length)
    })
    return () => cancelAnimationFrame(frame)
  }, [autoFocus, textareaRef])

  const empty =
    !text && files.length === 0
  const forced =
    text.includes("\n") ||
    files.length > 0

  useLayoutEffect(() => {
    const field = textareaRef.current
    if (!field) return
    if (empty) {
      if (expanded) setExpanded(false)
      return
    }
    if (expanded) return
    const check = () => {
      const style = getComputedStyle(field)
      const line = parseFloat(style.lineHeight) || 24
      const padding =
        (parseFloat(style.paddingTop) || 0) +
        (parseFloat(style.paddingBottom) || 0)
      if (forced || field.scrollHeight - padding > line * 1.5) {
        setExpanded(true)
      }
    }
    check()
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(check)
    observer.observe(field)
    return () => observer.disconnect()
  }, [textareaRef, text, empty, forced, expanded, setExpanded])

  return (
    <textarea
      {...props}
      ref={textareaRef}
      data-slot="prompt-input-textarea"
      name="message"
      value={text}
      placeholder={placeholder}
      disabled={context.disabled}
      dir="auto"
      rows={1}
      enterKeyHint={"send"}
      autoComplete="off"
      autoCapitalize="sentences"
      spellCheck
      aria-label={props["aria-label"] ?? "Message"}
      aria-invalid={
        context.maxLength !== undefined && text.length > context.maxLength
          ? true
          : undefined
      }
      className={cn(
        "order-2 group-data-dictating/composer:invisible field-sizing-content max-h-52 min-h-9 min-w-0 flex-1 basis-0 resize-none bg-transparent p-1.5 text-[15px] text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed group-data-[layout=expanded]/composer:order-1 group-data-[layout=expanded]/composer:basis-full group-data-[layout=expanded]/composer:pt-1 pointer-coarse:text-touch",
        className
      )}
      onChange={(event) => {
        context.setText(event.currentTarget.value)
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event)
        if (event.defaultPrevented) return
        if (isImeEnter(event.nativeEvent)) return
        const mod = event.metaKey || event.ctrlKey
        if (event.key === "Enter") {
          if (event.shiftKey || event.altKey) return
          const send = mod || !coarse
          if (send) {
            event.preventDefault()
            context.submit()
          }
          return
        }
      }}
      onPaste={(event) => {
        onPaste?.(event)
        if (event.defaultPrevented) return
        const data = event.clipboardData
        const pasted = Array.from(data.files)
        const plain = data.getData("text/plain")
        if (pasted.length > 0) {
          if (!plain) event.preventDefault()
          context.addFiles(pasted)
          return
        }
        if (context.pasteLimit !== false && plain.length > context.pasteLimit) {
          event.preventDefault()
          context.addFiles(
            [new File([plain], "Pasted text.txt", { type: "text/plain" })],
            { pasted: plain }
          )
        }
      }}
    />
  )
}

function PromptInputTools({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="prompt-input-tools"
      className={cn(
        "order-1 flex min-w-0 items-center gap-0.5 group-data-dictating/composer:invisible group-data-[layout=expanded]/composer:order-2",
        className
      )}
      {...props}
    />
  )
}

function PromptInputActions({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="prompt-input-actions"
      className={cn("order-3 ms-auto flex items-center gap-1", className)}
      {...props}
    />
  )
}

function PromptInputSubmit({ className }: { className?: string }) {
  const context = usePromptInput("PromptInputSubmit")
  const hasText = Boolean(context.text.trim()) || context.files.length > 0
  const stopping = context.busy && !hasText && Boolean(context.stop)
  const queueing = context.busy && hasText
  const label = stopping
    ? "Stop"
    : queueing
      ? "Queue message"
      : "Send message"

  return (
    <div className={cn("flex items-center gap-1", className)}>
      {context.busy && hasText && context.stop ? (
        <span className="flex motion-safe:animate-in motion-safe:animation-duration-150 motion-safe:fade-in-0 motion-safe:zoom-in-90">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  aria-label="Stop"
                  onClick={context.stop}
                />
              }
            >
              <IconPlayerStopFilled />
            </TooltipTrigger>
            <TooltipContent>
              Stop <Kbd>escape</Kbd>
            </TooltipContent>
          </Tooltip>
        </span>
      ) : null}
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type={stopping ? "button" : "submit"}
              size="icon"
              variant={stopping || context.canSubmit ? "default" : "secondary"}
              aria-label={label}
              aria-disabled={!stopping && !context.canSubmit ? true : undefined}
              data-mode={stopping ? "stop" : "send"}
              onClick={(event) => {
                if (stopping) {
                  event.preventDefault()
                  context.stop?.()
                }
              }}
              className="group/submit"
            />
          }
        >
          <span className="grid *:col-start-1 *:row-start-1">
            <IconArrowUp className="transition duration-150 ease-out group-data-[mode=stop]/submit:scale-50 group-data-[mode=stop]/submit:opacity-0 motion-reduce:transition-none" />
            <IconPlayerStopFilled className="scale-50 opacity-0 transition duration-150 ease-out group-data-[mode=stop]/submit:scale-100 group-data-[mode=stop]/submit:opacity-100 motion-reduce:transition-none" />
          </span>
        </TooltipTrigger>
        <TooltipContent>
          {stopping ? (
            <>
              Stop <Kbd>escape</Kbd>
            </>
          ) : context.blockedReason ? (
            context.blockedReason
          ) : (
            <>
              {queueing ? "Queue" : "Send"}{" "}
              <Kbd>
                enter
              </Kbd>
            </>
          )}
        </TooltipContent>
      </Tooltip>
    </div>
  )
}

function fileDescription(file: PromptFile) {
  if (file.state === "error") return file.error ?? "Couldn’t upload"
  if (file.state === "uploading") {
    return file.progress !== undefined ? `Uploading ${file.progress}%` : "Uploading"
  }
  if (file.existing) return "Attached"
  if (file.pasted) {
    return `${file.pasted.lines.toLocaleString()} ${file.pasted.lines === 1 ? "line" : "lines"}`
  }
  return formatBytes(file.size)
}

function PromptInputAttachments({ className }: { className?: string }) {
  const context = usePromptInput("PromptInputAttachments")
  const [preview, setPreview] = useState<PromptFile | null>(null)

  if (context.files.length === 0) {
    return null
  }

  return (
    <div
      data-slot="prompt-input-attachments"
      className={cn("order-first min-w-0 basis-full", className)}
    >
      <AttachmentGroup className="w-full">
        {context.files.map((file) => (
          <Attachment
            key={file.id}
            size="sm"
            state={file.state}
          >
            {file.pasted ? (
              <AttachmentTrigger
                aria-label={`Preview ${file.name}`}
                onClick={() => setPreview(file)}
              />
            ) : null}

            {file.preview ? (
              <AttachmentMedia variant="image">
                <Image
                  src={file.preview}
                  alt=""
                  fill
                  unoptimized
                  sizes="40px"
                  className="size-full object-cover"
                />
              </AttachmentMedia>
            ) : (
              <AttachmentMedia>
                {file.pasted ? <IconFileText /> : <IconPaperclip />}
              </AttachmentMedia>
            )}
            <AttachmentContent>
              <AttachmentTitle>{file.name}</AttachmentTitle>
              <AttachmentDescription>{fileDescription(file)}</AttachmentDescription>
            </AttachmentContent>
            <AttachmentActions>
              {file.state === "error" && file.retryable ? (
                <AttachmentAction
                  aria-label={`Retry ${file.name}`}
                  onClick={() => context.retryFile(file.id)}
                >
                  <IconRefresh />
                </AttachmentAction>
              ) : null}
              <AttachmentAction
                aria-label={`Remove ${file.name}`}
                onClick={() => {
                  context.removeFile(file.id)
                  context.textareaRef.current?.focus()
                }}
              >
                <IconX />
              </AttachmentAction>
            </AttachmentActions>
          </Attachment>
        ))}
      </AttachmentGroup>
      <Dialog
        open={preview !== null}
        onOpenChange={(open) => {
          if (!open) setPreview(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pasted text</DialogTitle>
            <DialogDescription>
              {preview ? fileDescription(preview) : null}. Long pastes are sent
              as a file so the message stays readable.
            </DialogDescription>
          </DialogHeader>
          <pre className="max-h-80 overflow-auto rounded-lg bg-muted p-3 font-mono text-xs/5 whitespace-pre-wrap">
            {preview?.pasted?.text}
          </pre>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Close</DialogClose>
            <Button
              onClick={() => {
                const field = context.textareaRef.current
                if (!preview?.pasted || !field) return
                const text = preview.pasted.text
                context.removeFile(preview.id)
                setPreview(null)
                requestAnimationFrame(() => insertText(field, text))
              }}
            >
              Insert as text
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function PromptInputSelections({ className }: { className?: string }) {
  const context = usePromptInput("PromptInputSelections")
  if (context.selections.length === 0) return null

  return (
    <ul
      data-slot="prompt-input-selections"
      aria-label="Selected elements"
      className={cn("flex min-w-0 flex-wrap gap-1.5", className)}
    >
      {context.selections.map((selection) => {
        const label = selectionLabel(selection)
        return (
          <li
            key={selectionKey(selection)}
            title={selection.text || selection.selector}
            className="inline-flex max-w-56 items-center gap-1 rounded-md bg-bloom/10 py-0.5 ps-1.5 pe-0.5 text-xs font-medium text-bloom motion-safe:animate-in motion-safe:animation-duration-150 motion-safe:fade-in-0"
          >
            <IconPointer className="size-3 shrink-0" />
            <span className="truncate">{label}</span>
            <button
              type="button"
              disabled={context.disabled}
              aria-label={`Remove ${label}`}
              onClick={() => {
                context.removeSelection(selectionKey(selection))
                context.textareaRef.current?.focus()
              }}
              className="grid size-4 shrink-0 place-items-center rounded-sm outline-none hover:bg-bloom/15 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              <IconX className="size-3" strokeWidth={2.5} />
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function PromptInputQueue({ className }: { className?: string }) {
  const context = usePromptInput("PromptInputQueue")
  if (context.queue.length === 0) return null

  return (
    <ol
      data-slot="prompt-input-queue"
      aria-label="Queued messages"
      className={cn("flex flex-col gap-1", className)}
    >
      {context.queue.map((item, index) => (
        <li
          key={item.id}
          className="flex min-w-0 items-center gap-2 rounded-lg bg-muted/60 py-1 ps-3 pe-1 text-sm motion-safe:animate-in motion-safe:animation-duration-200 motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1"
        >
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {index + 1}
          </span>
          <span className="min-w-0 flex-1 truncate">
            {item.text ||
              `${item.files.length} ${item.files.length === 1 ? "file" : "files"}`}
          </span>
          <Button
            size="xs"
            variant="ghost"
            onClick={() => context.sendQueuedNow(item.id)}
          >
            Send now
          </Button>
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label="Remove from queue"
            onClick={() => context.removeQueued(item.id)}
          >
            <IconX />
          </Button>
        </li>
      ))}
    </ol>
  )
}

export {
  PromptInput,
  PromptInputAttachments,
  PromptInputActions,
  PromptInputBody,
  PromptInputQueue,
  PromptInputSelections,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInput,
  type PromptInputProps,
  type PromptMessage,
  type PromptStatus,
}
