import assert from "node:assert/strict";
import { syncBuiltinESMExports } from "node:module";
import test from "node:test";

process.env.MUSE_API_KEY = "image-generation-test";
const { generateProjectImage } = await import("../ai/image-generation.ts");

const model = "muse-image-1.0";
const concurrency = 6;
const imageResponse = () => Response.json({
  created: 1,
  data: [{ b64_json: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==" }],
});
const failure = (status: number, message: string) =>
  Response.json({ error: { message, type: "error", param: null, code: null } }, { status });

type Url = Parameters<typeof fetch>[0];
const endpoint = (url: Url) => new URL(url instanceof Request ? url.url : String(url));
const hang = (options?: RequestInit) => new Promise<Response>((_, reject) => {
  options?.signal?.addEventListener("abort", () => reject(options.signal?.reason), { once: true });
});

function generate(index: number, abortSignal = new AbortController().signal) {
  return generateProjectImage({ prompt: `Fixture image ${index}`, abortSignal }, index);
}

test("a batch runs six requests at a time on the Muse image model", { timeout: 5_000 }, async (t) => {
  const waveStarted = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const bodies: Array<Record<string, unknown>> = [];
  let active = 0;
  let peak = 0;
  t.mock.method(globalThis, "fetch", async (url: Url, options?: RequestInit) => {
    assert.equal(endpoint(url).href, "https://api.meta.ai/v1/images/generations");
    bodies.push(JSON.parse(String(options?.body)));
    peak = Math.max(peak, ++active);
    if (active === concurrency) waveStarted.resolve();
    await release.promise;
    active--;
    return imageResponse();
  });

  const results = Promise.all(Array.from({ length: concurrency + 2 }, (_, index) => generate(index)));
  try {
    await waveStarted.promise;
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(bodies.length, concurrency);
  } finally {
    release.resolve();
    await results;
  }
  assert.deepEqual((await results).map(({ responses }) => responses[0]?.modelId), Array(concurrency + 2).fill(model));
  assert.equal(peak, concurrency);
  assert.equal(bodies.length, concurrency + 2);
  assert.ok(bodies.every((body) => body.model === model && body.output_format === "webp"));
});

test("the aspect ratio is sent as a size and source artwork as numbered images", async (t) => {
  const requests: Array<{ path: string; body: RequestInit["body"] }> = [];
  t.mock.method(globalThis, "fetch", async (url: Url, options?: RequestInit) => {
    requests.push({ path: endpoint(url).pathname, body: options?.body });
    return imageResponse();
  });
  const abortSignal = new AbortController().signal;
  const artwork = new Uint8Array([137, 80, 78, 71]);

  await generateProjectImage({ prompt: "A wide scene", aspectRatio: "16:9", abortSignal }, 0);
  await generateProjectImage({ prompt: "Any shape", abortSignal }, 0);
  await generateProjectImage({ prompt: { text: "Use the supplied artwork", images: [artwork] }, aspectRatio: "3:2", abortSignal }, 0);
  await generateProjectImage({ prompt: { text: "Combine the supplied artwork", images: [artwork, artwork] }, abortSignal }, 0);

  const [wide, free, edit, combine] = requests;
  assert.equal(wide?.path, "/v1/images/generations");
  assert.equal(JSON.parse(String(wide?.body)).size, "1536x864");
  assert.equal("size" in JSON.parse(String(free?.body)), false);
  assert.equal(edit?.path, "/v1/images/edits");
  assert.ok(edit?.body instanceof FormData);
  assert.equal(edit.body.get("model"), model);
  assert.equal(edit.body.get("size"), "1536x1024");
  assert.ok(edit.body.get("image") instanceof Blob);
  assert.ok(combine?.body instanceof FormData);
  assert.deepEqual([...combine.body.keys()].filter((key) => key.startsWith("image")), ["image[0]", "image[1]"]);
});

test("stopping a queued or active image cancels it without another request", { timeout: 5_000 }, async (t) => {
  const activeRequests = new AbortController();
  const queuedRequest = new AbortController();
  const started = Promise.withResolvers<void>();
  let requests = 0;
  t.mock.method(globalThis, "fetch", (_url: Url, options?: RequestInit) => {
    if (++requests === concurrency) started.resolve();
    return hang(options);
  });

  const activeResults = Array.from({ length: concurrency }, (_, index) =>
    assert.rejects(generate(index, activeRequests.signal), { name: "AbortError" }));
  try {
    await started.promise;
    const queuedResult = assert.rejects(generate(concurrency, queuedRequest.signal), { name: "AbortError" });
    queuedRequest.abort();
    await queuedResult;
  } finally {
    activeRequests.abort();
    await Promise.all(activeResults);
  }
  assert.equal(requests, concurrency);
});

test("a timeout or server error is tried once more, and a rejected request is not", { timeout: 10_000 }, async (t) => {
  const timeout = AbortSignal.timeout;
  t.mock.method(AbortSignal, "timeout", (duration: number) => timeout(duration === 180_000 ? 20 : duration));
  let requests = 0;
  let respond = (options?: RequestInit) => requests === 1 ? hang(options) : Promise.resolve(imageResponse());
  t.mock.method(globalThis, "fetch", (_url: Url, options?: RequestInit) => {
    requests++;
    return respond(options);
  });

  assert.equal((await generate(0)).responses[0]?.modelId, model);
  assert.equal(requests, 2);

  requests = 0;
  respond = async () => failure(503, "The image backend is unavailable.");
  await assert.rejects(generate(0), { statusCode: 503 });
  assert.equal(requests, 2);

  requests = 0;
  respond = async () => failure(400, "The prompt was rejected.");
  await assert.rejects(generate(0), { statusCode: 400 });
  assert.equal(requests, 1);
});

test("a rate limit rests every image for 30 seconds and gives up after four rests", { timeout: 5_000 }, async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: Date.now() });
  // The module under test imported the timer by name; make that binding follow the mock.
  syncBuiltinESMExports();
  t.after(() => { t.mock.timers.reset(); syncBuiltinESMExports(); });
  const settle = async () => { for (let turn = 0; turn < 40; turn++) await new Promise((resolve) => setImmediate(resolve)); };
  let limited = true;
  let requests = 0;
  t.mock.method(globalThis, "fetch", async () => {
    requests++;
    return limited ? failure(429, "Rate limit exceeded.") : imageResponse();
  });

  const first = generate(0);
  await settle();
  const second = generate(1);
  await settle();
  // The second image starts during the rest and sends nothing.
  assert.equal(requests, 1);

  limited = false;
  t.mock.timers.tick(29_000);
  await settle();
  assert.equal(requests, 1);
  t.mock.timers.tick(1_000);
  await settle();
  assert.equal((await first).responses[0]?.modelId, model);
  assert.equal((await second).responses[0]?.modelId, model);
  assert.equal(requests, 3);

  limited = true;
  requests = 0;
  const exhausted = assert.rejects(generate(2), { statusCode: 429 });
  for (let rest = 0; rest < 4; rest++) {
    await settle();
    t.mock.timers.tick(30_000);
  }
  await exhausted;
  assert.equal(requests, 5);
});
