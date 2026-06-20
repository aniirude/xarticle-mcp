import crypto from "node:crypto";
import fs from "node:fs";
import { CONFIG_DIR, KEY_PATH } from "./paths.js";

/**
 * Self-contained AES-256-GCM at rest. A random 32-byte key is generated on first
 * use and stored (0600) in ~/.xarticle/key. The key never leaves the machine and
 * is never committed. Encrypted blob layout: [iv(12) | authTag(16) | ciphertext].
 */
function ensureKey(): Buffer {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  if (!fs.existsSync(KEY_PATH)) {
    const key = crypto.randomBytes(32);
    fs.writeFileSync(KEY_PATH, key.toString("base64"), { mode: 0o600 });
    return key;
  }
  return Buffer.from(fs.readFileSync(KEY_PATH, "utf8").trim(), "base64");
}

export function encrypt(plaintext: string): Buffer {
  const key = ensureKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]);
}

export function decrypt(blob: Buffer): string {
  const key = ensureKey();
  const iv = blob.subarray(0, 12);
  const tag = blob.subarray(12, 28);
  const enc = blob.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}
