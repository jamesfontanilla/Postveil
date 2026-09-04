export type CalendarView = "month" | "week" | "day" | "agenda";

export function normalizeWorkspaceSlug(value: unknown, fallback = "resource"): string {
  const slug = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || fallback;
}

export function csvEscape(value: unknown): string {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function parseContactCsv(value: string): Array<{ email: string; displayName: string; company: string; notes: string }> {
  const lines = value.replace(/^\uFEFF/, "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return [];
  const parseLine = (line: string) => {
    const cells: string[] = [];
    let cell = "";
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      if (char === '"' && line[index + 1] === '"' && quoted) { cell += '"'; index += 1; continue; }
      if (char === '"') { quoted = !quoted; continue; }
      if (char === "," && !quoted) { cells.push(cell.trim()); cell = ""; continue; }
      cell += char;
    }
    cells.push(cell.trim());
    return cells;
  };
  const header = parseLine(lines[0]).map((cell) => cell.toLowerCase());
  const hasHeader = header.some((cell) => ["email", "email address", "name", "display name"].includes(cell));
  const columns = hasHeader ? header : ["email", "display name", "company", "notes"];
  return lines.slice(hasHeader ? 1 : 0).map(parseLine).map((cells) => {
    const at = (names: string[]) => {
      const index = columns.findIndex((column) => names.includes(column));
      return index >= 0 ? cells[index] || "" : "";
    };
    return { email: at(["email", "email address"]), displayName: at(["display name", "name"]), company: at(["company", "organization"]), notes: at(["notes", "note"]) };
  }).filter((contact) => contact.email.includes("@"));
}

export function icsEscape(value: unknown): string {
  return String(value ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

export function icsTimestamp(value: unknown): string {
  const date = new Date(String(value || ""));
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function buildIcsEvent(event: Record<string, unknown>): string {
  const uid = String(event.external_uid || event.id || crypto.randomUUID());
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Postveil//Calendar//EN", "CALSCALE:GREGORIAN", "BEGIN:VEVENT",
    `UID:${icsEscape(uid)}`, `DTSTAMP:${icsTimestamp(event.created_at || new Date().toISOString())}`,
    `DTSTART:${icsTimestamp(event.starts_at)}`, `DTEND:${icsTimestamp(event.ends_at)}`,
    `SUMMARY:${icsEscape(event.title || "Untitled event")}`,
  ];
  if (event.description) lines.push(`DESCRIPTION:${icsEscape(event.description)}`);
  if (event.location) lines.push(`LOCATION:${icsEscape(event.location)}`);
  if (event.recurrence_rule) lines.push(`RRULE:${icsEscape(event.recurrence_rule)}`);
  if (event.conference_url) lines.push(`URL:${icsEscape(event.conference_url)}`);
  lines.push("END:VEVENT", "END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}

export function buildIcsCalendar(events: Array<Record<string, unknown>>): string {
  const payload = events.map((event) => buildIcsEvent(event).split(/\r?\n/).filter((line) => !["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Postveil//Calendar//EN", "CALSCALE:GREGORIAN", "END:VCALENDAR"].includes(line)).join("\r\n")).join("\r\n");
  return `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Postveil//Calendar//EN\r\nCALSCALE:GREGORIAN\r\n${payload}END:VCALENDAR\r\n`;
}

export function vCardEscape(value: unknown): string {
  return String(value ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

export function buildVCard(contact: Record<string, unknown>): string {
  const email = String(contact.email || "");
  const name = String(contact.display_name || email.split("@")[0] || "Contact");
  return ["BEGIN:VCARD", "VERSION:3.0", `FN:${vCardEscape(name)}`, `N:${vCardEscape(name)};;;;`, `EMAIL;TYPE=INTERNET:${vCardEscape(email)}`, contact.company ? `ORG:${vCardEscape(contact.company)}` : "", contact.notes ? `NOTE:${vCardEscape(contact.notes)}` : "", "END:VCARD", ""].filter(Boolean).join("\r\n");
}

export function calendarBusySlots(events: Array<Record<string, unknown>>, from: Date, to: Date): Array<{ startsAt: string; endsAt: string }> {
  return events.map((event) => ({ starts: new Date(String(event.starts_at)), ends: new Date(String(event.ends_at)) }))
    .filter((event) => Number.isFinite(event.starts.getTime()) && Number.isFinite(event.ends.getTime()) && event.ends > from && event.starts < to)
    .map((event) => ({ startsAt: event.starts.toISOString(), endsAt: event.ends.toISOString() }))
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}
