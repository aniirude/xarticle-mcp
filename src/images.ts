import fs from "node:fs/promises";
import path from "node:path";
import type { ImageRef } from "./toMarkdown.js";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export type ImageFormat = "original" | "png";

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

async function maybePng(buf: Buffer, ext: string, format: ImageFormat): Promise<{ buf: Buffer; ext: string }> {
  if (format !== "png" || ext === "png") return { buf, ext };
  try {
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
): Promise<{ map: Map<string, string>; saved: number }> {
  const map = new Map<string, string>();
  if (images.length === 0) return { map, saved: 0 };
  await fs.mkdir(destDir, { recursive: true });

  let saved = 0;
  let i = 0;
  for (const img of images) {
    i++;
    try {
      const res = await fetch(img.src, { headers: { "User-Agent": UA, Referer: "https://x.com/" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      let buf: Buffer = Buffer.from(await res.arrayBuffer());
      let ext = extFromUrl(img.src, res.headers.get("content-type"));
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
