import fs from "node:fs";
import { chromium, type BrowserContext } from "playwright";
import { CONFIG_DIR, PROFILE_DIR } from "./paths.js";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// Flags that suppress the "automated test software" infobar and the navigator.webdriver signal.
const STEALTH_ARGS = [
  "--disable-blink-features=AutomationControlled",
  "--no-default-browser-check",
];

export function hasSession(): boolean {
  try {
    return fs.existsSync(PROFILE_DIR) && fs.readdirSync(PROFILE_DIR).length > 0;
  } catch {
    return false;
  }
}

/**
 * Launch a persistent browser context backed by ~/.xarticle/chrome-profile.
 * Prefers the real installed Chrome (channel: "chrome") — far less likely to be
 * flagged by X/Google than Playwright's bundled Chromium — and falls back to
 * bundled Chromium if Chrome isn't installed.
 */
export async function openContext(
  headless: boolean,
  viewport: { width: number; height: number } | null = null
): Promise<BrowserContext> {
  fs.mkdirSync(PROFILE_DIR, { recursive: true });
  const opts = {
    headless,
    viewport,
    userAgent: UA,
    locale: "en-US",
    args: STEALTH_ARGS,
  } as const;
  let ctx: BrowserContext;
  try {
    ctx = await chromium.launchPersistentContext(PROFILE_DIR, { ...opts, channel: "chrome" });
  } catch {
    ctx = await chromium.launchPersistentContext(PROFILE_DIR, opts);
  }
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });
  return ctx;
}

function waitForEnter(prompt: string): Promise<void> {
  process.stderr.write(prompt);
  return new Promise((resolve) => {
    const onData = () => {
      process.stdin.pause();
      process.stdin.off("data", onData);
      resolve();
    };
    process.stdin.resume();
    process.stdin.on("data", onData);
  });
}

/**
 * One-time interactive login. Opens real Chrome to x.com; the user signs in
 * (use username + password — Google/Apple SSO is blocked inside controlled
 * browsers). The session persists in the profile dir for headless fetches.
 * Run this from a terminal, not via the MCP client.
 */
export async function login(): Promise<void> {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  console.error(
    [
      "Opening Chrome to x.com.",
      "Tip: sign in with your USERNAME + PASSWORD, not 'Continue with Google/Apple'",
      "(SSO popups are blocked inside automated browsers).",
      "If X says 'login temporarily limited', wait ~15-30 min and run login again.",
      "",
    ].join("\n")
  );
  const ctx = await openContext(false);
  try {
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    await page.goto("https://x.com/login", { waitUntil: "domcontentloaded" });
    await waitForEnter(
      "When you can see your home timeline (logged in), press ENTER here to save the session...\n"
    );
    console.error(`\nSession saved to profile: ${PROFILE_DIR}`);
  } finally {
    await ctx.close();
  }
}
