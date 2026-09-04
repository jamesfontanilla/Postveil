export const AI_FEATURES = [
  "thread_summary",
  "inbox_digest",
  "priority_detection",
  "suggested_replies",
  "draft_generation",
  "tone_rewrite",
  "grammar_correction",
  "translation",
  "action_item_extraction",
  "deadline_extraction",
  "meeting_extraction",
  "contact_extraction",
  "automatic_categorization",
  "semantic_search",
  "natural_language_search",
  "long_thread_qa",
  "attachment_summary",
  "inbox_cleanup",
  "duplicate_detection",
  "scam_explanation",
  "phishing_explanation",
  "writing_style",
] as const;

export type AiFeature = (typeof AI_FEATURES)[number];

export const AI_FEATURE_LABELS: Record<AiFeature, string> = {
  thread_summary: "Thread summaries",
  inbox_digest: "Inbox digest",
  priority_detection: "Priority detection",
  suggested_replies: "Suggested replies",
  draft_generation: "Draft generation",
  tone_rewrite: "Tone rewriting",
  grammar_correction: "Grammar correction",
  translation: "Translation",
  action_item_extraction: "Action-item extraction",
  deadline_extraction: "Deadline extraction",
  meeting_extraction: "Meeting extraction",
  contact_extraction: "Contact extraction",
  automatic_categorization: "Automatic categorization",
  semantic_search: "Semantic search",
  natural_language_search: "Natural-language search",
  long_thread_qa: "Long-thread questions",
  attachment_summary: "Attachment summaries",
  inbox_cleanup: "Inbox cleanup suggestions",
  duplicate_detection: "Duplicate detection",
  scam_explanation: "Scam explanations",
  phishing_explanation: "Phishing explanations",
  writing_style: "Personal writing style",
};

export type AiSettingsRecord = {
  owner_id: string;
  enabled: boolean;
  provider: "groq" | "byom" | "local" | string;
  model: string;
  local_endpoint: string | null;
  retention_mode: "none" | "audit_only" | "thirty_days" | string;
  feature_flags: Record<string, boolean>;
};

export function defaultAiFeatureFlags() {
  return Object.fromEntries(AI_FEATURES.map((feature) => [feature, false]));
}

export function normalizeAiSettings(row: Record<string, unknown> | undefined, ownerId: string): AiSettingsRecord {
  const flags = row?.feature_flags && typeof row.feature_flags === "object" && !Array.isArray(row.feature_flags)
    ? row.feature_flags as Record<string, unknown>
    : {};
  return {
    owner_id: ownerId,
    enabled: row?.enabled === true,
    provider: typeof row?.provider === "string" ? row.provider : "groq",
    model: typeof row?.model === "string" && row.model.trim() ? row.model.trim() : "openai/gpt-oss-120b",
    local_endpoint: typeof row?.local_endpoint === "string" && row.local_endpoint.trim() ? row.local_endpoint.trim() : null,
    retention_mode: typeof row?.retention_mode === "string" ? row.retention_mode : "none",
    feature_flags: Object.fromEntries(AI_FEATURES.map((feature) => [feature, flags[feature] === true])),
  };
}

export function promptInjectionSignals(text: string): string[] {
  const signals: string[] = [];
  if (/ignore\s+(all|any|the)\s+(previous|above|system)|disregard\s+instructions|developer\s+message|reveal\s+(the\s+)?prompt|system\s+override/i.test(text)) signals.push("instruction_override_pattern");
  if (/<script|javascript:|data:text\/html|<iframe|<form/i.test(text)) signals.push("active_content_pattern");
  if (/\b(password|secret|api[_ -]?key|one[- ]time code|recovery code)\b/i.test(text)) signals.push("credential_request_pattern");
  return signals;
}

export function cleanAiText(value: unknown, maxChars = 12000): string {
  return String(value || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxChars);
}

export function buildAiInstruction(feature: AiFeature, query = ""): string {
  const suffix = query.trim() ? `\nUser question or requested style:\n${query.trim().slice(0, 1200)}` : "";
  const instructions: Record<AiFeature, string> = {
    thread_summary: "Summarize the email thread in 5 concise bullets, followed by a one-sentence outcome and open questions.",
    inbox_digest: "Create a calm inbox digest with sections: urgent, needs reply, waiting on others, informational, and suggested next steps. Do not invent facts.",
    priority_detection: "Classify priority as low, normal, high, or urgent. Explain the evidence in at most 3 bullets and do not infer sensitive traits.",
    suggested_replies: "Suggest three short reply options with distinct tones: concise, warm, and firm. Never send or imply that a reply was sent.",
    draft_generation: "Write a draft reply that directly addresses the message. State assumptions separately. This is a draft only and must never be sent automatically.",
    tone_rewrite: "Rewrite the supplied draft for the requested tone while preserving facts, names, links, and commitments. Return only the rewritten draft.",
    grammar_correction: "Correct grammar and clarity while preserving meaning and voice. Return only the corrected text.",
    translation: "Translate the supplied message into the requested language. Preserve names, URLs, dates, and formatting. Return the translation only.",
    action_item_extraction: "Extract explicit action items as JSON with owner, action, due_date, and evidence fields. Use null when unknown.",
    deadline_extraction: "Extract explicit dates, times, and deadlines as JSON. Include timezone only when stated or unambiguous.",
    meeting_extraction: "Extract meeting details as JSON: title, starts_at, ends_at, timezone, location, attendees, and confidence. Do not fabricate missing values.",
    contact_extraction: "Extract possible contacts as JSON with name, email, company, and evidence. Include only addresses visibly present.",
    automatic_categorization: "Classify each message into one of: primary, updates, promotions, social, forums, finance, travel, or other. Explain signals briefly.",
    semantic_search: "Interpret the search request and return a safe, human-readable explanation of what matches should be looked for. Do not claim database results.",
    natural_language_search: "Translate the natural-language request into a concise mail-search plan with filters and terms. Do not execute actions.",
    long_thread_qa: "Answer the user's question from the supplied thread only. Cite the relevant sender/date/subject evidence and say when the thread does not contain the answer.",
    attachment_summary: "Summarize attachment metadata and any supplied text. Do not claim malware scanning or inspect binary content that was not provided.",
    inbox_cleanup: "Suggest safe cleanup candidates and explain why. Never delete, archive, label, or modify mail automatically.",
    duplicate_detection: "Identify likely duplicate messages from the supplied metadata and explain the matching signals. Do not delete anything.",
    scam_explanation: "Explain scam risk signals in plain language, distinguishing evidence from uncertainty. Do not make a definitive accusation.",
    phishing_explanation: "Explain phishing indicators and the safest next steps. Never ask the user to reveal credentials or follow a link.",
    writing_style: "Describe the user's writing style from the supplied sent samples, then provide 5 bounded style guidelines. Do not infer identity, health, politics, or other sensitive traits.",
  };
  return `${instructions[feature]}${suffix}`;
}

export function parseAiContent(content: string): unknown {
  const trimmed = content.trim();
  try { return JSON.parse(trimmed); } catch { return content; }
}

