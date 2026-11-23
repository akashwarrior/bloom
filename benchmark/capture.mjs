import path from "node:path";

// Shared by bench.mjs and compare.mjs so every page, whichever tool built it, is captured the same way.

export const VIEWPORTS = [
  ["desktop", 1440, 900],
  ["mobile", 390, 844],
];

async function autoScroll(page) {
  await page.evaluate(async () => {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const step = Math.max(240, Math.floor(window.innerHeight * 0.75));
    let y = 0;
    let guard = 0;
    while (y < document.documentElement.scrollHeight && guard < 200) {
      window.scrollTo(0, y);
      await wait(120);
      y += step;
      guard += 1;
    }
    window.scrollTo(0, document.documentElement.scrollHeight);
    await wait(500);
    window.scrollTo(0, 0);
    await wait(200);
  });
}

async function waitForImages(page) {
  await page.evaluate(async () => {
    const pending = [...document.images].filter(
      (image) => !image.complete || image.naturalWidth === 0,
    );
    await Promise.all(
      pending.map(
        (image) =>
          new Promise((resolve) => {
            const done = () => resolve();
            image.addEventListener("load", done, { once: true });
            image.addEventListener("error", done, { once: true });
            setTimeout(done, 10_000);
          }),
      ),
    );
  });
}

export async function capture(browser, url, directory) {
  const results = {};
  for (const [label, width, height] of VIEWPORTS) {
    const page = await browser.newPage();
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      const text = message.text();
      if (text.includes("WebSocket connection") && text.includes("_next/hmr")) return;
      errors.push(text);
    });
    try {
      await page.goto(url, { waitUntil: "networkidle2", timeout: 120_000 });
    } catch {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    }
    await page.evaluate(() => document.fonts.ready);
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    await autoScroll(page);
    await page.waitForNetworkIdle({ idleTime: 500, timeout: 15_000 }).catch(() => undefined);
    await waitForImages(page);
    await new Promise((resolve) => setTimeout(resolve, 500));

    const metrics = await page.evaluate(() => {
      const images = [...document.images];
      return {
        title: document.title,
        description:
          document.querySelector('meta[name="description"]')?.getAttribute("content") ??
          null,
        lang: document.documentElement.lang || null,
        h1: [...document.querySelectorAll("h1")].map(
          (node) => node.textContent?.trim() ?? "",
        ),
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        scrollHeight: document.documentElement.scrollHeight,
        overflow:
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth,
        sections: document.querySelectorAll("section").length,
        links: document.querySelectorAll("a").length,
        images: {
          total: images.length,
          loaded: images.filter((image) => image.complete && image.naturalWidth > 0)
            .length,
          failed: images.filter(
            (image) => image.complete && image.naturalWidth === 0,
          ).length,
          lazy: images.filter((image) => image.loading === "lazy").length,
        },
      };
    });
    await page.screenshot({
      path: path.join(directory, `${label}.png`),
      fullPage: true,
    });
    results[label] = { ...metrics, errors: [...new Set(errors)].slice(0, 10) };
    await page.close();
  }
  return results;
}
