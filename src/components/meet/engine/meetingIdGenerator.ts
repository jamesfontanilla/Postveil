/**
 * Sovereign Meeting ID & Slug Generator
 * Deterministic & Cryptographic 3-Tier Meeting Generation for P-Meet
 */

const ADJECTIVES = [
  "swift", "sovereign", "zen", "prism", "vortex", "silent", "astral", "solar",
  "aurora", "kinetic", "stellar", "quantum", "lunar", "crystal", "ember", "radiant",
  "noble", "mystic", "aether", "vernal", "hyper", "cosmic", "titan", "spectral"
];

const NOUNS = [
  "falcon", "orbit", "beacon", "summit", "pulse", "matrix", "haven", "citadel",
  "glade", "harbor", "vector", "strata", "nexus", "canyon", "spire", "forge",
  "pinnacle", "bastion", "zenith", "crest", "sanctuary", "odyssey", "realm", "solace"
];

const VERBS = [
  "glide", "flow", "mesh", "spark", "drift", "shift", "leap", "glow",
  "climb", "surge", "soar", "bloom", "trace", "pulse", "craft", "stride",
  "rise", "thrive", "shine", "sculpt", "radiate", "unfold", "ignite", "echo"
];

/**
 * Generates an intuitive, memorable 3-word slug (e.g. "swift-zen-orbit")
 */
export function generateMemorableMeetingSlug(): string {
  const getRand = (arr: string[]) => {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return arr[buf[0] % arr.length];
  };

  const adj = getRand(ADJECTIVES);
  const noun = getRand(NOUNS);
  const verb = getRand(VERBS);
  return `${adj}-${noun}-${verb}`;
}

/**
 * Generates an end-to-end encrypted room route with a zero-knowledge 256-bit client hash key.
 * The server only sees the roomSlug; the encryption key after '#' never leaves the browser.
 */
export function generateSecureE2EERoom(): { roomSlug: string; encryptionKey: string; fullPath: string } {
  const roomSlug = generateMemorableMeetingSlug();
  const rawKey = new Uint8Array(32);
  crypto.getRandomValues(rawKey);
  const encryptionKey = Array.from(rawKey, (b) => b.toString(16).padStart(2, "0")).join("");
  return {
    roomSlug,
    encryptionKey,
    fullPath: `room/${roomSlug}#k_${encryptionKey}`,
  };
}

/**
 * Sanitizes and extracts a clean room handle or slug from arbitrary input (URL or raw code)
 */
export function parseMeetingInput(input: string): string {
  let cleaned = input.trim();
  if (cleaned.startsWith("http://") || cleaned.startsWith("https://")) {
    try {
      const url = new URL(cleaned);
      cleaned = url.pathname.replace(/^\/+/, "");
    } catch {
      // Keep as-is if invalid URL
    }
  }
  // Remove leading slashes and hostnames if typed
  cleaned = cleaned.replace(/^meet\.postveil\.me\//i, "");
  cleaned = cleaned.replace(/^room\//i, "");
  // Remove hash if any
  cleaned = cleaned.split("#")[0];
  return cleaned.replace(/[^a-zA-Z0-9\-_/]/g, "").toLowerCase();
}
