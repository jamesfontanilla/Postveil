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
 * Generates a clean 3-4-3 random character meeting slug (e.g. "x7k-m9pq-w2z")
 * Uses cryptographically secure random bytes with an unambiguous lowercase alphanumeric alphabet.
 */
export function generate343MeetingSlug(): string {
  // Unambiguous lowercase alphabet excluding confusing characters (0, o, 1, l, i)
  const CHARS = "abcdefghjkmnpqrstuvwxyz23456789";
  const getRandChars = (count: number): string => {
    const bytes = new Uint8Array(count);
    crypto.getRandomValues(bytes);
    let result = "";
    for (let i = 0; i < count; i++) {
      result += CHARS[bytes[i] % CHARS.length];
    }
    return result;
  };

  const part1 = getRandChars(3);
  const part2 = getRandChars(4);
  const part3 = getRandChars(3);
  return `${part1}-${part2}-${part3}`;
}

/**
 * Generates meeting slug (defaults to 3-4-3 random characters, e.g. "x7k-m9pq-w2z")
 */
export function generateMeetingSlug(): string {
  return generate343MeetingSlug();
}

/**
 * Generates an end-to-end encrypted room route with a zero-knowledge 256-bit client hash key.
 * The server only sees the roomSlug; the encryption key after '#' never leaves the browser.
 */
export function generateSecureE2EERoom(): { roomSlug: string; encryptionKey: string; fullPath: string } {
  const roomSlug = generate343MeetingSlug();
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
