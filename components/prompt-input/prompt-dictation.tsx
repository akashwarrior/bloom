"use client"

import * as React from "react"
import {
  IconArrowUp,
  IconMicrophone,
  IconPlayerStopFilled,
  IconX,
} from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { matchesHotkey } from "@/components/prompt-input/hotkey"
import { haptic } from "./haptics"
import { usePromptInput } from "./prompt-input"
import { insertText } from "./text"

type Recognition = {
  continuous: boolean
  interimResults: boolean
  lang: string
  start: () => void
  stop: () => void
  abort: () => void
  onresult:
  | ((event: {
    resultIndex: number
    results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>
  }) => void)
  | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
}

type RecognitionConstructor = new () => Recognition

function getRecognition() {
  if (typeof window === "undefined") return null
  const scope = window as unknown as {
    SpeechRecognition?: RecognitionConstructor
    webkitSpeechRecognition?: RecognitionConstructor
  }
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null
}

function subscribeNothing() {
  return () => { }
}

function canRecord() {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function"
  )
}

const sampleEvery = 50

function Waveform({
  levelsRef,
  sampledRef,
}: {
  levelsRef: React.RefObject<number[]>
  sampledRef: React.RefObject<number>
}) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null)

  React.useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext("2d")
    if (!canvas || !context) return
    const ratio = Math.min(2, window.devicePixelRatio || 1)
    const styles = getComputedStyle(canvas)
    const bar = styles.color
    const dot = styles.borderTopColor || bar
    let frame = 0

    const draw = () => {
      const width = Math.max(1, Math.round(canvas.clientWidth * ratio))
      const height = Math.max(1, Math.round(canvas.clientHeight * ratio))
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
      }
      context.clearRect(0, 0, width, height)
      const step = 5 * ratio
      const thickness = 2.5 * ratio
      const slots = Math.floor(width / step) + 1
      const levels = levelsRef.current
      const start = Math.max(0, levels.length - slots)
      const filled = levels.length - start
      const middle = height / 2
      const progress = Math.min(1, (performance.now() - sampledRef.current) / sampleEvery)
      const shift = levels.length > 0 ? progress * step : 0
      for (let slot = 0; slot < slots; slot++) {
        const x = width - (slots - slot) * step + (step - thickness) / 2 - shift + step
        const index = slot - (slots - filled)
        if (index < 0) {
          context.fillStyle = dot
          context.globalAlpha = 0.5
          context.beginPath()
          context.arc(x + thickness / 2, middle, ratio, 0, Math.PI * 2)
          context.fill()
          continue
        }
        const level = levels[start + index]
        const size = Math.max(thickness, level * height * 0.9)
        context.globalAlpha = 0.85
        context.fillStyle = bar
        context.beginPath()
        context.roundRect(x, middle - size / 2, thickness, size, thickness / 2)
        context.fill()
      }
      context.globalAlpha = 1
      frame = requestAnimationFrame(draw)
    }

    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [levelsRef, sampledRef])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="h-8 min-w-0 flex-1 border-muted-foreground text-foreground/70 rtl:-scale-x-100"
    />
  )
}

type DictationStatus = "idle" | "recording" | "transcribing"

type DictationSession = {
  stream: MediaStream | null
  audio: AudioContext | null
  timer: ReturnType<typeof setInterval> | undefined
  recorder: MediaRecorder | null
  chunks: Blob[]
  recognition: Recognition | null
  heard: string
  pending: string
  ended: Promise<void>
  stopped: boolean
  failed: boolean
}

export function PromptInputDictation({
  transcribe,
  shortcut = "ctrl+shift+d",
  autoSend = false,
}: {
  transcribe?: (audio: Blob) => Promise<string>
  shortcut?: string | false
  autoSend?: boolean
}) {
  const context = usePromptInput("PromptInputDictation")
  const supported = React.useSyncExternalStore(
    subscribeNothing,
    () => canRecord() && (Boolean(transcribe) || getRecognition() !== null),
    () => false
  )
  const [status, setStatus] = React.useState<DictationStatus>("idle")
  const sessionRef = React.useRef<DictationSession | null>(null)
  const levelsRef = React.useRef<number[]>([])
  const sampledRef = React.useRef(0)
  const { announce, submit, textareaRef } = context
  const submitRef = React.useRef(submit)
  const submitTimerRef = React.useRef<ReturnType<typeof setTimeout>>(undefined)

  React.useLayoutEffect(() => {
    submitRef.current = submit
  }, [submit])

  const insert = React.useCallback(
    (text: string) => {
      const field = textareaRef.current
      const clean = text.replace(/\s+/g, " ").trim()
      if (!field || !clean) return false
      const before = field.value.slice(0, field.selectionStart)
      insertText(field, before && !/\s$/.test(before) ? ` ${clean}` : clean)
      return true
    },
    [textareaRef]
  )

  const release = (session: DictationSession) => {
    clearInterval(session.timer)
    session.stream?.getTracks().forEach((track) => track.stop())
    session.audio?.close().catch(() => { })
  }

  const start = React.useCallback(async () => {
    if (sessionRef.current || !canRecord()) return
    let finish: () => void = () => { }
    const ended = new Promise<void>((resolve) => {
      finish = resolve
    })
    const session: DictationSession = {
      stream: null,
      audio: null,
      timer: undefined,
      recorder: null,
      chunks: [],
      recognition: null,
      heard: "",
      pending: "",
      ended,
      stopped: false,
      failed: false,
    }
    sessionRef.current = session
    levelsRef.current = []
    sampledRef.current = performance.now()
    setStatus("recording")
    haptic("tap")

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      if (sessionRef.current !== session) return
      sessionRef.current = null
      setStatus("idle")
      announce("Microphone access is blocked")
      textareaRef.current?.focus()
      return
    }
    if (session.stopped) {
      stream.getTracks().forEach((track) => track.stop())
      return
    }
    session.stream = stream
    const audio = new AudioContext()
    session.audio = audio
    const analyser = audio.createAnalyser()
    analyser.fftSize = 1024
    audio.createMediaStreamSource(stream).connect(analyser)
    const samples = new Float32Array(analyser.fftSize)
    let smooth = 0
    session.timer = setInterval(() => {
      analyser.getFloatTimeDomainData(samples)
      let sum = 0
      for (const sample of samples) sum += sample * sample
      const level = Math.min(1, Math.sqrt(sum / samples.length) * 6)
      smooth += (level - smooth) * (level > smooth ? 0.65 : 0.3)
      levelsRef.current.push(smooth)
      if (levelsRef.current.length > 400) levelsRef.current.shift()
      sampledRef.current = performance.now()
    }, sampleEvery)

    if (transcribe) {
      const recorder = new MediaRecorder(stream)
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) session.chunks.push(event.data)
      }
      recorder.onstop = () => finish()
      recorder.start()
      session.recorder = recorder
    } else {
      const Recognition = getRecognition()
      if (Recognition) {
        const recognition = new Recognition()
        recognition.continuous = true
        recognition.interimResults = true
        recognition.lang = document.documentElement.lang || navigator.language
        recognition.onresult = (event) => {
          let pending = ""
          for (let index = event.resultIndex; index < event.results.length; index++) {
            const result = event.results[index]
            if (result.isFinal) session.heard += ` ${result[0].transcript}`
            else pending += result[0].transcript
          }
          session.pending = pending
        }
        recognition.onerror = (event) => {
          if (event.error === "no-speech" || event.error === "aborted") return
          session.failed = true
          announce(
            event.error === "not-allowed" || event.error === "service-not-allowed"
              ? "Speech recognition is blocked"
              : "Speech recognition stopped"
          )
        }
        recognition.onend = () => {
          if (!session.stopped && !session.failed) {
            try {
              recognition.start()
              return
            } catch { }
          }
          finish()
        }
        recognition.start()
        session.recognition = recognition
      } else {
        finish()
      }
    }
    announce("Recording. Press Escape to cancel.")
  }, [announce, textareaRef, transcribe])

  const stop = React.useCallback(
    async (action: "insert" | "send" | "cancel") => {
      const session = sessionRef.current
      if (!session) return
      sessionRef.current = null
      session.stopped = true
      release(session)
      haptic("tick")
      if (action === "cancel") {
        session.recorder?.stop()
        session.recognition?.abort()
        setStatus("idle")
        announce("Recording discarded")
        textareaRef.current?.focus()
        return
      }
      let text = ""
      if (session.recorder && transcribe) {
        session.recorder.stop()
        setStatus("transcribing")
        await session.ended
        try {
          text = await transcribe(
            new Blob(session.chunks, { type: session.recorder.mimeType })
          )
        } catch {
          announce("Couldn’t transcribe that. Try again.")
        }
      } else if (session.recognition) {
        setStatus("transcribing")
        session.recognition.stop()
        await Promise.race([
          session.ended,
          new Promise((resolve) => setTimeout(resolve, 1500)),
        ])
        text = `${session.heard} ${session.pending}`
      }
      setStatus("idle")
      const added = insert(text)
      if (!added) {
        announce("Didn’t catch anything")
        textareaRef.current?.focus()
        return
      }
      if (action === "send" || autoSend) {
        clearTimeout(submitTimerRef.current)
        submitTimerRef.current = setTimeout(() => submitRef.current(), 350)
      }
    },
    [announce, autoSend, insert, textareaRef, transcribe]
  )

  React.useEffect(
    () => () => {
      clearTimeout(submitTimerRef.current)
      const session = sessionRef.current
      if (!session) return
      sessionRef.current = null
      session.stopped = true
      release(session)
      session.recorder?.stop()
      session.recognition?.abort()
    },
    []
  )

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (shortcut && matchesHotkey(event, shortcut)) {
        event.preventDefault()
        if (sessionRef.current) void stop("insert")
        else if (status === "idle") void start()
        return
      }
      if (event.key === "Escape" && sessionRef.current) {
        event.preventDefault()
        void stop("cancel")
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [shortcut, start, stop, status])

  React.useEffect(() => {
    const group = context.groupRef.current
    if (!group) return
    if (status === "idle") group.removeAttribute("data-dictating")
    else group.setAttribute("data-dictating", "")
  }, [status, context.groupRef])

  if (!supported) return null

  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Dictate"
              disabled={context.disabled || status !== "idle"}
              onClick={() => void start()}
            />
          }
        >
          <IconMicrophone />
        </TooltipTrigger>
        <TooltipContent>
          Dictate {shortcut ? <Kbd>{shortcut}</Kbd> : null}
        </TooltipContent>
      </Tooltip>
      {status !== "idle" ? (
        <div
          role="group"
          aria-label="Dictation"
          className="absolute inset-px z-20 flex items-center gap-2 rounded-(--composer-radius-inner) bg-background p-1.75 dark:bg-card"
        >
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  aria-label="Cancel dictation"
                  disabled={status !== "recording"}
                  onClick={() => void stop("cancel")}
                />
              }
            >
              <IconX />
            </TooltipTrigger>
            <TooltipContent>
              Cancel <Kbd>escape</Kbd>
            </TooltipContent>
          </Tooltip>
          <div className="relative flex min-w-0 flex-1 items-center px-2">
            {status === "transcribing" ? (
              <span className="flex h-8 flex-1 items-center justify-center text-sm text-shimmer motion-safe:animate-in motion-safe:animation-duration-200 motion-safe:fade-in-0">
                Transcribing…
              </span>
            ) : (
              <Waveform levelsRef={levelsRef} sampledRef={sampledRef} />
            )}
          </div>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  aria-label="Stop and insert text"
                  disabled={status !== "recording"}
                  onClick={() => void stop("insert")}
                  className="relative"
                />
              }
            >
              {status === "recording" ? (
                <span
                  aria-hidden="true"
                  className="absolute -inset-1 rounded-full border border-foreground/15 motion-safe:animate-pulse"
                />
              ) : null}
              <IconPlayerStopFilled />
            </TooltipTrigger>
            <TooltipContent>
              Stop <Kbd>{shortcut || "ctrl+shift+d"}</Kbd>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  size="icon"
                  aria-label="Send now"
                  disabled={status !== "recording"}
                  onClick={() => void stop("send")}
                />
              }
            >
              <IconArrowUp />
            </TooltipTrigger>
            <TooltipContent>Send</TooltipContent>
          </Tooltip>
        </div>
      ) : null}
    </>
  )
}
