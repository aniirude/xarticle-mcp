import fs from "node:fs/promises";
import path from "node:path";
import type { ImageRef, MediaRef } from "./toMarkdown.js";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export type ImageFormat = "original" | "png";

interface DownloadResult {
  map: Map<string, string>;
  saved: number;
}

function extFromUrl(url: string, contentType: string | null): string {
  try {
    const u = new URL(url);
    // X media often encodes the format as ?format=jpg&name=large
    const fmt = u.searchParams.get("format");
    if (fmt) return fmt.replace("jpeg", "jpg");
    const m = u.pathname.match(/\.(png|jpe?g|webp|gif)$/i);
    if (m) return m[1].toLowerCase().replace("jpeg", "jpg");
  } catch {
    /* ignore */
  }
  if (contentType?.includes("png")) return "png";
  if (contentType?.includes("webp")) return "webp";
  if (contentType?.includes("gif")) return "gif";
  return "jpg";
}

function extFromMediaUrl(url: string, contentType: string | null): string {
  try {
    const u = new URL(url);
    const fmt = u.searchParams.get("format");
    if (fmt) return fmt.toLowerCase().replace("quicktime", "mov");
    const m = u.pathname.match(/\.(mp4|webm|mov|m4v|gif|m3u8)$/i);
    if (m) return m[1].toLowerCase();
  } catch {
    /* ignore */
  }
  const type = contentType?.toLowerCase() || "";
  if (type.includes("webm")) return "webm";
  if (type.includes("quicktime")) return "mov";
  if (type.includes("gif")) return "gif";
  if (type.includes("mpegurl") || type.includes("m3u8")) return "m3u8";
  return "mp4";
}

async function fetchBuffer(url: string): Promise<{ buf: Buffer; contentType: string | null }> {
  const u = new URL(url);
  if (!["http:", "https:"].includes(u.protocol)) {
    throw new Error(`Unsupported URL protocol: ${u.protocol}`);
  }
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Referer: "https://x.com/" },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return { buf: Buffer.from(await res.arrayBuffer()), contentType: res.headers.get("content-type") };
}

async function maybePng(buf: Buffer, ext: string, format: ImageFormat): Promise<{ buf: Buffer; ext: string }> {
  if (format !== "png" || ext === "png") return { buf, ext };
  try {
    // sharp is an optional add-on (`npm i sharp`); not a declared dependency.
    // @ts-expect-error optional, possibly-absent module
    const sharp = (await import("sharp")).default;
    return { buf: await sharp(buf).png().toBuffer(), ext: "png" };
  } catch {
    // sharp is an optional dependency; if absent, keep the original format.
    console.error("[xarticle-mcp] sharp not installed; keeping original image format. (npm i sharp to enable PNG)");
    return { buf, ext };
  }
}

/**
 * Download each referenced image into `destDir`. Returns a map of placeholder ->
 * relative markdown path (e.g. "images/01.jpg"). On failure for a given image, the
 * placeholder maps to the original remote URL so the article still renders.
 */
export async function downloadImages(
  images: ImageRef[],
  destDir: string,
  relPrefix: string,
  format: ImageFormat
): Promise<DownloadResult> {
  const map = new Map<string, string>();
  if (images.length === 0) return { map, saved: 0 };
  await fs.mkdir(destDir, { recursive: true });

  let saved = 0;
  let i = 0;
  for (const img of images) {
    i++;
    try {
      let { buf, contentType } = await fetchBuffer(img.src);
      let ext = extFromUrl(img.src, contentType);
      ({ buf, ext } = await maybePng(buf, ext, format));
      const name = `${String(i).padStart(2, "0")}.${ext}`;
      await fs.writeFile(path.join(destDir, name), buf);
      map.set(img.placeholder, `${relPrefix}/${name}`);
      saved++;
    } catch (e) {
      console.error(`[xarticle-mcp] image ${i} failed (${img.src}): ${(e as Error).message}`);
      map.set(img.placeholder, img.src); // fall back to remote URL
    }
  }
  return { map, saved };
}

/**
 * Download each referenced video/GIF-style media asset into `destDir`. The
 * Markdown uses HTML video tags, so placeholders map to paths like
 * "media/01.mp4". If a media URL cannot be downloaded, keep the original URL.
 */
export async function downloadMedia(
  media: MediaRef[],
  destDir: string,
  namePrefix: string
): Promise<DownloadResult> {
  const map = new Map<string, string>();
  if (media.length === 0) return { map, saved: 0 };
  await fs.mkdir(destDir, { recursive: true });

  let saved = 0;
  let i = 0;
  for (const item of media) {
    i++;
    try {
      const { buf, contentType } = await fetchBuffer(item.src);
      const ext = extFromMediaUrl(item.src, contentType);
      // Unique, vault-resolvable basename so Obsidian `![[name]]` embeds work.
      const name = `${namePrefix}-${String(i).padStart(2, "0")}.${ext}`;
      await fs.writeFile(path.join(destDir, name), buf);
      map.set(item.placeholder, name); // basename for the wikilink embed
      saved++;
    } catch (e) {
      console.error(`[xarticle-mcp] media ${i} failed (${item.src}): ${(e as Error).message}`);
      map.set(item.placeholder, item.src); // remote URL -> rendered as a link
    }
  }
  return { map, saved };
}
