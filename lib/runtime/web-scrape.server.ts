import "server-only";

import type { ManifestSummary } from "@/ai/tools/web-scrape";
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
  sanitizeDiagnosticUrl,
  type BrowserDiagnostic,
} from "@/lib/runtime/browser-diagnostics";
import { ensureProjectPreview } from "@/lib/runtime/runtime-service.server";
import { selectScreenshots } from "@/lib/runtime/screenshot-selection";
import {
  analyzeFrames,
  collectDesignProfile,
  composeComparisons,
} from "@/lib/runtime/design-capture";
import type { DesignProfile, FrameAnalysis } from "@/lib/design/dna";
import { evenlySelectItems } from "@/lib/evenly-select-items";

const MAX_DIAGNOSTICS = 10;
const MAX_SCROLL_POSITIONS = 20;
const MAX_SCREENSHOTS = 16;
const IMAGE_QUALITY = 85;
const MAX_FULL_PAGE_VIEWPORTS = 12;
export const FULL_PAGE_SCREENSHOT_NAME = "Full page";
const MAX_FONTS = 10;
const MAX_DESIGN_VALUES = 24;
const MAX_MANIFEST_NODES = 1_800;
const MAX_MANIFEST_STYLES = 1_200;
const MAX_MANIFEST_ASSETS = 150;
const MAX_NODE_VARIANTS = 4;
const MANIFEST_SEGMENT_SIZE = 120;
const SCROLL_STEP_RATIO = 0.9;
const MANIFEST_SETTLE_MS = 450;
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

export type PageViewport = {
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
  /** Reference frames to pair with preview frames in side-by-side comparison images. */
  comparisonFrames?: Array<{
    bytes: Uint8Array;
    mimeType: string;
    scrollPercentage: number;
    label: string;
  }>;
};

type Screenshot = {
  name: string;
  mimeType: "image/webp";
  bytes: Uint8Array;
  scrollY: number;
  scrollPercentage: number;
};

type PendingScreenshot = Omit<Screenshot, "name" | "scrollPercentage">;

type ManifestTruncationReason =
  | "nodes"
  | "styles"
  | "assets"
  | "animations"
  | "scroll_positions";

export type RenderManifest = {
  nodes: Array<{
    id: number;
    parent: number | null;
    tag: string;
    style: string;
    bounds: [number, number, number, number];
    coordinateSpace?: "viewport";
    role?: string;
    name?: string;
    text?: string;
    attributes?: Record<string, string>;
    assets?: string[];
    repeat?: {
      count: number;
      examples: number;
      axis: "row" | "column" | "mixed";
      gap: number;
    };
    variants?: Array<{
      scrollY: number;
      style: string;
      bounds: [number, number, number, number];
    }>;
  }>;
  assets: Record<
    string,
    {
      kind: "image" | "background" | "mask" | "video" | "poster";
      url?: string;
      content?: string;
      mediaType?: "image/svg+xml";
      alt?: string;
      intrinsicSize?: [number, number];
    }
  >;
  fonts: Array<{
    family: string;
    style: string;
    weight: string;
    stretch: string;
    sources: Array<{
      url: string;
      style: string;
      weight: string;
      stretch: string;
      format?: string;
      unicodeRange?: string;
    }>;
  }>;
};

type ManifestNode = RenderManifest["nodes"][number];
type ManifestAsset = RenderManifest["assets"][string];
type ManifestRepeat = NonNullable<ManifestNode["repeat"]>;
type ManifestFontSource = RenderManifest["fonts"][number]["sources"][number];
type CriticalAssetPlacement =
  ManifestSummary["fidelity"]["criticalAssets"][number]["placements"][number];
type GradientSample =
  ManifestSummary["fidelity"]["effects"]["cssGradients"]["samples"][number];

type ReferenceFontCatalog = Pick<RenderManifest, "fonts">;

export type RenderedPageScrape = {
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
  captureTruncated: boolean;
  manifest: ManifestSummary | null;
  referenceFontCatalog: ReferenceFontCatalog | null;

  diagnostics: BrowserDiagnostic[] | null;
  blocked: boolean;

  /** Computed-style design evidence from the live DOM. */
  designProfile: DesignProfile | null;
  /** Pixel statistics for every returned screenshot, in screenshot order. */
  frameAnalyses: FrameAnalysis[];
  /** Side-by-side reference/preview comparison images. */
  comparisons: Array<{ bytes: Uint8Array; label: string }>;
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

async function captureFullPage(page: Page) {
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await settleScrolledPage(page);
  const { width, pageHeight, viewportHeight } = await page.evaluate(() => {
    const root = document.scrollingElement ?? document.documentElement;
    return {
      width: document.documentElement.clientWidth || window.innerWidth,
      pageHeight: Math.max(root.scrollHeight, window.innerHeight),
      viewportHeight: window.innerHeight,
    };
  });
  const height = Math.min(pageHeight, viewportHeight * MAX_FULL_PAGE_VIEWPORTS);
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
    truncated: height < pageHeight,
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
      scrollY: Math.round(window.scrollY),
    };
  });

  const finalBottom = Math.max(
    0,
    finalDimensions.pageHeight - finalDimensions.viewportHeight,
  );

  const screenshots = finalizeScreenshots(
    captures,
    finalDimensions.pageHeight,
    finalDimensions.viewportHeight,
  );

  return {
    screenshots,
    pageHeight: finalDimensions.pageHeight,
    captureTruncated: finalDimensions.scrollY < finalBottom,
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

export type CapturedStylesheet = {
  url: string | null;
  content: string;
};

function captureStylesheetResponses(page: Page) {
  const stylesheets = new Map<string, string>();
  const pending = new Set<Promise<void>>();

  const onResponse = (response: HTTPResponse) => {
    const contentType = response.headers()["content-type"]?.toLowerCase() ?? "";
    if (
      response.request().resourceType() !== "stylesheet" &&
      !contentType.includes("text/css")
    ) {
      return;
    }

    const task = response
      .text()
      .then((content) => {
        if (content.trim()) {
          stylesheets.set(sanitizedUrl(response.url()), content);
        }
      })
      .catch(() => undefined);

    pending.add(task);
    void task.finally(() => pending.delete(task));
  };

  page.on("response", onResponse);

  return {
    async read() {
      await Promise.allSettled([...pending]);
      return [...stylesheets].map(([url, content]) => ({ url, content }));
    },
    dispose() {
      page.off("response", onResponse);
    },
  };
}

function fontSourcesFromStylesheets(
  stylesheets: CapturedStylesheet[],
  pageUrl: string,
) {
  const sources = new Map<string, Map<string, ManifestFontSource>>();

  for (const stylesheet of stylesheets) {
    const baseUrl = stylesheet.url ?? pageUrl;
    const fontFacePattern = /@font-face\s*{([\s\S]*?)}/gi;
    let match: RegExpExecArray | null;

    while ((match = fontFacePattern.exec(stylesheet.content))) {
      const block = match[1] ?? "";
      const familyValue = /font-family\s*:\s*([^;}]+)/i.exec(block)?.[1];
      if (!familyValue) continue;

      const family = familyValue.replaceAll(/["']/g, "").trim().toLowerCase();
      const style = /font-style\s*:\s*([^;}]+)/i.exec(block)?.[1]?.trim() || "normal";
      const weight = /font-weight\s*:\s*([^;}]+)/i.exec(block)?.[1]?.trim() || "400";
      const stretch = /font-stretch\s*:\s*([^;}]+)/i.exec(block)?.[1]?.trim() || "normal";
      const unicodeRange = /unicode-range\s*:\s*([^;}]+)/i.exec(block)?.[1]?.trim();
      const familySources = sources.get(family) ?? new Map();
      const urlPattern = /url\(\s*(["']?)(.*?)\1\s*\)(?:\s*format\(\s*(["']?)(.*?)\3\s*\))?/gi;
      let urlMatch: RegExpExecArray | null;

      while ((urlMatch = urlPattern.exec(block))) {
        const rawUrl = urlMatch[2]?.trim();
        if (!rawUrl || rawUrl.startsWith("data:")) continue;

        try {
          const url = new URL(rawUrl, baseUrl).toString();
          if (!familySources.has(url)) {
            const format = urlMatch[4]?.trim();
            familySources.set(url, {
              url,
              style,
              weight,
              stretch,
              ...(format ? { format } : {}),
              ...(unicodeRange ? { unicodeRange } : {}),
            });
          }
        } catch {
          // Ignore malformed CSS URLs while retaining the rest of the scrape.
        }
      }

      sources.set(family, familySources);
    }
  }

  return new Map(
    [...sources].map(([family, familySources]) => [
      family,
      [...familySources.values()],
    ]),
  );
}

export async function extractRenderEvidence(
  page: Page,
  responseStylesheets:
    | CapturedStylesheet[]
    | (() => Promise<CapturedStylesheet[]>),
  captureOptions?: {
    signal: AbortSignal;
    includeScreenshots: boolean;
  },
): Promise<{
  manifest: ManifestSummary;
  fonts: RenderManifest["fonts"];
  capture?: {
    screenshots: Screenshot[];
    pageHeight: number;
    captureTruncated: boolean;
  };
}> {
  const captures: PendingScreenshot[] = [];
  const captureBinding = captureOptions
    ? "__bloomCaptureManifestViewport"
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
      maxNodes,
      maxStyles,
      maxAssets,
      maxVariants,
      maxScrollPositions,
      scrollStepRatio,
      settleMs,
      maxColors,
      maxFonts,
      captureBinding,
      segmentSize,
    }) => {
      const round = (value: number) => Math.round(value * 10) / 10;
      const cleanText = (value: string | null | undefined, limit = 500) =>
        (value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
      const directTextFor = (element: Element, limit: number) => {
        if (limit <= 0) return "";
        const parts: string[] = [];
        for (const node of element.childNodes) {
          if (node.nodeType === Node.TEXT_NODE) {
            parts.push(node.textContent ?? "");
          }
        }
        return cleanText(parts.join(" "), limit);
      };
      const absoluteUrl = (value: string) => {
        try {
          return new URL(value, document.baseURI).toString();
        } catch {
          return value;
        }
      };
      const meaningfulColor = (value: string) =>
        Boolean(value) &&
        value !== "transparent" &&
        value !== "rgba(0, 0, 0, 0)";
      const boundsFor = (
        element: Element,
        style: CSSStyleDeclaration,
        rect = element.getBoundingClientRect(),
      ): [number, number, number, number] => {
        const viewportSpace = style.position === "fixed";
        return [
          round(rect.left + (viewportSpace ? 0 : window.scrollX)),
          round(rect.top + (viewportSpace ? 0 : window.scrollY)),
          round(rect.width),
          round(rect.height),
        ];
      };
      const truncationReasons = new Set<ManifestTruncationReason>();
      const markTruncated = (reason: ManifestTruncationReason) => {
        truncationReasons.add(reason);
      };
      let remainingTextCharacters = 60_000;
      let omittedRepeatedNodes = 0;
      const styleIdByValue = new Map<string, string>();
      const baseStyleRecords = new Map<string, Record<string, string>>();
      let styleOverflowed = false;
      const assets: RenderManifest["assets"] = {};
      const assetIdByValue = new Map<string, string>();
      const inlineSvgAssetByElement = new WeakMap<SVGSVGElement, string>();
      const nodes: RenderManifest["nodes"] = [];
      const colorCounts = new Map<string, number>();
      const recordColor = (color: string) => {
        if (meaningfulColor(color)) {
          colorCounts.set(color, (colorCounts.get(color) ?? 0) + 1);
        }
      };
      const usedFontFamilies = new Set<string>();
      const nodeIdByElement = new WeakMap<Element, number>();
      const pseudoNodeIdByKey = new Map<string, number>();
      const stateSignaturesByNode = new Map<number, Set<string>>();
      const omittedRoots = new WeakSet<Element>();
      const repeatByElement = new WeakMap<Element, ManifestRepeat>();

      const compactGridTrackValue = (rawValue: string) => {
        if (rawValue.length <= 400) return rawValue;

        const tokens: string[] = [];
        let current = "";
        let depth = 0;
        let quote = "";
        let escaped = false;

        for (const character of rawValue) {
          if (escaped) {
            current += character;
            escaped = false;
            continue;
          }
          if (character === "\\") {
            current += character;
            escaped = true;
            continue;
          }
          if (quote) {
            current += character;
            if (character === quote) quote = "";
            continue;
          }
          if (character === '"' || character === "'") {
            quote = character;
            current += character;
            continue;
          }
          if (character === "(" || character === "[") depth += 1;
          if (character === ")" || character === "]") {
            depth = Math.max(0, depth - 1);
          }
          if (/\s/.test(character) && depth === 0) {
            if (current) {
              tokens.push(current);
              current = "";
            }
            continue;
          }
          current += character;
        }
        if (current) tokens.push(current);

        const compacted: string[] = [];
        for (let index = 0; index < tokens.length;) {
          const token = tokens[index]!;
          let nextIndex = index + 1;
          while (tokens[nextIndex] === token) nextIndex += 1;
          const count = nextIndex - index;
          if (count >= 3) {
            compacted.push(`repeat(${count},${token})`);
          } else {
            compacted.push(...tokens.slice(index, nextIndex));
          }
          index = nextIndex;
        }

        const compactedValue = compacted.join(" ");
        return compactedValue.length < rawValue.length ? compactedValue : rawValue;
      };

      const noneDefault = ["none"] as const;
      const autoDefault = ["auto"] as const;
      const zeroDefault = ["0"] as const;
      const staticDefault = ["static"] as const;
      const zeroPixelDefault = ["0px"] as const;
      const spacingDefaults = ["0px", "normal"] as const;
      const sizeConstraintDefaults = ["0px", "none"] as const;
      const flexContainerDefaults = ["row", "nowrap", "normal"] as const;
      const gridContainerDefaults = ["none", "auto", "row", "normal"] as const;
      const autoOrNormalDefaults = ["auto", "normal"] as const;
      const overflowDefaults = ["visible", "content-box"] as const;
      const optionalTypographyDefaults = [
        "normal",
        "start",
        "none",
        "normal normal",
      ] as const;
      const transparentDefaults = [
        "rgba(0, 0, 0, 0)",
        "transparent",
      ] as const;
      const oneDefault = ["1"] as const;
      const normalDefault = ["normal"] as const;
      const transformOriginDefault = ["50% 50% 0px"] as const;
      const strokeWidthDefault = ["1px"] as const;
      const strokeLinecapDefault = ["butt"] as const;
      const strokeLinejoinDefault = ["miter"] as const;
      const objectFitDefault = ["fill"] as const;
      const objectPositionDefault = ["50% 50%"] as const;
      const stylePropertyGroups = {
        inset: ["top", "right", "bottom", "left", "z-index"],
        spacing: [
          "margin-top",
          "margin-right",
          "margin-bottom",
          "margin-left",
          "padding-top",
          "padding-right",
          "padding-bottom",
          "padding-left",
          "row-gap",
          "column-gap",
        ],
        sizeConstraints: ["min-width", "min-height", "max-width", "max-height"],
        flexContainer: [
          "flex-direction",
          "flex-wrap",
          "align-items",
          "align-content",
          "justify-content",
        ],
        gridContainer: [
          "grid-template-columns",
          "grid-template-rows",
          "grid-auto-columns",
          "grid-auto-rows",
          "grid-auto-flow",
          "align-items",
          "justify-items",
          "align-content",
          "justify-content",
        ],
        gridItem: [
          "grid-column-start",
          "grid-column-end",
          "grid-row-start",
          "grid-row-end",
          "justify-self",
        ],
        overflow: ["overflow-x", "overflow-y", "box-sizing"],
        requiredTypography: [
          "font-family",
          "font-size",
          "font-weight",
          "line-height",
          "color",
        ],
        optionalTypography: [
          "font-style",
          "letter-spacing",
          "text-align",
          "text-transform",
          "text-decoration-line",
          "white-space",
          "word-break",
        ],
      } as const;
      const flexItemProperties = [
        ["flex-grow", zeroDefault],
        ["flex-shrink", ["1"]],
        ["flex-basis", autoDefault],
        ["align-self", autoDefault],
        ["order", zeroDefault],
      ] as const;
      const backgroundProperties = [
        ["background-position", ["0% 0%"]],
        ["background-size", autoDefault],
        ["background-repeat", ["repeat"]],
        ["background-origin", ["padding-box"]],
        ["background-clip", ["border-box"]],
      ] as const;
      const maskProperties = [
        ["position", ["0% 0%"]],
        ["size", autoDefault],
        ["repeat", ["repeat"]],
      ] as const;
      const borderSides = ["top", "right", "bottom", "left"] as const;

      const addStyle = (
        computed: CSSStyleDeclaration,
        element: Element,
        retainRecord = false,
      ) => {
        const value = (property: string) => {
          const rawValue = computed.getPropertyValue(property).trim();
          const propertyValue = property.startsWith("grid-template-")
            ? compactGridTrackValue(rawValue)
            : rawValue;
          if (propertyValue.length > 2_000) markTruncated("styles");
          return propertyValue.slice(0, 2_000);
        };
        const style: Record<string, string> = {};
        const add = (
          property: string,
          defaults?: readonly string[],
          always = false,
        ) => {
          const propertyValue = value(property);
          if (
            propertyValue &&
            (always || !defaults?.includes(propertyValue))
          ) {
            style[property] = propertyValue;
          }
          return propertyValue;
        };

        add("display", undefined, true);
        add("position", staticDefault);
        add("float", noneDefault);
        add("clear", noneDefault);
        for (const property of stylePropertyGroups.inset) {
          add(property, autoDefault);
        }
        for (const property of stylePropertyGroups.spacing) {
          add(property, spacingDefaults);
        }
        for (const property of stylePropertyGroups.sizeConstraints) {
          add(property, sizeConstraintDefaults);
        }

        const display = computed.display;
        if (display.includes("flex")) {
          for (const property of stylePropertyGroups.flexContainer) {
            add(property, flexContainerDefaults);
          }
        }
        for (const [property, defaults] of flexItemProperties) {
          add(property, defaults);
        }
        if (display.includes("grid")) {
          for (const property of stylePropertyGroups.gridContainer) {
            add(property, gridContainerDefaults);
          }
        }
        for (const property of stylePropertyGroups.gridItem) {
          add(property, autoOrNormalDefaults);
        }

        for (const property of stylePropertyGroups.overflow) {
          add(property, overflowDefaults);
        }
        let textColor = "";
        for (const property of stylePropertyGroups.requiredTypography) {
          const propertyValue = add(property, undefined, true);
          if (property === "color") textColor = propertyValue;
        }
        for (const property of stylePropertyGroups.optionalTypography) {
          add(property, optionalTypographyDefaults);
        }

        add("background-color", transparentDefaults);
        const backgroundImage = value("background-image");
        if (backgroundImage && backgroundImage !== "none") {
          style["background-image"] = backgroundImage;
          for (const [property, defaults] of backgroundProperties) {
            add(property, defaults);
          }
        }

        for (const side of borderSides) {
          const width = value(`border-${side}-width`);
          const borderStyle = value(`border-${side}-style`);
          if (width !== "0px" && borderStyle !== "none") {
            add(`border-${side}`, undefined, true);
          }
        }
        add("border-radius", zeroPixelDefault);
        add("box-shadow", noneDefault);
        add("opacity", oneDefault);
        add("filter", noneDefault);
        add("backdrop-filter", noneDefault);
        add("mix-blend-mode", normalDefault);

        const transform = value("transform");
        if (transform && transform !== "none") {
          style.transform = transform;
          add("transform-origin", transformOriginDefault);
        }
        add("clip-path", noneDefault);

        const maskImage = value("mask-image");
        const webkitMaskImage = value("-webkit-mask-image");
        const maskProperty =
          maskImage && maskImage !== "none"
            ? "mask"
            : webkitMaskImage && webkitMaskImage !== "none"
              ? "-webkit-mask"
              : null;
        if (maskProperty) {
          const imageProperty = `${maskProperty}-image`;
          style[imageProperty] =
            maskProperty === "mask" ? maskImage : webkitMaskImage;
          for (const [suffix, defaults] of maskProperties) {
            add(`${maskProperty}-${suffix}`, defaults);
          }
        }

        const textFill = value("-webkit-text-fill-color");
        if (
          textFill &&
          textFill !== "currentcolor" &&
          textFill !== textColor
        ) {
          style["-webkit-text-fill-color"] = textFill;
        }

        if (element instanceof SVGElement) {
          add("fill", noneDefault);
          const stroke = add("stroke", noneDefault);
          if (stroke !== "none") {
            add("stroke-width", strokeWidthDefault);
            add("stroke-linecap", strokeLinecapDefault);
            add("stroke-linejoin", strokeLinejoinDefault);
          }
        }

        if (
          element instanceof HTMLImageElement ||
          element instanceof HTMLVideoElement ||
          element instanceof HTMLCanvasElement
        ) {
          add("object-fit", objectFitDefault);
          add("object-position", objectPositionDefault);
        }
        add("aspect-ratio", autoDefault);

        const key = JSON.stringify(style);
        const existing = styleIdByValue.get(key);
        if (existing) {
          if (retainRecord && !baseStyleRecords.has(existing)) {
            baseStyleRecords.set(existing, style);
          }
          return existing;
        }
        if (styleIdByValue.size >= maxStyles) {
          markTruncated("styles");
          styleOverflowed = true;
          return "s0";
        }
        const id = `s${styleIdByValue.size + 1}`;
        styleIdByValue.set(key, id);
        if (retainRecord) {
          baseStyleRecords.set(id, style);
        }
        return id;
      };

      const addAsset = (
        kind: ManifestAsset["kind"],
        rawUrl: string,
        details: Pick<ManifestAsset, "alt" | "intrinsicSize"> = {},
      ) => {
        if (!rawUrl || rawUrl.startsWith("data:")) return null;
        const url = absoluteUrl(rawUrl);
        const key = `${kind}:${url}`;
        const existing = assetIdByValue.get(key);
        if (existing) return existing;
        if (assetIdByValue.size >= maxAssets) {
          markTruncated("assets");
          return null;
        }
        const id = `a${assetIdByValue.size + 1}`;
        assetIdByValue.set(key, id);
        assets[id] = {
          kind,
          url,
          ...details,
        };
        return id;
      };

      const inlineSvgStyleProperties = [
        "color",
        "fill",
        "fill-opacity",
        "fill-rule",
        "stroke",
        "stroke-opacity",
        "stroke-width",
        "stroke-linecap",
        "stroke-linejoin",
        "stroke-dasharray",
        "stroke-dashoffset",
        "opacity",
        "paint-order",
        "font-family",
        "font-size",
        "font-style",
        "font-weight",
        "letter-spacing",
      ] as const;
      const serializeInlineSvg = (element: SVGSVGElement) => {
        const clone = element.cloneNode(true) as SVGSVGElement;
        const originalElements = [
          element,
          ...element.querySelectorAll<SVGElement>("*"),
        ];
        const clonedElements = [
          clone,
          ...clone.querySelectorAll<SVGElement>("*"),
        ];

        for (let index = 0; index < clonedElements.length; index += 1) {
          const original = originalElements[index];
          const cloned = clonedElements[index];
          if (!original || !cloned) continue;
          for (const attribute of [...cloned.attributes]) {
            const name = attribute.name.toLowerCase();
            if (name.startsWith("on")) {
              cloned.removeAttribute(attribute.name);
              continue;
            }
            if (
              (name === "href" || name === "xlink:href") &&
              /^\s*javascript:/i.test(attribute.value)
            ) {
              cloned.removeAttribute(attribute.name);
            }
          }
          const computed = getComputedStyle(original);
          for (const property of inlineSvgStyleProperties) {
            const value = computed.getPropertyValue(property);
            if (value) cloned.style.setProperty(property, value);
          }
        }
        clone.querySelectorAll("script, foreignObject").forEach((node) => node.remove());

        if (!clone.hasAttribute("xmlns")) {
          clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        }
        const rect = element.getBoundingClientRect();
        if (!clone.hasAttribute("width") && rect.width > 0) {
          clone.setAttribute("width", String(round(rect.width)));
        }
        if (!clone.hasAttribute("height") && rect.height > 0) {
          clone.setAttribute("height", String(round(rect.height)));
        }
        const content = new XMLSerializer().serializeToString(clone);
        return content.length <= 100_000 ? content : null;
      };
      const addInlineSvgAsset = (element: SVGSVGElement) => {
        const existingForElement = inlineSvgAssetByElement.get(element);
        if (existingForElement) return existingForElement;
        const content = serializeInlineSvg(element);
        if (!content) return null;
        const key = `image:inline-svg:${content}`;
        const existing = assetIdByValue.get(key);
        if (existing) {
          inlineSvgAssetByElement.set(element, existing);
          return existing;
        }
        if (assetIdByValue.size >= maxAssets) {
          markTruncated("assets");
          return null;
        }
        const id = `a${assetIdByValue.size + 1}`;
        const rect = element.getBoundingClientRect();
        const alt = cleanText(
          element.getAttribute("aria-label") ||
          element.getAttribute("title") ||
          element.querySelector("title")?.textContent,
        );
        assetIdByValue.set(key, id);
        inlineSvgAssetByElement.set(element, id);
        assets[id] = {
          kind: "image",
          content,
          mediaType: "image/svg+xml",
          ...(alt ? { alt } : {}),
          intrinsicSize: [round(rect.width), round(rect.height)],
        };
        return id;
      };

      const urlsFromCss = (value: string) => {
        const urls: string[] = [];
        const pattern = /url\(\s*["']?(.*?)["']?\s*\)/gi;
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(value))) {
          if (match[1]) urls.push(match[1]);
        }
        return urls;
      };

      const assetsFor = (
        element: Element,
        computed: CSSStyleDeclaration,
        includeElementAsset = true,
      ) => {
        const ids = new Set<string>();
        if (
          includeElementAsset &&
          element instanceof SVGSVGElement &&
          !element.ownerSVGElement
        ) {
          const id = addInlineSvgAsset(element);
          if (id) ids.add(id);
        }
        if (includeElementAsset && element instanceof HTMLImageElement) {
          const id = addAsset("image", element.currentSrc || element.src, {
            alt: cleanText(element.alt),
            intrinsicSize: [element.naturalWidth, element.naturalHeight],
          });
          if (id) ids.add(id);
        }
        if (includeElementAsset && element instanceof HTMLVideoElement) {
          const video = addAsset("video", element.currentSrc || element.src);
          const poster = addAsset("poster", element.poster);
          if (video) ids.add(video);
          if (poster) ids.add(poster);
        }
        for (const url of urlsFromCss(computed.backgroundImage)) {
          const id = addAsset("background", url);
          if (id) ids.add(id);
        }
        const maskImage =
          computed.getPropertyValue("mask-image") ||
          computed.getPropertyValue("-webkit-mask-image");
        for (const url of urlsFromCss(maskImage)) {
          const id = addAsset("mask", url);
          if (id) ids.add(id);
        }
        return [...ids];
      };

      const isOmitted = (element: Element) => {
        let current: Element | null = element;
        while (current && current !== document.body) {
          if (omittedRoots.has(current)) return true;
          current = current.parentElement;
        }
        return false;
      };

      const repeatableTags = new Set(["a", "article", "div", "li", "tr"]);
      const initialElements = document.body.querySelectorAll("*");
      for (let index = -1; index < initialElements.length; index += 1) {
        const parent = index === -1 ? document.body : initialElements[index]!;
        if (parent.children.length < 10) continue;
        if (parent.closest("svg")) continue;
        const groups = new Map<string, Element[]>();
        for (const child of parent.children) {
          const tag = child.tagName.toLowerCase();
          if (!repeatableTags.has(tag)) continue;
          const structure = [...child.children]
            .slice(0, 6)
            .map(
              (item) =>
                `${item.tagName.toLowerCase()}.${item.getAttribute("class") ?? ""}`,
            )
            .join("|");
          const signature = [
            tag,
            child.getAttribute("class") ?? "",
            child.getAttribute("role") ?? "",
            structure,
          ].join("::");
          const group = groups.get(signature) ?? [];
          group.push(child);
          groups.set(signature, group);
        }

        for (const group of groups.values()) {
          if (group.length < 10) continue;
          const retained = group.slice(0, 6);
          const omitted = group.slice(6);
          omitted.forEach((element) => omittedRoots.add(element));
          omittedRepeatedNodes += omitted.length;

          const rects = retained.map((element) => element.getBoundingClientRect());
          const horizontalSpread =
            Math.max(...rects.map((rect) => rect.left)) -
            Math.min(...rects.map((rect) => rect.left));
          const verticalSpread =
            Math.max(...rects.map((rect) => rect.top)) -
            Math.min(...rects.map((rect) => rect.top));
          const axis =
            horizontalSpread > verticalSpread * 1.5
              ? "row"
              : verticalSpread > horizontalSpread * 1.5
                ? "column"
                : "mixed";
          const primaryPositions = rects
            .map((rect) => (axis === "row" ? rect.left : rect.top))
            .sort((left, right) => left - right);
          const primarySizes = rects.map((rect) =>
            axis === "row" ? rect.width : rect.height,
          );
          const gaps = primaryPositions.slice(1).map((position, index) =>
            Math.max(0, position - primaryPositions[index]! - primarySizes[index]!),
          );
          repeatByElement.set(retained[0]!, {
            count: group.length,
            examples: retained.length,
            axis,
            gap: round(
              gaps.length > 0
                ? gaps.reduce((total, gap) => total + gap, 0) / gaps.length
                : 0,
            ),
          });
        }
      }

      const nodeById = (id: number) => nodes[id - 1];
      const mergeNodeAssets = (
        node: Pick<ManifestNode, "assets">,
        discoveredAssets: string[],
      ) => {
        if (discoveredAssets.length === 0) return;
        const existingAssets = node.assets ?? [];
        const seen = new Set(existingAssets);
        const additions = discoveredAssets.filter((asset) => !seen.has(asset));
        if (additions.length > 0) {
          node.assets = [...existingAssets, ...additions];
        }
      };
      const recordExistingNodeState = (
        id: number,
        element: Element,
        computed: CSSStyleDeclaration,
        bounds: [number, number, number, number],
        discoveredAssets: string[],
      ) => {
        const signatures = stateSignaturesByNode.get(id)!;
        if (signatures.size - 1 < maxVariants) {
          const style = addStyle(computed, element);
          signatures.add(JSON.stringify([style, bounds, discoveredAssets]));
        }
        mergeNodeAssets(nodeById(id)!, discoveredAssets);
      };
      const snapshotFor = (
        element: Element,
        computed = getComputedStyle(element),
        rect = element.getBoundingClientRect(),
      ) => {
        return {
          computed,
          bounds: boundsFor(element, computed, rect),
          coordinateSpace:
            computed.position === "fixed" ? ("viewport" as const) : undefined,
          assets: assetsFor(element, computed),
        };
      };

      const ensureNode = (
        element: Element,
        computed?: CSSStyleDeclaration,
        rect?: DOMRect,
      ): number | null => {
        if (isOmitted(element)) return null;
        const existingId = nodeIdByElement.get(element);
        const snapshot = snapshotFor(element, computed, rect);
        if (existingId) {
          recordExistingNodeState(
            existingId,
            element,
            snapshot.computed,
            snapshot.bounds,
            snapshot.assets,
          );
          return existingId;
        }

        if (nodes.length >= maxNodes) {
          markTruncated("nodes");
          return null;
        }
        const parentElement = element.parentElement;
        const parent =
          parentElement && element !== document.body
            ? ensureNode(parentElement)
            : null;
        const id = nodes.length + 1;
        nodeIdByElement.set(element, id);
        const style = addStyle(snapshot.computed, element, true);
        const directText = directTextFor(
          element,
          Math.min(500, remainingTextCharacters),
        );
        remainingTextCharacters = Math.max(
          0,
          remainingTextCharacters - directText.length,
        );
        const role = cleanText(element.getAttribute("role"), 80);
        const name = cleanText(
          element.getAttribute("aria-label") ||
          element.getAttribute("alt") ||
          element.getAttribute("title"),
          300,
        );
        const repeat = repeatByElement.get(element);
        const node = {
          id,
          parent,
          tag: element.tagName.toLowerCase(),
          style,
          bounds: snapshot.bounds,
          ...(snapshot.coordinateSpace
            ? { coordinateSpace: snapshot.coordinateSpace }
            : {}),
          ...(role ? { role } : {}),
          ...(name ? { name } : {}),
          ...(directText ? { text: directText } : {}),
          ...(snapshot.assets.length > 0 ? { assets: snapshot.assets } : {}),
          ...(repeat ? { repeat } : {}),
        };
        nodes.push(node);
        stateSignaturesByNode.set(
          id,
          new Set([
            JSON.stringify([style, snapshot.bounds, snapshot.assets]),
          ]),
        );

        if (directText) {
          const match = /^\s*(?:"([^"]+)"|'([^']+)'|([^,]+))/.exec(
            snapshot.computed.fontFamily,
          );
          const family = (match?.[1] ?? match?.[2] ?? match?.[3])
            ?.trim()
            .toLowerCase();
          if (family) usedFontFamilies.add(family);
        }

        return id;
      };

      const capturePseudo = (
        element: Element,
        parent: number,
        pseudo: "::before" | "::after",
        elementStyle: CSSStyleDeclaration,
        elementRect: DOMRect,
      ) => {
        const computed = getComputedStyle(element, pseudo);
        const content = computed.content;
        if (
          (content === "none" || content === "normal" || content === "") &&
          computed.backgroundImage === "none" &&
          computed.getPropertyValue("mask-image") === "none" &&
          computed.getPropertyValue("-webkit-mask-image") === "none"
        ) {
          return;
        }

        const key = `${parent}:${pseudo}`;
        const bounds = boundsFor(element, elementStyle, elementRect);
        const assetsForPseudo = assetsFor(element, computed, false);
        const existingId = pseudoNodeIdByKey.get(key);
        if (existingId) {
          recordExistingNodeState(
            existingId,
            element,
            computed,
            bounds,
            assetsForPseudo,
          );
          return;
        }
        if (nodes.length >= maxNodes) {
          markTruncated("nodes");
          return;
        }
        const id = nodes.length + 1;
        pseudoNodeIdByKey.set(key, id);
        const style = addStyle(computed, element, true);
        const text = cleanText(content.replace(/^(["'])(.*)\1$/, "$2"), 300);
        nodes.push({
          id,
          parent,
          tag: pseudo,
          style,
          bounds,
          ...(text ? { text } : {}),
          ...(assetsForPseudo.length > 0 ? { assets: assetsForPseudo } : {}),
        });
        stateSignaturesByNode.set(
          id,
          new Set([JSON.stringify([style, bounds, assetsForPseudo])]),
        );
      };

      const pauseDocumentTimelineAnimations = () => {
        for (const animation of document.getAnimations()) {
          if (
            animation.playState === "running" &&
            (animation.timeline?.constructor.name ?? "DocumentTimeline") ===
            "DocumentTimeline"
          ) {
            try {
              animation.pause();
            } catch {
              // A newly created animation can have an unresolved current time.
            }
          }
        }
      };

      const settle = async () => {
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        });
        await new Promise<void>((resolve) => setTimeout(resolve, settleMs));
      };

      await document.fonts.ready;
      let nextScrollY = 0;
      let scannedPositions = 0;
      let reachedBottom = false;

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
        pauseDocumentTimelineAnimations();
        scannedPositions += 1;

        const candidates = document.body.querySelectorAll("*");
        for (let index = -1; index < candidates.length; index += 1) {
          const element = index === -1 ? document.body : candidates[index]!;
          if (isOmitted(element)) continue;
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
          const node = ensureNode(element, computed, rect);
          if (!node) continue;
          recordColor(computed.color);
          recordColor(computed.backgroundColor);
          recordColor(computed.borderTopColor);
          recordColor(computed.borderRightColor);
          recordColor(computed.borderBottomColor);
          recordColor(computed.borderLeftColor);
          capturePseudo(element, node, "::before", computed, rect);
          capturePseudo(element, node, "::after", computed, rect);
        }

        const currentRoot = document.scrollingElement ?? document.documentElement;
        const currentBottom = Math.max(
          0,
          currentRoot.scrollHeight - window.innerHeight,
        );
        if (window.scrollY >= currentBottom) {
          reachedBottom = true;
          break;
        }
        const step = Math.max(1, Math.floor(window.innerHeight * scrollStepRatio));
        nextScrollY = Math.min(currentBottom, window.scrollY + step);
      }

      if (!reachedBottom) markTruncated("scroll_positions");
      const root = document.scrollingElement ?? document.documentElement;
      const fonts: RenderManifest["fonts"] = [];
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
          sources: [],
        });
      }

      window.scrollTo({ top: 0, behavior: "instant" });
      await settle();

      const grouped = new Map<
        string,
        RenderManifest["fonts"][number] & {
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
        // Stylesheet parsing on the host supplies the complete source list.
        sources: [],
      }));

      const pageSize = {
        width: Math.max(root.scrollWidth, window.innerWidth),
        height: Math.max(root.scrollHeight, window.innerHeight),
      };
      const colors = [...colorCounts]
        .sort((left, right) => right[1] - left[1])
        .slice(0, maxColors)
        .map(([color]) => color);
      const stats = {
        scannedPositions,
        omittedRepeatedNodes,
        truncated: truncationReasons.size > 0,
        truncatedBy: [...truncationReasons],
      };

      const styleAbbreviations: Record<string, string> = {
        display: "dsp",
        width: "w",
        height: "h",
        "grid-template-columns": "gtc",
        "grid-template-rows": "gtr",
        "flex-direction": "fld",
        "justify-content": "jc",
        "align-items": "ai",
        "align-content": "ac",
        gap: "gp",
        overflow: "ovf",
        background: "bg",
        "background-color": "bgc",
        "background-image": "bgi",
        "background-clip": "bgcl",
        "-webkit-background-clip": "bgcl",
        "background-size": "bgs",
        "background-position": "bgp",
        color: "c",
        "font-family": "ff",
        "font-size": "fz",
        "font-style": "fst",
        "font-weight": "fw",
        "line-height": "lh",
        "letter-spacing": "ls",
        "text-align": "ta",
        "text-transform": "tt",
        "white-space": "ws",
        border: "bd",
        "border-radius": "bdr",
        "box-shadow": "bxsh",
        "clip-path": "clp",
        "object-fit": "of",
        "object-position": "objp",
        opacity: "op",
        transform: "trf",
      };
      const styleRecord = (styleId: string) => {
        return baseStyleRecords.get(styleId) ?? {};
      };
      const compactStyleCache = new Map<string, Record<string, string>>();
      const compactStyle = (styleId: string) => {
        const cached = compactStyleCache.get(styleId);
        if (cached) return cached;
        const style: Record<string, string> = {};
        for (const [property, propertyValue] of Object.entries(
          styleRecord(styleId),
        )) {
          const abbreviated = styleAbbreviations[property];
          if (!abbreviated) continue;
          if (abbreviated === "bgcl" && style.bgcl) continue;
          style[abbreviated] = propertyValue;
        }
        compactStyleCache.set(styleId, style);
        return style;
      };
      const styleTableEntries: Record<string, string>[] = [];
      const styleTableIndexes = new Map<string, number>();
      const internStyle = (style: Record<string, string>) => {
        const key = JSON.stringify(style);
        const existing = styleTableIndexes.get(key);
        if (existing !== undefined) return existing;
        const index = styleTableEntries.length;
        styleTableEntries.push(style);
        styleTableIndexes.set(key, index);
        return index;
      };
      const sectionTags = new Set(["header", "section", "footer"]);
      const headingTags = new Set(["h1", "h2", "h3"]);
      const interactiveTags = new Set([
        "a",
        "button",
        "input",
        "select",
        "textarea",
      ]);
      const pageRegionTags = new Set([
        "body",
        "header",
        "main",
        "section",
        "footer",
      ]);
      const priorityTags = new Set(["h1", "h2", "section"]);

      const sectionNodes: ManifestNode[] = [];
      let firstMain: ManifestNode | undefined;
      for (const node of nodes) {
        if (!firstMain && node.tag === "main") firstMain = node;
        if (sectionTags.has(node.tag)) sectionNodes.push(node);
        if (sectionNodes.length >= 32) break;
      }
      if (sectionNodes.length === 0 && firstMain) sectionNodes.push(firstMain);
      const sectionIds = new Set(sectionNodes.map((node) => node.id));
      const descendantsBySection = new Map<
        number,
        ManifestNode[]
      >();
      for (const node of nodes) {
        let parent = node.parent;
        while (parent !== null && !sectionIds.has(parent)) {
          parent = nodeById(parent)?.parent ?? null;
        }
        if (parent === null) continue;
        const descendants = descendantsBySection.get(parent) ?? [];
        descendants.push(node);
        descendantsBySection.set(parent, descendants);
      }
      const sections = sectionNodes.map((node) => {
        const allNodes = [node, ...(descendantsBySection.get(node.id) ?? [])];
        const assetIds = new Set<string>();
        const segmentIndexes = new Set<number>();
        const headingNodes: ManifestNode[] = [];
        for (const item of allNodes) {
          for (const assetId of item.assets ?? []) assetIds.add(assetId);
          segmentIndexes.add(Math.floor((item.id - 1) / segmentSize));
          if (
            headingNodes.length < 6 &&
            headingTags.has(item.tag) &&
            item.text
          ) {
            headingNodes.push(item);
          }
        }
        const sectionStyle = internStyle(compactStyle(node.style));
        const headings = headingNodes.map((item) => ({
          nodeId: item.id,
          tag: item.tag,
          text: item.text!,
          bounds: item.bounds,
          style: internStyle(compactStyle(item.style)),
        }));
        return {
          nodeId: node.id,
          tag: node.tag,
          bounds: node.bounds,
          heightInViewports:
            Math.round((node.bounds[3] / window.innerHeight) * 100) / 100,
          style: sectionStyle,
          headings,
          assetIds: [...assetIds].slice(0, 30),
          segmentIndexes: [...segmentIndexes].sort((left, right) => left - right),
        };
      });

      const assetPlacements = new Map<
        string,
        CriticalAssetPlacement[]
      >();
      for (const node of nodes) {
        for (const assetId of node.assets ?? []) {
          let placements = assetPlacements.get(assetId);
          if (!placements) {
            placements = [];
            assetPlacements.set(assetId, placements);
          }
          if (placements.length < 6) {
            placements.push({
              nodeId: node.id,
              bounds: node.bounds,
            });
          }
        }
      }
      const assetKindPriority = {
        video: 5,
        poster: 4,
        background: 3,
        mask: 2,
        image: 1,
      } as const;
      const criticalAssets = Object.entries(assets)
        .map(([assetId, asset]) => ({
          assetId,
          kind: asset.kind,
          ...(asset.mediaType ? { mediaType: asset.mediaType } : {}),
          ...(asset.alt ? { alt: asset.alt } : {}),
          ...(asset.intrinsicSize
            ? { intrinsicSize: asset.intrinsicSize }
            : {}),
          placements: assetPlacements.get(assetId) ?? [],
        }))
        .sort((left, right) => {
          const priority =
            assetKindPriority[right.kind] - assetKindPriority[left.kind];
          if (priority !== 0) return priority;
          const leftBounds = left.placements[0]?.bounds;
          const rightBounds = right.placements[0]?.bounds;
          const leftArea = leftBounds ? leftBounds[2] * leftBounds[3] : 0;
          const rightArea = rightBounds ? rightBounds[2] * rightBounds[3] : 0;
          return rightArea - leftArea;
        })
        .slice(0, 40);

      const gradientStyleProperties = new Set<string>([
        "background",
        "background-image",
        "background-clip",
        "-webkit-background-clip",
        "color",
      ]);
      const gradientPattern = /(?:linear|radial|conic)-gradient\(/i;
      const gradientContexts = new Set<
        "text" | "control" | "page" | "surface"
      >();
      const gradientSamples: GradientSample[] = [];
      let gradientNodeCount = 0;
      for (const node of nodes) {
        const style = styleRecord(node.style);
        const gradientEntries = Object.entries(style).filter(
          ([property, propertyValue]) =>
            gradientStyleProperties.has(property) &&
            gradientPattern.test(propertyValue),
        );
        if (gradientEntries.length === 0) continue;
        const textGradient =
          /text/i.test(style["background-clip"] ?? "") ||
          /text/i.test(style["-webkit-background-clip"] ?? "") ||
          /transparent|rgba\([^)]*,\s*0\s*\)/i.test(style.color ?? "");
        const interactive =
          interactiveTags.has(node.tag) ||
          /button|tab|menuitem/i.test(node.role ?? "");
        const pageRegion = pageRegionTags.has(node.tag);
        const context = textGradient
          ? ("text" as const)
          : interactive
            ? ("control" as const)
            : pageRegion
              ? ("page" as const)
              : ("surface" as const);
        gradientNodeCount += 1;
        gradientContexts.add(context);
        if (gradientSamples.length < 12) {
          gradientSamples.push({
            nodeId: node.id,
            tag: node.tag,
            bounds: node.bounds,
            context,
            properties: Object.fromEntries(gradientEntries),
          });
        }
      }
      const criticalAssetIds = new Set(
        criticalAssets.map(({ assetId }) => assetId),
      );
      const prioritySegmentIndexes = new Set<number>();
      for (
        let index = 0;
        index < nodes.length && prioritySegmentIndexes.size < 8;
        index += 1
      ) {
        const node = nodes[index]!;
        if (
          node.assets?.length ||
          priorityTags.has(node.tag)
        ) {
          prioritySegmentIndexes.add(Math.floor(index / segmentSize));
        }
      }
      const prioritySegments = [...prioritySegmentIndexes];
      const requirements: string[] = [];
      if (uniqueFonts.length > 0) {
        requirements.push(
          `Load and use the supplied custom font families: ${[
            ...new Set(uniqueFonts.map((font) => font.family)),
          ].join(", ")}.`,
        );
      }
      if (criticalAssets.length > 0) {
        requirements.push(
          `The screenshots contain ${criticalAssets.length} mapped media roles. Generate only the image and SVG roles selected for the implementation, preserving their visually observed placement.`,
        );
      }
      const supportingAssets: ManifestSummary["assets"] = {};
      for (const [assetId, asset] of Object.entries(assets)) {
        if (criticalAssetIds.has(assetId)) continue;
        supportingAssets[assetId] = {
          kind: asset.kind,
          ...(asset.mediaType ? { mediaType: asset.mediaType } : {}),
          ...(asset.intrinsicSize
            ? { intrinsicSize: asset.intrinsicSize }
            : {}),
        };
      }
      const summary = {
        page: pageSize,
        fidelity: {
          viewportHeight: window.innerHeight,
          styleTable: styleTableEntries.slice(0, 64),
          sections,
          criticalAssets,
          effects: {
            cssGradients: {
              nodeCount: gradientNodeCount,
              contexts: [...gradientContexts],
              samples: gradientSamples,
              guidance:
                "Computed-style evidence is location-specific. Do not turn a page/canvas accent into gradient text, cards, tabs, or controls. Canvas/WebGL pixels may only be inferred from the supplied screenshots.",
            },
          },
          prioritySegments,
          requirements,
        },
        assets: supportingAssets,
        fonts: uniqueFonts.map((font) => ({
          family: font.family,
          style: font.style,
          weight: font.weight,
        })),
        colors,
        stats: {
          ...stats,
          totalNodes: nodes.length,
          totalStyleRules:
            styleIdByValue.size + (styleOverflowed ? 1 : 0),
          segmentSize,
          segmentCount: Math.ceil(nodes.length / segmentSize),
        },
      };

      return {
        manifest: summary,
        fonts: uniqueFonts,
        traversal: {
          pageHeight: pageSize.height,
          viewportHeight: window.innerHeight,
          reachedBottom,
        },
      };
    },
    {
      maxNodes: MAX_MANIFEST_NODES,
      maxStyles: MAX_MANIFEST_STYLES,
      maxAssets: MAX_MANIFEST_ASSETS,
      maxVariants: MAX_NODE_VARIANTS,
      maxScrollPositions: MAX_SCROLL_POSITIONS,
      scrollStepRatio: SCROLL_STEP_RATIO,
      settleMs: MANIFEST_SETTLE_MS,
      maxColors: MAX_DESIGN_VALUES,
      maxFonts: MAX_FONTS,
      captureBinding,
      segmentSize: MANIFEST_SEGMENT_SIZE,
    },
  ).finally(async () => {
    if (captureBinding) {
      await page.removeExposedFunction(captureBinding).catch(() => undefined);
    }
  });

  const stylesheets = typeof responseStylesheets === "function"
    ? await responseStylesheets()
    : responseStylesheets;
  const fontSources = fontSourcesFromStylesheets(stylesheets, page.url());

  const screenshots = finalizeScreenshots(
    captures,
    raw.traversal.pageHeight,
    raw.traversal.viewportHeight,
  );

  return {
    manifest: raw.manifest as ManifestSummary,
    fonts: raw.fonts.map((font) => ({
      ...font,
      sources: [...(fontSources.get(font.family.toLowerCase()) ?? [])],
    })),
    ...(captureOptions
      ? {
        capture: {
          screenshots,
          pageHeight: raw.traversal.pageHeight,
          captureTruncated: !raw.traversal.reachedBottom,
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
  const capturedStylesheets = !localTarget
    ? captureStylesheetResponses(page)
    : {
      read: async () => [] as CapturedStylesheet[],
      dispose: () => undefined,
    };

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
    const renderEvidence = localTarget
      ? null
      : await extractRenderEvidence(
        page,
        () => capturedStylesheets.read(),
        {
          signal: options.signal,
          includeScreenshots: viewportScreenshots,
        },
      );

    const capture = renderEvidence?.capture ?? await loadLazyContent(
      page,
      options.signal,
      viewportScreenshots,
    );
    let fullPage: Screenshot | null = null;
    if (options.includeScreenshots && !options.deep) {
      const pageCapture = await captureFullPage(page);
      fullPage = pageCapture.fullPage;
      capture.screenshots = pageCapture.screenshots;
      capture.captureTruncated = capture.captureTruncated || pageCapture.truncated;
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

    const screenshotsTruncated =
      capture.screenshots.length > requestedScreenshotLimit;
    capture.captureTruncated =
      capture.captureTruncated ||
      (renderEvidence?.manifest.stats.truncated ?? false) ||
      screenshotsTruncated;

    capture.screenshots = selectScreenshots(
      capture.screenshots,
      requestedScreenshotLimit,
    );

    const designProfile = await collectDesignProfile(page).catch(() => null);
    const frameAnalyses = await analyzeFrames(
      context,
      capture.screenshots.map((screenshot) => ({
        bytes: screenshot.bytes,
        scrollY: screenshot.scrollY,
        mimeType: screenshot.mimeType,
      })),
    ).catch(() => [] as FrameAnalysis[]);
    const comparisonFrames = options.comparisonFrames ?? [];
    const comparisons = comparisonFrames.length > 0 && capture.screenshots.length > 0
      ? await composeComparisons(
        context,
        evenlySelectItems(capture.screenshots, Math.min(5, capture.screenshots.length)).map((screenshot) => {
          const reference = comparisonFrames.reduce((best, candidate) =>
            Math.abs(candidate.scrollPercentage - screenshot.scrollPercentage) <
              Math.abs(best.scrollPercentage - screenshot.scrollPercentage)
              ? candidate
              : best,
          comparisonFrames[0]!);
          return {
            left: { bytes: reference.bytes, mimeType: reference.mimeType, label: reference.label },
            right: {
              bytes: screenshot.bytes,
              mimeType: screenshot.mimeType,
              label: `YOUR PREVIEW at ${screenshot.scrollPercentage}%`,
            },
          };
        }),
      )
        .then((images) => images.map((bytes, index) => ({ bytes, label: `comparison-${index + 1}` })))
        .catch(() => [] as Array<{ bytes: Uint8Array; label: string }>)
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
      manifest: renderEvidence?.manifest ?? null,
      referenceFontCatalog: renderEvidence
        ? {
          fonts: renderEvidence.fonts,
        }
        : null,

      diagnostics:
        diagnostics && diagnostics.length > 0
          ? [...diagnostics]
          : null,

      blocked,
      designProfile,
      frameAnalyses,
      comparisons,
    };
  } finally {
    capturedStylesheets.dispose();
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
