export async function observeResumedStream<T>(
  opening: Promise<ReadableStream<T> | null | undefined>,
  signal: AbortSignal,
  liveness?: { isActive: () => Promise<boolean>; intervalMs: number },
) {
  const disconnectError = new Error("The chat stream disconnected. Reconnecting may recover it.");
  let reader: ReadableStreamDefaultReader<T> | undefined;
  let output: ReadableStreamDefaultController<T> | undefined;
  let rejectOpening: (error: Error) => void;
  const disconnected = new Promise<never>((_, reject) => { rejectOpening = reject; });
  let detached = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const detach = () => {
    detached = true;
    clearTimeout(timer);
    signal.removeEventListener("abort", onDisconnect);
  };
  const onDisconnect = () => {
    if (output) {
      output.error(disconnectError);
      void reader?.cancel().catch(() => undefined);
    } else {
      rejectOpening(disconnectError);
    }
    detach();
  };

  signal.addEventListener("abort", onDisconnect, { once: true });
  if (signal.aborted) onDisconnect();
  try {
    const stream = await Promise.race([opening, disconnected]);
    if (signal.aborted) throw disconnectError;
    if (!stream) {
      detach();
      return null;
    }
    reader = stream.getReader();
    const source = reader;
    let inactiveChecks = 0;
    const checkLiveness = liveness && (async function checkLiveness() {
      try {
        inactiveChecks = await liveness.isActive() ? 0 : inactiveChecks + 1;
      } catch {
        inactiveChecks = 0;
      }
      if (detached) return;
      if (inactiveChecks >= 2) {
        // Give terminal chunks time to arrive after the producer updates its run.
        detach();
        output?.close();
        void source.cancel().catch(() => undefined);
        return;
      }
      timer = setTimeout(checkLiveness, liveness.intervalMs);
    });
    return new ReadableStream<T>({
      start(controller) {
        output = controller;
        if (liveness && checkLiveness) timer = setTimeout(checkLiveness, liveness.intervalMs);
      },
      async pull(controller) {
        try {
          const result = await source.read();
          if (detached) return;
          if (result.done) {
            detach();
            controller.close();
          } else {
            controller.enqueue(result.value);
          }
        } catch (error) {
          if (!detached) controller.error(error);
          detach();
        }
      },
      cancel(reason) {
        detach();
        return source.cancel(reason);
      },
    });
  } catch (error) {
    detach();
    if (signal.aborted) void opening.then((stream) => stream?.cancel()).catch(() => undefined);
    throw error;
  }
}
