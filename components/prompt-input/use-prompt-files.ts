"use client"

import { getDataUrlSize, type ChatFilePart } from "@/lib/assets"
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { countLines, formatBytes, matchesAccept } from "./text"

type PromptFileState = "uploading" | "done" | "error"

type PromptFile = {
  id: string
  file: File
  name: string
  size: number
  type: string
  state: PromptFileState
  preview?: string
  progress?: number
  error?: string
  retryable?: boolean
  pasted?: { text: string; lines: number }
  result?: unknown
  existing?: boolean
}

type UploadOptions = {
  signal: AbortSignal
  onProgress: (progress: number) => void
}

type PromptUpload = (file: File, options: UploadOptions) => Promise<unknown>

type PromptFileOptions = {
  accept?: string
  maxFiles?: number
  maxFileSize?: number
  maxTotalSize?: number
  initialFiles?: ChatFilePart[]
  upload?: PromptUpload
  onReject?: (file: File, reason: string) => void
  onDiscard?: (file: PromptFile) => void
}

let counter = 0

function nextId() {
  counter += 1
  return `file-${Date.now().toString(36)}-${counter}`
}

function createPreview(file: File) {
  if (!file.type.startsWith("image/")) return undefined
  try {
    return URL.createObjectURL(file)
  } catch {
    return undefined
  }
}

function revoke(entry: PromptFile) {
  if (!entry.preview?.startsWith("blob:")) return
  try {
    URL.revokeObjectURL(entry.preview)
  } catch { }
}

function initialFile(part: ChatFilePart, index: number): PromptFile {
  const name = part.filename ?? "Attachment"
  return {
    id: `existing-${index}`,
    file: new File([], name, { type: part.mediaType }),
    name,
    size: part.size ?? getDataUrlSize(part.url) ?? 0,
    type: part.mediaType,
    state: "done",
    preview: part.mediaType.startsWith("image/") ? part.url : undefined,
    result: part,
    existing: true,
  }
}

function usePromptFiles({
  accept,
  maxFiles = 10,
  maxFileSize,
  maxTotalSize,
  initialFiles,
  upload,
  onReject,
  onDiscard,
}: PromptFileOptions) {
  const [files, setFiles] = useState<PromptFile[]>(() =>
    (initialFiles ?? []).map(initialFile)
  )
  const filesRef = useRef(files)
  const controllers = useRef(new Map<string, AbortController>())
  const options = useRef({ upload, onReject, onDiscard })

  useEffect(() => {
    options.current = { upload, onReject, onDiscard }
  }, [upload, onReject, onDiscard])

  useEffect(() => {
    filesRef.current = files
  }, [files])

  const discard = useCallback((entries: PromptFile[]) => {
    for (const entry of entries) {
      controllers.current.get(entry.id)?.abort()
      controllers.current.delete(entry.id)
      revoke(entry)
      if (entry.result && !entry.existing) {
        void options.current.onDiscard?.(entry)
      }
    }
  }, [])

  useEffect(() => {
    const pending = controllers.current
    return () => {
      for (const controller of pending.values()) controller.abort()
      discard(filesRef.current)
    }
  }, [discard])

  const patch = useCallback((id: string, change: Partial<PromptFile>) => {
    setFiles((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, ...change } : entry))
    )
  }, [])

  const start = useCallback(
    (entry: PromptFile) => {
      const send = options.current.upload
      if (!send) return
      const controller = new AbortController()
      controllers.current.set(entry.id, controller)
      send(entry.file, {
        signal: controller.signal,
        onProgress: (progress) => {
          if (!controller.signal.aborted) {
            patch(entry.id, { progress: Math.round(progress) })
          }
        },
      }).then(
        (result) => {
          if (controller.signal.aborted) {
            void options.current.onDiscard?.({ ...entry, result })
            return
          }
          controllers.current.delete(entry.id)
          patch(entry.id, { state: "done", progress: undefined, result })
        },
        (error: unknown) => {
          if (controller.signal.aborted) return
          controllers.current.delete(entry.id)
          patch(entry.id, {
            state: "error",
            progress: undefined,
            error: error instanceof Error ? error.message : "Upload failed",
            retryable: true,
          })
        }
      )
    },
    [patch]
  )

  const add = useCallback(
    (incoming: File[], extra: { pasted?: string } = {}) => {
      const accepted: PromptFile[] = []
      const rejected: PromptFile[] = []
      let room = maxFiles - filesRef.current.filter((f) => f.state !== "error").length
      let total = filesRef.current.reduce(
        (sum, entry) => (entry.state === "error" ? sum : sum + entry.size),
        0
      )
      for (const file of incoming) {
        const base = {
          id: nextId(),
          file,
          name: file.name || "Untitled",
          size: file.size,
          type: file.type,
        }
        let reason: string | null = null
        if (!matchesAccept(file, accept)) reason = "This file type isn’t supported"
        else if (maxFileSize !== undefined && file.size > maxFileSize) {
          reason = `Larger than ${formatBytes(maxFileSize)}`
        } else if (maxTotalSize !== undefined && total + file.size > maxTotalSize) {
          reason = `Attachments must total ${formatBytes(maxTotalSize)} or less`
        } else if (room <= 0) {
          reason = `You can attach up to ${maxFiles} files`
        }
        if (reason) {
          rejected.push({ ...base, state: "error", error: reason, retryable: false })
          options.current.onReject?.(file, reason)
          continue
        }
        room--
        total += file.size
        accepted.push({
          ...base,
          state: options.current.upload ? "uploading" : "done",
          progress: options.current.upload ? 0 : undefined,
          preview: createPreview(file),
          pasted:
            extra.pasted !== undefined
              ? { text: extra.pasted, lines: countLines(extra.pasted) }
              : undefined,
        })
      }
      const next = [...filesRef.current, ...accepted, ...rejected]
      filesRef.current = next
      setFiles(next)
      for (const entry of accepted) start(entry)
      return { accepted, rejected }
    },
    [accept, maxFiles, maxFileSize, maxTotalSize, start]
  )

  const remove = useCallback(
    (id: string) => {
      const entry = filesRef.current.find((f) => f.id === id)
      if (entry) discard([entry])
      const next = filesRef.current.filter((f) => f.id !== id)
      filesRef.current = next
      setFiles(next)
    },
    [discard]
  )

  const retry = useCallback(
    (id: string) => {
      const entry = filesRef.current.find((f) => f.id === id)
      if (!entry || entry.state !== "error" || !entry.retryable) return
      const reset = { ...entry, state: "uploading" as const, progress: 0, error: undefined }
      patch(id, reset)
      start(reset)
    },
    [patch, start]
  )

  const take = useCallback(() => {
    const sent = filesRef.current.filter((f) => f.state === "done")
    for (const entry of filesRef.current) {
      if (entry.state !== "done") {
        controllers.current.get(entry.id)?.abort()
        revoke(entry)
      }
    }
    controllers.current.clear()
    filesRef.current = []
    setFiles([])
    return sent
  }, [])

  const restore = useCallback((entries: PromptFile[]) => {
    const next = [...entries, ...filesRef.current]
    filesRef.current = next
    setFiles(next)
  }, [])

  const release = useCallback((entries: PromptFile[]) => {
    for (const entry of entries) {
      controllers.current.get(entry.id)?.abort()
      controllers.current.delete(entry.id)
      revoke(entry)
    }
  }, [])

  return useMemo(
    () => ({ files, add, remove, retry, take, restore, release, discard }),
    [files, add, remove, retry, take, restore, release, discard]
  )
}

export {
  usePromptFiles,
  type PromptFile,
  type PromptFileOptions,
}
