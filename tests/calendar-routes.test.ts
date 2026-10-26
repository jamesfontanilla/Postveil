import assert from "node:assert/strict";
import test from "node:test";
import { calendarWire } from "../worker/index.ts";

test("calendar rows map snake_case storage to camelCase wire fields", () => {
  assert.deepEqual(calendarWire({ id: "event-1", title: "Planning", description: "", location: null, starts_at: "2026-01-01T15:00:00.000Z", ends_at: "2026-01-01T16:00:00.000Z", all_day: 0, attendees: JSON.stringify(["person@example.com"]), created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z" }), {
    id: "event-1", title: "Planning", description: "", location: null, startsAt: "2026-01-01T15:00:00.000Z", endsAt: "2026-01-01T16:00:00.000Z", allDay: false, attendees: ["person@example.com"], createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
  });
});

test("calendar row mapping does not expose owner fields", () => {
  const mapped = calendarWire({ id: "event-1", owner_id: "other-user", title: "Private", starts_at: "2026-01-01T00:00:00.000Z", ends_at: "2026-01-01T01:00:00.000Z" });
  assert.equal("owner_id" in mapped, false);
});
