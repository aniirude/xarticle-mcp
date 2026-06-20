import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

export interface ImageRef {
  src: string;
  placeholder: string;
}

export interface MediaRef {
  src: string;
  placeholder: string;
}

export interface MarkdownResult {
  markdown: string;
  images: ImageRef[];
  media: MediaRef[];
}

function absolutize(src: string, base: string): string {
  try {
    return new URL(src, base).toString();
  } catch {
    return src;
  }
}

function unwrapLinkedImages(markdown: string): string {
  return markdown.replace(
    /\[\s*\n+\s*(!\[[^\]]*]\([^)]+\))\s*\n+\s*]\([^)]+\)/g,
    "\n\n$1\n\n"
  );
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
  const media: MediaRef[] = [];

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

  td.addRule("xVideos", {
    filter: "video",
    replacement: (_content, node) => {
      const el = node as unknown as HTMLVideoElement;
      const source = el.querySelector("source") as HTMLSourceElement | null;
      const raw =
        el.getAttribute("src") ||
        el.getAttribute("data-src") ||
        source?.getAttribute("src") ||
        source?.getAttribute("data-src") ||
        "";
      const poster = el.getAttribute("poster") || "";

      // X often renders blob-backed videos. Those cannot be downloaded after the
      // page closes, so preserve the poster image if one exists.
      if (!raw || raw.startsWith("blob:") || raw.startsWith("data:")) {
        if (poster && !poster.startsWith("blob:") && !poster.startsWith("data:")) {
          const src = absolutize(poster, baseUrl);
          const placeholder = `__XIMG_${images.length}__`;
          images.push({ src, placeholder });
          return `\n\n![Video poster](${placeholder})\n\n`;
        }
        return "\n\n_[Video unavailable in archive]_\n\n";
      }

      const src = absolutize(raw, baseUrl);
      const placeholder = `__XMEDIA_${media.length}__`;
      media.push({ src, placeholder });
      return `\n\n<video controls src="${placeholder}"></video>\n\n[Open video](${placeholder})\n\n`;
    },
  });

  // Drop interactive/SVG cruft that X sprinkles through the DOM.
  td.remove((node) =>
    ["SCRIPT", "STYLE", "NOSCRIPT", "SVG", "BUTTON"].includes(node.nodeName)
  );

  const rawMarkdown = td
    .turndown(html)
    .replace(/\[\s*(!\[[^\]]*]\([^)]+\))\s*]\([^)]+\)/g, "$1");

  const markdown = unwrapLinkedImages(rawMarkdown)
    .replace(/^#{1,6}\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { markdown, images, media };
}
