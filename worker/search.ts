import { d1Request } from "./d1.ts";

export type JsonRecord = Record<string, unknown>;

export type SearchEnv = {
  DB: D1Database;
};

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '""';
  const text = String(value).replace(/"/g, '""');
  return `"${text}"`;
}

export function messageScopeFilter(ownerId: string, mailboxIds: string[]): string {
  if (!mailboxIds.length) return `owner_id=eq.${encodeURIComponent(ownerId)}`;
  const ids = mailboxIds.map((id) => id.replace(/[^a-f0-9-]/gi, "")).filter(Boolean).join(",");
  return ids ? `or=${encodeURIComponent(`owner_id.eq.${ownerId},mailbox_id.in.(${ids})`)}` : `owner_id=eq.${encodeURIComponent(ownerId)}`;
}


export const SYSTEM_FOLDERS = ["inbox", "sent", "drafts", "archive", "trash", "spam", "quarantine"];

export function splitAddresses(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map((v) => v.trim()).filter(Boolean);
  if (typeof value === "string") return value.split(",").map((v) => v.trim()).filter(Boolean);
  return [];
}

export function domainOf(address: string): string {
  const parts = address.toLowerCase().trim().split("@");
  return parts.length > 1 ? parts.pop() || "" : "";
}

async function dbRequest<T = unknown>(env: SearchEnv, path: string, init: RequestInit = {}): Promise<T> {
  return d1Request<T>(env, path, init);
}

export type SearchToken = { value: string; quoted: boolean; negated: boolean };
export type SearchTextPart = { value: string; negated: boolean };
export type SearchField = "from" | "to" | "cc" | "bcc" | "subject" | "filename" | "rfc822msgid";
export type SearchStateField = "is_read" | "is_starred" | "is_flagged" | "is_pinned" | "is_important" | "is_muted" | "is_ignored" | "has_attachment";
export type SearchFilter =
  | { kind: "field"; field: SearchField; value: string; negated: boolean }
  | { kind: "state"; field: SearchStateField; value: boolean; negated: boolean }
  | { kind: "folder"; value: string; negated: boolean }
  | { kind: "date"; operator: "after" | "before"; value: string; negated: boolean }
  | { kind: "size"; operator: "larger" | "smaller"; bytes: number; negated: boolean }
  | { kind: "numeric"; field: "spam_score" | "link_count"; operator: "gt" | "gte" | "lt" | "lte" | "eq"; value: number; negated: boolean }
  | { kind: "domain"; value: string; negated: boolean }
  | { kind: "auth"; value: string; negated: boolean }
  | { kind: "relation"; relation: "filetype" | "label" | "calendar" | "work" | "project"; value: string; negated: boolean };
export type ParsedSearch = { normalized: string; terms: SearchTextPart[]; phrases: SearchTextPart[]; filters: SearchFilter[] };

export function tokenizeSearch(value: string): SearchToken[] {
  const tokens: SearchToken[] = [];
  let index = 0;
  while (index < value.length) {
    while (index < value.length && /\s/.test(value[index])) index += 1;
    if (index >= value.length) break;
    let negated = false;
    if (value[index] === "-") { negated = true; index += 1; }
    let token = "";
    let quoted = false;
    let inQuotes = false;
    while (index < value.length) {
      const character = value[index];
      if (character === '"') {
        quoted = true;
        inQuotes = !inQuotes;
        index += 1;
        continue;
      }
      if (!inQuotes && /\s/.test(character)) break;
      token += character;
      index += 1;
    }
    if (inQuotes) throw new Error("Unclosed quoted phrase");
    if (!token.trim()) throw new Error("A negation must be followed by a search term");
    tokens.push({ value: token.trim(), quoted, negated });
  }
  return tokens;
}

export function parseSearchDate(value: string, operator: string): string {
  const now = new Date();
  const lower = value.toLowerCase();
  let date: Date;
  if (lower === "today") date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  else if (lower === "yesterday") date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
  else {
    const relative = lower.match(/^(\d+)([dwmy])$/);
    if (relative) {
      date = new Date(now);
      const amount = Number(relative[1]);
      if (relative[2] === "d") date.setUTCDate(date.getUTCDate() - amount);
      if (relative[2] === "w") date.setUTCDate(date.getUTCDate() - amount * 7);
      if (relative[2] === "m") date.setUTCMonth(date.getUTCMonth() - amount);
      if (relative[2] === "y") date.setUTCFullYear(date.getUTCFullYear() - amount);
    } else {
      date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00.000Z`) : new Date(value);
    }
  }
  if (Number.isNaN(date.getTime())) throw new Error(`${operator}: invalid date "${value}"; use YYYY-MM-DD, today, or a relative value such as 7d`);
  return date.toISOString();
}

export function parseSearchBytes(value: string, operator: string): number {
  const match = value.toLowerCase().match(/^(\d+(?:\.\d+)?)(b|kb|kib|mb|mib|gb|gib)?$/);
  if (!match) throw new Error(`${operator}: invalid size "${value}"; use values such as 500KB or 5MB`);
  const multipliers: Record<string, number> = { b: 1, kb: 1000, kib: 1024, mb: 1000 ** 2, mib: 1024 ** 2, gb: 1000 ** 3, gib: 1024 ** 3 };
  return Math.round(Number(match[1]) * (multipliers[match[2] || "b"] || 1));
}

export function expandNaturalLanguageSearch(input: string): string {
  let value = input.trim();
  value = value.replace(/\bwithout\s+(?:any\s+)?(?:attachments?|files?)\b/gi, "-has:attachment");
  value = value.replace(/\bwith\s+(?:any\s+)?(?:attachments?|files?)\b/gi, "has:attachment");
  value = value.replace(/\bwithout\s+(?:any\s+)?links?\b/gi, "-has:link");
  value = value.replace(/\bwith\s+(?:any\s+)?links?\b/gi, "has:link");
  value = value.replace(/\bnot\s+read\b/gi, "is:unread");
  value = value.replace(/\bunread\b/gi, "is:unread");
  value = value.replace(/\bread\s+messages?\b/gi, "is:read");
  value = value.replace(/\bfrom\s+([\w.+-]+@[\w.-]+\.[a-z]{2,})\b/gi, "from:$1");
  value = value.replace(/\bto\s+([\w.+-]+@[\w.-]+\.[a-z]{2,})\b/gi, "to:$1");
  value = value.replace(/\b(?:in\s+)?the\s+last\s+(\d+)\s+(days?|weeks?|months?|years?)\b/gi, (_match, amount: string, unit: string) => {
    const suffix = unit.toLowerCase().startsWith("day") ? "d" : unit.toLowerCase().startsWith("week") ? "w" : unit.toLowerCase().startsWith("month") ? "m" : "y";
    return `after:${amount}${suffix}`;
  });
  value = value.replace(/\b(?:this|past)\s+week\b/gi, "after:7d");
  value = value.replace(/\bold(?:er)?\s+than\s+(\d+(?:\.\d+)?\s*(?:kb|kib|mb|mib|gb|gib))\b/gi, "larger:$1");
  return value.replace(/\s+/g, " ").trim();
}

export function parseSearchNumber(value: string, operator: string, field: "spam_score" | "link_count"): { operator: "gt" | "gte" | "lt" | "lte" | "eq"; value: number } {
  const match = value.trim().match(/^(>=|<=|>|<|=)?\s*(\d+(?:\.\d+)?)(%)?$/);
  if (!match) throw new Error(`${operator}: invalid number "${value}"`);
  let number = Number(match[2]);
  if (field === "spam_score" && (match[3] || number > 1)) number /= 100;
  if (!Number.isFinite(number) || number < 0 || (field === "spam_score" && number > 1)) throw new Error(`${operator}: value must be between 0 and 1`);
  const comparison = match[1] || "=";
  return { operator: comparison === ">" ? "gt" : comparison === ">=" ? "gte" : comparison === "<" ? "lt" : comparison === "<=" ? "lte" : "eq", value: number };
}

export function parseSearchQuery(input: string): ParsedSearch {
  const query = expandNaturalLanguageSearch(input);
  if (query.length > 1000) throw new Error("Search query is too long; keep it under 1,000 characters");
  const terms: SearchTextPart[] = [];
  const phrases: SearchTextPart[] = [];
  const filters: SearchFilter[] = [];
  const normalized: string[] = [];
  for (const token of tokenizeSearch(query)) {
    const colon = token.value.indexOf(":");
    if (colon <= 0) {
      const target = token.quoted ? phrases : terms;
      target.push({ value: token.value, negated: token.negated });
      normalized.push(`${token.negated ? "-" : ""}${token.quoted ? `"${token.value}"` : token.value}`);
      continue;
    }
    const operator = token.value.slice(0, colon).toLowerCase();
    const operand = token.value.slice(colon + 1).trim();
    if (!operand) throw new Error(`${operator}: needs a value`);
    normalized.push(`${token.negated ? "-" : ""}${operator}:${token.quoted ? `"${operand}"` : operand}`);
    if (["from", "to", "cc", "bcc", "subject", "filename", "rfc822msgid"].includes(operator)) {
      filters.push({ kind: "field", field: operator as SearchField, value: operand, negated: token.negated });
      continue;
    }
    if (operator === "domain") {
      filters.push({ kind: "domain", value: operand.toLowerCase().replace(/^@/, ""), negated: token.negated });
      continue;
    }
    if (operator === "auth" || operator === "authentication") {
      const authValue = operand.toLowerCase();
      if (!["pass", "fail", "none", "neutral", "missing"].includes(authValue)) throw new Error(`auth: unsupported value "${operand}"; use pass, fail, none, neutral, or missing`);
      filters.push({ kind: "auth", value: authValue, negated: token.negated });
      continue;
    }
    if (["type", "filetype", "mime"].includes(operator)) {
      filters.push({ kind: "relation", relation: "filetype", value: operand.toLowerCase().replace(/^\./, ""), negated: token.negated });
      continue;
    }
    if (operator === "label") {
      filters.push({ kind: "relation", relation: "label", value: operand, negated: token.negated });
      continue;
    }
    if (operator === "calendar" || operator === "event") {
      filters.push({ kind: "relation", relation: "calendar", value: operand, negated: token.negated });
      continue;
    }
    if (operator === "work" || operator === "task") {
      filters.push({ kind: "relation", relation: "work", value: operand.toLowerCase(), negated: token.negated });
      continue;
    }
    if (operator === "project") {
      filters.push({ kind: "relation", relation: "project", value: operand, negated: token.negated });
      continue;
    }
    if (operator === "has") {
      const hasValue = operand.toLowerCase();
      if (["attachment", "attachments", "file", "files"].includes(hasValue)) filters.push({ kind: "state", field: "has_attachment", value: true, negated: token.negated });
      else if (["link", "links"].includes(hasValue)) filters.push({ kind: "numeric", field: "link_count", operator: "gt", value: 0, negated: token.negated });
      else if (["calendar", "event", "events"].includes(hasValue)) filters.push({ kind: "relation", relation: "calendar", value: "any", negated: token.negated });
      else if (["work", "task", "tasks"].includes(hasValue)) filters.push({ kind: "relation", relation: "work", value: "any", negated: token.negated });
      else throw new Error(`has: unsupported value "${operand}"; use attachment, link, calendar, or work`);
      continue;
    }
    if (operator === "is") {
      const states: Record<string, { field: SearchStateField; value: boolean }> = {
        unread: { field: "is_read", value: false }, read: { field: "is_read", value: true },
        starred: { field: "is_starred", value: true }, unstarred: { field: "is_starred", value: false },
        flagged: { field: "is_flagged", value: true }, unflagged: { field: "is_flagged", value: false },
        pinned: { field: "is_pinned", value: true }, unpinned: { field: "is_pinned", value: false },
        important: { field: "is_important", value: true }, unimportant: { field: "is_important", value: false },
        muted: { field: "is_muted", value: true }, ignored: { field: "is_ignored", value: true },
      };
      const state = states[operand.toLowerCase()];
      if (!state) throw new Error(`is: unsupported value "${operand}"; use unread, read, starred, flagged, pinned, important, muted, or ignored`);
      filters.push({ kind: "state", ...state, negated: token.negated });
      continue;
    }
    if (operator === "in") {
      const folder = operand.toLowerCase();
      const validFolder = folder === "all" || ["important", "snoozed", "muted"].includes(folder) || SYSTEM_FOLDERS.includes(folder as typeof SYSTEM_FOLDERS[number]) || (folder.startsWith("custom:") && /^[0-9a-f-]{36}$/i.test(folder.slice(7)));
      if (!validFolder) throw new Error(`in: unknown folder "${operand}"`);
      filters.push({ kind: "folder", value: folder, negated: token.negated });
      continue;
    }
    if (["after", "before", "older", "newer"].includes(operator)) {
      const dateOperator = operator === "after" || operator === "newer" ? "after" : "before";
      filters.push({ kind: "date", operator: dateOperator, value: parseSearchDate(operand, operator), negated: token.negated });
      continue;
    }
    if (operator === "larger" || operator === "smaller") {
      filters.push({ kind: "size", operator, bytes: parseSearchBytes(operand, operator), negated: token.negated });
      continue;
    }
    if (["spam", "spam_score", "risk", "score"].includes(operator)) {
      filters.push({ kind: "numeric", field: "spam_score", ...parseSearchNumber(operand, operator, "spam_score"), negated: token.negated });
      continue;
    }
    if (["links", "link_count"].includes(operator)) {
      const linksValue = operand.toLowerCase();
      if (["yes", "true", "present"].includes(linksValue)) filters.push({ kind: "numeric", field: "link_count", operator: "gt", value: 0, negated: token.negated });
      else if (["no", "false", "none", "absent"].includes(linksValue)) filters.push({ kind: "numeric", field: "link_count", operator: "eq", value: 0, negated: token.negated });
      else filters.push({ kind: "numeric", field: "link_count", ...parseSearchNumber(operand, operator, "link_count"), negated: token.negated });
      continue;
    }
    throw new Error(`Unknown search operator "${operator}:"`);
  }
  return { normalized: normalized.join(" "), terms, phrases, filters };
}

export function safeLike(value: string): string {
  return value.replace(/[*,()%_]/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
}

export function safeFts(value: string): string {
  return value.replace(/[^\p{L}\p{N}@._-]+/gu, " ").trim().slice(0, 200);
}

export function webSearchValue(parsed: ParsedSearch): string {
  return [...parsed.terms, ...parsed.phrases].map((part) => {
    const value = safeFts(part.value);
    if (!value) return "";
    const text = parsed.phrases.includes(part) ? `"${value}"` : value;
    return `${part.negated ? "-" : ""}${text}`;
  }).filter(Boolean).join(" ");
}

export async function attachmentSearchIds(env: SearchEnv, ownerId: string, filters: SearchFilter[]): Promise<{ include: string[] | null; exclude: string[] }> {
  let include: Set<string> | null = null;
  const exclude = new Set<string>();
  for (const filter of filters) {
    if (filter.kind !== "field" && filter.kind !== "relation") continue;
    const isFilename = filter.kind === "field" && filter.field === "filename";
    const isFileType = filter.kind === "relation" && filter.relation === "filetype";
    if (!isFilename && !isFileType) continue;
    const condition = isFilename
      ? `filename=ilike.*${encodeURIComponent(safeLike(filter.value))}*`
      : `or=${encodeURIComponent(`(content_type.ilike.*${safeLike(filter.value)}*,filename.ilike.*.${safeLike(filter.value)})`)}`;
    const rows = await dbRequest<Array<{ message_id: string }>>(env, `attachments?owner_id=eq.${encodeURIComponent(ownerId)}&${condition}&select=message_id&limit=10000`);
    const ids = new Set(rows.map((row) => row.message_id));
    if (filter.negated) ids.forEach((id) => exclude.add(id));
    else if (include === null) include = ids;
    else {
      const currentInclude = include as Set<string>;
      include = new Set<string>([...currentInclude].filter((id) => ids.has(id)));
    }
  }
  return { include: include ? [...include] : null, exclude: [...exclude] };
}

export async function domainSearchIds(env: SearchEnv, ownerId: string, filters: SearchFilter[]): Promise<{ include: string[] | null; exclude: string[] }> {
  let include: Set<string> | null = null;
  const exclude = new Set<string>();
  const domainFilters = filters.filter((filter): filter is Extract<SearchFilter, { kind: "domain" }> => filter.kind === "domain");
  if (!domainFilters.length) return { include: null, exclude: [] };
  const rows = await dbRequest<Array<{ id: string; from_address?: string; to_addresses?: unknown; cc_addresses?: unknown; bcc_addresses?: unknown }>>(
    env,
    `messages?owner_id=eq.${encodeURIComponent(ownerId)}&select=id,from_address,to_addresses,cc_addresses,bcc_addresses&limit=10000`,
  );
  for (const filter of domainFilters) {
    const domain = filter.value.toLowerCase().replace(/^@/, "");
    const matchingIds = rows
      .filter((row) => [String(row.from_address || ""), ...splitAddresses(row.to_addresses), ...splitAddresses(row.cc_addresses), ...splitAddresses(row.bcc_addresses)].some((address) => domainOf(address) === domain))
      .map((row) => String(row.id));
    const ids = new Set<string>(matchingIds);
    if (filter.negated) ids.forEach((id) => exclude.add(id));
    else if (include === null) include = ids;
    else {
      const currentInclude = include as Set<string>;
      include = new Set<string>([...currentInclude].filter((id) => ids.has(id)));
    }
  }
  return { include: include ? [...include] : null, exclude: [...exclude] };
}

export async function relatedSearchIds(env: SearchEnv, ownerId: string, filters: SearchFilter[]): Promise<{ include: string[] | null; exclude: string[] }> {
  let include: Set<string> | null = null;
  const exclude = new Set<string>();
  const apply = (ids: Set<string>, negated: boolean) => {
    if (negated) ids.forEach((id) => exclude.add(id));
    else if (include === null) include = ids;
    else include = new Set<string>([...include].filter((id) => ids.has(id)));
  };
  for (const filter of filters) {
    if (filter.kind !== "relation" || ["filetype"].includes(filter.relation)) continue;
    let ids = new Set<string>();
    if (filter.relation === "label") {
      const labels = await dbRequest<Array<{ id: string }>>(env, `labels?owner_id=eq.${encodeURIComponent(ownerId)}&name=ilike.*${encodeURIComponent(safeLike(filter.value))}*&select=id&limit=100`);
      if (labels.length) {
        const labelIds = labels.map((row) => row.id).join(",");
        const rows = await dbRequest<Array<{ message_id: string }>>(env, `message_labels?label_id=in.(${encodeURIComponent(labelIds)})&select=message_id&limit=10000`);
        ids = new Set(rows.map((row) => row.message_id));
      }
    } else if (filter.relation === "calendar") {
      const value = filter.value.toLowerCase();
      const path = value === "any" || ["yes", "true", "present"].includes(value)
        ? `calendar_events?owner_id=eq.${encodeURIComponent(ownerId)}&source_message_id=not.is.null&select=source_message_id&limit=10000`
        : `calendar_events?owner_id=eq.${encodeURIComponent(ownerId)}&source_message_id=not.is.null&title=ilike.*${encodeURIComponent(safeLike(filter.value))}*&select=source_message_id&limit=10000`;
      const rows = await dbRequest<Array<{ source_message_id?: string }>>(env, path);
      ids = new Set(rows.map((row) => row.source_message_id).filter((id): id is string => Boolean(id)));
    } else if (filter.relation === "work") {
      const value = filter.value.toLowerCase();
      if (["any", "yes", "true", "open", "task", "tasks"].includes(value)) {
        const [tasks, messages] = await Promise.all([
          dbRequest<Array<{ source_message_id?: string }>>(env, `tasks?owner_id=eq.${encodeURIComponent(ownerId)}&source_message_id=not.is.null&completed=eq.false&select=source_message_id&limit=10000`),
          dbRequest<Array<{ id: string }>>(env, `messages?owner_id=eq.${encodeURIComponent(ownerId)}&work_state=neq.none&select=id&limit=10000`),
        ]);
        tasks.forEach((row) => { if (row.source_message_id) ids.add(row.source_message_id); });
        messages.forEach((row) => ids.add(row.id));
      } else if (["none", "reply_later", "waiting_on", "i_owe"].includes(value)) {
        const rows = await dbRequest<Array<{ id: string }>>(env, `messages?owner_id=eq.${encodeURIComponent(ownerId)}&work_state=eq.${encodeURIComponent(value)}&select=id&limit=10000`);
        ids = new Set(rows.map((row) => row.id));
      } else {
        const rows = await dbRequest<Array<{ source_message_id?: string }>>(env, `tasks?owner_id=eq.${encodeURIComponent(ownerId)}&source_message_id=not.is.null&title=ilike.*${encodeURIComponent(safeLike(filter.value))}*&select=source_message_id&limit=10000`);
        ids = new Set(rows.map((row) => row.source_message_id).filter((id): id is string => Boolean(id)));
      }
    } else if (filter.relation === "project") {
      const rows = await dbRequest<Array<{ source_message_id?: string }>>(env, `tasks?owner_id=eq.${encodeURIComponent(ownerId)}&source_message_id=not.is.null&title=ilike.*${encodeURIComponent(safeLike(filter.value))}*&select=source_message_id&limit=10000`);
      ids = new Set(rows.map((row) => row.source_message_id).filter((id): id is string => Boolean(id)));
    }
    apply(ids, filter.negated);
  }
  return { include: include ? [...include] : null, exclude: [...exclude] };
}

type MailQueryOptions = { folder: string; query?: string; filter?: string; sort?: string; page?: number; pageSize?: number; maxPageSize?: number; mailboxIds?: string[] };

export async function buildMailQuery(env: SearchEnv, ownerId: string, options: MailQueryOptions): Promise<{ path: string; parsed?: ParsedSearch; page: number; pageSize: number; searchActive: boolean }> {
  const query = options.query?.trim() || "";
  const parsed = query ? parseSearchQuery(query) : undefined;
  const page = Math.max(1, Math.min(100000, Number(options.page || 1)));
  const maxPageSize = Math.max(100, Math.min(5000, Number(options.maxPageSize || 100)));
  const pageSize = Math.max(10, Math.min(maxPageSize, Number(options.pageSize || 80)));
  const parts = [messageScopeFilter(ownerId, options.mailboxIds || []), "select=id,thread_id,mailbox_id,owner_id,direction,folder,status,custom_folder_id,previous_folder,from_name,from_address,to_addresses,cc_addresses,subject,snippet,message_id_header,is_read,is_starred,is_pinned,is_flagged,is_important,is_muted,is_ignored,priority,has_attachment,spam_score,spam_reasons,screening_model_version,screening_confidence,screening_decision_source,link_count,auth_spf,auth_dkim,auth_dmarc,auth_arc,auth_tls,trust_score,trust_reasons,screening_status,focused_score,focused_category,delivery_status,delivery_error_code,delivery_error,provider,provider_message_id,open_tracking_enabled,click_tracking_enabled,message_size_bytes,scheduled_at,next_delivery_at,snoozed_until,work_state,follow_up_at,work_note,reminder_at,unsubscribe_url,retention_expires_at,legal_hold,received_at,sent_at,created_at"];
  const explicitFolders = parsed?.filters.filter((filter): filter is Extract<SearchFilter, { kind: "folder" }> => filter.kind === "folder") || [];
  if (!parsed) {
    if (options.folder.startsWith("custom:")) { parts.push("folder=eq.custom", `custom_folder_id=eq.${encodeURIComponent(options.folder.slice(7))}`); }
    else if (options.folder === "focused") parts.push("folder=eq.inbox", "focused_category=eq.focused", "is_ignored=eq.false");
    else if (options.folder === "other") parts.push("folder=eq.inbox", "focused_category=eq.other", "is_ignored=eq.false");
    else if (options.folder === "important") parts.push("is_important=eq.true");
    else if (options.folder === "snoozed") parts.push("snoozed_until=not.is.null");
    else if (options.folder === "muted") parts.push("is_muted=eq.true");
    else if (options.folder === "inbox") parts.push("folder=eq.inbox", "is_ignored=eq.false");
    else if (options.folder !== "all") parts.push(`folder=eq.${encodeURIComponent(options.folder)}`);
  } else {
    for (const folder of explicitFolders) {
      if (folder.value === "all") continue;
      if (folder.value.startsWith("custom:")) {
        if (folder.negated) throw new Error("Negating a custom folder is not supported; use a positive in: folder filter");
        parts.push("folder=eq.custom", `custom_folder_id=eq.${encodeURIComponent(folder.value.slice(7))}`);
      } else if (folder.value === "important") parts.push(`is_important=${folder.negated ? "eq.false" : "eq.true"}`);
      else if (folder.value === "snoozed") parts.push(`snoozed_until=${folder.negated ? "is.null" : "not.is.null"}`);
      else if (folder.value === "muted") parts.push(`is_muted=${folder.negated ? "eq.false" : "eq.true"}`);
      else parts.push(`folder=${folder.negated ? "not.eq" : "eq"}.${encodeURIComponent(folder.value)}`);
    }
    const fts = webSearchValue(parsed);
    if (fts) parts.push(`search_vector=wfts.${encodeURIComponent(fts)}`);
    for (const filter of parsed.filters) {
      if (filter.kind === "field") {
        if (filter.field === "filename") continue;
        if (filter.field === "rfc822msgid") { parts.push(`message_id_header=${filter.negated ? "not.eq" : "eq"}.${encodeURIComponent(filter.value)}`); continue; }
        if (filter.field === "to" || filter.field === "cc" || filter.field === "bcc") {
          const values = `{${safeLike(filter.value).replace(/[{}]/g, "")}}`;
          parts.push(`${filter.field}_addresses=${filter.negated ? "not.cs" : "cs"}.${encodeURIComponent(values)}`);
          continue;
        }
        const column = filter.field === "from" ? "from_address" : filter.field;
        parts.push(`${column}=${filter.negated ? "not.ilike" : "ilike"}.*${encodeURIComponent(safeLike(filter.value))}*`);
      }
      if (filter.kind === "state") {
        const value = filter.negated ? !filter.value : filter.value;
        parts.push(`${filter.field}=eq.${value}`);
      }
      if (filter.kind === "date") {
        const after = filter.operator === "after";
        const operator = filter.negated ? (after ? "lt" : "gte") : (after ? "gte" : "lt");
        parts.push(`created_at=${operator}.${encodeURIComponent(filter.value)}`);
      }
      if (filter.kind === "size") {
        const operator = filter.operator === "larger"
          ? (filter.negated ? "lte" : "gt")
          : (filter.negated ? "gte" : "lt");
        parts.push(`message_size_bytes=${operator}.${filter.bytes}`);
      }
      if (filter.kind === "numeric") {
        const inverted: Record<"gt" | "gte" | "lt" | "lte" | "eq", string> = { gt: "lte", gte: "lt", lt: "gte", lte: "gt", eq: "neq" };
        const operator = filter.negated ? inverted[filter.operator] : filter.operator;
        parts.push(`${filter.field}=${operator}.${filter.value}`);
      }
      if (filter.kind === "auth") {
        const authFields = ["auth_spf", "auth_dkim", "auth_dmarc", "auth_arc", "auth_tls"];
        const authValue = filter.value === "missing" ? "" : filter.value;
        if (filter.value === "missing") {
          const condition = filter.negated
            ? `or=(${authFields.map((field) => `${field}.not.is.null`).join(",")})`
            : `and=(${authFields.map((field) => `${field}.is.null`).join(",")})`;
          parts.push(condition.startsWith("or=") ? `or=${encodeURIComponent(condition.slice(3))}` : `and=${encodeURIComponent(condition.slice(4))}`);
        } else {
          const condition = filter.negated
            ? `and=(${authFields.map((field) => `${field}.not.eq.${authValue}`).join(",")})`
            : `or=(${authFields.map((field) => `${field}.eq.${authValue}`).join(",")})`;
          parts.push(condition.startsWith("or=") ? `or=${encodeURIComponent(condition.slice(3))}` : `and=${encodeURIComponent(condition.slice(4))}`);
        }
      }
    }
    const attachmentIds = await attachmentSearchIds(env, ownerId, parsed.filters);
    const domainIds = await domainSearchIds(env, ownerId, parsed.filters);
    const relatedIds = await relatedSearchIds(env, ownerId, parsed.filters);
    const includeSets = [attachmentIds.include, domainIds.include, relatedIds.include].filter((ids): ids is string[] => Boolean(ids));
    if (includeSets.length) {
      let combined = new Set(includeSets[0]);
      for (const ids of includeSets.slice(1)) combined = new Set([...combined].filter((id) => ids.includes(id)));
      parts.push(combined.size ? `id=${encodeURIComponent(`in.(${[...combined].join(",")})`)}` : "id=eq.00000000-0000-0000-0000-000000000000");
    }
    const excludedIds = [...new Set([...attachmentIds.exclude, ...domainIds.exclude, ...relatedIds.exclude])];
    if (excludedIds.length) parts.push(`id=${encodeURIComponent(`not.in.(${excludedIds.join(",")})`)}`);
  }
  const listFilter = options.filter || "all";
  if (listFilter === "unread") parts.push("is_read=eq.false");
  if (listFilter === "starred") parts.push("is_starred=eq.true");
  if (listFilter === "attachments") parts.push("has_attachment=eq.true");
  parts.push(`order=${options.sort === "oldest" ? "created_at.asc,id.asc" : "created_at.desc,id.desc"}`, `offset=${(page - 1) * pageSize}`, `limit=${pageSize + 1}`);
  return { path: `messages?${parts.join("&")}`, parsed, page, pageSize, searchActive: Boolean(parsed) };
}

export type SearchHistoryRow = { id: string; owner_id: string; query: string; normalized_query: string; usage_count: number; last_used_at: string; created_at: string };
export type SearchSuggestion = { kind: "recent" | "saved" | "label" | "contact" | "syntax"; value: string; label: string; detail?: string };

export async function recordSearchHistory(env: SearchEnv, ownerId: string, query: string): Promise<SearchHistoryRow> {
  const parsed = parseSearchQuery(query);
  const normalized = parsed.normalized.slice(0, 1000);
  const now = new Date().toISOString();
  const existing = await dbRequest<SearchHistoryRow[]>(env, `search_history?owner_id=eq.${encodeURIComponent(ownerId)}&normalized_query=eq.${encodeURIComponent(normalized)}&limit=1`);
  if (existing[0]) {
    const rows = await dbRequest<SearchHistoryRow[]>(env, `search_history?id=eq.${encodeURIComponent(existing[0].id)}&owner_id=eq.${encodeURIComponent(ownerId)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ query: query.slice(0, 1000), usage_count: Math.min(1000000, Number(existing[0].usage_count || 0) + 1), last_used_at: now }) });
    return rows[0] || { ...existing[0], query, last_used_at: now, usage_count: Number(existing[0].usage_count || 0) + 1 };
  }
  const rows = await dbRequest<SearchHistoryRow[]>(env, "search_history", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ owner_id: ownerId, query: query.slice(0, 1000), normalized_query: normalized, usage_count: 1, last_used_at: now }) });
  return rows[0];
}

export async function searchSuggestions(env: SearchEnv, ownerId: string, input: string): Promise<SearchSuggestion[]> {
  const needle = input.trim().toLowerCase();
  const [history, saved, labels, contacts] = await Promise.all([
    dbRequest<SearchHistoryRow[]>(env, `search_history?owner_id=eq.${encodeURIComponent(ownerId)}&order=last_used_at.desc&limit=8`).catch(() => []),
    dbRequest<Array<{ name: string; query: string }>>(env, `saved_searches?owner_id=eq.${encodeURIComponent(ownerId)}&order=sort_order.asc,name.asc&limit=20`).catch(() => []),
    dbRequest<Array<{ name: string }>>(env, `labels?owner_id=eq.${encodeURIComponent(ownerId)}&order=name.asc&limit=20`).catch(() => []),
    dbRequest<Array<{ display_name?: string; email: string }>>(env, `contacts?owner_id=eq.${encodeURIComponent(ownerId)}&order=display_name.asc&limit=20`).catch(() => []),
  ]);
  const suggestions: SearchSuggestion[] = [];
  const add = (suggestion: SearchSuggestion) => {
    if (suggestions.some((item) => item.value.toLowerCase() === suggestion.value.toLowerCase())) return;
    if (needle && !`${suggestion.value} ${suggestion.label} ${suggestion.detail || ""}`.toLowerCase().includes(needle)) return;
    suggestions.push(suggestion);
  };
  history.forEach((item) => add({ kind: "recent", value: item.query, label: item.query, detail: `${item.usage_count} use${item.usage_count === 1 ? "" : "s"}` }));
  saved.forEach((item) => add({ kind: "saved", value: item.query, label: item.name, detail: item.query }));
  labels.forEach((item) => add({ kind: "label", value: `label:${item.name}`, label: `Label: ${item.name}` }));
  contacts.forEach((item) => add({ kind: "contact", value: `from:${item.email}`, label: item.display_name || item.email, detail: item.email }));
  [
    ["from:", "Sender"], ["to:", "Recipient"], ["subject:", "Subject"], ["filename:", "Attachment name"], ["type:", "File type"],
    ["label:", "Label"], ["in:", "Folder"], ["domain:", "Domain"], ["auth:pass", "Authentication passed"], ["is:unread", "Unread"],
    ["has:attachment", "Has attachments"], ["has:calendar", "Has calendar event"], ["has:work", "Has follow-up work"], ["spam:>70%", "Spam score"],
    ["links:>0", "Has links"], ["after:7d", "Recent messages"], ["larger:5MB", "Message size"], ["work:reply_later", "Work state"], ["project:", "Project or task"],
  ].forEach(([value, label]) => add({ kind: "syntax", value, label: String(label), detail: String(value) }));
  return suggestions.slice(0, 12);
}

export function exportSearchRows(rows: JsonRecord[], format: "csv" | "json"): { body: string; contentType: string; extension: string } {
  const fields = ["created_at", "folder", "from_address", "to_addresses", "subject", "message_size_bytes", "spam_score", "auth_spf", "auth_dkim", "auth_dmarc", "link_count", "has_attachment", "work_state"];
  if (format === "json") return { body: JSON.stringify(rows.map((row) => Object.fromEntries(fields.map((field) => [field, row[field] ?? null]))), null, 2), contentType: "application/json; charset=utf-8", extension: "json" };
  const lines = [fields.join(",")];
  rows.forEach((row) => lines.push(fields.map((field) => csvCell(Array.isArray(row[field]) ? row[field].join("; ") : row[field])).join(",")));
  return { body: `${lines.join("\n")}\n`, contentType: "text/csv; charset=utf-8", extension: "csv" };
}
