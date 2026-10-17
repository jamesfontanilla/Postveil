import type { Message } from "../types/mail";

export function markdownToHtml(value: string): string {
  const escaped = value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .split(/\n{2,}/)
    .map((paragraph) => (paragraph.startsWith("<h") ? paragraph : `<p>${paragraph.replace(/\n/g, "<br />")}</p>`))
    .join("");
}

export function zonedLocalToIso(value: string, timeZone: string): string | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) return null;
  const parts = match.slice(1).map(Number);
  const [year, month, day, hour, minute] = parts;
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const zoned = Object.fromEntries(
    formatter
      .formatToParts(new Date(naive))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  const asUtc = Date.UTC(
    Number(zoned.year),
    Number(zoned.month) - 1,
    Number(zoned.day),
    Number(zoned.hour) % 24,
    Number(zoned.minute),
  );
  return new Date(naive - (asUtc - naive)).toISOString();
}

export function displayName(address: string): string {
  return address.split("@")[0] || address;
}

export function initials(value: string): string {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? parts.slice(0, 2).map((part) => part[0]) : [value.trim()[0] || "?"])
    .join("")
    .toUpperCase();
}

export function avatarGradient(email: string): { background: string } {
  let hash = 0;
  for (const character of email) hash = (hash * 31 + character.charCodeAt(0)) | 0;
  const hue = Math.abs(hash) % 360;
  return { background: `linear-gradient(135deg, hsl(${hue} 68% 58%), hsl(${(hue + 42) % 360} 72% 42%))` };
}

export function formatDate(value?: string): string {
  if (!value) return "";
  const d = new Date(value);
  const now = new Date();
  return d.toDateString() === now.toDateString()
    ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function messageStatusLabel(message: Message): string {
  if (message.cancelled_at) return "Cancelled";
  if (message.direction === "inbound" && message.status === "queued") return "Receiving";
  if (message.direction === "outbound" && message.status === "queued") return "Sending";
  if (message.status === "received") return "Received";
  if (message.status === "sent") return "Sent";
  if (message.status === "delivered") return "Delivered";
  if (message.status === "failed") return "Failed";
  if (message.status === "bounced") return "Bounced";
  if (message.status === "scheduled") return "Scheduled";
  return message.status;
}

export function workStateLabel(state?: string | null): string {
  if (state === "reply_later") return "Reply later";
  if (state === "waiting_on") return "Waiting on";
  if (state === "i_owe") return "I owe";
  return "No work state";
}

export function displayWorkNote(value?: string | null): string {
  const note = value?.trim() || "";
  if (!note) return "";
  if (/\b(?:node is not defined|deserialization error|hidden field|\$response)\b/i.test(note))
    return "Work details unavailable";
  return note.length > 240 ? `${note.slice(0, 237)}…` : note;
}

export function workDueLabel(value?: string | null): string {
  if (!value) return "No follow-up date";
  const date = new Date(value);
  return date.getTime() <= Date.now() ? `Overdue · ${date.toLocaleString()}` : `Follow up · ${date.toLocaleString()}`;
}

export function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}
