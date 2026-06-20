// Offline smoke test: markdown conversion + MCP tools/list. No network / no X session needed.
import assert from "node:assert";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { htmlToMarkdown } from "../dist/toMarkdown.js";

// 1) HTML -> Markdown + image extraction
{
  const html =
    '<h1>Hello</h1><p>Yo <strong>bold</strong> and <em>italic</em></p>' +
    '<img src="https://pbs.twimg.com/media/abc?format=jpg&name=large" alt="pic">';
  const { markdown, images } = htmlToMarkdown(html, "https://x.com/i/article/1");
  assert(markdown.includes("# Hello"), "heading converted");
  assert(markdown.includes("**bold**"), "bold converted");
  assert(images.length === 1, "one image collected");
  assert(markdown.includes(images[0].placeholder), "placeholder present in markdown");
  console.log("markdown conversion: OK");
}

// 2) MCP server lists the xarticle tool over stdio
{
  const transport = new StdioClientTransport({ command: "node", args: ["dist/server.js"] });
  const client = new Client({ name: "smoke", version: "0.0.0" });
  await client.connect(transport);
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name);
  assert(names.includes("xarticle"), "xarticle tool is registered");
  console.log("tools/list: OK ->", names.join(", "));
  await client.close();
}

console.log("ALL SMOKE TESTS PASSED");
