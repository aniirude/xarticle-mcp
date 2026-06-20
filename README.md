# xarticle-mcp

An MCP server that saves an **X (Twitter) Article** to your disk as **Obsidian-faithful Markdown** with all images downloaded locally — so the article reads in Obsidian the way it reads on X.

One tool: **`xarticle <url>`** → creates `<slug>/<slug>.md` + `images/` in your working directory, with YAML frontmatter and rewritten local image links.

> Works in any MCP client (Claude Code, Codex, Cursor, Windsurf, …). Fetches via an authenticated headless browser using **your own** X session, stored encrypted on your machine.

---

## Install (1 line)

Add to your MCP client config:

```json
{
  "mcpServers": {
    "xarticle": { "command": "npx", "args": ["-y", "xarticle-mcp"] }
  }
}
```

- **Claude Code:** put it in `.mcp.json` (project) or your user MCP config.
- **Codex / Cursor / Windsurf / others:** same `command` + `args` in their MCP config.

> Not published to npm yet? You can run straight from GitHub with the same config but `args: ["-y", "github:aniirude/xarticle-mcp"]`.

On install it runs `playwright install chromium`. If that's skipped, run it once:

```bash
npx playwright install chromium
```

## One-time login

X Articles require a logged-in session. Run this once in a terminal — a browser opens, you log into X, then press Enter:

```bash
npx -y xarticle-mcp login
```

Your session is encrypted (AES-256-GCM) at `~/.xarticle/storageState.enc` with a key in `~/.xarticle/key`. It never leaves your machine and is never committed.

## Use

In your MCP client, just ask:

```
xarticle https://x.com/i/article/...
```

It writes, in your current working directory:

```
<article-slug>/
  <article-slug>.md     # frontmatter + body, local image links
  images/               # 01.jpg, 02.jpg, ... (+ cover)
```

### Tool input

| field | type | default | notes |
|-------|------|---------|-------|
| `url` | string | — | the X Article URL |
| `outputDir` | string | working dir | where to create the folder |
| `imageFormat` | `"original"` \| `"png"` | `original` | `png` re-encodes (needs `sharp`) |

## Caveats

- **Your account / X ToS:** this automates access with your logged-in session. Keep it personal and low-volume; automated access carries some account risk.
- **Only what you can see:** articles your account can't view won't fetch.
- **X markup changes:** extraction selectors live in `src/fetchArticle.ts`; if X changes its DOM, that's the file to update.

## Develop

```bash
npm install
npm run build
npm run smoke      # offline: markdown conversion + tools/list
```

MIT © aniirude
