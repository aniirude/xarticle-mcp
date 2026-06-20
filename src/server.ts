#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { saveArticle } from "./saveArticle.js";
import { login, loginWithCookiesPrompt, hasSession, sessionStatus } from "./auth.js";

const VERSION = "0.1.0";

async function runServer(): Promise<void> {
  const server = new McpServer({ name: "xarticle-mcp", version: VERSION });

  server.registerTool(
    "xarticle",
    {
      title: "Save X Article to Markdown",
      description:
        "Fetch an X (Twitter) Article and save it as an Obsidian-faithful Markdown file with images and media downloaded locally. Creates <slug>/<slug>.md + images/ + media/ in the working directory (or outputDir). Requires a one-time `xarticle-mcp login`.",
      inputSchema: {
        url: z.string().describe("The X Article URL (x.com/...)"),
        outputDir: z
          .string()
          .optional()
          .describe("Where to create the article folder. Defaults to the current working directory."),
        imageFormat: z
          .enum(["original", "png"])
          .optional()
          .describe('Image format on disk. "original" (default) keeps jpg/webp; "png" re-encodes (needs sharp).'),
      },
    },
    async ({ url, outputDir, imageFormat }) => {
      try {
        if (!hasSession()) {
          return {
            content: [
              {
                type: "text",
                text:
                  "No X session found. Run this once in a terminal first:\n" +
                  "  xarticle-mcp login\n\n" +
                  "If you are running from the local project before npm publish:\n" +
                  "  node dist/server.js login",
              },
            ],
            isError: true,
          };
        }
        const r = await saveArticle({ url, outputDir, imageFormat });
        return {
          content: [
            {
              type: "text",
              text: [
                `Saved "${r.title}" -> ${r.dir}`,
                `  markdown: ${r.mdPath}`,
                `  images: ${r.imageCount}`,
                `  media: ${r.mediaCount}`,
              ].join("\n"),
            },
          ],
        };
      } catch (e) {
        return {
          content: [{ type: "text", text: `xarticle failed: ${(e as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`xarticle-mcp v${VERSION} running (stdio)`);
}

async function main(): Promise<void> {
  if (process.argv[2] === "status") {
    const status = sessionStatus();
    console.error(status.message);
    process.exit(status.ok ? 0 : 1);
  }
  if (process.argv[2] === "login") {
    // Default = cookie paste (reliable on every OS/account). `--browser` reuses
    // your real Chrome profile (no DevTools, but needs Chrome fully quit).
    if (process.argv[3] === "--browser") {
      await login();
    } else {
      await loginWithCookiesPrompt();
    }
    process.exit(0);
  }
  if (process.argv[2] === "save" || process.argv[2] === "fetch") {
    const url = process.argv[3];
    if (!url) {
      console.error("Usage: xarticle-mcp save <url> [outputDir]");
      process.exit(1);
    }
    const r = await saveArticle({ url, outputDir: process.argv[4] });
    console.error(
      `Saved "${r.title}" -> ${r.dir}\n  images: ${r.imageCount}\n  media: ${r.mediaCount}`
    );
    process.exit(0);
  }
  await runServer();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
