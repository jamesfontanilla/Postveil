import assert from "node:assert/strict";
import test from "node:test";
import { validateCalendarEvent } from "../worker/index.ts";

const valid = { title: "Planning", description: "Private event", location: "Room 1", startsAt: "2026-01-01T10:00:00-05:00", endsAt: "2026-01-01T11:00:00-05:00", allDay: false, attendees: ["Person@Example.com"] };

test("calendar validation normalizes offsets and attendees", () => {
  const result = validateCalendarEvent(valid);
  assert.deepEqual(result.fields, {});
  assert.equal(result.value?.startsAt, "2026-01-01T15:00:00.000Z");
  assert.deepEqual(result.value?.attendees, ["person@example.com"]);
});

test("calendar validation rejects unknown fields and invalid ranges deterministically", () => {
  const result = validateCalendarEvent({ ...valid, endsAt: "2026-01-01T09:00:00Z", owner_id: "foreign" });
  assert.equal(result.value, undefined);
  assert.equal(result.fields.owner_id, "Unknown field");
  assert.equal(result.fields.endsAt, "Must be after startsAt");
});

test("calendar validation rejects malformed values in a patch", () => {
  const result = validateCalendarEvent({ startsAt: "not-a-timestamp" }, true);
  assert.equal(result.value, undefined);
  assert.match(result.fields.startsAt, /RFC3339/);
});
