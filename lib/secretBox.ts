import crypto from "node:crypto";

type CipherPayload = {
  iv: string;
  tag: string;
  ciphertext: string;
};

function getSecret(): Buffer {
  const secret = process.env.MISSION_CONTROL_SECRET;
  if (!secret) {
    throw new Error("MISSION_CONTROL_SECRET is required for secure token storage.");
  }
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptSecret(value: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getSecret(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const payload: CipherPayload = {
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: encrypted.toString("base64"),
  };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
}

export function decryptSecret(payload: string): string {
  const decoded = Buffer.from(payload, "base64").toString("utf8");
  const parsed = JSON.parse(decoded) as CipherPayload;
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getSecret(),
    Buffer.from(parsed.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(parsed.tag, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(parsed.ciphertext, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}
