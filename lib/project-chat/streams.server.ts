import "server-only";

import { after } from "next/server";
import { UI_MESSAGE_STREAM_HEADERS } from "ai";
import { createClient } from "redis";
import { createResumableStreamContext, type Publisher, type Subscriber } from "resumable-stream";

import prisma from "@/lib/prisma";
import { observeResumedStream } from "./resumed-stream";

type StreamConnection = {
  context: ReturnType<typeof createResumableStreamContext>;
  signal: AbortSignal;
};

const local = globalThis as typeof globalThis & {
  bloomStreamConnection?: Promise<StreamConnection>;
};

async function connectStreams(onDisconnect: () => void): Promise<StreamConnection> {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL is required for chat streaming");
  const publisher = createClient({
    url,
    disableOfflineQueue: true,
    socket: { connectTimeout: 5_000, reconnectStrategy: false },
  });
  const subscriber = publisher.duplicate();
  const disconnected = new AbortController();
  const { signal } = disconnected;
  const close = () => {
    if (signal.aborted) return;
    disconnected.abort();
    onDisconnect();
    void Promise.allSettled([publisher.disconnect(), subscriber.disconnect()]);
  };
  publisher.on("error", close).on("end", close);
  subscriber.on("error", close).on("end", close);
  try {
    await Promise.all([publisher.connect(), subscriber.connect()]);
    signal.throwIfAborted();
    const context = createResumableStreamContext({
      keyPrefix: "bloom-chat",
      waitUntil: (promise) => after(() => promise.catch(() => undefined)),
      publisher: {
        connect: () => publisher.connect(),
        get: async (key) => {
          try {
            return await publisher.get(key);
          } catch (error) {
            if (!signal.aborted) throw error;
            return null;
          }
        },
        incr: (key) => publisher.incr(key),
        set: async (key, value, options) => {
          try {
            return await publisher.set(key, value, options);
          } catch (error) {
            // Keep draining the original response after a Redis disconnect.
            if (value !== "DONE") throw error;
          }
        },
        publish: (channel, message) => channel.includes(":request:")
          ? publisher.publish(channel, message)
          : publisher.publish(channel, message).catch(() => 0),
      } satisfies Publisher,
      subscriber: {
        connect: () => subscriber.connect(),
        subscribe: (channel, listener) => subscriber.subscribe(channel, listener),
        unsubscribe: (channel) => subscriber.unsubscribe(channel).catch(() => undefined),
      } satisfies Subscriber,
    });
    return { context, signal };
  } catch (error) {
    close();
    throw error;
  }
}

export function chatStreams() {
  if (local.bloomStreamConnection) return local.bloomStreamConnection;
  const invalidate = () => {
    if (local.bloomStreamConnection === connection) delete local.bloomStreamConnection;
  };
  const connection = connectStreams(invalidate).catch((error) => {
    invalidate();
    throw error;
  });
  local.bloomStreamConnection = connection;
  return connection;
}

export function streamResponse(stream: ReadableStream<string>) {
  return new Response(stream.pipeThrough(new TextEncoderStream()), {
    headers: { ...UI_MESSAGE_STREAM_HEADERS, "Cache-Control": "no-store" },
  });
}

export async function resumeChatStream(runId: string, requestSignal: AbortSignal) {
  const { context, signal } = await chatStreams();
  const stream = await observeResumedStream(
    context.resumeExistingStream(runId),
    AbortSignal.any([signal, requestSignal]),
    {
      intervalMs: 5_000,
      isActive: async () => Boolean(await prisma.chatRun.findFirst({
        where: { id: runId, status: "RUNNING", leaseExpiresAt: { gt: new Date() } },
        select: { id: true },
      })),
    },
  );
  return stream ? streamResponse(stream) : new Response(null, { status: 204 });
}

export function chatUnavailable() {
  const message = process.env.REDIS_URL
    ? "Chat streaming is unavailable. Try again shortly."
    : "Chat streaming needs Redis. Set REDIS_URL and restart Bloom.";
  return Response.json({ error: message }, { status: 503 });
}
