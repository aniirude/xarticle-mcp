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
  const context = await openFetchContext({ width: 1280, height: 900 });
  try {
    const page = await context.newPage();
    await page.goto(sourceUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});

    // Expand any "Show more" truncation.
    for (const label of ["Show more", "Read more"]) {
      const btn = page.getByRole("button", { name: label }).first();
      if (await btn.count().catch(() => 0)) {
        await btn.click({ timeout: 2000 }).catch(() => {});
      }
    }

    // Wait until meaningful content is present (or time out gracefully).
    await page
      .waitForFunction(() => (document.body?.innerText?.length ?? 0) > 400, null, {
        timeout: 30000,
      })
      .catch(() => {});

    const meta = await page.evaluate(() => {
      const prop = (p: string) =>
        document.querySelector(`meta[property="${p}"]`)?.getAttribute("content") ||
        undefined;
      const name = (n: string) =>
        document.querySelector(`meta[name="${n}"]`)?.getAttribute("content") || undefined;
      const title = (prop("og:title") || document.title || "X Article").replace(
        /\s+\/\s+X$/,
        ""
      );
      const cover = prop("og:image");
      // Best-effort author/handle from a profile link in the byline.
      let author: string | undefined;
      let handle: string | undefined;
      const userLink = document.querySelector(
        'a[role="link"][href^="/"] [dir] span, [data-testid="User-Name"] a'
      );
      if (userLink && userLink.textContent) author = userLink.textContent.trim();
      const handleEl = Array.from(document.querySelectorAll("span")).find((s) =>
        /^@\w{1,15}$/.test(s.textContent?.trim() || "")
      );
      if (handleEl) handle = handleEl.textContent?.trim();
      const published =
        document.querySelector("time")?.getAttribute("datetime") ||
        name("article:published_time") ||
        undefined;
      return { title, cover, author, handle, published };
    });

    // Pick the richest content node among likely article containers.
    const html = await page.evaluate(() => {
      const selectors = [
        '[data-testid="longform"]',
        'article[role="article"]',
        "article",
        '[role="article"]',
        "main",
      ];
      let bestHtml = "";
      let bestLen = 0;
      const seen = new Set<Element>();
      for (const sel of selectors) {
        for (const el of Array.from(document.querySelectorAll(sel))) {
          if (seen.has(el)) continue;
          seen.add(el);
          const len = (el as HTMLElement).innerText?.length ?? 0;
          if (len > bestLen) {
            bestLen = len;
            bestHtml = (el as HTMLElement).innerHTML;
          }
        }
      }
      return bestHtml;
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
