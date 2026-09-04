import test from "node:test";
import assert from "node:assert/strict";
import { buildIcsCalendar, buildIcsEvent, buildVCard, calendarBusySlots, normalizeWorkspaceSlug, parseContactCsv } from "../worker/workspace.ts";

test("workspace slugs are stable and URL-safe", () => {
  assert.equal(normalizeWorkspaceSlug("Team Planning / Manila"), "team-planning-manila");
  assert.equal(normalizeWorkspaceSlug("!!!", "fallback"), "fallback");
});

test("contact CSV import accepts headers and ignores invalid rows", () => {
  const contacts = parseContactCsv('Name,Email,Company\nAda Lovelace,ada@example.com,Analytical Engines\ninvalid,not-an-email,Nope');
  assert.deepEqual(contacts, [{ email: "ada@example.com", displayName: "Ada Lovelace", company: "Analytical Engines", notes: "" }]);
});

test("calendar exports escape text and preserve event boundaries", () => {
  const event = { id: "event-1", title: "Planning, Q3", description: "Line one\nLine two", starts_at: "2026-09-04T09:00:00.000Z", ends_at: "2026-09-04T10:00:00.000Z" };
  const ics = buildIcsEvent(event);
  assert.match(ics, /SUMMARY:Planning\\, Q3/);
  assert.match(ics, /DESCRIPTION:Line one\\nLine two/);
  assert.equal((buildIcsCalendar([event]).match(/BEGIN:VEVENT/g) || []).length, 1);
});

test("vCard export and availability only return normalized records", () => {
  const vcard = buildVCard({ email: "ada@example.com", display_name: "Ada, Lovelace", company: "Analytical Engines" });
  assert.match(vcard, /FN:Ada\\, Lovelace/);
  const from = new Date("2026-09-04T09:00:00.000Z");
  const to = new Date("2026-09-04T12:00:00.000Z");
  assert.deepEqual(calendarBusySlots([{ starts_at: "2026-09-04T10:00:00.000Z", ends_at: "2026-09-04T11:00:00.000Z" }, { starts_at: "invalid", ends_at: "invalid" }], from, to), [{ startsAt: "2026-09-04T10:00:00.000Z", endsAt: "2026-09-04T11:00:00.000Z" }]);
});
