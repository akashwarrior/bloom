import "server-only";

import type { BrowserContext, Page } from "puppeteer-core";

import type { DesignProfile, FrameAnalysis } from "@/lib/design/dna";

const FRAME_BANDS = 12;
const ANALYSIS_WIDTH = 240;

/**
 * Reads computed typography, button, card, and layout evidence from the live
 * DOM. Runs inside the page, so it must stay self-contained.
 */
export async function collectDesignProfile(page: Page): Promise<DesignProfile> {
  return page.evaluate(() => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const root = document.scrollingElement ?? document.documentElement;
    const pageHeight = Math.max(root.scrollHeight, viewportHeight);
    const firstFamily = (value: string) =>
      (value.split(",")[0] ?? "").replace(/["']/g, "").trim();
    const numeric = (value: string) => {
      const parsed = Number.parseFloat(value);
      return Number.isFinite(parsed) ? parsed : null;
    };
    const transparent = (value: string) =>
      !value || value === "transparent" || /rgba\([^)]*,\s*0\s*\)$/.test(value);
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
      lineHeight: number | null;
      letterSpacing: number | null;
      transform: string;
      color: string;
      chars: number;
      headingChars: number;
      tags: Set<string>;
    }>();
    const prominentTexts = new Set<string>();
    const parseRgba = (value: string) => {
      const match = /rgba?\(([^)]+)\)/.exec(value);
      if (!match) return null;
      const parts = match[1]!.split(/[\s,/]+/).filter(Boolean).map(Number.parseFloat);
      return { r: parts[0] ?? 0, g: parts[1] ?? 0, b: parts[2] ?? 0, a: parts[3] ?? 1 };
    };
    const luminance = ({ r, g, b }: { r: number; g: number; b: number }) => {
      const channel = (value: number) => {
        const normalized = value / 255;
        return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    };
    const effectiveBackground = (element: Element) => {
      let current: Element | null = element;
      while (current) {
        const style = getComputedStyle(current);
        if (style.backgroundImage && style.backgroundImage !== "none") return null;
        const color = parseRgba(style.backgroundColor);
        if (color && color.a >= 0.9) return color;
        current = current.parentElement;
      }
      return { r: 255, g: 255, b: 255, a: 1 };
    };
    const lowContrast: Array<{ text: string; color: string; background: string; ratio: number; y: number }> = [];
    let lowContrastCount = 0;
    const contrastChecked = new Set<Element>();
    const hex = (color: { r: number; g: number; b: number }) =>
      `#${[color.r, color.g, color.b].map((value) => Math.round(value).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
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
      const heading = element.closest("h1,h2,h3,h4,h5,h6");
      let entry = textStyles.get(key);
      if (!entry) {
        entry = {
          family,
          size,
          weight,
          lineHeight: numeric(info.style.lineHeight),
          letterSpacing: numeric(info.style.letterSpacing),
          transform,
          color: info.style.color,
          chars: 0,
          headingChars: 0,
          tags: new Set(),
        };
        textStyles.set(key, entry);
      }
      entry.chars += text.length;
      if (heading) entry.headingChars += text.length;
      if (!contrastChecked.has(element) && size >= 11) {
        contrastChecked.add(element);
        const foreground = parseRgba(info.style.color);
        const background = foreground && foreground.a >= 0.6 ? effectiveBackground(element) : null;
        if (foreground && background) {
          const lighter = Math.max(luminance(foreground), luminance(background));
          const darker = Math.min(luminance(foreground), luminance(background));
          const ratio = (lighter + 0.05) / (darker + 0.05);
          if (ratio < 2.5) {
            lowContrastCount += 1;
            if (lowContrast.length < 8) {
              lowContrast.push({
                text: text.slice(0, 60),
                color: hex(foreground),
                background: hex(background),
                ratio: Math.round(ratio * 100) / 100,
                y: Math.round(info.rect.top + window.scrollY),
              });
            }
          }
        }
      }
      if (size >= 24 && prominentTexts.size < 60) {
        const block = element.closest("h1,h2,h3,h4,p,a,button,li,div") ?? element;
        const blockText = (block.textContent ?? "").replace(/\s+/g, " ").trim();
        prominentTexts.add((blockText.length <= 200 ? blockText : text).slice(0, 200));
      }
      if (entry.tags.size < 6) entry.tags.add((heading ?? element).tagName.toLowerCase());
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
        return [{
          tag: element.tagName.toLowerCase(),
          text: (element.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 140),
          family: firstFamily(info.style.fontFamily),
          size: numeric(info.style.fontSize) ?? 16,
          weight: Number.parseInt(info.style.fontWeight, 10) || 400,
          transform: info.style.textTransform || "none",
          y: Math.round(info.rect.top + window.scrollY),
        }];
      });

    const buttonGroups = new Map<string, {
      shape: "pill" | "rounded" | "square";
      radius: number;
      height: number;
      background: string | null;
      color: string;
      border: boolean;
      weight: number;
      transform: string;
      count: number;
      firstY: number;
    }>();
    for (const element of [...document.querySelectorAll("a,button,[role=button]")].slice(0, 600)) {
      const info = infoFor(element);
      if (!info.visible) continue;
      const { rect, style } = info;
      if (rect.height < 28 || rect.height > 96 || rect.width < 48 || rect.width > 520) continue;
      const hasFill = !transparent(style.backgroundColor);
      const borderWidth = numeric(style.borderTopWidth) ?? 0;
      const hasBorder = borderWidth > 0 && !transparent(style.borderTopColor);
      if (!hasFill && !hasBorder) continue;
      const radius = numeric(style.borderTopLeftRadius) ?? 0;
      const shape = radius >= rect.height / 2 - 1 ? "pill" : radius >= 4 ? "rounded" : "square";
      const key = `${shape}|${style.backgroundColor}|${Math.round(rect.height / 4)}`;
      const pageY = Math.round(rect.top + window.scrollY);
      const existing = buttonGroups.get(key);
      if (existing) {
        existing.count += 1;
        existing.firstY = Math.min(existing.firstY, pageY);
        continue;
      }
      buttonGroups.set(key, {
        shape,
        radius: shape === "pill" ? 9999 : radius,
        height: rect.height,
        background: hasFill ? style.backgroundColor : null,
        color: style.color,
        border: hasBorder,
        weight: Number.parseInt(style.fontWeight, 10) || 400,
        transform: style.textTransform || "none",
        count: 1,
        firstY: pageY,
      });
    }

    const cardRadii: number[] = [];
    let cardCount = 0;
    let shadowed = 0;
    let bordered = 0;
    for (const element of [...document.querySelectorAll("div,article,li,a,figure,section,aside")].slice(0, 6_000)) {
      const info = infoFor(element);
      if (!info.visible) continue;
      const { rect, style } = info;
      if (rect.width < viewportWidth * 0.14 || rect.width > viewportWidth * 0.72 || rect.height < 120) continue;
      const parent = element.parentElement;
      const parentBackground = parent ? infoFor(parent).style.backgroundColor : "";
      const filled = !transparent(style.backgroundColor) && style.backgroundColor !== parentBackground;
      const hasShadow = style.boxShadow !== "none" && style.boxShadow !== "";
      const hasBorder = (numeric(style.borderTopWidth) ?? 0) > 0 && !transparent(style.borderTopColor);
      if (!filled && !hasShadow && !hasBorder) continue;
      cardCount += 1;
      if (hasShadow) shadowed += 1;
      if (hasBorder) bordered += 1;
      cardRadii.push(numeric(style.borderTopLeftRadius) ?? 0);
    }
    cardRadii.sort((a, b) => a - b);

    const contentWidths = [...document.querySelectorAll("body *")]
      .slice(0, 4_000)
      .flatMap((element) => {
        const info = infoCache.get(element) ?? infoFor(element);
        const maxWidth = numeric(info.style.maxWidth);
        if (!info.visible || maxWidth === null || maxWidth < 600 || maxWidth > 2_400) return [];
        return info.rect.width >= 560 ? [info.rect.width] : [];
      })
      .sort((a, b) => a - b);

    const sections = [...document.querySelectorAll("section,header,footer,main > div,body > div > div")]
      .filter((element) => {
        const info = infoFor(element);
        return info.visible && info.rect.height >= 160 && info.rect.width >= viewportWidth * 0.85;
      });
    const topLevelSections = sections.filter(
      (element) => !sections.some((other) => other !== element && other.contains(element)),
    );

    let stickyHeaderHeight = 0;
    for (const element of [...document.querySelectorAll("header,nav,div")].slice(0, 2_000)) {
      const info = infoFor(element);
      if (!info.visible) continue;
      if (info.style.position !== "fixed" && info.style.position !== "sticky") continue;
      if (info.rect.top > 4 || info.rect.width < viewportWidth * 0.5 || info.rect.height > viewportHeight * 0.3) continue;
      stickyHeaderHeight = Math.max(stickyHeaderHeight, info.rect.bottom);
    }

    const images = [...document.images];
    const h1 = document.querySelector("h1");

    const imageUses = new Map<string, number>();
    for (const image of images) {
      const rect = image.getBoundingClientRect();
      if (!image.currentSrc || rect.width < 120 || rect.height < 120) continue;
      imageUses.set(image.currentSrc, (imageUses.get(image.currentSrc) ?? 0) + 1);
    }
    const [repeatedSrc, repeatedCount] = [...imageUses].sort((a, b) => b[1] - a[1])[0] ?? ["", 0];

    let firstScreenMedia = 0;
    for (const element of [...document.querySelectorAll("img,video,canvas,picture,svg,[style*='url('],section *,header *")].slice(0, 4_000)) {
      const tag = element.tagName.toLowerCase();
      const isMedia = tag === "img" || tag === "video" || tag === "canvas" || tag === "picture" || tag === "svg" ||
        /url\(/.test(getComputedStyle(element).backgroundImage);
      if (!isMedia) continue;
      const rect = element.getBoundingClientRect();
      const top = rect.top + window.scrollY;
      const visibleWidth = Math.max(0, Math.min(rect.right, viewportWidth) - Math.max(rect.left, 0));
      const visibleHeight = Math.max(0, Math.min(top + rect.height, viewportHeight) - Math.max(top, 0));
      firstScreenMedia = Math.max(firstScreenMedia, (visibleWidth * visibleHeight) / (viewportWidth * viewportHeight));
    }

    const emptyCandidates: Element[] = [];
    for (const element of [...document.querySelectorAll("main div, main article, main a, main li, section div, section article, section a, section li")].slice(0, 5_000)) {
      const rect = element.getBoundingClientRect();
      if (rect.width < 240 || rect.height < 160) continue;
      const style = getComputedStyle(element);
      if (style.backgroundImage !== "none" || style.visibility === "hidden" || Number(style.opacity) === 0) continue;
      const painted = (parseRgba(style.backgroundColor)?.a ?? 0) > 0.5 || parseFloat(style.borderTopWidth) > 0 || parseFloat(style.borderTopLeftRadius) > 4;
      if (!painted) continue;
      if (element.querySelector("img,video,canvas,picture,iframe,input,textarea,select,table")) continue;
      if ([...element.querySelectorAll("svg")].some((svg) => svg.getBoundingClientRect().width > 64)) continue;
      if ([...element.querySelectorAll("*")].some((child) => getComputedStyle(child).backgroundImage !== "none")) continue;
      const text = (element.textContent ?? "").replace(/\s+/g, " ").trim();
      if (text.length > 60) continue;
      if ([...element.querySelectorAll("*")].some((child) => parseFloat(getComputedStyle(child).fontSize) >= 40)) continue;
      const mostlyEmpty = [...element.children].every((child) => {
        const box = child.getBoundingClientRect();
        return box.width * box.height < rect.width * rect.height * 0.35;
      });
      if (mostlyEmpty) emptyCandidates.push(element);
    }
    const emptyPanels = emptyCandidates.filter((element) => !emptyCandidates.some((other) => other !== element && element.contains(other)));

    const textOverflow: Array<{ text: string; overflow: number; y: number }> = [];
    let textOverflowCount = 0;
    for (const element of [...document.querySelectorAll("h1,h2,h3,h4,h5,h6,p,li,a,button,span,div")].slice(0, 4_000)) {
      if (![...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim())) continue;
      const style = getComputedStyle(element);
      if (style.display === "inline" || style.overflowX !== "visible" || style.whiteSpace.includes("nowrap")) continue;
      const html = element as HTMLElement;
      if (html.clientWidth === 0 || html.scrollWidth <= html.clientWidth + 2) continue;
      textOverflowCount += 1;
      if (textOverflow.length < 6) {
        textOverflow.push({
          text: (element.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 60),
          overflow: html.scrollWidth - html.clientWidth,
          y: Math.round(element.getBoundingClientRect().top + window.scrollY),
        });
      }
    }

    return {
      viewportWidth,
      viewportHeight,
      pageHeight,
      stickyHeaderHeight: Math.round(stickyHeaderHeight),
      textStyles: [...textStyles.values()]
        .sort((a, b) => b.chars - a.chars)
        .slice(0, 40)
        .map((entry) => ({ ...entry, tags: [...entry.tags] })),
      headings,
      buttons: [...buttonGroups.values()].sort((a, b) => b.count - a.count).slice(0, 8),
      prominentTexts: [...prominentTexts],
      fontMetrics,
      lowContrast: { count: lowContrastCount, examples: lowContrast },
      textOverflow: { count: textOverflowCount, examples: textOverflow },
      firstScreenMedia: Math.round(firstScreenMedia * 100) / 100,
      emptyPanels: {
        count: emptyPanels.length,
        examples: emptyPanels.slice(0, 4).map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            text: (element.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            y: Math.round(rect.top + window.scrollY),
          };
        }),
      },
      repeatedImage: { src: repeatedSrc.replace(/^https?:\/\/[^/]+/, ""), count: repeatedCount },
      cards: {
        count: cardCount,
        radiusMedian: cardRadii.length > 0 ? cardRadii[Math.floor(cardRadii.length / 2)]! : null,
        shadowShare: cardCount > 0 ? shadowed / cardCount : 0,
        borderShare: cardCount > 0 ? bordered / cardCount : 0,
      },
      contentWidth: contentWidths.length > 0 ? contentWidths[Math.floor(contentWidths.length / 2)]! : null,
      sectionCount: topLevelSections.length,
      images: {
        count: images.length,
        broken: images.filter((image) => image.complete && image.currentSrc && image.naturalWidth === 0).length,
      },
      overflowX: Math.max(0, root.scrollWidth - viewportWidth),
      rootFamilies: {
        body: getComputedStyle(document.body).fontFamily,
        h1: h1 ? getComputedStyle(h1).fontFamily : null,
      },
      loadedFontFamilies: [
        ...new Set(
          [...document.fonts]
            .filter((face) => face.status === "loaded")
            .map((face) => face.family.replace(/["']/g, "")),
        ),
      ].slice(0, 20),
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
            width: bitmap.width,
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

/** Renders labeled side-by-side comparison images (left = reference, right = preview). */
export async function composeComparisons(
  context: BrowserContext,
  pairs: Array<{
    left: { bytes: Uint8Array; mimeType: string; label: string };
    right: { bytes: Uint8Array; mimeType: string; label: string };
  }>,
): Promise<Uint8Array[]> {
  if (pairs.length === 0) return [];
  const page = await context.newPage();
  try {
    const encoded = await page.evaluate(
      async ({ inputs }) => {
        const decode = async (data: string, mimeType: string) => {
          const binary = atob(data);
          const bytes = new Uint8Array(binary.length);
          for (let index = 0; index < binary.length; index += 1) {
            bytes[index] = binary.charCodeAt(index);
          }
          return createImageBitmap(new Blob([bytes], { type: mimeType }));
        };
        const outputs: string[] = [];
        for (const input of inputs) {
          const left = await decode(input.left, input.leftType);
          const right = await decode(input.right, input.rightType);
          const paneWidth = 960;
          const paneHeight = Math.round((left.height * paneWidth) / left.width);
          const rightHeight = Math.round((right.height * paneWidth) / right.width);
          const labelHeight = 36;
          const gap = 12;
          const canvas = new OffscreenCanvas(
            paneWidth * 2 + gap,
            Math.max(paneHeight, rightHeight) + labelHeight,
          );
          const context2d = canvas.getContext("2d");
          if (!context2d) throw new Error("Canvas is unavailable");
          context2d.fillStyle = "#111111";
          context2d.fillRect(0, 0, canvas.width, canvas.height);
          context2d.drawImage(left, 0, labelHeight, paneWidth, paneHeight);
          context2d.drawImage(right, paneWidth + gap, labelHeight, paneWidth, rightHeight);
          context2d.fillStyle = "#FFFFFF";
          context2d.font = "600 18px sans-serif";
          context2d.textBaseline = "middle";
          context2d.fillText(input.leftLabel, 12, labelHeight / 2);
          context2d.fillText(input.rightLabel, paneWidth + gap + 12, labelHeight / 2);
          const blob = await canvas.convertToBlob({ type: "image/webp", quality: 0.82 });
          const buffer = new Uint8Array(await blob.arrayBuffer());
          let binary = "";
          for (let index = 0; index < buffer.length; index += 1) {
            binary += String.fromCharCode(buffer[index]!);
          }
          outputs.push(btoa(binary));
          left.close();
          right.close();
        }
        return outputs;
      },
      {
        inputs: pairs.map((pair) => ({
          left: Buffer.from(pair.left.bytes).toString("base64"),
          leftType: pair.left.mimeType,
          leftLabel: pair.left.label,
          right: Buffer.from(pair.right.bytes).toString("base64"),
          rightType: pair.right.mimeType,
          rightLabel: pair.right.label,
        })),
      },
    );
    return encoded.map((value) => new Uint8Array(Buffer.from(value, "base64")));
  } finally {
    await page.close().catch(() => undefined);
  }
}
