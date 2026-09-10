import crypto from "node:crypto";
import { env } from "../env.js";

// AES-256-GCM at-rest encryption for ADO PATs / Slack tokens stored on Client rows.
// CREDENTIALS_ENCRYPTION_KEY must be a 32-byte key, hex-encoded (64 hex chars).

const ALGO = "aes-256-gcm";

function getKey(): Buffer {
  if (!env.credentialsEncryptionKey) {
    throw new Error(
      "CREDENTIALS_ENCRYPTION_KEY is not set. Generate one with: " +
        `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
    );
  }
  const key = Buffer.from(env.credentialsEncryptionKey, "hex");
  if (key.length !== 32) {
    throw new Error("CREDENTIALS_ENCRYPTION_KEY must decode to exactly 32 bytes (64 hex chars).");
  }
  return key;
}

// Encoded as base64(iv):base64(authTag):base64(ciphertext)
export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(":");
}

export function decryptSecret(encoded: string): string {
  const [ivB64, tagB64, dataB64] = encoded.split(":");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Malformed encrypted secret.");
  }
  const decipher = crypto.createDecipheriv(ALGO, getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}
