import "server-only";

import { access } from "node:fs/promises";
import type {
  Browser,
  ConsoleMessage,
  HTTPRequest,
  HTTPResponse,
  Page,
} from "puppeteer-core";
import { launch } from "puppeteer-core";

import {
  browserDiagnosticKey,
  compactDiagnosticMessage,
  isDevHmrDiagnostic,
  sanitizeDiagnosticUrl,
  type BrowserDiagnostic,
} from "@/lib/runtime/browser-diagnostics";
import { resolveFullPageBounds } from "@/lib/runtime/full-page-height";
import { ensureProjectPreview } from "@/lib/runtime/runtime-service.server";
import { selectScreenshots } from "@/lib/runtime/screenshot-selection";
import {
  analyzeFrames,
  collectDesignProfile,
} from "@/lib/runtime/design-capture";
import type { DesignProfile, FrameAnalysis } from "@/lib/design/dna";

const MAX_DIAGNOSTICS = 10;
const MAX_SCROLL_POSITIONS = 20;
const MAX_SCREENSHOTS = 16;
const IMAGE_QUALITY = 85;
const MAX_FULL_PAGE_VIEWPORTS = 12;
export const FULL_PAGE_SCREENSHOT_NAME = "Full page";
const MAX_FONTS = 10;
const MAX_COLORS = 24;
const SCROLL_STEP_RATIO = 0.9;
const SCROLL_SETTLE_MS = 450;
const INITIAL_NETWORK_IDLE_MS = 750;
const EXPLICIT_URL_SCHEME = /^([a-z][a-z\d+.-]*):\/\//i;

const BLOCK_PATTERN =
  /just a moment|checking your browser|verify you are human|captcha|access denied|request blocked|unusual traffic/i;

const CONSENT_TEXT_PATTERN =
  /cookie|consent|privacy preferences|privacy settings|tracking|gdpr|we use cookies/i;

const CONSENT_ACTION_PATTERN =
  /^(accept|accept all|allow all|agree|i agree|got it|reject|reject all|decline|close|dismiss)$/i;

type Theme = "light" | "dark";
type ViewportName = "mobile" | "tablet" | "desktop";
type TargetKind = "preview" | "public";

type PageViewport = {
  width: number;
  height: number;
  deviceScaleFactor: number;
  isMobile: boolean;
  hasTouch: boolean;
};

type ResolvedTarget = {
  targetKind: TargetKind;
  destination: URL;
  previewOrigin: string | null;
};

type ScrapeOptions = {
  projectId: string;
  signal: AbortSignal;

  url: string;
  theme: Theme;
  viewport: ViewportName;
  includeScreenshots?: boolean;
  /** Scroll and screenshot every viewport instead of one full-page capture, for scroll-animated pages. */
  deep?: boolean;
  maxScreenshots?: number;
};

type Screenshot = {
  name: string;
  mimeType: "image/webp";
  bytes: Uint8Array;
  scrollY: number;
  scrollPercentage: number;
};

type PendingScreenshot = Omit<Screenshot, "name" | "scrollPercentage">;

type CapturedDesign = {
  fonts: Array<{
    family: string;
    style: string;
    weight: string;
  }>;
  colors: string[];
};

type RenderedPageScrape = {
  targetKind: TargetKind;

  url: string;
  status: number;
  title: string;

  theme: Theme;
  viewport: PageViewport;

  /** Viewport frames, used for measurement and frame-numbered references. */
  screenshots: Screenshot[];
  /** One top-to-bottom capture of the page; null for deep captures or when screenshots are off. */
  fullPage: Screenshot | null;
  pageHeight: number;
  design: CapturedDesign | null;

  diagnostics: BrowserDiagnostic[] | null;
  blocked: boolean;

  /** Computed-style design evidence from the live DOM. */
  designProfile: DesignProfile | null;
  /** Pixel statistics for every returned screenshot, in screenshot order. */
  frameAnalyses: FrameAnalysis[];
};

function chromiumExecutable() {
  return process.env.BLOOM_CHROMIUM_PATH || "/usr/bin/chromium";
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) {
    throw signal.reason ?? new Error("Page inspection cancelled");
  }
}

function sanitizedUrl(value: string) {
  try {
    const url = new URL(value);

    url.username = "";
    url.password = "";

    return url.toString().slice(0, 2_000);
  } catch {
    return value.slice(0, 2_000);
  }
}

function isLocalHostname(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized === "::1" ||
    normalized === "0.0.0.0" ||
    /^127(?:\.\d{1,3}){3}$/.test(normalized)
  );
}

function viewportSettings(viewport: ViewportName) {
  switch (viewport) {
    case "mobile":
      return {
        width: 390,
        height: 844,
        deviceScaleFactor: 1,
        isMobile: true,
        hasTouch: true,
      };

    case "tablet":
      return {
        width: 768,
        height: 1_024,
        deviceScaleFactor: 1,
        isMobile: true,
        hasTouch: true,
      };

    case "desktop":
      return {
        width: 1_920,
        height: 1_080,
        deviceScaleFactor: 1,
        isMobile: false,
        hasTouch: false,
      };
  }
}

async function getPreviewOrigin(projectId: string, signal: AbortSignal) {
  const runtime = await ensureProjectPreview(projectId, signal);

  if (!runtime.previewUrl) {
    throw new Error("Preview startup failed");
  }

  return new URL(runtime.previewUrl).origin;
}

function isPreviewScrapeTarget(input: string) {
  return input.trim().startsWith("/");
}

function parsePublicScrapeUrl(input: string) {
  const value = input.trim();
  const explicitScheme = EXPLICIT_URL_SCHEME.exec(value)?.[1]?.toLowerCase();

  if (explicitScheme && explicitScheme !== "http" && explicitScheme !== "https") {
    throw new Error("Invalid target URL");
  }

  let url: URL;
  try {
    url = new URL(explicitScheme ? value : `https://${value}`);
  } catch {
    throw new Error("Invalid target URL");
  }

  if (!url.hostname || (url.protocol !== "http:" && url.protocol !== "https:")) {
    throw new Error("Invalid target URL");
  }

  return url;
}

async function resolveTarget(
  options: ScrapeOptions,
): Promise<ResolvedTarget> {
  const requestedUrl = options.url.trim();

  if (!requestedUrl) {
    throw new Error("Target URL is required");
  }

  if (isPreviewScrapeTarget(requestedUrl)) {
    const previewOrigin = await getPreviewOrigin(
      options.projectId,
      options.signal,
    );

    const destination = new URL(
      requestedUrl,
      previewOrigin,
    );

    if (destination.origin !== previewOrigin) {
      throw new Error("Invalid preview path");
    }

    return {
      targetKind: "preview",
      destination,
      previewOrigin,
    };
  }

  return {
    targetKind: "public",
    destination: parsePublicScrapeUrl(requestedUrl),
    previewOrigin: null,
  };
}

function requestAlreadyHandled(request: HTTPRequest) {
  const compatibleRequest =
    request as HTTPRequest & {
      isInterceptResolutionHandled?: () => boolean;
    };

  return (
    compatibleRequest.isInterceptResolutionHandled?.() ??
    false
  );
}

function attachDiagnostics(
  page: Page,
  target: ResolvedTarget,
) {
  if (target.targetKind !== "preview") {
    return null;
  }

  const diagnostics: BrowserDiagnostic[] = [];
  const seen = new Set<string>();

  const add = (diagnostic: BrowserDiagnostic) => {
    if (isDevHmrDiagnostic(diagnostic)) {
      return;
    }
    const key = browserDiagnosticKey(diagnostic);
    if (
      seen.has(key) ||
      diagnostics.length >= MAX_DIAGNOSTICS
    ) {
      return;
    }

    seen.add(key);
    diagnostics.push(diagnostic);
  };

  page.on("console", (message: ConsoleMessage) => {
    if (message.type() === "error") {
      add({
        kind: "console",
        severity: "error",
        message: compactDiagnosticMessage(message.text() || "Console error"),
        ...(message.location().url
          ? { url: sanitizeDiagnosticUrl(message.location().url!) }
          : {}),
      });
    }
  });

  page.on("pageerror", (error) => {
    add({
      kind: "runtime",
      severity: "error",
      message: compactDiagnosticMessage(
        error instanceof Error
          ? error.message || "Runtime error"
          : String(error || "Runtime error"),
      ),
    });
  });

  page.on("requestfailed", (request: HTTPRequest) => {
    if (
      request.failure()?.errorText ===
      "net::ERR_BLOCKED_BY_CLIENT"
    ) {
      return;
    }

    add({
      kind: "request-failed",
      severity: "error",
      message: compactDiagnosticMessage(
        `${request.method()} ${request.failure()?.errorText ?? "Request failed"}`,
      ),
      url: sanitizeDiagnosticUrl(request.url()),
    });
  });

  page.on("response", (response: HTTPResponse) => {
    if (response.status() >= 400) {
      add({
        kind: "http",
        severity: "error",
        message: compactDiagnosticMessage(
          `HTTP ${response.status()} ${response.statusText()}`,
        ),
        url: sanitizeDiagnosticUrl(response.url()),
        status: response.status(),
      });
    }
  });

  return diagnostics;
}

async function configurePage(
  browser: Browser,
  page: Page,
  target: ResolvedTarget,
  options: ScrapeOptions,
) {
  await page.setViewport(
    viewportSettings(options.viewport),
  );

  await page.emulateMediaFeatures([
    {
      name: "prefers-color-scheme",
      value: options.theme,
    },
    {
      name: "prefers-reduced-motion",
      value: "reduce",
    }
  ]);

  await page.setExtraHTTPHeaders({
    "accept-language": "en-US,en;q=0.9",
  });

  const userAgent = await browser.userAgent();

  await page.setUserAgent(
    userAgent.replace("HeadlessChrome", "Chrome"),
  );

  if (target.targetKind !== "preview" || !target.previewOrigin) {
    return;
  }

  await page.setRequestInterception(true);

  page.on("request", (request: HTTPRequest) => {
    if (requestAlreadyHandled(request)) {
      return;
    }

    const isTopLevelNavigation =
      request.isNavigationRequest() &&
      request.frame() === page.mainFrame();

    let allowed = true;

    if (isTopLevelNavigation) {
      try {
        const url = new URL(request.url());

        allowed =
          url.origin === target.previewOrigin ||
          url.protocol === "about:";
      } catch {
        allowed = false;
      }
    }

    const operation = allowed ? request.continue() : request.abort("blockedbyclient");

    void operation.catch(() => undefined);
  });
}

async function navigate(
  page: Page,
  destination: URL,
  signal: AbortSignal,
) {
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    throwIfAborted(signal);

    try {
      return await page.goto(destination.toString(), {
        waitUntil: "domcontentloaded",
        timeout: 20_000,
      });
    } catch (error) {
      lastError = error;

      if (attempt === 0) {
        await delay(500);
      }
    }
  }

  throw lastError ?? new Error("Page navigation failed");
}

async function waitForNetworkIdle(
  page: Page,
  timeout: number,
  idleTime = INITIAL_NETWORK_IDLE_MS,
) {
  await page
    .waitForNetworkIdle({ idleTime, timeout, })
    .catch(() => undefined);
}

async function waitForDocumentReady(page: Page, timeout = 10_000) {
  await page
    .waitForFunction(() => document.readyState === "complete", { timeout })
    .catch(() => undefined);
}

async function dismissPageObstructions(page: Page) {
  await page.evaluate(
    ({ consentTextSource, consentActionSource }) => {
      const consentTextPattern = new RegExp(
        consentTextSource,
        "i",
      );
      const consentActionPattern = new RegExp(
        consentActionSource,
        "i",
      );

      const normalize = (value: string) =>
        value.replace(/\s+/g, " ").trim();

      const isVisible = (element: HTMLElement) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);

        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.display !== "none" &&
          style.visibility !== "hidden"
        );
      };

      const looksLikeConsentContainer = (
        element: HTMLElement,
      ) => {
        if (!isVisible(element)) {
          return false;
        }

        const text = normalize(
          element.innerText?.slice(0, 2_000) ?? "",
        );

        const identity = [
          element.id,
          element.className,
          element.getAttribute("aria-label") ?? "",
          element.getAttribute("data-testid") ?? "",
        ]
          .join(" ")
          .toLowerCase();

        const style = getComputedStyle(element);
        const role = element.getAttribute("role");
        const ariaModal =
          element.getAttribute("aria-modal") === "true";

        const hasConsentIdentity =
          consentTextPattern.test(text) ||
          /cookie|consent|privacy|gdpr/i.test(identity);

        const looksLikeOverlay =
          style.position === "fixed" ||
          style.position === "sticky" ||
          role === "dialog" ||
          role === "alertdialog" ||
          ariaModal;

        return hasConsentIdentity && looksLikeOverlay;
      };

      const candidates = [
        ...document.querySelectorAll<HTMLElement>(
          [
            '[role="dialog"]',
            '[role="alertdialog"]',
            '[aria-modal="true"]',
            '[id*="cookie" i]',
            '[class*="cookie" i]',
            '[id*="consent" i]',
            '[class*="consent" i]',
            '[id*="privacy" i]',
            '[class*="privacy" i]',
          ].join(","),
        ),
        ...document.querySelectorAll<HTMLElement>("body *"),
      ];

      const uniqueCandidates = [...new Set(candidates)];

      for (const container of uniqueCandidates) {
        if (!looksLikeConsentContainer(container)) {
          continue;
        }

        const actions = container.querySelectorAll<HTMLElement>(
          [
            "button",
            '[role="button"]',
            'input[type="button"]',
            'input[type="submit"]',
          ].join(","),
        );

        let clicked = false;

        for (const action of actions) {
          const text = normalize(
            action.innerText ||
            action.getAttribute("aria-label") ||
            (action as HTMLInputElement).value ||
            "",
          );

          if (!consentActionPattern.test(text)) {
            continue;
          }

          action.click();
          clicked = true;
          break;
        }

        if (!clicked) {
          container.remove();
        }
      }
    },
    {
      consentTextSource: CONSENT_TEXT_PATTERN.source,
      consentActionSource: CONSENT_ACTION_PATTERN.source,
    },
  );

  await delay(300);

  await page.evaluate((consentTextSource) => {
    const consentTextPattern = new RegExp(
      consentTextSource,
      "i",
    );

    const elements = document.querySelectorAll<HTMLElement>("body *");

    for (const element of elements) {
      const style = getComputedStyle(element);

      if (
        style.position !== "fixed" &&
        style.position !== "sticky" &&
        element.getAttribute("role") !== "dialog" &&
        element.getAttribute("role") !== "alertdialog" &&
        element.getAttribute("aria-modal") !== "true"
      ) {
        continue;
      }

      const text =
        element.innerText?.slice(0, 2_000) ?? "";

      const identity = [
        element.id,
        element.className,
        element.getAttribute("aria-label") ?? "",
        element.getAttribute("data-testid") ?? "",
      ]
        .join(" ")
        .toLowerCase();

      if (
        !consentTextPattern.test(text) &&
        !/cookie|consent|privacy|gdpr/i.test(identity)
      ) {
        continue;
      }

      element.remove();
    }

    document.documentElement.style.removeProperty("overflow");
    document.body.style.removeProperty("overflow");
  }, CONSENT_TEXT_PATTERN.source);
}

async function waitForVisibleAssets(timeoutMs: number) {
  const visible = (element: Element) => {
    const rect = element.getBoundingClientRect();

    return (
      rect.width > 0 &&
      rect.height > 0 &&
      rect.bottom > 0 &&
      rect.right > 0 &&
      rect.top < innerHeight &&
      rect.left < innerWidth
    );
  };
  const waits: Promise<unknown>[] = [];
  const assetWait = new AbortController();
  const aborted = new Promise<void>((resolve) => {
    assetWait.signal.addEventListener("abort", () => resolve(), { once: true });
  });

  for (const element of [...document.querySelectorAll("*")].filter(visible)) {
    if (element instanceof HTMLImageElement) {
      element.loading = "eager";
      element.fetchPriority = "high";
      waits.push(Promise.race([
        element.decode().catch(() => undefined),
        aborted,
      ]));
    }

    if (element instanceof HTMLVideoElement) {
      element.preload = "auto";

      if (element.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        waits.push(Promise.race([
          new Promise<void>((resolve) => {
            const options = { once: true, signal: assetWait.signal };
            element.addEventListener("loadeddata", () => resolve(), options);
            element.addEventListener("error", () => resolve(), options);
            element.load();
          }),
          aborted,
        ]));
      }
    }

    const style = getComputedStyle(element);
    for (const value of [
      style.backgroundImage,
      style.maskImage,
      style.getPropertyValue("-webkit-mask-image"),
    ]) {
      for (const match of value.matchAll(
        /url\(\s*["']?(.*?)["']?\s*\)/gi,
      )) {
        const src = match[1]?.trim();
        if (!src || src.startsWith("#")) continue;

        waits.push(Promise.race([
          new Promise<void>((resolve) => {
            const image = new Image();
            image.onload = () => {
              image.decode().catch(() => undefined).finally(resolve);
            };
            image.onerror = () => resolve();
            image.src = new URL(src, document.baseURI).href;
          }),
          aborted,
        ]));
      }
    }
  }

  waits.push(Promise.race([document.fonts.ready, aborted]));
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    await Promise.race([
      Promise.allSettled(waits),
      new Promise<void>((resolve) => {
        timeout = setTimeout(resolve, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
    assetWait.abort();
  }
}

async function waitForViewportReady(page: Page, maxWaitMs = 4_000) {
  const deadline = Date.now() + maxWaitMs;

  // 1. Trigger scroll/IntersectionObserver/lazy-render behavior.
  await page.evaluate(async () => {
    window.dispatchEvent(new Event("scroll"));

    // Let browser run layout + intersection observers + rendering.
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() =>
        requestAnimationFrame(() => resolve()),
      ),
    );
  });

  // 2. Wait for currently visible DOM-backed visual assets, but never let an
  // unresolved media event consume Puppeteer's much longer protocol timeout.
  const assetWaitMs = Math.max(0, deadline - Date.now());
  if (assetWaitMs > 0) {
    await page.evaluate(waitForVisibleAssets, assetWaitMs);
  }

  // 3. Catch fetches initiated by the lazy-loaded content.
  const remaining = Math.max(0, deadline - Date.now());

  if (remaining > 0) {
    await page
      .waitForNetworkIdle({
        idleTime: 250,
        timeout: remaining,
      })
      .catch(() => undefined);
  }

  // 4. Give canvas/WebGL/JS rendering several actual frames.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        let frames = 4;

        const frame = () => {
          if (--frames <= 0) resolve();
          else requestAnimationFrame(frame);
        };

        requestAnimationFrame(frame);
      }),
  );
}

async function captureViewportScreenshot(
  page: Page,
  scrollY: number,
): Promise<PendingScreenshot> {
  const bytes = await page.screenshot({
    type: "webp",
    quality: IMAGE_QUALITY,
    fullPage: false,
    encoding: "binary",
  });

  return {
    mimeType: "image/webp",
    bytes,
    scrollY,
  };
}

async function captureFullPage(page: Page, minimumPageHeight = 0) {
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await settleScrolledPage(page);
  const { width, pageHeight: measuredPageHeight, viewportHeight } = await page.evaluate(() => {
    const root = document.scrollingElement ?? document.documentElement;
    return {
      width: document.documentElement.clientWidth || window.innerWidth,
      pageHeight: Math.max(root.scrollHeight, window.innerHeight),
      viewportHeight: window.innerHeight,
    };
  });
  // Scrolling back to the top can collapse lazy content, so the top measurement
  // can be shorter than the height observed after the full scroll pass.
  const { height } = resolveFullPageBounds({
    measuredPageHeight,
    minimumPageHeight,
    viewportHeight,
    maxViewports: MAX_FULL_PAGE_VIEWPORTS,
  });

  const shoot = async (y: number, clipHeight: number): Promise<PendingScreenshot> => ({
    mimeType: "image/webp",
    bytes: await page.screenshot({
      type: "webp",
      quality: IMAGE_QUALITY,
      encoding: "binary",
      captureBeyondViewport: true,
      clip: { x: 0, y, width, height: clipHeight },
    }),
    scrollY: y,
  });

  const fullPage = await shoot(0, height);
  const bottom = Math.max(0, height - viewportHeight);
  const positions: number[] = [];
  for (let y = 0; positions.length < MAX_SCROLL_POSITIONS; y = Math.round(y + viewportHeight * 0.925)) {
    positions.push(Math.min(y, bottom));
    if (y >= bottom) break;
  }
  const frames: PendingScreenshot[] = [];

  for (const y of positions) {
    frames.push(await shoot(y, Math.min(viewportHeight, height)));
  }

  return {
    fullPage: { ...fullPage, name: FULL_PAGE_SCREENSHOT_NAME, scrollPercentage: 0 } satisfies Screenshot,
    screenshots: finalizeScreenshots(frames, height, viewportHeight),
  };
}

function finalizeScreenshots(
  captures: PendingScreenshot[],
  pageHeight: number,
  viewportHeight: number,
) {
  const bottom = Math.max(0, pageHeight - viewportHeight);

  return captures.map((screenshot): Screenshot => {
    const scrollPercentage =
      bottom === 0
        ? 0
        : Math.min(100, Math.round((screenshot.scrollY / bottom) * 100));
    const name =
      bottom === 0
        ? "Entire page"
        : scrollPercentage === 0
          ? "Top of page"
          : scrollPercentage === 100
            ? "Bottom of page"
            : `Page at ${scrollPercentage}%`;

    return {
      ...screenshot,
      name,
      scrollPercentage,
    };
  });
}

async function loadLazyContent(page: Page, signal: AbortSignal, includeScreenshots: boolean) {
  await settleScrolledPage(page);

  const captures: PendingScreenshot[] = [];
  const initialScrollY = await page.evaluate(() => Math.round(window.scrollY));

  if (includeScreenshots) {
    captures.push(await captureViewportScreenshot(page, initialScrollY));
    // A pinned header repeats over the top of every later frame and reads as content
    // overlapping it; frames after the first show the page without it.
    await page.evaluate(() => {
      for (const element of document.querySelectorAll<HTMLElement>("body *")) {
        const style = getComputedStyle(element);
        if (style.position !== "fixed" && style.position !== "sticky") continue;
        const rect = element.getBoundingClientRect();
        if (rect.top > 24 || rect.height > window.innerHeight * 0.3 || rect.width < window.innerWidth * 0.5) continue;
        element.dataset.bloomHiddenPinned = element.style.visibility;
        element.style.visibility = "hidden";
      }
    }).catch(() => undefined);
  }

  for (let i = 1; i < MAX_SCROLL_POSITIONS; ++i) {
    throwIfAborted(signal);

    const state = await page.evaluate(() => {
      const root = document.scrollingElement ?? document.documentElement;
      const bottom = Math.max(0, root.scrollHeight - window.innerHeight);
      const nextTop = Math.min(bottom, window.scrollY + window.innerHeight * 0.925);

      window.scrollTo({
        top: nextTop,
        behavior: "instant",
      });

      return {
        scrollY: Math.round(window.scrollY),
        pageHeight: Math.max(root.scrollHeight, window.innerHeight),
        viewportHeight: window.innerHeight,
      };
    });

    await settleScrolledPage(page);

    if (includeScreenshots) {
      captures.push(await captureViewportScreenshot(page, state.scrollY));
    }

    const bottom = Math.max(0, state.pageHeight - state.viewportHeight);

    if (state.scrollY >= bottom) {
      break;
    }
  }

  await page.evaluate(() => {
    for (const element of document.querySelectorAll<HTMLElement>("[data-bloom-hidden-pinned]")) {
      element.style.visibility = element.dataset.bloomHiddenPinned ?? "";
      delete element.dataset.bloomHiddenPinned;
    }
  }).catch(() => undefined);

  const finalDimensions = await page.evaluate(() => {
    const root = document.scrollingElement ?? document.documentElement;

    return {
      pageHeight: Math.max(root.scrollHeight, window.innerHeight),
      viewportHeight: window.innerHeight,
    };
  });

  const screenshots = finalizeScreenshots(
    captures,
    finalDimensions.pageHeight,
    finalDimensions.viewportHeight,
  );

  return {
    screenshots,
    pageHeight: finalDimensions.pageHeight,
  };
}

async function pageSummary(page: Page) {
  return page.evaluate(() => ({
    title: document.title.trim(),
    text: document.body?.innerText?.slice(0, 5_000) ?? "",
  }));
}

function pageWasBlocked(
  targetKind: TargetKind,
  status: number,
  title: string,
  text: string,
) {
  if (targetKind !== "public") {
    return false;
  }

  return (
    status === 401 ||
    status === 403 ||
    status === 429 ||
    BLOCK_PATTERN.test(`${title}\n${text}`)
  );
}

async function settleScrolledPage(page: Page) {
  await Promise.all([
    waitForNetworkIdle(page, 1_200, 300),
    waitForViewportReady(page, 1_500),
  ]);
}

async function extractCapturedDesign(
  page: Page,
  captureOptions?: {
    signal: AbortSignal;
    includeScreenshots: boolean;
  },
): Promise<{
  design: CapturedDesign;
  capture?: {
    screenshots: Screenshot[];
    pageHeight: number;
  };
}> {
  const captures: PendingScreenshot[] = [];
  const captureBinding = captureOptions
    ? "__bloomCaptureViewport"
    : null;

  if (captureBinding && captureOptions) {
    const { signal, includeScreenshots } = captureOptions;
    await page.exposeFunction(captureBinding, async (scrollY: number) => {
      throwIfAborted(signal);
      await settleScrolledPage(page);
      throwIfAborted(signal);

      if (!includeScreenshots) return;

      captures.push(await captureViewportScreenshot(page, scrollY));
    });
  }

  const raw = await page.evaluate(
    async ({
      maxScrollPositions,
      scrollStepRatio,
      settleMs,
      maxColors,
      maxFonts,
      captureBinding,
    }) => {
      const meaningfulColor = (value: string) =>
        Boolean(value) &&
        value !== "transparent" &&
        value !== "rgba(0, 0, 0, 0)";
      const colorCounts = new Map<string, number>();
      const recordColor = (color: string) => {
        if (meaningfulColor(color)) {
          colorCounts.set(color, (colorCounts.get(color) ?? 0) + 1);
        }
      };
      const firstFamily = (value: string) => {
        const match = /^\s*(?:"([^"]+)"|'([^']+)'|([^,]+))/.exec(value);
        return (match?.[1] ?? match?.[2] ?? match?.[3])?.trim().toLowerCase() ?? "";
      };
      const hasDirectText = (element: Element) => {
        for (const child of element.childNodes) {
          if (
            child.nodeType === Node.TEXT_NODE &&
            (child.textContent ?? "").trim()
          ) {
            return true;
          }
        }
        return false;
      };
      const usedFontFamilies = new Set<string>();

      const settle = async () => {
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        });
        await new Promise<void>((resolve) => setTimeout(resolve, settleMs));
      };

      await document.fonts.ready;
      let nextScrollY = 0;
      let scannedPositions = 0;

      while (scannedPositions < maxScrollPositions) {
        const root = document.scrollingElement ?? document.documentElement;
        const bottom = Math.max(0, root.scrollHeight - window.innerHeight);
        window.scrollTo({ top: Math.min(nextScrollY, bottom), behavior: "instant" });
        if (captureBinding) {
          const captureViewport = (
            window as unknown as Record<
              string,
              (scrollY: number) => Promise<void>
            >
          )[captureBinding];
          await captureViewport(Math.round(window.scrollY));
        } else {
          await settle();
        }
        scannedPositions += 1;

        const candidates = document.body.querySelectorAll("*");
        for (let index = -1; index < candidates.length; index += 1) {
          const element = index === -1 ? document.body : candidates[index]!;
          const computed = getComputedStyle(element);
          if (
            computed.display === "none" ||
            computed.visibility === "hidden" ||
            Number(computed.opacity) === 0
          ) {
            continue;
          }
          const rect = element.getBoundingClientRect();
          if (
            computed.display !== "contents" &&
            !(
              rect.width > 0 &&
              rect.height > 0 &&
              rect.bottom >= -80 &&
              rect.top <= window.innerHeight + 80 &&
              rect.right >= -80 &&
              rect.left <= window.innerWidth + 80
            )
          ) {
            continue;
          }
          recordColor(computed.color);
          recordColor(computed.backgroundColor);
          recordColor(computed.borderTopColor);
          recordColor(computed.borderRightColor);
          recordColor(computed.borderBottomColor);
          recordColor(computed.borderLeftColor);
          if (hasDirectText(element)) {
            const family = firstFamily(computed.fontFamily);
            if (family) usedFontFamilies.add(family);
          }
        }

        const currentRoot = document.scrollingElement ?? document.documentElement;
        const currentBottom = Math.max(
          0,
          currentRoot.scrollHeight - window.innerHeight,
        );
        if (window.scrollY >= currentBottom) {
          break;
        }
        const step = Math.max(1, Math.floor(window.innerHeight * scrollStepRatio));
        nextScrollY = Math.min(currentBottom, window.scrollY + step);
      }

      const root = document.scrollingElement ?? document.documentElement;
      const fonts: Array<{
        family: string;
        style: string;
        weight: string;
        stretch: string;
      }> = [];
      for (const font of document.fonts) {
        if (fonts.length >= maxFonts) break;
        if (font.status !== "loaded") continue;
        const family = font.family.replace(/["']/g, "").trim();
        if (!usedFontFamilies.has(family.toLowerCase())) continue;
        fonts.push({
          family,
          style: font.style,
          weight: font.weight,
          stretch: font.stretch,
        });
      }

      window.scrollTo({ top: 0, behavior: "instant" });
      await settle();

      const grouped = new Map<
        string,
        (typeof fonts)[number] & {
          weights: Set<string>;
        }
      >();
      for (const font of fonts) {
        const key = [font.family, font.style, font.stretch].join("\u0000");
        const existing = grouped.get(key);
        if (existing) {
          existing.weights.add(font.weight);
          continue;
        }
        grouped.set(key, {
          ...font,
          weights: new Set([font.weight]),
        });
      }
      const uniqueFonts = [...grouped.values()].map(({ weights, ...font }) => ({
        ...font,
        weight: [...weights].join(", "),
      }));
      const colors = [...colorCounts]
        .sort((left, right) => right[1] - left[1])
        .slice(0, maxColors)
        .map(([color]) => color);

      return {
        design: {
          fonts: uniqueFonts.map((font) => ({
            family: font.family,
            style: font.style,
            weight: font.weight,
          })),
          colors,
        },
        traversal: {
          pageHeight: Math.max(root.scrollHeight, window.innerHeight),
          viewportHeight: window.innerHeight,
        },
      };
    },
    {
      maxScrollPositions: MAX_SCROLL_POSITIONS,
      scrollStepRatio: SCROLL_STEP_RATIO,
      settleMs: SCROLL_SETTLE_MS,
      maxColors: MAX_COLORS,
      maxFonts: MAX_FONTS,
      captureBinding,
    },
  ).finally(async () => {
    if (captureBinding) {
      await page.removeExposedFunction(captureBinding).catch(() => undefined);
    }
  });

  const screenshots = finalizeScreenshots(
    captures,
    raw.traversal.pageHeight,
    raw.traversal.viewportHeight,
  );

  return {
    design: raw.design,
    ...(captureOptions
      ? {
        capture: {
          screenshots,
          pageHeight: raw.traversal.pageHeight,
        },
      }
      : {}),
  };
}

function finalUrl(
  target: ResolvedTarget,
  page: Page,
) {
  const url = new URL(page.url());

  if (target.targetKind === "preview") {
    return `${url.pathname}${url.search}${url.hash}`;
  }

  return sanitizedUrl(url.toString());
}

async function scrapeRenderedPageWithBrowser(
  browser: Browser,
  options: ScrapeOptions,
): Promise<RenderedPageScrape> {
  throwIfAborted(options.signal);

  const target = await resolveTarget(options);
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  const localTarget = target.targetKind === "preview" || isLocalHostname(target.destination.hostname);

  const diagnostics = attachDiagnostics(
    page,
    target,
  );

  const handleAbort = () => {
    void context.close().catch(() => undefined);
  };

  options.signal.addEventListener("abort", handleAbort, { once: true });

  try {
    await configurePage(
      browser,
      page,
      target,
      options,
    );

    const response = await navigate(
      page,
      target.destination,
      options.signal,
    );

    await waitForDocumentReady(page);

    await waitForNetworkIdle(page, 10_000);

    await dismissPageObstructions(page);

    const viewportScreenshots = Boolean(options.includeScreenshots && options.deep);
    const capturedDesign = localTarget
      ? null
      : await extractCapturedDesign(page, {
        signal: options.signal,
        includeScreenshots: viewportScreenshots,
      });

    const capture = capturedDesign?.capture ?? await loadLazyContent(
      page,
      options.signal,
      viewportScreenshots,
    );

    let fullPage: Screenshot | null = null;
    if (options.includeScreenshots && !options.deep) {
      const pageCapture = await captureFullPage(page, capture.pageHeight);
      fullPage = pageCapture.fullPage;
      capture.screenshots = pageCapture.screenshots;
    }

    let summary = await pageSummary(page);
    const status = response?.status() ?? 0;

    let blocked = pageWasBlocked(
      target.targetKind,
      status,
      summary.title,
      summary.text,
    );

    if (blocked && status < 400) {
      await delay(3_000);

      summary = await pageSummary(page);

      blocked = pageWasBlocked(
        target.targetKind,
        status,
        summary.title,
        summary.text,
      );
    }

    const requestedScreenshotLimit = Math.max(
      1,
      Math.min(
        MAX_SCREENSHOTS,
        Math.trunc(options.maxScreenshots ?? 1),
      ),
    );

    capture.screenshots = selectScreenshots(
      capture.screenshots,
      requestedScreenshotLimit,
    );

    const designProfile = target.targetKind === "public"
      ? await collectDesignProfile(page).catch(() => null)
      : null;

    const frameAnalyses = target.targetKind === "public"
      ? await analyzeFrames(
        context,
        capture.screenshots.map((screenshot) => ({
          bytes: screenshot.bytes,
          scrollY: screenshot.scrollY,
          mimeType: screenshot.mimeType,
        })),
      ).catch(() => [] as FrameAnalysis[])
      : [];

    return {
      targetKind: target.targetKind,

      url: finalUrl(target, page),
      status,
      title: summary.title,

      theme: options.theme,
      viewport: viewportSettings(options.viewport),

      ...capture,
      fullPage,
      design: capturedDesign?.design ?? null,

      diagnostics:
        diagnostics && diagnostics.length > 0
          ? [...diagnostics]
          : null,

      blocked,
      designProfile,
      frameAnalyses,
    };
  } finally {
    options.signal.removeEventListener(
      "abort",
      handleAbort,
    );

    await context.close().catch(() => undefined);
  }
}

export async function scrapeRenderedPage(
  options: ScrapeOptions,
): Promise<RenderedPageScrape> {
  const executablePath = chromiumExecutable();

  await access(executablePath).catch(() => {
    throw new Error("Chromium is unavailable");
  });

  const args = [
    // GPU / WebGL / canvas
    "--enable-gpu",

    // Needed on headless Linux without X11 in many environments.
    "--use-angle=vulkan",
    "--enable-features=Vulkan",
    "--disable-vulkan-surface",

    // Don't throttle pages we're inspecting in parallel.
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows",

    "--disable-extensions",
    "--disable-sync",
    "--no-first-run",
  ];

  if (
    typeof process.getuid === "function" &&
    process.getuid() === 0
  ) {
    args.push("--no-sandbox", "--disable-setuid-sandbox");
  }

  const browser = await launch({
    executablePath,
    headless: true,
    args,
    signal: options.signal,
  });

  try {
    return await scrapeRenderedPageWithBrowser(browser, options);
  } finally {
    await browser.close().catch(() => undefined);
  }
}
