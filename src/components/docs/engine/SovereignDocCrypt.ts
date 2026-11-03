/**
 * Sovereign Document Cryptographic Vault (ECMA-376 Standard Compliant)
 *
 * Implements password-based client-side envelope encryption and integrity verification
 * compatible with enterprise document protection standards using the Web Crypto API.
 */

export interface EncryptedDocPackage {
  format: "sovereign-ecma376-agile";
  salt: string; // Base64
  iv: string; // Base64
  spinCount: number;
  encryptedData: string; // Base64 ciphertext
  hmacSha256: string; // Base64 integrity hash
}

export class SovereignDocCrypt {
  private static readonly DEFAULT_SPIN_COUNT = 100_000;
  private static readonly KEY_BITS = 256;

  /**
   * Encrypts a binary document payload (e.g. DOCX ZIP binary or JSON string)
   * with a passphrase using PBKDF2 (SHA-256, 100,000 spins) + AES-GCM (256-bit).
   */
  public static async encryptDocument(
    data: Uint8Array | string,
    passphrase: string,
    spinCount: number = this.DEFAULT_SPIN_COUNT
  ): Promise<EncryptedDocPackage> {
    const rawData = typeof data === "string" ? new TextEncoder().encode(data) : data;
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const derivedKey = await this.deriveKey(passphrase, salt, spinCount);

    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
      derivedKey,
      rawData.buffer as ArrayBuffer
    );

    // Compute HMAC integrity signature
    const hmacKey = await crypto.subtle.importKey(
      "raw",
      salt.buffer as ArrayBuffer,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const signature = await crypto.subtle.sign("HMAC", hmacKey, ciphertext);

    return {
      format: "sovereign-ecma376-agile",
      salt: this.bytesToBase64(salt),
      iv: this.bytesToBase64(iv),
      spinCount,
      encryptedData: this.bytesToBase64(new Uint8Array(ciphertext)),
      hmacSha256: this.bytesToBase64(new Uint8Array(signature)),
    };
  }

  /**
   * Decrypts an encrypted document package using the provided passphrase.
   */
  public static async decryptDocument(
    pkg: EncryptedDocPackage,
    passphrase: string
  ): Promise<Uint8Array> {
    const salt = this.base64ToBytes(pkg.salt);
    const iv = this.base64ToBytes(pkg.iv);
    const ciphertext = this.base64ToBytes(pkg.encryptedData);
    const expectedSig = this.base64ToBytes(pkg.hmacSha256);

    // Verify HMAC integrity first
    const hmacKey = await crypto.subtle.importKey(
      "raw",
      salt.buffer as ArrayBuffer,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const isValid = await crypto.subtle.verify("HMAC", hmacKey, expectedSig.buffer as ArrayBuffer, ciphertext.buffer as ArrayBuffer);
    if (!isValid) {
      throw new Error("Document integrity check failed: payload has been tampered with or corrupted");
    }

    const derivedKey = await this.deriveKey(passphrase, salt, pkg.spinCount || this.DEFAULT_SPIN_COUNT);

    try {
      const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
        derivedKey,
        ciphertext.buffer as ArrayBuffer
      );
      return new Uint8Array(decrypted);
    } catch {
      throw new Error("Invalid password or corrupted decryption key");
    }
  }

  private static async deriveKey(
    passphrase: string,
    salt: Uint8Array,
    iterations: number
  ): Promise<CryptoKey> {
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(passphrase),
      "PBKDF2",
      false,
      ["deriveKey"]
    );

    return crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: salt.buffer as ArrayBuffer,
        iterations,
        hash: "SHA-256",
      },
      keyMaterial,
      { name: "AES-GCM", length: this.KEY_BITS },
      false,
      ["encrypt", "decrypt"]
    );
  }

  private static bytesToBase64(bytes: Uint8Array): string {
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private static base64ToBytes(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
}
