import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

export interface ImageRef {
  src: string;
  placeholder: string;
}

export interface MarkdownResult {
  markdown: string;
  images: ImageRef[];
}

function absolutize(src: string, base: string): string {
  try {
    return new URL(src, base).toString();
  } catch {
    return src;
  }
}

/**
 * Convert article HTML to Markdown. Images become `![alt](__XIMG_n__)` placeholders
 * and their absolute URLs are returned so the caller can download them and rewrite
 * the placeholders to local relative paths.
 */
export function htmlToMarkdown(html: string, baseUrl: string): MarkdownResult {
  const td = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
    emDelimiter: "*",
  });
  td.use(gfm);

  const images: ImageRef[] = [];

  td.addRule("xImages", {
    filter: "img",
    replacement: (_content, node) => {
      const el = node as unknown as HTMLImageElement;
      const raw =
        el.getAttribute("src") ||
        el.getAttribute("data-src") ||
        el.getAttribute("data-image-url") ||
        "";
      if (!raw || raw.startsWith("data:")) return "";
      const src = absolutize(raw, baseUrl);
      const placeholder = `__XIMG_${images.length}__`;
      images.push({ src, placeholder });
      const alt = (el.getAttribute("alt") || "").replace(/\n/g, " ").trim();
      return `\n\n![${alt}](${placeholder})\n\n`;
    },
  });

  // Drop interactive/SVG cruft that X sprinkles through the DOM.
  td.remove((node) =>
    ["SCRIPT", "STYLE", "NOSCRIPT", "SVG", "BUTTON"].includes(node.nodeName)
  );

  const markdown = td
    .turndown(html)
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { markdown, images };
}
