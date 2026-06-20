import { openFetchContext } from "./auth.js";

export interface ArticleMeta {
  title: string;
  author?: string;
  handle?: string;
  published?: string;
  cover?: string;
}

export interface FetchResult {
  meta: ArticleMeta;
  html: string;
  sourceUrl: string;
}

/**
 * Load an X Article with the saved session and return the densest content block's
 * HTML plus best-effort metadata. All X-DOM specifics are isolated here — if X
 * changes its markup, this is the only file to adjust.
 */
export async function fetchArticle(sourceUrl: string): Promise<FetchResult> {
  const context = await openFetchContext({ width: 1280, height: 1400 });
  try {
    const page = await context.newPage();
    const capturedVideoUrls = new Set<string>();
    page.on("response", (response) => {
      const url = response.url();
      if (/^https:\/\/video\.twimg\.com\/.+\.(mp4|webm|m3u8|gif)(\?|$)/i.test(url)) {
        capturedVideoUrls.add(url);
      }
    });

    await page.goto(sourceUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});

    // X may finish enough network activity before the longform DOM is mounted.
    // Give client-side rendering a short settle window, then validate below.
    await page.waitForSelector('article[role="article"], [data-testid="longform"]', {
      timeout: 30000,
    });
    await page.waitForTimeout(3000);

    // If X uses blob-backed video elements, attach captured direct media URLs so
    // the Markdown converter can archive them after the page closes.
    await page
      .evaluate((urls) => {
        const queue = [...urls];
        for (const video of Array.from(document.querySelectorAll("video"))) {
          const source = video.querySelector("source");
          const raw =
            video.getAttribute("src") ||
            video.getAttribute("data-src") ||
            source?.getAttribute("src") ||
            source?.getAttribute("data-src") ||
            "";
          if ((!raw || raw.startsWith("blob:")) && queue.length > 0) {
            video.setAttribute("data-src", queue.shift() as string);
          }
        }
      }, Array.from(capturedVideoUrls))
      .catch(() => {});

    const { meta, html } = await page.evaluate(() => {
      const prop = (p: string) =>
        document.querySelector(`meta[property="${p}"]`)?.getAttribute("content") ||
        undefined;
      const name = (n: string) =>
        document.querySelector(`meta[name="${n}"]`)?.getAttribute("content") || undefined;

      // Pick the richest content node among likely article containers.
      const selectors = [
        '[data-testid="longform"]',
        'article[role="article"]',
        'article[data-testid="tweet"]',
        "article",
        '[role="article"]',
      ];
      let bestEl: HTMLElement | null = null;
      let bestLen = 0;
      const seen = new Set<Element>();
      for (const sel of selectors) {
        for (const el of Array.from(document.querySelectorAll(sel))) {
          if (seen.has(el)) continue;
          seen.add(el);
          const len = (el as HTMLElement).innerText?.length ?? 0;
          if (len > bestLen) {
            bestLen = len;
            bestEl = el as HTMLElement;
          }
        }
      }

      const textLines = (bestEl?.innerText || document.body.innerText || "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      const titleFromDocument = document.title.match(/^[^"]+"(.+)"\s*\/\s*X$/)?.[1];
      const titleFromLines = textLines.find(
        (line, index) =>
          index > 0 &&
          !line.startsWith("@") &&
          !/^\d+(\.\d+)?[KMB]?$/.test(line) &&
          line !== "Article" &&
          line !== "Conversation" &&
          line !== "See new posts"
      );
      const title = (titleFromDocument || titleFromLines || prop("og:title") || "X Article")
        .replace(/\s+\/\s+X$/, "")
        .trim();

      const author = textLines.find((line, index) => index < 6 && !line.startsWith("@"));
      const handle = textLines.find((line) => /^@\w{1,15}$/.test(line));
      const published =
        bestEl?.querySelector("time")?.getAttribute("datetime") ||
        document.querySelector("time")?.getAttribute("datetime") ||
        name("article:published_time") ||
        undefined;
      const imgs = Array.from(bestEl?.querySelectorAll("img") || []);
      const coverImg =
        imgs.find((img) => {
          const src = img.getAttribute("src") || img.getAttribute("data-src") || "";
          const href = img.closest("a")?.getAttribute("href") || "";
          return href.includes("/media/") || /pbs\.twimg\.com\/media\//.test(src);
        }) ||
        imgs.find((img) => {
          const src = img.getAttribute("src") || img.getAttribute("data-src") || "";
          return src !== "" && !src.includes("profile_images");
        });
      const cover =
        coverImg?.getAttribute("src") || coverImg?.getAttribute("data-src") || prop("og:image");

      return {
        meta: { title, cover, author, handle, published },
        html: bestEl?.innerHTML || "",
      };
    });

    if (!html || html.length < 40) {
      throw new Error(
        "Could not locate article content. The page may require login (run `xarticle-mcp login`), be unavailable to your account, or X's markup may have changed."
      );
    }

    return { meta, html, sourceUrl };
  } finally {
    await context.browser()?.close();
  }
}
