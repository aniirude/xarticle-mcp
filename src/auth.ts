import fs from "node:fs";
import { chromium } from "playwright";
import { CONFIG_DIR, STATE_PATH } from "./paths.js";
import { encrypt, decrypt } from "./crypto.js";

export function hasSession(): boolean {
  return fs.existsSync(STATE_PATH);
}

/** Decrypt the saved Playwright storageState (the logged-in X session). */
export function loadStorageState(): Record<string, unknown> {
  if (!fs.existsSync(STATE_PATH)) {
    throw new Error(
      "No saved X session. Run this once in a terminal:\n  npx -y xarticle-mcp login"
    );
  }
  return JSON.parse(decrypt(fs.readFileSync(STATE_PATH)));
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
 * Interactive, one-time login. Opens a real browser, lets the user sign into X,
 * then captures + encrypts the session. Run from a terminal (not via the MCP client).
 */
export async function login(): Promise<void> {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  console.error("Opening a browser. Log into X (x.com), then come back here.");
  const browser = await chromium.launch({ headless: false });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("https://x.com/login", { waitUntil: "domcontentloaded" });
    await waitForEnter(
      "\nWhen you're fully logged in (you can see your home timeline), press ENTER here to save the session...\n"
    );
    const state = await context.storageState();
    fs.writeFileSync(STATE_PATH, encrypt(JSON.stringify(state)), { mode: 0o600 });
    console.error(`\nSaved encrypted X session to ${STATE_PATH}`);
  } finally {
    await browser.close();
  }
}
