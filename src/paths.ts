import os from "node:os";
import path from "node:path";

/** All session/key material lives in the user's home, never in a project or repo. */
export const CONFIG_DIR = path.join(os.homedir(), ".xarticle");
export const KEY_PATH = path.join(CONFIG_DIR, "key");
export const STATE_PATH = path.join(CONFIG_DIR, "storageState.enc");
/** Dedicated, persistent browser profile (keeps the X login; less bot-detectable than a fresh context). */
export const PROFILE_DIR = path.join(CONFIG_DIR, "chrome-profile");
