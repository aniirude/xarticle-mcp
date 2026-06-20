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

interface Mp4Variant {
  url: string;
  bitrate: number;
}

/** Score a video.twimg.com URL by its WxH path token, as a bitrate fallback. */
function resScore(url: string): number {
  const m = url.match(/\/(\d+)x(\d+)\//);
  return m ? Number(m[1]) * Number(m[2]) : 0;
}

/** Recursively pull mp4 entries out of X's GraphQL `video_info.variants` arrays. */
function collectMp4Variants(node: unknown, out: Mp4Variant[]): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) collectMp4Variants(item, out);
    return;
  }
  const obj = node as Record<string, unknown>;
  const variants = obj.variants;
  if (Array.isArray(variants)) {
    for (const v of variants) {
      if (v && typeof v === "object") {
        const vv = v as Record<string, unknown>;
        const url = typeof vv.url === "string" ? vv.url : "";
        const ct = typeof vv.content_type === "string" ? vv.content_type : "";
        if (url && (ct === "video/mp4" || /\.mp4(\?|$)/i.test(url))) {
          out.push({ url, bitrate: typeof vv.bitrate === "number" ? vv.bitrate : resScore(url) });
        }
      }
    }
  }
  for (const key of Object.keys(obj)) collectMp4Variants(obj[key], out);
}

/** One best mp4 per distinct video (group by URL with the resolution token removed). */
function bestMp4sPerVideo(variants: Mp4Variant[]): string[] {
  const best = new Map<string, Mp4Variant>();
  for (const v of variants) {
    const key = v.url.replace(/\/\d+x\d+\//, "/RES/").split("?")[0];
    const cur = best.get(key);
    if (!cur || v.bitrate > cur.bitrate) best.set(key, v);
  }
  return [...best.values()].sort((a, b) => b.bitrate - a.bitrate).map((v) => v.url);
}

/**
 * Load an X Article/post with the saved session and return the densest content
 * block's HTML plus best-effort metadata. All X-DOM specifics are isolated here —
 * if X changes its markup, this is the only file to adjust.
 */
export async function fetchArticle(sourceUrl: string): Promise<FetchResult> {
  const context = await openFetchContext({ width: 1280, height: 1400 });
  try {
    const page = await context.newPage();

    // Collect direct MP4 URLs from network: GraphQL JSON variants (reliable, no
    // playback needed) plus any direct .mp4 responses.
    const mp4Variants: Mp4Variant[] = [];
    page.on("response", async (response) => {
      const url = response.url();
      if (/^https:\/\/video\.twimg\.com\/.+\.mp4(\?|$)/i.test(url)) {
        mp4Variants.push({ url, bitrate: resScore(url) });
        return;
      }
      if (/\/graphql\//.test(url)) {
        const ct = response.headers()["content-type"] || "";
        if (!ct.includes("application/json")) return;
        try {
          collectMp4Variants(await response.json(), mp4Variants);
        } catch {
          /* ignore non-JSON / consumed bodies */
        }
      }
    });

    await page.goto(sourceUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
    await page
      .waitForSelector('article[role="article"], [data-testid="longform"]', { timeout: 30000 })
      .catch(() => {});

    // Wait for the article body to actually populate (avoids generic title / empty body).
    await page
      .waitForFunction(
        () => {
          const sels = [
            '[data-testid="longform"]',
            'article[role="article"]',
            "article",
            '[role="article"]',
          ];
          let best = 0;
          for (const s of sels)
            for (const el of Array.from(document.querySelectorAll(s)))
              best = Math.max(best, (el as HTMLElement).innerText?.length ?? 0);
          return best > 200;
        },
        { timeout: 20000 }
      )
      .catch(() => {});
    await page.waitForTimeout(1500);

    // Attach the best direct MP4 to each blob-backed <video> so the converter can
    // archive a real, playable file after the page closes.
    await page
      .evaluate((urls) => {
        const queue = [...urls];
        for (const video of Array.from(document.querySelectorAll("video"))) {
          const source = video.querySelector("source");
          const raw =
            video.getAttribute("src") ||
            source?.getAttribute("src") ||
            "";
          if (!raw || raw.startsWith("blob:") || raw.startsWith("data:")) {
            if (queue.length > 0) video.setAttribute("data-src", queue.shift() as string);
          }
        }
      }, bestMp4sPerVideo(mp4Variants))
      .catch(() => {});

    const { meta, html } = await page.evaluate(() => {
      const prop = (p: string) =>
        document.querySelector(`meta[property="${p}"]`)?.getAttribute("content") || undefined;
      const name = (n: string) =>
        document.querySelector(`meta[name="${n}"]`)?.getAttribute("content") || undefined;

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

      const heading = bestEl?.querySelector("h1, h2")?.textContent?.trim();
      const titleFromDocument = document.title.match(/^[^"]+"(.+)"\s*\/\s*X$/)?.[1];
      const ogTitle = prop("og:title");
      const ogIsGeneric = !ogTitle || /^X(\s|$)|The Everything App/i.test(ogTitle);
      const titleFromLines = textLines.find(
        (line, index) =>
          index > 0 &&
          line.length > 8 &&
          !line.startsWith("@") &&
          !/^\d+(\.\d+)?[KMB]?$/.test(line) &&
          !["Article", "Conversation", "See new posts"].includes(line)
      );
      const title = (
        titleFromDocument ||
        (!ogIsGeneric ? ogTitle : undefined) ||
        heading ||
        titleFromLines ||
        ogTitle ||
        "X Article"
      )
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
