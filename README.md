# xarticle-mcp

Save an **X (Twitter) Article** to disk as **Obsidian-faithful Markdown** — with images and videos downloaded locally — so it reads in Obsidian the way it reads on X.

One tool: **`xarticle <url>`** → creates `<slug>/<slug>.md` + `images/` (+ `media/` for video) in your working directory, with YAML frontmatter and local, rewritten links.

Works in any MCP client: **Claude Code, Codex, Cursor, Windsurf**, … It fetches with **your own** X session, stored encrypted on your machine.

---

## Requirements

- **Node.js ≥ 18**
- **Google Chrome or Microsoft Edge** installed (Edge ships with Windows). The tool drives your existing browser — no separate browser download.

## Install (one line)

Add this to your MCP client config:

```json
{
  "mcpServers": {
    "xarticle": { "command": "npx", "args": ["-y", "xarticle-mcp"] }
  }
}
```

- **Claude Code** — `.mcp.json` in your project root (or your user MCP config).
- **Codex** — add an MCP server entry with the same `command` + `args`.
- **Cursor / Windsurf / others** — same `command` + `args` in their MCP settings.

> Prefer running straight from source? Use `"args": ["-y", "github:aniirude/xarticle-mcp"]`.

> macOS/Linux use the same config. The tool uses your installed Chrome/Edge; nothing else to install.

## One-time login (paste 2 cookies)

X Articles need your logged-in session. There's no automated login (X rate-limits those), so you paste two session cookies once — they're stored **encrypted** at `~/.xarticle/`.

```bash
npx -y xarticle-mcp login
```

It walks you through it:
1. In a browser logged into X, press **F12**.
2. **Application** tab (Chrome/Edge) or **Storage** (Firefox) → **Cookies** → `https://x.com`.
3. Copy the value of **`auth_token`**, paste, Enter.
4. Copy the value of **`ct0`**, paste, Enter.

Check it anytime with `npx -y xarticle-mcp status`.

*Alternative (no DevTools):* `npx -y xarticle-mcp login --browser` reuses your real Chrome profile — but you must fully quit Chrome first (it can be flaky on Windows).

## Use

In your MCP client, ask:

```
xarticle https://x.com/<user>/status/<id>
```

It writes, in your current working directory:

```
<article-slug>/
  <article-slug>.md     # frontmatter + body, local links
  images/               # 01.jpg, 02.jpg, …  (+ cover)
  media/                # <slug>-01.mp4, …   (videos, when downloadable)
```

- Saves to the directory your MCP client is running in. Pass `outputDir` to override.
- Videos with a direct MP4 are embedded as `![[…mp4]]` (Obsidian renders a player). Stream-only (HLS) videos fall back to a poster image + a link to X.

### Tool input

| field | type | default | notes |
|-------|------|---------|-------|
| `url` | string | — | the X Article/post URL |
| `outputDir` | string | working dir | where to create the folder |
| `imageFormat` | `"original"` \| `"png"` | `original` | `png` re-encodes (needs `sharp`) |

### CLI (handy for testing)

```bash
npx -y xarticle-mcp save <url> [outputDir]   # fetch without an MCP client
npx -y xarticle-mcp status                    # check the saved session
```

## Notes & caveats

- **Personal use.** This automates access with your own session; keep it low-volume. Respect X's Terms.
- **Only what you can see.** Articles your account can't view won't fetch.
- **Obsidian video** embeds (`![[…mp4]]`) render inside an Obsidian vault.
- **X changes its markup.** All X-DOM selectors live in `src/fetchArticle.ts` — the one file to update if extraction drifts.

## Develop

```bash
npm install
npm run build
npm run smoke   # offline: markdown/video conversion + tools/list
```

MIT © aniirude
