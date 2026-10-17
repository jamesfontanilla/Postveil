import { requireSupabase, type Session } from "./supabase";

export class ApiError extends Error {
  status: number;
  payload: Record<string, unknown>;
  constructor(message: string, status: number, payload: Record<string, unknown>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const session = (await requireSupabase().auth.getSession()).data.session;
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: {
      "content-type": "application/json",
      ...(session?.access_token
        ? { authorization: `Bearer ${session.access_token}` }
        : {}),
      ...(init.headers ?? {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new ApiError(payload.error || `Request failed (${response.status})`, response.status, payload);
  return payload as T;
}

export async function apiUpload<T>(path: string, file: File, fields: Record<string, string> = {}): Promise<T> {
  const session = (await requireSupabase().auth.getSession()).data.session;
  const form = new FormData();
  form.append("file", file);
  Object.entries(fields).forEach(([key, value]) => form.append(key, value));
  const response = await fetch(path, {
    method: "POST",
    body: form,
    headers: session?.access_token
      ? { authorization: `Bearer ${session.access_token}` }
      : {},
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(payload.error || `Upload failed (${response.status})`);
  return payload as T;
}

export async function publicApiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
  return payload as T;
}

export async function recordExplicitSignIn(session: Session | null, method: "password" | "oauth" = "password"): Promise<void> {
  if (!session?.access_token) return;
  await fetch("/api/auth/login-event", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ method }),
  }).catch(() => undefined);
}
