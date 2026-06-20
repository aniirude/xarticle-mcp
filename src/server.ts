#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { saveArticle } from "./saveArticle.js";
import { login, loginWithCookiesPrompt, hasSession } from "./auth.js";

const VERSION = "0.1.0";

async function runServer(): Promise<void> {
  const server = new McpServer({ name: "xarticle-mcp", version: VERSION });

  server.registerTool(
    "xarticle",
    {
      title: "Save X Article to Markdown",
      description:
        "Fetch an X (Twitter) Article and save it as an Obsidian-faithful Markdown file with images downloaded locally. Creates <slug>/<slug>.md + images/ in the working directory (or outputDir). Requires a one-time `xarticle-mcp login`.",
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
                text: "No X session found. Run this once in a terminal first:\n  npx -y xarticle-mcp login",
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
              text: `Saved "${r.title}" → ${r.dir}\n  markdown: ${r.mdPath}\n  images: ${r.imageCount}`,
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
  if (process.argv[2] === "login") {
    if (process.argv[3] === "--cookies") {
      await loginWithCookiesPrompt();
    } else {
      await login();
    }
    process.exit(0);
  }
  await runServer();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
