import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { chromium, type BrowserContext } from "playwright";
import { CONFIG_DIR, KEY_PATH, STATE_PATH } from "./paths.js";
import { encrypt, decrypt } from "./crypto.js";

export function hasSession(): boolean {
  return fs.existsSync(STATE_PATH);
}

export function sessionStatus(): { ok: boolean; message: string } {
  if (!fs.existsSync(STATE_PATH)) {
    return {
      ok: false,
      message:
        "No saved X session found.\n" +
        `  config: ${CONFIG_DIR}\n` +
        "Run one of:\n" +
        "  node dist/server.js login\n" +
        "  node dist/server.js login --cookies",
    };
  }
  try {
    const state = loadStorageState();
    const cookies = Array.isArray(state.cookies) ? state.cookies.length : 0;
    return {
      ok: true,
      message:
        "Saved X session found and decrypted successfully.\n" +
        `  session: ${STATE_PATH}\n` +
        `  key: ${KEY_PATH}\n` +
        `  cookies: ${cookies}`,
    };
  } catch (e) {
    return {
      ok: false,
      message:
        "Saved X session exists, but could not be decrypted.\n" +
        `  session: ${STATE_PATH}\n` +
        `  error: ${(e as Error).message}`,
    };
  }
}

export function loadStorageState(): Record<string, unknown> {
  if (!fs.existsSync(STATE_PATH)) {
    throw new Error("No X session saved. Run once in a terminal:  xarticle-mcp login");
  }
  return JSON.parse(decrypt(fs.readFileSync(STATE_PATH)));
}

function saveStorageState(state: unknown): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(STATE_PATH, encrypt(JSON.stringify(state)), { mode: 0o600 });
}

/** A headless context that REUSES the saved session (no login) to read the article. */
export async function openFetchContext(
  viewport: { width: number; height: number } = { width: 1280, height: 900 }
): Promise<BrowserContext> {
  const storageState = loadStorageState() as never;
  let browser;
  try {
    browser = await chromium.launch({ headless: true, channel: "chrome" });
  } catch {
    browser = await chromium.launch({ headless: true });
  }
  return browser.newContext({ storageState, viewport, locale: "en-US" });
}

// ---------- login: reuse the user's real browser session (no automated login) ----------

function chromeUserDataDir(): string | null {
  const home = os.homedir();
  let dir: string;
  if (process.platform === "win32") {
    dir = path.join(process.env.LOCALAPPDATA || path.join(home, "AppData", "Local"), "Google", "Chrome", "User Data");
  } else if (process.platform === "darwin") {
    dir = path.join(home, "Library", "Application Support", "Google", "Chrome");
  } else {
    dir = path.join(home, ".config", "google-chrome");
  }
  return fs.existsSync(dir) ? dir : null;
}

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) => rl.question(question, (a) => { rl.close(); resolve(a.trim()); }));
}

async function isLoggedIn(page: import("playwright").Page): Promise<boolean> {
  if (/\/(login|i\/flow\/login)/.test(page.url())) return false;
  const el = page
    .locator('[data-testid="AppTabBar_Home_Link"], [aria-label="Home timeline"], [data-testid="SideNav_AccountSwitcher_Button"]')
    .first();
  return (await el.count().catch(() => 0)) > 0;
}

/**
 * Default login: open the user's REAL Chrome profile (already logged into X),
 * capture the session, save it encrypted. No login happens, so X never rate-limits.
 */
export async function login(): Promise<void> {
  const udd = chromeUserDataDir();
  if (!udd) {
    console.error("Chrome profile not found. Use the cookie method instead:\n  the cookie method (re-run the same command, but `login --cookies`)");
    return;
  }
  console.error(
    [
      "Reusing your existing X login (no new sign-in, so X won't rate-limit).",
      "1) Make sure you're logged into X in Chrome.",
      "2) Fully QUIT Chrome (close all windows; check the system tray).",
      "",
    ].join("\n")
  );
  await ask("Press ENTER once Chrome is fully closed...");

  let ctx: BrowserContext;
  try {
    ctx = await chromium.launchPersistentContext(udd, {
      channel: "chrome",
      headless: false,
      args: ["--profile-directory=Default"],
    });
  } catch (e) {
    console.error(
      `\nCouldn't open your Chrome profile (it's usually still running).\n  ${(e as Error).message}\n` +
        "Fully quit Chrome and retry, or use:  the cookie method (re-run the same command, but `login --cookies`)"
    );
    return;
  }

  try {
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    await page.goto("https://x.com/home", { waitUntil: "domcontentloaded" }).catch(() => {});
    await page.waitForTimeout(2500);
    if (!(await isLoggedIn(page))) {
      console.error(
        "\nThis Chrome profile isn't logged into X. Log into x.com in Chrome first, then re-run login.\n" +
          "(If you use a non-Default Chrome profile, use:  the cookie method (re-run the same command, but `login --cookies`))"
      );
      return;
    }
    saveStorageState(await ctx.storageState());
    console.error("\nSaved your X session (encrypted). You can reopen Chrome now.");
  } finally {
    await ctx.close();
  }
}

function makeCookie(name: string, value: string, httpOnly: boolean) {
  return {
    name,
    value,
    domain: ".x.com",
    path: "/",
    expires: Math.floor(Date.now() / 1000) + 365 * 24 * 3600,
    httpOnly,
    secure: true,
    sameSite: "None" as const,
  };
}

/**
 * Fallback login: paste the two X session cookies. Works on any OS/browser and
 * never triggers a login. Get them from a logged-in x.com tab:
 * F12 -> Application -> Cookies -> x.com -> copy `auth_token` and `ct0`.
 */
export async function loginWithCookiesPrompt(): Promise<void> {
  console.error(
    [
      "One-time setup: paste your X session cookies (stored encrypted on this machine).",
      "",
      "In a browser where you're logged into X (x.com):",
      "  1. Press F12 to open DevTools",
      "  2. Open the 'Application' tab (Chrome/Edge) or 'Storage' (Firefox)",
      "  3. Left sidebar: Cookies -> https://x.com",
      "  4. Copy the Value of `auth_token`, paste below, press Enter",
      "  5. Copy the Value of `ct0`, paste below, press Enter",
      "",
      "(Both are just session tokens; nothing else is read. This lasts months.)",
      "",
    ].join("\n")
  );
  const authToken = (await ask("auth_token: ")).replace(/^auth_token[=:]\s*/i, "").trim();
  const ct0 = (await ask("ct0: ")).replace(/^ct0[=:]\s*/i, "").trim();
  if (!authToken || !ct0) {
    console.error("Both auth_token and ct0 are required. Re-run and paste both values.");
    return;
  }
  const state = {
    cookies: [makeCookie("auth_token", authToken, true), makeCookie("ct0", ct0, false)],
    origins: [] as unknown[],
  };
  saveStorageState(state);
  console.error("Saved your X session (encrypted).");
}
