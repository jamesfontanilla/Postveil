import assert from "node:assert/strict";
import test from "node:test";
import { inspectEmailHtml, safeEmailUrl, sanitizeInlineStyle } from "../src/lib/email-renderer.ts";

test("email URLs allow safe navigation schemes and reject executable schemes", () => {
  assert.equal(safeEmailUrl("https://example.com/path"), "https://example.com/path");
  assert.equal(safeEmailUrl("mailto:hello@example.com"), "mailto:hello@example.com");
  assert.equal(safeEmailUrl("javascript:alert(1)"), null);
  assert.equal(safeEmailUrl("data:text/html,<script>alert(1)</script>"), null);
  assert.equal(safeEmailUrl("data:image/svg+xml;base64,abc", "image"), null);
});

test("inline email styles remove active or page-escaping declarations", () => {
  assert.equal(
    sanitizeInlineStyle("color: #172033; position: fixed; background-image: url(https://tracker.test/pixel); padding: 12px"),
    "color: #172033; padding: 12px",
  );
});

test("email HTML inspection identifies graphics, links, and table layouts", () => {
  const stats = inspectEmailHtml('<table><tr><td><img src="https://cdn.example/hero.png"><a href="https://example.com">Open</a></td></tr></table>');
  assert.deepEqual(stats, { externalImageCount: 1, inlineImageCount: 0, linkCount: 1, tableCount: 1, hasRichStructure: true });
});
