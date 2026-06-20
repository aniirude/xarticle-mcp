/** Normalize an X/Twitter URL: enforce host, drop tracking params/hash. */
export function normalizeUrl(input: string): string {
  let u: URL;
  try {
    u = new URL(input.trim());
  } catch {
    throw new Error(`Not a valid URL: ${input}`);
  }
  const host = u.hostname.replace(/^www\./, "").toLowerCase();
  if (!["x.com", "twitter.com", "mobile.x.com", "mobile.twitter.com"].includes(host)) {
    throw new Error(`Not an X/Twitter URL (host: ${u.hostname})`);
  }
  u.hostname = "x.com";
  u.protocol = "https:";
  u.search = "";
  u.hash = "";
  return u.toString();
}

/** Heuristic: does this look like an X Article (vs a profile/timeline)? */
export function looksLikeArticle(url: string): boolean {
  return /\/(i\/)?article\/|\/status\/\d+/i.test(url);
}
