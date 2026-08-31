export function normalizeRecoveryEmail(value: string): string {
  return value.trim().toLowerCase();
}

export const MAX_JSON_BODY_BYTES = 1024 * 1024;
export const MAX_MULTIPART_REQUEST_BYTES = 16 * 1024 * 1024;
export const MAX_RAW_EMAIL_BYTES = 25 * 1024 * 1024;

export class RequestInputError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "RequestInputError";
    this.status = status;
  }
}

export function isValidDomain(value: string): boolean {
  const domain = value.trim().toLowerCase();
  if (domain.length < 1 || domain.length > 253 || domain.includes("..")) return false;
  const labels = domain.split(".");
  return labels.length >= 2 && labels.every((label) =>
    label.length >= 1 && label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label),
  );
}

export function isValidEmailAddress(value: string): boolean {
  const normalized = value.trim();
  if (normalized.length > 254) return false;
  const at = normalized.lastIndexOf("@");
  if (at <= 0 || at !== normalized.indexOf("@")) return false;
  const local = normalized.slice(0, at);
  const domain = normalized.slice(at + 1);
  if (local.length > 64 || local.startsWith(".") || local.endsWith(".") || local.includes("..")) return false;
  if (!/^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(local)) return false;
  return isValidDomain(domain);
}

export async function readJsonBody<T = Record<string, unknown>>(
  request: Request,
  maxBytes = MAX_JSON_BODY_BYTES,
): Promise<T> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    const length = Number(declaredLength);
    if (!Number.isFinite(length) || length < 0) throw new RequestInputError("Invalid request length");
    if (length > maxBytes) throw new RequestInputError("Request body is too large", 413);
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > maxBytes) throw new RequestInputError("Request body is too large", 413);
  if (!bytes.byteLength) throw new RequestInputError("Request body is required");
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch {
    throw new RequestInputError("Request body must be valid JSON");
  }
}

export function maskRecoveryEmail(value: string): string {
  const [local = "", domain = ""] = normalizeRecoveryEmail(value).split("@");
  if (!local || !domain) return "••••";
  const visible = local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2);
  return `${visible}${"•".repeat(Math.max(2, local.length - visible.length))}@${domain}`;
}

export function isValidRecoveryEmail(value: string): boolean {
  return isValidEmailAddress(normalizeRecoveryEmail(value));
}

export function isRecent(timestamp: string | null | undefined, windowMs: number, now = Date.now()): boolean {
  if (!timestamp) return false;
  const time = new Date(timestamp).getTime();
  return Number.isFinite(time) && now - time < windowMs;
}

export function isStrongPassword(value: string): boolean {
  return value.length >= 12 && /[A-Za-z]/.test(value) && /\d/.test(value);
}

export function recoveryCode(value: string): string {
  return value.replace(/\D/g, "").slice(0, 6);
}
