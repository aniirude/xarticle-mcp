import { openFetchContext } from "../dist/auth.js";

const url = process.argv[2];
if (!url) {
  console.error("Usage: node scripts/debug-fetch.mjs <x-url>");
  process.exit(2);
}

const context = await openFetchContext({ width: 1280, height: 1400 });
try {
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(3000);

  const data = await page.evaluate(() => {
    const q = (selector) => document.querySelectorAll(selector).length;
    const candidates = Array.from(
      document.querySelectorAll("[data-testid=longform], article[role=article], article, main, [role=article]")
    )
      .map((el, index) => ({
        index,
        tag: el.tagName,
        testid: el.getAttribute("data-testid"),
        role: el.getAttribute("role"),
        textLength: el.innerText?.length ?? 0,
        text: (el.innerText || "").slice(0, 700),
      }))
      .sort((a, b) => b.textLength - a.textLength)
      .slice(0, 10);

    return {
      url: location.href,
      title: document.title,
      bodyText: document.body.innerText.slice(0, 3000),
      counts: {
        longform: q("[data-testid=longform]"),
        articleRole: q("article[role=article]"),
        article: q("article"),
        roleArticle: q("[role=article]"),
        main: q("main"),
        time: q("time"),
        img: q("img"),
      },
      candidates,
    };
  });

  console.log(JSON.stringify(data, null, 2));
} finally {
  await context.browser()?.close();
}
