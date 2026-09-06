type JsonRecord = Record<string, unknown>;

export type D1User = {
  id: string;
  email: string;
  user_metadata: JsonRecord;
  status: string;
  last_sign_in_at: string | null;
  email_verified_at?: string | null;
  locked_until?: string | null;
};

export type D1Session = {
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
  expires_in: number;
  user: D1User;
};

type D1Env = { DB: D1Database };
type StoredRecord = { table_name: string; record_id: string; data: string; created_at: string; updated_at: string };
type Row = JsonRecord & { id: string };

const SESSION_SECONDS = 60 * 60 * 24 * 30;

function isStrongPassword(password: string): boolean {
  return password.length >= 12 && /[A-Za-z]/.test(password) && /\d/.test(password);
}

function now(): string {
  return new Date().toISOString();
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function parseJson(value: string): JsonRecord {
  try { return asRecord(JSON.parse(value)); } catch { return {}; }
}

function encode(bytes: Uint8Array): string {
  let value = "";
  for (let index = 0; index < bytes.length; index += 0x8000) value += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decode(value: string): Uint8Array {
  const raw = atob(value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "="));
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes;
}

function equalValue(left: unknown, right: string): boolean {
  if (left === null || left === undefined) return right === "null";
  if (typeof left === "boolean") return String(left) === right || (left && right === "1") || (!left && right === "0");
  if (Array.isArray(left) || (typeof left === "object" && left !== null)) return JSON.stringify(left) === right;
  return String(left) === right;
}

function wildcardMatch(value: unknown, pattern: string): boolean {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`, "i").test(String(value ?? ""));
}

function splitList(value: string): string[] {
  const inner = value.startsWith("(") && value.endsWith(")") ? value.slice(1, -1) : value;
  return inner.split(",").map((item) => item.trim()).filter(Boolean);
}

function matchFilter(row: Row, field: string, expression: string): boolean {
  const value = row[field];
  if (expression === "is.null") return value === null || value === undefined;
  if (expression === "not.is.null") return value !== null && value !== undefined;
  const not = expression.startsWith("not.");
  const normalized = not ? expression.slice(4) : expression;
  const dot = normalized.indexOf(".");
  const operator = dot === -1 ? "eq" : normalized.slice(0, dot);
  const operand = dot === -1 ? normalized : normalized.slice(dot + 1);
  let result = false;
  if (operator === "eq") result = equalValue(value, operand);
  else if (operator === "neq") result = !equalValue(value, operand);
  else if (operator === "in") result = splitList(operand).some((item) => equalValue(value, item));
  else if (operator === "ilike" || operator === "like") result = wildcardMatch(value, operand);
  else if (operator === "gt" || operator === "gte" || operator === "lt" || operator === "lte") {
    const left = typeof value === "number" ? value : Date.parse(String(value ?? "")) || Number(value);
    const right = Date.parse(operand) || Number(operand);
    if (operator === "gt") result = left > right;
    if (operator === "gte") result = left >= right;
    if (operator === "lt") result = left < right;
    if (operator === "lte") result = left <= right;
  } else if (operator === "cs") {
    const expected = splitList(operand);
    result = Array.isArray(value) ? expected.every((item) => value.some((entry) => equalValue(entry, item))) : String(value ?? "").includes(operand);
  }
  return not ? !result : result;
}

function matchBooleanExpression(row: Row, key: string, value: string): boolean {
  const expressions = splitList(value);
  if (key === "or") return expressions.some((entry) => {
    const index = entry.indexOf(".");
    return index > 0 && matchFilter(row, entry.slice(0, index), entry.slice(index + 1));
  });
  if (key === "and") return expressions.every((entry) => {
    const index = entry.indexOf(".");
    return index > 0 && matchFilter(row, entry.slice(0, index), entry.slice(index + 1));
  });
  return true;
}

function selectedRow(row: Row, select: string | null): JsonRecord {
  if (!select || select === "*") return { ...row };
  const output: JsonRecord = {};
  for (const field of select.split(",").map((item) => item.trim()).filter(Boolean)) {
    const normalized = field.replace(/\(.*\)$/, "");
    if (normalized) output[normalized] = row[normalized];
  }
  return output;
}

function uniqueFields(table: string, params: URLSearchParams): string[] {
  const explicit = params.get("on_conflict");
  if (explicit) return explicit.split(",").map((field) => field.trim()).filter(Boolean);
  const known: Record<string, string[]> = {
    profiles: ["id"], user_settings: ["owner_id"], mailbox_admin_settings: ["mailbox_id"],
    organization_members: ["organization_id", "user_id"], email_provider_configs: ["organization_id", "provider"],
    domain_reputation: ["organization_id", "domain"], organization_group_members: ["group_id", "member_email"],
    auto_replies: ["owner_id", "mailbox_id"], integrations: ["owner_id", "provider"], spam_feedback: ["owner_id", "message_id"],
    message_labels: ["message_id", "label_id"], mailbox_delegations: ["mailbox_id", "member_id"],
    suppression_entries: ["organization_id", "email"],
  };
  return known[table] || [];
}

async function loadRows(env: D1Env, table: string): Promise<Row[]> {
  const result = await env.DB.prepare("SELECT record_id, data FROM pv_records WHERE table_name = ?1").bind(table).all<{ record_id: string; data: string }>();
  return (result.results || []).map((record) => ({ ...parseJson(record.data), id: record.record_id }));
}

function filterRows(rows: Row[], params: URLSearchParams): Row[] {
  const entries: Array<[string, string]> = [];
  params.forEach((value, key) => entries.push([key, value]));
  const filtered = rows.filter((row) => entries.every(([key, value]) => {
    if (["select", "order", "limit", "offset", "on_conflict"].includes(key)) return true;
    if (key === "or" || key === "and") return matchBooleanExpression(row, key, value);
    return matchFilter(row, key, value);
  }));
  const order = params.get("order");
  if (order) {
    const fields = order.split(",").map((item) => item.trim()).filter(Boolean).reverse();
    for (const entry of fields) {
      const [field, direction] = entry.split(".");
      const sign = direction?.toLowerCase() === "desc" ? -1 : 1;
      filtered.sort((left, right) => {
        const a = left[field]; const b = right[field];
        if (a === b) return 0;
        if (a === null || a === undefined) return direction?.includes("nullslast") ? 1 : -1;
        if (b === null || b === undefined) return direction?.includes("nullslast") ? -1 : 1;
        return (a < b ? -1 : 1) * sign;
      });
    }
  }
  const offset = Math.max(0, Number(params.get("offset") || 0));
  const limit = params.get("limit") === null ? filtered.length : Math.max(0, Number(params.get("limit")) || 0);
  return filtered.slice(offset, offset + limit);
}

async function writeRecord(env: D1Env, table: string, row: Row, createdAt = now()): Promise<void> {
  const payload = JSON.stringify(row);
  await env.DB.prepare("INSERT OR REPLACE INTO pv_records(table_name, record_id, data, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)")
    .bind(table, row.id, payload, createdAt, now()).run();
}

async function deleteRecord(env: D1Env, table: string, id: string): Promise<void> {
  await env.DB.prepare("DELETE FROM pv_records WHERE table_name = ?1 AND record_id = ?2").bind(table, id).run();
}

export async function d1Request<T = unknown>(env: D1Env, path: string, init: RequestInit = {}): Promise<T> {
  const url = new URL(path, "https://d1.local");
  const table = url.pathname.replace(/^\//, "");
  if (!table) throw new Error("D1 table is required");
  const params = url.searchParams;
  const method = String(init.method || "GET").toUpperCase();
  const prefer = String(new Headers(init.headers).get("prefer") || "");
  if (method === "GET") {
    const rows = filterRows(await loadRows(env, table), params);
    return rows.map((row) => selectedRow(row, params.get("select"))) as T;
  }
  const parsed = init.body ? JSON.parse(String(init.body)) as unknown : {};
  const records = Array.isArray(parsed) ? parsed.map(asRecord) : [asRecord(parsed)];
  if (method === "POST") {
    const rows: Row[] = [];
    const existing = await loadRows(env, table);
    for (const input of records) {
      const unique = uniqueFields(table, params);
      const conflict = unique.length ? existing.find((row) => unique.every((field) => equalValue(row[field], String(input[field] ?? "")))) : undefined;
      const row = { ...(conflict || {}), ...input, id: String(input.id || conflict?.id || crypto.randomUUID()) } as Row;
      if (!row.created_at) row.created_at = now();
      row.updated_at = String(row.updated_at || now());
      await writeRecord(env, table, row, String(conflict?.created_at || row.created_at));
      rows.push(row);
    }
    return prefer.includes("return=representation") ? rows.map((row) => selectedRow(row, params.get("select"))) as T : undefined as T;
  }
  const matched = filterRows(await loadRows(env, table), params);
  if (method === "PATCH") {
    const rows: Row[] = [];
    for (const current of matched) {
      const row = { ...current, ...asRecord(parsed), id: current.id, updated_at: now() } as Row;
      await writeRecord(env, table, row, String(current.created_at || now()));
      rows.push(row);
    }
    return prefer.includes("return=representation") ? rows.map((row) => selectedRow(row, params.get("select"))) as T : undefined as T;
  }
  if (method === "DELETE") {
    await Promise.all(matched.map((row) => deleteRecord(env, table, row.id)));
    return undefined as T;
  }
  throw new Error(`Unsupported D1 request method: ${method}`);
}

export async function d1Probe(env: D1Env): Promise<{ ok: boolean; status: number; detail?: string }> {
  try {
    await env.DB.prepare("SELECT 1 AS ok").first();
    return { ok: true, status: 200 };
  } catch (error) {
    return { ok: false, status: 500, detail: error instanceof Error ? error.message.slice(0, 180) : "D1 probe failed" };
  }
}

async function passwordHash(password: string, salt: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: salt.buffer as ArrayBuffer, iterations: 100_000, hash: "SHA-256" }, key, 256);
  return encode(new Uint8Array(bits));
}

async function tokenHash(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return encode(new Uint8Array(digest));
}

export async function recordD1AuthEvent(env: D1Env, event: {
  userId?: string;
  email: string;
  eventType: string;
  ip?: string;
  userAgent?: string;
}): Promise<void> {
  try {
    await env.DB.prepare("INSERT INTO pv_auth_events(id,user_id,email_hash,event_type,ip_hash,user_agent,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7)")
      .bind(
        crypto.randomUUID(),
        event.userId || null,
        await tokenHash(event.email.trim().toLowerCase()),
        event.eventType,
        event.ip ? await tokenHash(event.ip) : null,
        event.userAgent ? event.userAgent.slice(0, 256) : null,
        now(),
      )
      .run();
  } catch {
    // Authentication must remain available if audit storage is temporarily unavailable.
  }
}

function userFromRow(row: Record<string, unknown>): D1User {
  let metadata: JsonRecord = {};
  try { metadata = asRecord(JSON.parse(String(row.metadata || "{}"))); } catch { metadata = {}; }
  return { id: String(row.id), email: String(row.email), user_metadata: metadata, status: String(row.status || "active"), last_sign_in_at: row.last_sign_in_at ? String(row.last_sign_in_at) : null, email_verified_at: row.email_verified_at ? String(row.email_verified_at) : null, locked_until: row.locked_until ? String(row.locked_until) : null };
}

export async function getUserByEmail(env: D1Env, email: string): Promise<Record<string, unknown> | null> {
  return await env.DB.prepare("SELECT * FROM pv_users WHERE lower(email) = lower(?1) LIMIT 1").bind(email.trim()).first<Record<string, unknown>>();
}

export async function createD1User(env: D1Env, email: string, password: string, displayName = "", options: { emailVerified?: boolean } = {}): Promise<{ user: D1User; session: D1Session }> {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !password) throw new Error("Email and password are required");
  if (!isStrongPassword(password)) throw new Error("Password must be at least 12 characters and include a letter and a number");
  if (await getUserByEmail(env, normalized)) throw new Error("An account with that email already exists");
  const id = crypto.randomUUID();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const createdAt = now();
  await env.DB.prepare("INSERT INTO pv_users(id,email,password_hash,password_salt,display_name,metadata,status,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?6,'active',?7,?7)")
    .bind(id, normalized, await passwordHash(password, salt), encode(salt), displayName || normalized.split("@")[0], JSON.stringify({ display_name: displayName || normalized.split("@")[0] }), createdAt).run();
  if (options.emailVerified) await env.DB.prepare("UPDATE pv_users SET email_verified_at = ?1 WHERE id = ?2").bind(createdAt, id).run();
  const user = userFromRow({ id, email: normalized, status: "active", metadata: JSON.stringify({ display_name: displayName || normalized.split("@")[0] }), email_verified_at: options.emailVerified ? createdAt : null, locked_until: null });
  return { user, session: await createD1Session(env, user) };
}

export async function verifyD1Password(env: D1Env, email: string, password: string, options: { allowUnverified?: boolean } = {}): Promise<{ user: D1User; session: D1Session } | null> {
  const row = await getUserByEmail(env, email);
  if (!row || String(row.status || "active") !== "active") return null;
  if (row.locked_until && Date.parse(String(row.locked_until)) > Date.now()) return null;
  if (!options.allowUnverified && !row.email_verified_at) return null;
  const hash = await passwordHash(password, decode(String(row.password_salt)));
  if (hash !== String(row.password_hash)) return null;
  const signedIn = now();
  await env.DB.prepare("UPDATE pv_users SET last_sign_in_at = ?1, failed_sign_in_count = 0, locked_until = NULL, last_failed_sign_in_at = NULL, updated_at = ?1 WHERE id = ?2").bind(signedIn, String(row.id)).run();
  const user = userFromRow({ ...row, last_sign_in_at: signedIn, failed_sign_in_count: 0, locked_until: null, last_failed_sign_in_at: null });
  return { user, session: await createD1Session(env, user) };
}

/** Records a failed password attempt without disclosing account existence. */
export async function recordD1SignInFailure(env: D1Env, email: string): Promise<{ locked: boolean; lockedUntil: string | null }> {
  const row = await getUserByEmail(env, email);
  if (!row) return { locked: false, lockedUntil: null };
  const nowValue = now();
  const existingLock = row.locked_until ? String(row.locked_until) : null;
  if (existingLock && Date.parse(existingLock) > Date.now()) return { locked: true, lockedUntil: existingLock };
  const recentFailure = row.last_failed_sign_in_at && Date.parse(String(row.last_failed_sign_in_at)) > Date.now() - 15 * 60 * 1000;
  const count = recentFailure ? Number(row.failed_sign_in_count || 0) + 1 : 1;
  const lockedUntil = count >= 5 ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null;
  await env.DB.prepare("UPDATE pv_users SET failed_sign_in_count = ?1, last_failed_sign_in_at = ?2, locked_until = ?3, updated_at = ?2 WHERE id = ?4")
    .bind(count, nowValue, lockedUntil, String(row.id)).run();
  return { locked: Boolean(lockedUntil), lockedUntil };
}

export async function createD1Session(env: D1Env, user: D1User): Promise<D1Session> {
  const token = encode(crypto.getRandomValues(new Uint8Array(32)));
  const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000).toISOString();
  await env.DB.prepare("INSERT INTO pv_sessions(token_hash,user_id,created_at,expires_at,aal,revoked) VALUES (?1,?2,?3,?4,'aal1',0)")
    .bind(await tokenHash(token), user.id, now(), expiresAt).run();
  return { access_token: token, refresh_token: token, token_type: "bearer", expires_in: SESSION_SECONDS, user };
}

export async function userFromToken(env: D1Env, token: string): Promise<D1User | null> {
  if (!token) return null;
  const row = await env.DB.prepare("SELECT u.* FROM pv_sessions s JOIN pv_users u ON u.id = s.user_id WHERE s.token_hash = ?1 AND s.revoked = 0 AND s.expires_at > ?2 LIMIT 1")
    .bind(await tokenHash(token), now()).first<Record<string, unknown>>();
  return row ? userFromRow(row) : null;
}

export async function revokeD1Session(env: D1Env, token: string): Promise<void> {
  if (token) await env.DB.prepare("UPDATE pv_sessions SET revoked = 1 WHERE token_hash = ?1").bind(await tokenHash(token)).run();
}

export async function revokeD1UserSessions(env: D1Env, userId: string): Promise<void> {
  await env.DB.prepare("UPDATE pv_sessions SET revoked = 1 WHERE user_id = ?1").bind(userId).run();
}

export async function listD1Users(env: D1Env): Promise<D1User[]> {
  const result = await env.DB.prepare("SELECT * FROM pv_users ORDER BY created_at ASC LIMIT 1000").all<Record<string, unknown>>();
  return (result.results || []).map(userFromRow);
}

export async function updateD1User(env: D1Env, userId: string, patch: { display_name?: string; metadata?: JsonRecord; status?: string; banned_until?: string | null }): Promise<D1User | null> {
  const current = await env.DB.prepare("SELECT * FROM pv_users WHERE id = ?1 LIMIT 1").bind(userId).first<Record<string, unknown>>();
  if (!current) return null;
  const metadata = patch.metadata ? JSON.stringify(patch.metadata) : String(current.metadata || "{}");
  await env.DB.prepare("UPDATE pv_users SET display_name = ?1, metadata = ?2, status = ?3, banned_until = ?4, updated_at = ?5 WHERE id = ?6")
    .bind(patch.display_name ?? String(current.display_name || ""), metadata, patch.status ?? String(current.status || "active"), patch.banned_until ?? current.banned_until ?? null, now(), userId).run();
  return userFromRow({ ...current, display_name: patch.display_name ?? current.display_name, metadata, status: patch.status ?? current.status, banned_until: patch.banned_until ?? current.banned_until });
}

export async function deleteD1User(env: D1Env, userId: string): Promise<void> {
  await revokeD1UserSessions(env, userId);
  await env.DB.prepare("DELETE FROM pv_users WHERE id = ?1").bind(userId).run();
  await env.DB.prepare("DELETE FROM pv_records WHERE json_extract(data, '$.owner_id') = ?1 OR json_extract(data, '$.user_id') = ?1").bind(userId).run();
}

export async function updateD1Password(env: D1Env, userId: string, password: string): Promise<boolean> {
  if (!isStrongPassword(password)) return false;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const result = await env.DB.prepare("UPDATE pv_users SET password_hash = ?1, password_salt = ?2, updated_at = ?3 WHERE id = ?4")
    .bind(await passwordHash(password, salt), encode(salt), now(), userId).run();
  await revokeD1UserSessions(env, userId);
  return Number(result.meta?.changes || 0) > 0;
}

function randomPasswordResetToken(): string {
  return encode(crypto.getRandomValues(new Uint8Array(32)));
}

export async function createD1PasswordResetToken(env: D1Env, userId: string): Promise<string> {
  const token = randomPasswordResetToken();
  const nowValue = now();
  await env.DB.prepare("DELETE FROM pv_password_reset_tokens WHERE user_id = ?1 OR expires_at <= ?2")
    .bind(userId, nowValue)
    .run();
  await env.DB.prepare("INSERT INTO pv_password_reset_tokens(token_hash,user_id,expires_at,used_at,created_at) VALUES (?1,?2,?3,NULL,?4)")
    .bind(await tokenHash(token), userId, new Date(Date.now() + 30 * 60 * 1000).toISOString(), nowValue)
    .run();
  return token;
}

export async function consumeD1PasswordResetToken(env: D1Env, token: string): Promise<string | null> {
  if (!token) return null;
  const tokenHashValue = await tokenHash(token);
  const current = await env.DB.prepare("SELECT user_id FROM pv_password_reset_tokens WHERE token_hash = ?1 AND used_at IS NULL AND expires_at > ?2 LIMIT 1")
    .bind(tokenHashValue, now())
    .first<{ user_id: string }>();
  if (!current?.user_id) return null;
  const result = await env.DB.prepare("UPDATE pv_password_reset_tokens SET used_at = ?1 WHERE token_hash = ?2 AND used_at IS NULL AND expires_at > ?3")
    .bind(now(), tokenHashValue, now())
    .run();
  return Number(result.meta?.changes || 0) === 1 ? current.user_id : null;
}

export async function createD1EmailVerificationToken(env: D1Env, userId: string): Promise<string> {
  const token = randomPasswordResetToken();
  const nowValue = now();
  const recent = await env.DB.prepare("SELECT created_at FROM pv_email_verification_tokens WHERE user_id = ?1 AND used_at IS NULL ORDER BY created_at DESC LIMIT 1").bind(userId).first<{ created_at: string }>();
  if (recent?.created_at && Date.parse(recent.created_at) > Date.now() - 60_000) throw new Error("Please wait before requesting another verification email");
  await env.DB.prepare("DELETE FROM pv_email_verification_tokens WHERE user_id = ?1 OR expires_at <= ?2").bind(userId, nowValue).run();
  await env.DB.prepare("INSERT INTO pv_email_verification_tokens(token_hash,user_id,expires_at,used_at,created_at) VALUES (?1,?2,?3,NULL,?4)")
    .bind(await tokenHash(token), userId, new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), nowValue).run();
  return token;
}

export async function consumeD1EmailVerificationToken(env: D1Env, token: string): Promise<string | null> {
  if (!token) return null;
  const tokenHashValue = await tokenHash(token);
  const current = await env.DB.prepare("SELECT user_id FROM pv_email_verification_tokens WHERE token_hash = ?1 AND used_at IS NULL AND expires_at > ?2 LIMIT 1")
    .bind(tokenHashValue, now()).first<{ user_id: string }>();
  if (!current?.user_id) return null;
  const nowValue = now();
  const result = await env.DB.prepare("UPDATE pv_email_verification_tokens SET used_at = ?1 WHERE token_hash = ?2 AND used_at IS NULL AND expires_at > ?3").bind(nowValue, tokenHashValue, nowValue).run();
  if (Number(result.meta?.changes || 0) !== 1) return null;
  await env.DB.prepare("UPDATE pv_users SET email_verified_at = ?1, updated_at = ?1 WHERE id = ?2").bind(nowValue, current.user_id).run();
  return current.user_id;
}
