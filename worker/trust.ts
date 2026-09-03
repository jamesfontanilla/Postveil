export type AuthStatus = "pass" | "fail" | "softfail" | "neutral" | "none" | "temperror" | "permerror" | string;

export type TrustAuthResults = {
  header: string;
  spf: AuthStatus | null;
  dkim: AuthStatus | null;
  dmarc: AuthStatus | null;
  arc: AuthStatus | null;
  tls: AuthStatus | null;
  spf_domain: string | null;
  dkim_domain: string | null;
  dmarc_domain: string | null;
  tls_version: string | null;
  tls_cipher: string | null;
  bimi_location: string | null;
  bimi_selector: string | null;
};

export type TrustLink = {
  host: string;
  count: number;
  shortened: boolean;
  suspicious: boolean;
  reputation: "unknown" | "suspicious";
  reputation_reasons: string[];
};

export type AttachmentReputation = {
  filename: string;
  mime_type: string;
  status: "unknown" | "suspicious" | "blocked";
  reasons: string[];
};

export type TrustEvidence = {
  sender: string;
  reply_to: string;
  reply_to_mismatch: boolean;
  link_count: number;
  link_hosts: TrustLink[];
  tracking_pixel_count: number;
  tracking_pixel_hosts: string[];
  authentication: TrustAuthResults;
  first_seen_sender: boolean;
  known_contact: boolean;
  policy_action: string | null;
  policy_id: string | null;
  sender_domain: string;
  mailbox_domain: string;
  external_sender: boolean;
  display_name: string;
  display_name_spoof: boolean;
  lookalike_domain: string | null;
  suspicious_reply_to: boolean;
  qr_code_count: number;
  link_reputation: TrustLink[];
  attachment_reputation: AttachmentReputation[];
  malware_scan: "static_only" | "blocked";
  brand_indicator: { present: boolean; location: string | null; selector: string | null; verified: false };
};

export type TrustPolicy = {
  id: string;
  mailbox_id: string | null;
  match_type: "address" | "domain";
  match_value: string;
  action: string;
  target_folder_id?: string | null;
  target_label_id?: string | null;
  enabled?: boolean;
};

const statusPattern = "pass|fail|softfail|neutral|none|temperror|permerror";

function cleanAddress(value: string): string {
  return value.trim().replace(/^.*<([^>]+)>.*$/, "$1").toLowerCase();
}

function addressDomain(value: string): string {
  return cleanAddress(value).split("@").pop() || "";
}

function authStatus(header: string, mechanism: string): AuthStatus | null {
  const match = header.match(new RegExp("\\b" + mechanism + "=(\\w+)", "i"));
  if (!match) return null;
  const status = match[1].toLowerCase();
  return new RegExp("^(?:" + statusPattern + ")$", "i").test(status) ? status : "unknown";
}

function mechanismSegment(header: string, mechanism: string): string {
  return header.match(new RegExp("\\b" + mechanism + "=[^;]+", "i"))?.[0] || "";
}

function authParameter(header: string, mechanism: string, parameter: string): string | null {
  const segment = mechanismSegment(header, mechanism);
  const match = segment.match(new RegExp("\\b" + parameter + "=([^\\s;]+)", "i"));
  return match?.[1]?.replace(/[<>]/g, "").toLowerCase() || null;
}

function tlsStatus(header: string): AuthStatus | null {
  const explicit = authStatus(header, "tls");
  if (explicit) return explicit;
  return /\btls\.(?:version|cipher)=/i.test(header) ? "pass" : null;
}

function headerValue(headers: Array<{ key?: string; value?: string }>, key: string): string | null {
  return headers.find((item) => String(item.key || "").toLowerCase() === key.toLowerCase())?.value?.trim() || null;
}

export function normalizeAuthenticationResults(headers: Array<{ key?: string; value?: string }> = []): TrustAuthResults {
  const header = headers
    .filter((item) => String(item.key || "").toLowerCase() === "authentication-results")
    .map((item) => String(item.value || "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, 4000);
  return {
    header,
    spf: authStatus(header, "spf"),
    dkim: authStatus(header, "dkim"),
    dmarc: authStatus(header, "dmarc"),
    arc: authStatus(header, "arc"),
    tls: tlsStatus(header),
    spf_domain: authParameter(header, "spf", "smtp.mailfrom"),
    dkim_domain: authParameter(header, "dkim", "header.d"),
    dmarc_domain: authParameter(header, "dmarc", "header.from"),
    tls_version: authParameter(header, "tls", "version") || header.match(/\btls\.version=([^\s;]+)/i)?.[1]?.toLowerCase() || null,
    tls_cipher: authParameter(header, "tls", "cipher") || header.match(/\btls\.cipher=([^\s;]+)/i)?.[1]?.toLowerCase() || null,
    bimi_location: headerValue(headers, "bimi-location") || headerValue(headers, "brand-indicator") || null,
    bimi_selector: headerValue(headers, "bimi-selector"),
  };
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ");
}

function urlHost(value: string): string {
  try { return new URL(value).hostname.toLowerCase(); } catch { return ""; }
}

function isSuspiciousHost(host: string): boolean {
  return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(host) || host.startsWith("xn--");
}

function isShortener(host: string): boolean {
  return /(?:^|\.)?(?:bit\.ly|tinyurl\.com|t\.co|goo\.gl|ow\.ly|is\.gd|cutt\.ly)$/i.test(host);
}

const BRAND_DOMAINS: Array<[string, string[]]> = [
  ["Amazon", ["amazon.com", "amazonaws.com"]],
  ["Apple", ["apple.com", "icloud.com"]],
  ["DocuSign", ["docusign.com"]],
  ["Dropbox", ["dropbox.com"]],
  ["Facebook", ["facebook.com", "meta.com"]],
  ["GitHub", ["github.com"]],
  ["Google", ["google.com", "gmail.com"]],
  ["Instagram", ["instagram.com"]],
  ["LinkedIn", ["linkedin.com"]],
  ["Microsoft", ["microsoft.com", "outlook.com", "office.com"]],
  ["PayPal", ["paypal.com"]],
  ["Yahoo", ["yahoo.com"]],
];

function rootDomain(value: string): string {
  const labels = value.toLowerCase().split(".").filter(Boolean);
  return labels.length > 2 ? labels.slice(-2).join(".") : labels.join(".");
}

function compactBrand(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "").replace(/[0135]/g, (character) => ({ "0": "o", "1": "l", "3": "e", "5": "s" }[character] || character));
}

function editDistance(left: string, right: string): number {
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = row[0];
    row[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const above = row[j];
      row[j] = left[i - 1] === right[j - 1] ? diagonal : Math.min(row[j] + 1, row[j - 1] + 1, diagonal + 1);
      diagonal = above;
    }
  }
  return row[right.length];
}

function detectLookalikeDomain(domain: string): string | null {
  const normalized = domain.toLowerCase().replace(/\.$/, "");
  if (!normalized || normalized.startsWith("xn--")) return "internationalized domain name";
  const stem = normalized.split(".")[0] || normalized;
  const compact = compactBrand(stem);
  for (const [brand, domains] of BRAND_DOMAINS) {
    if (domains.includes(rootDomain(normalized))) continue;
    const brandCompact = compactBrand(brand);
    if (compact === brandCompact || (compact.length >= 5 && editDistance(compact, brandCompact) <= 1)) return brand;
  }
  return null;
}

function detectDisplayNameSpoof(displayName: string, domain: string): boolean {
  const display = compactBrand(displayName);
  if (!display) return false;
  return BRAND_DOMAINS.some(([brand, domains]) => display.includes(compactBrand(brand)) && !domains.includes(rootDomain(domain)));
}

function linkReputation(host: string, senderDomain: string): { reputation: "unknown" | "suspicious"; reasons: string[] } {
  const reasons: string[] = [];
  if (isShortener(host)) reasons.push("URL shortener hides the final destination");
  if (isSuspiciousHost(host)) reasons.push("raw IP or internationalized host");
  if (senderDomain && rootDomain(host) !== rootDomain(senderDomain)) reasons.push("external destination");
  return { reputation: reasons.some((reason) => !reason.includes("external")) ? "suspicious" : "unknown", reasons };
}

function attachmentReputation(filename: string, mimeType: string): AttachmentReputation {
  const lowerName = filename.toLowerCase();
  const lowerMime = mimeType.toLowerCase();
  const blocked = /\.(?:exe|dll|scr|js|vbs|cmd|bat|ps1|msi|jar|hta|iso|lnk)$/i.test(lowerName) || /(?:x-msdownload|x-sh|javascript)/i.test(lowerMime);
  const suspicious = /\.(?:docm|dotm|xlsm|xltm|pptm|ppsm|zip|rar|7z)$/i.test(lowerName) || /(?:macroenabled|x-7z-compressed|x-rar-compressed)/i.test(lowerMime);
  const reasons = blocked ? ["Executable or active content is blocked"] : suspicious ? ["Archive or macro-enabled content needs review"] : [];
  return { filename, mime_type: mimeType, status: blocked ? "blocked" : suspicious ? "suspicious" : "unknown", reasons };
}

function attribute(tag: string, name: string): string {
  return tag.match(new RegExp("\\b" + name + "\\s*=\\s*[\"']?([^\\s\"'>]+)", "i"))?.[1] || "";
}

function isTinyDimension(value: string): boolean {
  const numeric = Number.parseFloat(value.replace(/px$/i, ""));
  return Number.isFinite(numeric) && numeric > 0 && numeric <= 3;
}

export function extractTrustEvidence(input: {
  sender: string;
  replyTo?: string | null;
  fromName?: string | null;
  mailboxAddress?: string | null;
  subject?: string;
  textBody?: string;
  htmlBody?: string;
  authentication: TrustAuthResults;
  attachments?: Array<{ filename?: string | null; mimeType?: string | null }>;
  firstSeenSender?: boolean;
  knownContact?: boolean;
  policyAction?: string | null;
  policyId?: string | null;
}): TrustEvidence {
  const sender = cleanAddress(input.sender);
  const replyTo = cleanAddress(input.replyTo || sender);
  const senderDomain = addressDomain(sender);
  const mailboxDomain = addressDomain(input.mailboxAddress || "");
  const html = String(input.htmlBody || "");
  const content = String(input.subject || "") + " " + String(input.textBody || "") + " " + stripHtml(html);
  const hrefs = [...html.matchAll(/<a\b[^>]*\bhref\s*=\s*[\"'](https?:\/\/[^\"']+)[\"']/gi)].map((match) => match[1]);
  const urls = [...(content.match(/https?:\/\/[^\s"'<>]+/gi) || []), ...hrefs];
  const linkMap = new Map<string, TrustLink>();
  urls.forEach((value) => {
    const host = urlHost(value.replace(/[),.;!?]+$/, ""));
    if (!host) return;
    const current = linkMap.get(host);
    const reputation = linkReputation(host, senderDomain);
    linkMap.set(host, {
      host,
      count: (current?.count || 0) + 1,
      shortened: Boolean(current?.shortened) || isShortener(host),
      suspicious: Boolean(current?.suspicious) || isSuspiciousHost(host),
      reputation: current?.reputation === "suspicious" || reputation.reputation === "suspicious" ? "suspicious" : "unknown",
      reputation_reasons: [...new Set([...(current?.reputation_reasons || []), ...reputation.reasons])],
    });
  });
  const linkHosts = [...linkMap.values()].slice(0, 50);
  const trackingPixelHosts = [...html.matchAll(/<img\b[^>]*>/gi)].flatMap((match) => {
    const tag = match[0];
    const src = attribute(tag, "src");
    if (!/^https?:\/\//i.test(src)) return [];
    const style = attribute(tag, "style");
    const tiny = isTinyDimension(attribute(tag, "width")) || isTinyDimension(attribute(tag, "height"))
      || /(?:display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0|width\s*:\s*[1-3]px|height\s*:\s*[1-3]px)/i.test(style);
    return tiny ? [urlHost(src)] : [];
  }).filter(Boolean).slice(0, 50);
  const linkReputationItems = linkHosts.filter((item) => item.reputation === "suspicious" || item.reputation_reasons.includes("external destination"));
  const qrImageCandidates = [...html.matchAll(/<(?:img|svg|object)\b[^>]*(?:qr|quick[ -]?response|scan)[^>]*>/gi)];
  const qrTextCandidates = [...String(content).matchAll(/\b(?:qr code|quick response code|scan this code)\b/gi)];
  const qrCodeCount = qrImageCandidates.length || qrTextCandidates.length;
  const attachments = (input.attachments || []).map((item) => attachmentReputation(String(item.filename || "attachment"), String(item.mimeType || "application/octet-stream")));
  const lookalikeDomain = detectLookalikeDomain(senderDomain);
  const displayNameSpoof = detectDisplayNameSpoof(String(input.fromName || ""), senderDomain);
  const suspiciousReplyTo = Boolean(replyTo && sender && replyTo !== sender && rootDomain(addressDomain(replyTo)) !== rootDomain(senderDomain));
  return {
    sender,
    reply_to: replyTo,
    reply_to_mismatch: Boolean(replyTo && sender && replyTo !== sender),
    link_count: urls.length,
    link_hosts: linkHosts,
    tracking_pixel_count: trackingPixelHosts.length,
    tracking_pixel_hosts: [...new Set(trackingPixelHosts)],
    authentication: input.authentication,
    first_seen_sender: input.firstSeenSender === true,
    known_contact: input.knownContact === true,
    policy_action: input.policyAction || null,
    policy_id: input.policyId || null,
    sender_domain: senderDomain,
    mailbox_domain: mailboxDomain,
    external_sender: Boolean(senderDomain && mailboxDomain && rootDomain(senderDomain) !== rootDomain(mailboxDomain)),
    display_name: String(input.fromName || "").trim().slice(0, 200),
    display_name_spoof: displayNameSpoof,
    lookalike_domain: lookalikeDomain,
    suspicious_reply_to: suspiciousReplyTo,
    qr_code_count: qrCodeCount,
    link_reputation: linkReputationItems,
    attachment_reputation: attachments,
    malware_scan: attachments.some((item) => item.status === "blocked") ? "blocked" : "static_only",
    brand_indicator: { present: Boolean(input.authentication.bimi_location), location: input.authentication.bimi_location, selector: input.authentication.bimi_selector, verified: false },
  };
}

export function selectSenderPolicy(policies: TrustPolicy[], mailboxId: string, sender: string): TrustPolicy | null {
  const normalizedSender = cleanAddress(sender);
  const domain = addressDomain(normalizedSender);
  return policies
    .filter((policy) => policy.enabled !== false && (policy.mailbox_id === null || policy.mailbox_id === mailboxId))
    .filter((policy) => (policy.match_type === "address" && policy.match_value.toLowerCase() === normalizedSender)
      || (policy.match_type === "domain" && policy.match_value.toLowerCase().replace(/^@/, "").replace(/\.$/, "") === domain))
    .sort((left, right) => {
      const mailboxRank = Number(right.mailbox_id === mailboxId) - Number(left.mailbox_id === mailboxId);
      if (mailboxRank) return mailboxRank;
      const matchRank = Number(right.match_type === "address") - Number(left.match_type === "address");
      if (matchRank) return matchRank;
      const actionRank = (action: string) => action === "spam" ? 3 : action === "folder" || action === "archive" ? 2 : action === "screen" ? 1 : 0;
      return actionRank(right.action) - actionRank(left.action);
    })[0] || null;
}

export function authenticationAlignmentMismatches(auth: TrustAuthResults, visibleDomain: string): string[] {
  const mismatches: string[] = [];
  const align = (left: string | null, right: string) => Boolean(left && right && (left === right || left.endsWith("." + right) || right.endsWith("." + left)));
  if (auth.spf === "pass" && auth.spf_domain && !align(auth.spf_domain, visibleDomain)) mismatches.push("SPF");
  if (auth.dkim === "pass" && auth.dkim_domain && !align(auth.dkim_domain, visibleDomain)) mismatches.push("DKIM");
  if (auth.dmarc === "pass" && auth.dmarc_domain && !align(auth.dmarc_domain, visibleDomain)) mismatches.push("DMARC");
  return mismatches;
}

export function screeningDecisionPatch(decision: "approve" | "block" | "reroute", targetFolder?: "archive" | "custom"): { folder: string; custom_folder_id: string | null; screening_status: string; event: "allowed" | "blocked" | "rerouted" } {
  if (decision === "approve") return { folder: "inbox", custom_folder_id: null, screening_status: "approved", event: "allowed" };
  if (decision === "block") return { folder: "spam", custom_folder_id: null, screening_status: "blocked", event: "blocked" };
  return { folder: targetFolder === "custom" ? "custom" : "archive", custom_folder_id: null, screening_status: "rerouted", event: "rerouted" };
}
