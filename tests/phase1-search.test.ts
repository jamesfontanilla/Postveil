import assert from "node:assert/strict";
import { test } from "node:test";
import { buildMailQuery, parseSearchQuery } from "../worker/index.ts";

test("parses quoted phrases, negation, fields, dates, and sizes", () => {
  const parsed = parseSearchQuery('from:alice@example.com "project launch" -is:read has:attachment after:7d larger:5MB');

  assert.deepEqual(parsed.terms, []);
  assert.deepEqual(parsed.phrases, [{ value: "project launch", negated: false }]);
  assert.equal(parsed.filters.length, 5);
  assert.deepEqual(parsed.filters[0], { kind: "field", field: "from", value: "alice@example.com", negated: false });
  assert.deepEqual(parsed.filters[1], { kind: "state", field: "is_read", value: true, negated: true });
  assert.deepEqual(parsed.filters[2], { kind: "state", field: "has_attachment", value: true, negated: false });
  assert.equal(parsed.filters[3].kind, "date");
  assert.match(parsed.normalized, /larger:5MB/);
});

test("rejects malformed and unknown operators with actionable errors", () => {
  assert.throws(() => parseSearchQuery("has:video"), /has: unsupported value/);
  assert.throws(() => parseSearchQuery("mystery:value"), /Unknown search operator/);
  assert.throws(() => parseSearchQuery('subject:"unfinished'), /Unclosed quoted phrase/);
  assert.throws(() => parseSearchQuery("after:not-a-date"), /after: invalid date/);
  assert.throws(() => parseSearchQuery("larger:watts"), /larger: invalid size/);
});

test("supports mailbox metadata filters and natural-language search", () => {
  const parsed = parseSearchQuery("from alex@example.com in the last 2 weeks with attachments spam:>70% links:>0 auth:pass type:pdf label:Projects has:calendar work:reply_later project:launch");

  assert.equal(parsed.filters.filter((filter) => filter.kind === "field").length, 1);
  assert.ok(parsed.filters.some((filter) => filter.kind === "date" && filter.operator === "after"));
  assert.ok(parsed.filters.some((filter) => filter.kind === "state" && filter.field === "has_attachment"));
  assert.ok(parsed.filters.some((filter) => filter.kind === "numeric" && filter.field === "spam_score" && filter.value === 0.7));
  assert.ok(parsed.filters.some((filter) => filter.kind === "numeric" && filter.field === "link_count" && filter.operator === "gt"));
  assert.ok(parsed.filters.some((filter) => filter.kind === "auth" && filter.value === "pass"));
  assert.ok(parsed.filters.some((filter) => filter.kind === "relation" && filter.relation === "filetype"));
  assert.ok(parsed.filters.some((filter) => filter.kind === "relation" && filter.relation === "label"));
  assert.ok(parsed.filters.some((filter) => filter.kind === "relation" && filter.relation === "calendar"));
  assert.ok(parsed.filters.some((filter) => filter.kind === "relation" && filter.relation === "work"));
  assert.ok(parsed.filters.some((filter) => filter.kind === "relation" && filter.relation === "project"));
});

test("builds bounded, owner-scoped, stable search requests", async () => {
  const result = await buildMailQuery({} as never, "owner-123", {
    folder: "inbox",
    query: 'from:alice@example.com "launch notes" -is:read',
    page: 2,
    pageSize: 80,
    sort: "oldest",
  });

  assert.equal(result.page, 2);
  assert.equal(result.pageSize, 80);
  assert.equal(result.searchActive, true);
  assert.match(result.path, /owner_id=eq.owner-123/);
  assert.match(result.path, /search_vector=wfts\./);
  assert.match(result.path, /from_address=ilike/);
  assert.match(result.path, /is_read=eq\.false/);
  assert.match(result.path, /order=created_at\.asc,id\.asc/);
  assert.match(result.path, /offset=80&limit=81/);
});

test("adds metadata comparisons without widening the owner scope", async () => {
  const result = await buildMailQuery({} as never, "owner-123", {
    folder: "all",
    query: "spam:>70% links:>0 auth:pass larger:5MB -is:read",
    pageSize: 20,
  });

  assert.match(result.path, /owner_id=eq.owner-123/);
  assert.match(result.path, /spam_score=gt\.0\.7/);
  assert.match(result.path, /link_count=gt\.0/);
  assert.match(result.path, /message_size_bytes=gt\.5000000/);
  assert.match(result.path, /or=/);
  assert.match(result.path, /is_read=eq\.false/);
});
