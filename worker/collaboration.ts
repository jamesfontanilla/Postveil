export type CollaborationPriority = "low" | "normal" | "high" | "urgent";
export type CollaborationStatus = "new" | "open" | "pending" | "resolved" | "closed";
export type CollaborationEvent = "message_received" | "comment_added" | "assignment_changed" | "status_changed" | "priority_changed" | "sla_breached";

const PRIORITY_SLA_MINUTES: Record<CollaborationPriority, number> = {
  urgent: 60,
  high: 240,
  normal: 1440,
  low: 2880,
};

export function collaborationPriority(value: unknown): CollaborationPriority {
  return value === "urgent" || value === "high" || value === "low" ? value : "normal";
}

export function collaborationStatus(value: unknown): CollaborationStatus {
  return value === "new" || value === "pending" || value === "resolved" || value === "closed" ? value : "open";
}

export function collaborationVisibility(value: unknown): "team" | "private" {
  return value === "private" ? "private" : "team";
}

export function collaborationCommentKind(value: unknown): "comment" | "note" {
  return value === "note" ? "note" : "comment";
}

export function cleanCollaborationText(value: unknown, maxLength = 4000): string {
  return String(value || "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, maxLength);
}

export function collaborationSlaDueAt(priority: CollaborationPriority, now = Date.now(), minutes?: number): string {
  const duration = Number.isFinite(minutes) ? Math.max(5, Math.min(30 * 24 * 60, Number(minutes))) : PRIORITY_SLA_MINUTES[priority];
  return new Date(now + duration * 60_000).toISOString();
}

export function collaborationSlaBreached(value: unknown, now = Date.now()): boolean {
  return typeof value === "string" && Boolean(value) && Date.parse(value) <= now;
}

export function collaborationMentionEmails(value: string): string[] {
  return [...new Set((value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []).map((item) => item.toLowerCase()))].slice(0, 20);
}

export function collaborationPolicyMatches(conditions: unknown, event: CollaborationEvent, state: { status?: unknown; priority?: unknown }): boolean {
  const input = conditions && typeof conditions === "object" ? conditions as Record<string, unknown> : {};
  if (input.event && String(input.event) !== event) return false;
  if (input.status && String(input.status) !== collaborationStatus(state.status)) return false;
  if (input.priority && String(input.priority) !== collaborationPriority(state.priority)) return false;
  return true;
}
