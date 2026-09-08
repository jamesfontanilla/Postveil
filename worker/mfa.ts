import * as QRCode from "qrcode";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let value = "";
  for (let index = 0; index < bytes.length; index += 0x8000) value += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string): Uint8Array {
  const raw = atob(value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "="));
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes;
}

export function base32Encode(bytes: Uint8Array): string {
  let output = "";
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      output += BASE32_ALPHABET[(buffer >>> bits) & 31];
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(buffer << (5 - bits)) & 31];
  return output;
}

export function base32Decode(value: string): Uint8Array {
  const normalized = value.replace(/[\s=-]/g, "").toUpperCase();
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const character of normalized) {
    const digit = BASE32_ALPHABET.indexOf(character);
    if (digit < 0) throw new Error("Invalid TOTP secret");
    buffer = (buffer << 5) | digit;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >>> bits) & 255);
    }
  }
  return new Uint8Array(bytes);
}

export function generateTotpSecret(): string {
  return base32Encode(crypto.getRandomValues(new Uint8Array(20)));
}

export function totpUri(secret: string, email: string, issuer = "Postveil"): string {
  const label = `${issuer}:${email}`;
  const params = new URLSearchParams({ secret, issuer, algorithm: "SHA1", digits: "6", period: "30" });
  return `otpauth://totp/${encodeURIComponent(label)}?${params.toString()}`;
}

/**
 * Render the provisioning URI locally as SVG so authenticator setup never
 * sends the TOTP secret to an external QR-code service.
 */
export async function totpQrCode(uri: string): Promise<string> {
  return QRCode.toString(uri, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 4,
    width: 256,
    color: { dark: "#132b26", light: "#ffffff" },
  });
}

export async function totpCode(secret: string, timestamp = Date.now()): Promise<string> {
  const counter = Math.floor(timestamp / 1000 / 30);
  const counterBytes = new Uint8Array(8);
  let remaining = counter;
  for (let index = counterBytes.length - 1; index >= 0; index -= 1) {
    counterBytes[index] = remaining & 255;
    remaining = Math.floor(remaining / 256);
  }
  const key = await crypto.subtle.importKey("raw", asArrayBuffer(base32Decode(secret)), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, asArrayBuffer(counterBytes)));
  const offset = digest[digest.length - 1] & 15;
  const binary = ((digest[offset] & 127) << 24) | ((digest[offset + 1] & 255) << 16) | ((digest[offset + 2] & 255) << 8) | (digest[offset + 3] & 255);
  return String(binary % 1_000_000).padStart(6, "0");
}

export function constantTimeEqual(left: string, right: string): boolean {
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  return difference === 0;
}

async function aesKey(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptTotpSecret(encryptionSecret: string, secret: string): Promise<{ iv: string; ciphertext: string }> {
  if (!encryptionSecret.trim()) throw new Error("MFA encryption is not configured");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: asArrayBuffer(iv) }, await aesKey(encryptionSecret), new TextEncoder().encode(secret));
  return { iv: base64UrlEncode(iv), ciphertext: base64UrlEncode(new Uint8Array(ciphertext)) };
}

export async function decryptTotpSecret(encryptionSecret: string, iv: string, ciphertext: string): Promise<string> {
  if (!encryptionSecret.trim()) throw new Error("MFA encryption is not configured");
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: asArrayBuffer(base64UrlDecode(iv)) }, await aesKey(encryptionSecret), asArrayBuffer(base64UrlDecode(ciphertext)));
  return new TextDecoder().decode(plaintext);
}
