import fs from "node:fs/promises";
import path from "node:path";
import { normalizeUrl } from "./url.js";
import { fetchArticle } from "./fetchArticle.js";
import { htmlToMarkdown, type ImageRef } from "./toMarkdown.js";
import { downloadImages, type ImageFormat } from "./images.js";

export interface SaveOptions {
  url: string;
  outputDir?: string;
  imageFormat?: ImageFormat;
}

export interface SaveResult {
  title: string;
  dir: string;
  mdPath: string;
  imageCount: number;
}

function slugify(title: string): string {
  const s = title
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return s || `x-article-${Date.now()}`;
}

async function uniqueDir(base: string, slug: string): Promise<string> {
  let dir = path.join(base, slug);
  let n = 2;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await fs.access(dir);
      dir = path.join(base, `${slug}-${n++}`);
    } catch {
      return dir;
    }
  }
}

function yaml(obj: Record<string, string | undefined>): string {
  const lines = ["---"];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === "") continue;
    lines.push(`${k}: ${JSON.stringify(v)}`);
  }
  lines.push("---", "");
  return lines.join("\n");
}

export async function saveArticle(opts: SaveOptions): Promise<SaveResult> {
  const sourceUrl = normalizeUrl(opts.url);
  const outputDir = opts.outputDir || process.cwd();
  const format: ImageFormat = opts.imageFormat || "original";

  const { meta, html } = await fetchArticle(sourceUrl);
  const { markdown, images } = htmlToMarkdown(html, sourceUrl);

  const slug = slugify(meta.title);
  const dir = await uniqueDir(outputDir, slug);
  await fs.mkdir(dir, { recursive: true });

  const coverRef: ImageRef | null = meta.cover
    ? { src: meta.cover, placeholder: "__XIMG_COVER__" }
    : null;
  const allImages = coverRef ? [coverRef, ...images] : images;

  const { map, saved } = await downloadImages(
    allImages,
    path.join(dir, "images"),
    "images",
    format
  );

  let body = markdown;
  for (const [ph, rel] of map) body = body.split(ph).join(rel);

  const frontmatter = yaml({
    title: meta.title,
    author: meta.author,
    handle: meta.handle,
    source_url: sourceUrl,
    published: meta.published,
    fetched: new Date().toISOString(),
    cover: coverRef ? map.get("__XIMG_COVER__") : undefined,
  });

  const coverMd = coverRef ? `![cover](${map.get("__XIMG_COVER__")})\n\n` : "";
  const md = `${frontmatter}# ${meta.title}\n\n${coverMd}${body}\n`;

  const mdPath = path.join(dir, `${slug}.md`);
  await fs.writeFile(mdPath, md, "utf8");

  return { title: meta.title, dir, mdPath, imageCount: saved };
}
