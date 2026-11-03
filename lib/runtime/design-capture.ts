import "server-only";

import type { BrowserContext, Page } from "puppeteer-core";

import type { DesignProfile, FrameAnalysis } from "@/lib/design/dna";

const FRAME_BANDS = 12;
const ANALYSIS_WIDTH = 240;

/**
 * Reads computed typography evidence from the live DOM. Runs inside the page,
 * so it must stay self-contained.
 */
export async function collectDesignProfile(page: Page): Promise<DesignProfile> {
  return page.evaluate(() => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const firstFamily = (value: string) =>
      (value.split(",")[0] ?? "").replace(/["']/g, "").trim();
    const numeric = (value: string) => {
      const parsed = Number.parseFloat(value);
      return Number.isFinite(parsed) ? parsed : null;
    };
    const visible = (style: CSSStyleDeclaration, rect: DOMRect) =>
      rect.width > 1 &&
      rect.height > 1 &&
      style.visibility !== "hidden" &&
      style.display !== "none" &&
      Number.parseFloat(style.opacity || "1") > 0.05;

    type Info = { style: CSSStyleDeclaration; rect: DOMRect; visible: boolean };
    const infoCache = new Map<Element, Info>();
    const infoFor = (element: Element): Info => {
      let info = infoCache.get(element);
      if (!info) {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        info = { style, rect, visible: visible(style, rect) };
        infoCache.set(element, info);
      }
      return info;
    };

    const textStyles = new Map<string, {
      family: string;
      size: number;
      weight: number;
      transform: string;
      chars: number;
    }>();
    const prominentTexts = new Set<string>();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let scanned = 0;
    while (walker.nextNode() && scanned < 8_000) {
      const node = walker.currentNode;
      const text = (node.textContent ?? "").replace(/\s+/g, " ").trim();
      const element = node.parentElement;
      if (!text || !element || element.closest("script,style,noscript,svg,template")) continue;
      scanned += 1;
      const info = infoFor(element);
      if (!info.visible) continue;
      const size = numeric(info.style.fontSize) ?? 16;
      const weight = Number.parseInt(info.style.fontWeight, 10) || 400;
      const family = firstFamily(info.style.fontFamily);
      const transform = info.style.textTransform || "none";
      const key = `${family}|${Math.round(size)}|${weight}|${transform}`;
      let entry = textStyles.get(key);
      if (!entry) {
        entry = { family, size, weight, transform, chars: 0 };
        textStyles.set(key, entry);
      }
      entry.chars += text.length;
      if (size >= 24 && prominentTexts.size < 60) {
        const block = element.closest("h1,h2,h3,h4,p,a,button,li,div") ?? element;
        const blockText = (block.textContent ?? "").replace(/\s+/g, " ").trim();
        prominentTexts.add((blockText.length <= 200 ? blockText : text).slice(0, 200));
      }
    }

    const fontMetrics: Array<{ family: string; weight: number; lower: number; x: number; cap: number; serif: number }> = [];
    {
      const styles = [...textStyles.values()];
      const display = [...styles].filter((style) => style.chars >= 4).sort((a, b) => b.size - a.size)[0];
      const byChars = [...styles].sort((a, b) => b.chars - a.chars);
      const targets = [display, ...byChars].filter(Boolean).filter(
        (style, index, all) => all.findIndex((other) => other!.family === style!.family && other!.weight === style!.weight) === index,
      ).slice(0, 4);
      const canvas = document.createElement("canvas");
      canvas.width = 600;
      canvas.height = 300;
      const context2d = canvas.getContext("2d", { willReadFrequently: true });
      for (const style of targets) {
        if (!context2d || !style) continue;
        const font = `${style.weight} 100px "${style.family}", sans-serif`;
        context2d.font = font;
        const lower = context2d.measureText("abcdefghijklmnopqrstuvwxyz").width / 2600;
        const x = context2d.measureText("x").actualBoundingBoxAscent / 100;
        const cap = context2d.measureText("H").actualBoundingBoxAscent / 100;
        context2d.clearRect(0, 0, 600, 300);
        context2d.fillStyle = "#000";
        context2d.font = `${style.weight} 200px "${style.family}", sans-serif`;
        context2d.textBaseline = "alphabetic";
        context2d.fillText("I", 100, 250);
        const pixels = context2d.getImageData(0, 0, 600, 300).data;
        const rowWidth = (y: number) => {
          let min = 600;
          let max = -1;
          for (let px = 0; px < 600; px += 1) {
            if (pixels[(y * 600 + px) * 4 + 3]! > 128) {
              min = Math.min(min, px);
              max = Math.max(max, px);
            }
          }
          return max >= min ? max - min + 1 : 0;
        };
        const capTop = 250 - Math.round(cap * 200);
        const middle = rowWidth(Math.round((capTop + 250) / 2));
        const foot = rowWidth(248);
        fontMetrics.push({
          family: style.family,
          weight: style.weight,
          lower: Math.round(lower * 1000) / 1000,
          x: Math.round(x * 1000) / 1000,
          cap: Math.round(cap * 1000) / 1000,
          serif: middle > 0 ? Math.round((foot / middle) * 100) / 100 : 1,
        });
      }
    }

    const headings = [...document.querySelectorAll("h1,h2,h3")]
      .slice(0, 60)
      .flatMap((element) => {
        const info = infoFor(element);
        if (!info.visible) return [];
        return [(element.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 140)];
      });

    let stickyHeaderHeight = 0;
    for (const element of [...document.querySelectorAll("header,nav,div")].slice(0, 2_000)) {
      const info = infoFor(element);
      if (!info.visible) continue;
      if (info.style.position !== "fixed" && info.style.position !== "sticky") continue;
      if (info.rect.top > 4 || info.rect.width < viewportWidth * 0.5 || info.rect.height > viewportHeight * 0.3) continue;
      stickyHeaderHeight = Math.max(stickyHeaderHeight, info.rect.bottom);
    }

    return {
      stickyHeaderHeight: Math.round(stickyHeaderHeight),
      textStyles: [...textStyles.values()]
        .sort((a, b) => b.chars - a.chars)
        .slice(0, 40),
      headings,
      prominentTexts: [...prominentTexts],
      fontMetrics,
    };
  });
}

/**
 * Measures dominant colors per frame and per horizontal band by decoding the
 * screenshots on a canvas in a blank page of the same browser.
 */
export async function analyzeFrames(
  context: BrowserContext,
  frames: Array<{ bytes: Uint8Array; scrollY: number; mimeType: string }>,
): Promise<FrameAnalysis[]> {
  if (frames.length === 0) return [];
  const page = await context.newPage();
  try {
    const results = await page.evaluate(
      async ({ inputs, bands, analysisWidth }) => {
        const hex = (r: number, g: number, b: number) =>
          `#${[r, g, b].map((value) => Math.round(value).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
        const analyses = [];
        for (const input of inputs) {
          const binary = atob(input.data);
          const bytes = new Uint8Array(binary.length);
          for (let index = 0; index < binary.length; index += 1) {
            bytes[index] = binary.charCodeAt(index);
          }
          const bitmap = await createImageBitmap(new Blob([bytes], { type: input.mimeType }));
          const width = analysisWidth;
          const height = Math.max(bands, Math.round((bitmap.height * width) / bitmap.width));
          const canvas = new OffscreenCanvas(width, height);
          const context2d = canvas.getContext("2d", { willReadFrequently: true });
          if (!context2d) throw new Error("Canvas is unavailable");
          context2d.drawImage(bitmap, 0, 0, width, height);
          const pixels = context2d.getImageData(0, 0, width, height).data;

          const dominant = (
            x0: number,
            x1: number,
            y0: number,
            y1: number,
            claimed?: Uint8Array,
          ) => {
            const buckets = new Map<number, { count: number; r: number; g: number; b: number }>();
            let total = 0;
            for (let y = y0; y < y1; y += 1) {
              for (let x = x0; x < x1; x += 1) {
                const pixel = y * width + x;
                if (claimed && claimed[pixel]) continue;
                const offset = pixel * 4;
                const r = pixels[offset]!;
                const g = pixels[offset + 1]!;
                const b = pixels[offset + 2]!;
                const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
                const bucket = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
                bucket.count += 1;
                bucket.r += r;
                bucket.g += g;
                bucket.b += b;
                buckets.set(key, bucket);
                total += 1;
              }
            }
            let best: { count: number; r: number; g: number; b: number } | null = null;
            for (const bucket of buckets.values()) {
              if (!best || bucket.count > best.count) best = bucket;
            }
            if (!best || total === 0) return null;
            const r = best.r / best.count;
            const g = best.g / best.count;
            const b = best.b / best.count;
            let near = 0;
            for (let y = y0; y < y1; y += 1) {
              for (let x = x0; x < x1; x += 1) {
                const pixel = y * width + x;
                if (claimed && claimed[pixel]) continue;
                const offset = pixel * 4;
                if (
                  Math.abs(pixels[offset]! - r) <= 14 &&
                  Math.abs(pixels[offset + 1]! - g) <= 14 &&
                  Math.abs(pixels[offset + 2]! - b) <= 14
                ) {
                  near += 1;
                  if (claimed) claimed[pixel] = 1;
                }
              }
            }
            return { color: hex(r, g, b), share: near / total, r, g, b };
          };

          const bandHeight = height / bands;
          const edge = Math.max(4, Math.round(width * 0.06));
          const bandResults = [];
          for (let band = 0; band < bands; band += 1) {
            const y0 = Math.round(band * bandHeight);
            const y1 = Math.max(y0 + 1, Math.round((band + 1) * bandHeight));
            const whole = dominant(0, width, y0, y1);
            const left = dominant(0, edge, y0, y1);
            const right = dominant(width - edge, width, y0, y1);
            const edgeMatch = left && right &&
              Math.abs(left.r - right.r) <= 18 &&
              Math.abs(left.g - right.g) <= 18 &&
              Math.abs(left.b - right.b) <= 18;
            bandResults.push({
              color: whole?.color ?? "#000000",
              share: whole?.share ?? 0,
              edgeColor: left?.color ?? whole?.color ?? "#000000",
              edgeShare: edgeMatch && left && right ? Math.min(left.share, right.share) : 0,
            });
          }

          const claimed = new Uint8Array(width * height);
          const palette: Array<{ color: string; share: number }> = [];
          for (let index = 0; index < 6; index += 1) {
            const entry = dominant(0, width, 0, height, claimed);
            if (!entry) break;
            const covered: number = palette.reduce((sum, item) => sum + item.share, 0);
            const absoluteShare: number = entry.share * (1 - covered);
            if (absoluteShare < 0.01) break;
            palette.push({ color: entry.color, share: Math.round(absoluteShare * 1000) / 1000 });
          }

          analyses.push({
            height: bitmap.height,
            bands: bandResults,
            palette,
          });
          bitmap.close();
        }
        return analyses;
      },
      {
        inputs: frames.map((frame) => ({
          data: Buffer.from(frame.bytes).toString("base64"),
          mimeType: frame.mimeType,
        })),
        bands: FRAME_BANDS,
        analysisWidth: ANALYSIS_WIDTH,
      },
    );
    return results.map((result, index) => ({
      scrollY: frames[index]!.scrollY,
      ...result,
    }));
  } finally {
    await page.close().catch(() => undefined);
  }
}
