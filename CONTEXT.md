# xarticle-mcp - Project Context (canonical)

> Single source of truth for any AI assistant working on this tool. The provider files (`CLAUDE.md`, `AGENTS.md`, `GEMINI.md`) are thin loaders that point here.

## What it is
An MCP server (Node/TypeScript, stdio) exposing one tool, `xarticle`, that fetches an X (Twitter) Article and saves it as Obsidian-faithful Markdown with locally downloaded images and media. Built by Ani (aniirude) as a reusable, publishable tool. Lives in the vault under `Tools/xarticle-mcp/`; published to GitHub + npm so anyone can install with one line.

## How it works
`xarticle <url>` -> `saveArticle.ts` orchestrates:
1. `url.ts` normalizes/validates the X URL.
2. `fetchArticle.ts` uses Playwright headless Chromium to load the article with the user's saved X session and extract the densest article block's HTML + meta (title/author/handle/published/cover). All X-DOM-specific selectors are isolated here.
3. `toMarkdown.ts` uses Turndown (+gfm) to produce Markdown. `<img>` elements become `__XIMG_n__` placeholders; `<video>`/`<source>` elements become `__XMEDIA_n__` placeholders rendered as HTML `<video controls>`.
4. `images.ts` downloads images into `images/` and direct video/GIF-video assets into `media/`; optional PNG conversion uses `sharp`. If a download fails, the placeholder falls back to the original remote URL.
5. `saveArticle.ts` slugs, writes frontmatter, substitutes placeholders, and writes `<slug>/<slug>.md`.

## Auth & secrets
- One-time `xarticle-mcp login` (`auth.ts`) opens a headed browser, user logs into X, captures Playwright `storageState`.
- `crypto.ts` is self-contained AES-256-GCM. Key auto-generated at `~/.xarticle/key` (0600); session at `~/.xarticle/storageState.enc`. Never in repo/cwd, never synced. This public package does not depend on the vault's cryptobox/master.key.

## Conventions / constraints
- ESM + NodeNext: import with `.js` suffixes. `registerTool(name, {title,description,inputSchema:<ZodRawShape>}, cb)` (SDK >=1.29). stdio logging via `console.error` only (stdout is JSON-RPC).
- `outputDir` defaults to `process.cwd()` (= the client's launch dir = "where the user is working"); overridable.
- Default `imageFormat:"original"` (Obsidian renders jpg/webp; PNG only re-bloats). `sharp` is an optionalDependency.
- Direct video URLs are saved under `media/` and embedded with `<video controls>`. Blob-backed X videos cannot be downloaded after page close without response interception; keep a poster image or fallback note instead of failing the article.

## Known risks
X ToS/account risk (authenticated automation); DOM fragility (fix selectors in `fetchArticle.ts`); only fetches what the logged-in account can view.

## Scope
v1 = X Articles only, including best-effort direct media downloads for videos/GIF-style video embeds. Deferred: threads/single posts, blob video interception, batch URLs, dedupe-on-refetch, auto re-login.

## Verify
`npm run build && npm run smoke` (offline). Live: `xarticle-mcp login` then `xarticle <real url>` -> open the folder in Obsidian.
