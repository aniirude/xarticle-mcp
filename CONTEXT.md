# xarticle-mcp — Project Context (canonical)

> Single source of truth for any AI assistant working on this tool. The provider files (`CLAUDE.md`, `AGENTS.md`, `GEMINI.md`) are thin loaders that point here.

## What it is
An MCP server (Node/TypeScript, stdio) exposing one tool, `xarticle`, that fetches an X (Twitter) Article and saves it as Obsidian-faithful Markdown + locally downloaded images. Built by Ani (aniirude) as a reusable, publishable tool. Lives in the vault under `Tools/xarticle-mcp/`; published to GitHub + npm so anyone can install with one line.

## How it works
`xarticle <url>` → `saveArticle.ts` orchestrates:
1. `url.ts` normalize/validate the X URL.
2. `fetchArticle.ts` — Playwright (headless Chromium) loads the article with the user's saved X session and extracts the densest content block's HTML + meta (title/author/handle/published/cover). **All X-DOM-specific selectors are isolated here.**
3. `toMarkdown.ts` — Turndown (+gfm) → Markdown; `<img>` become `__XIMG_n__` placeholders, URLs collected.
4. `images.ts` — download images into `images/`; optional PNG via `sharp`; returns placeholder→relative-path map (falls back to remote URL on failure).
5. `saveArticle.ts` — slug, frontmatter, substitute placeholders, write `<slug>/<slug>.md`.

## Auth & secrets
- One-time `xarticle-mcp login` (`auth.ts`) opens a headed browser, user logs into X, captures Playwright `storageState`.
- `crypto.ts` — self-contained AES-256-GCM. Key auto-generated at `~/.xarticle/key` (0600); session at `~/.xarticle/storageState.enc`. Never in repo/cwd, never synced. (Self-contained on purpose — this is a public package, so it does NOT depend on the vault's cryptobox/master.key.)

## Conventions / constraints
- ESM + NodeNext: import with `.js` suffixes. `registerTool(name, {title,description,inputSchema:<ZodRawShape>}, cb)` (SDK ≥1.29). stdio logging via `console.error` only (stdout is JSON-RPC).
- `outputDir` defaults to `process.cwd()` (= the client's launch dir = "where the user is working"); overridable.
- Default `imageFormat:"original"` (Obsidian renders jpg/webp; PNG only re-bloats). `sharp` is an optionalDependency.

## Known risks
X ToS/account risk (authenticated automation); DOM fragility (fix selectors in `fetchArticle.ts`); only fetches what the logged-in account can view.

## Scope
v1 = X Articles only. Deferred: threads/single posts, embedded video, batch URLs, dedupe-on-refetch, auto re-login.

## Verify
`npm run build && npm run smoke` (offline). Live: `xarticle-mcp login` then `xarticle <real url>` → open the folder in Obsidian.
