// Best-effort Chromium install for Playwright. Never fail the npm install if it can't.
import { execSync } from "node:child_process";

if (process.env.XARTICLE_SKIP_BROWSER_INSTALL) process.exit(0);

try {
  execSync("npx playwright install chromium", { stdio: "inherit" });
} catch {
  console.error(
    "[xarticle-mcp] Could not auto-install Chromium. Run this once before using the tool:\n" +
      "  npx playwright install chromium"
  );
}
