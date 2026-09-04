import assert from "node:assert/strict";
import test from "node:test";
import {
  authenticationAlignmentMismatches,
  extractTrustEvidence,
  normalizeAuthenticationResults,
  screeningDecisionPatch,
  selectSenderPolicy,
} from "../worker/trust.ts";

test("normalizes missing, ARC, TLS, and standard authentication results", () => {
  const missing = normalizeAuthenticationResults([]);
  assert.equal(missing.spf, null);
  assert.equal(missing.arc, null);
  assert.equal(missing.tls, null);

  const normalized = normalizeAuthenticationResults([{
    key: "Authentication-Results",
    value: "mx.example; spf=pass smtp.mailfrom=sender.example; dkim=pass header.d=sender.example; dmarc=pass header.from=sender.example; arc=pass; tls=pass tls.version=TLS1.3 tls.cipher=TLS_AES_256_GCM_SHA384",
  }]);
  assert.equal(normalized.spf, "pass");
  assert.equal(normalized.dkim, "pass");
  assert.equal(normalized.dmarc, "pass");
  assert.equal(normalized.arc, "pass");
  assert.equal(normalized.tls, "pass");
  assert.equal(normalized.tls_version, "tls1.3");
  assert.equal(normalized.dkim_domain, "sender.example");
  assert.deepEqual(authenticationAlignmentMismatches({ ...normalized, spf_domain: "evil.example", dkim_domain: "evil.example", dmarc_domain: "evil.example" }, "visible.example"), ["SPF", "DKIM", "DMARC"]);
});

test("records mismatch, first-seen, link-host, and tracking-pixel evidence", () => {
  const auth = normalizeAuthenticationResults([{ key: "Authentication-Results", value: "mx; spf=pass smtp.mailfrom=evil.example" }]);
  const evidence = extractTrustEvidence({
    sender: "visible@example.com",
    replyTo: "redirect@other.example",
    subject: "Please review",
    textBody: "Visit https://example.com and https://bit.ly/abc",
    htmlBody: '<a href="https://evil.example/login">https://example.com</a><img src="https://tracker.example/p.gif" width="1" height="1">',
    authentication: auth,
    firstSeenSender: true,
    knownContact: false,
  });
  assert.equal(evidence.reply_to_mismatch, true);
  assert.equal(evidence.first_seen_sender, true);
  assert.equal(evidence.known_contact, false);
  assert.equal(evidence.link_count, 4);
  assert.equal(evidence.tracking_pixel_count, 1);
  assert.ok(evidence.link_hosts.some((item) => item.host === "bit.ly" && item.shortened));
});

test("records anti-phishing identity, QR, attachment, and brand signals", () => {
  const auth = normalizeAuthenticationResults([
    { key: "Authentication-Results", value: "mx; spf=fail; dkim=pass; dmarc=fail; arc=pass; tls=pass" },
    { key: "BIMI-Location", value: "https://brand.invalid/logo.svg" },
    { key: "BIMI-Selector", value: "default" },
  ]);
  const evidence = extractTrustEvidence({
    sender: "micros0ft-alerts@micros0ft.example",
    fromName: "Microsoft account security",
    mailboxAddress: "james@example.com",
    replyTo: "help@credential.example",
    htmlBody: '<img src="https://example.invalid/qr-code.png" alt="scan QR code"><a href="https://bit.ly/abc">Continue</a>',
    authentication: auth,
    attachments: [{ filename: "invoice.xlsm", mimeType: "application/vnd.ms-excel.sheet.macroEnabled.12" }],
  });
  assert.equal(auth.bimi_location, "https://brand.invalid/logo.svg");
  assert.equal(auth.bimi_selector, "default");
  assert.equal(evidence.lookalike_domain, "Microsoft");
  assert.equal(evidence.display_name_spoof, true);
  assert.equal(evidence.suspicious_reply_to, true);
  assert.equal(evidence.qr_code_count, 1);
  assert.equal(evidence.attachment_reputation[0]?.status, "suspicious");
  assert.equal(evidence.brand_indicator.present, true);
});

test("policy precedence favors exact mailbox address over global domain", () => {
  const selected = selectSenderPolicy([
    { id: "domain", mailbox_id: null, match_type: "domain", match_value: "example.com", action: "spam", enabled: true },
    { id: "address", mailbox_id: "mailbox-1", match_type: "address", match_value: "sender@example.com", action: "inbox", enabled: true },
  ], "mailbox-1", "sender@example.com");
  assert.equal(selected?.id, "address");
  assert.equal(selectSenderPolicy([{ id: "screen", mailbox_id: null, match_type: "domain", match_value: "example.com", action: "screen", enabled: true }], "mailbox-1", "other@example.com")?.action, "screen");
});

test("screening decisions are reversible and explicit", () => {
  assert.deepEqual(screeningDecisionPatch("approve"), { folder: "inbox", custom_folder_id: null, screening_status: "approved", event: "allowed" });
  assert.deepEqual(screeningDecisionPatch("block"), { folder: "spam", custom_folder_id: null, screening_status: "blocked", event: "blocked" });
  assert.deepEqual(screeningDecisionPatch("reroute", "archive"), { folder: "archive", custom_folder_id: null, screening_status: "rerouted", event: "rerouted" });
});
