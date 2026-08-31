import { useEffect, useMemo, useState } from "react";
import { Code2, Eye, EyeOff, Image as ImageIcon, Link as LinkIcon, Mail, ShieldCheck } from "lucide-react";
import { inspectEmailHtml, safeEmailUrl, sanitizeEmailHtml } from "../lib/email-renderer";

type EmailBodyProps = {
  htmlBody?: string | null;
  textBody?: string | null;
  fallback?: string | null;
  attachments?: Array<{ id: string; content_id?: string | null; preview_state?: string }>;
  loadAttachmentPreview?: (id: string) => Promise<string>;
};

function normalizeContentId(value: string) {
  return value.replace(/^cid:/i, "").replace(/^<|>$/g, "").trim().toLowerCase();
}

function splitQuotedBody(value: string) {
  const lines = value.split(/\r?\n/);
  const quoteStart = lines.findIndex((line, index) =>
    index > 0 && (/^On .+wrote:\s*$/i.test(line.trim()) || /^>/.test(line.trim())),
  );
  if (quoteStart < 0) return { body: value.trim(), quote: "" };
  return { body: lines.slice(0, quoteStart).join("\n").trim(), quote: lines.slice(quoteStart).join("\n").trim() };
}

export default function EmailBody({ htmlBody, textBody, fallback, attachments = [], loadAttachmentPreview }: EmailBodyProps) {
  const html = htmlBody?.trim() || "";
  const plainText = textBody?.trim() || fallback?.trim() || "";
  const stats = useMemo(() => inspectEmailHtml(html), [html]);
  const [format, setFormat] = useState<"visual" | "text">(html ? "visual" : "text");
  const [showExternalImages, setShowExternalImages] = useState(false);
  const [inlineImageSources, setInlineImageSources] = useState<Record<string, string>>({});

  useEffect(() => {
    setFormat(html ? "visual" : "text");
    setShowExternalImages(false);
    setInlineImageSources({});
  }, [html, plainText]);

  useEffect(() => {
    let cancelled = false;
    const contentIds = [...html.matchAll(/<img\b[^>]*\bsrc\s*=\s*["']cid:([^"']+)/gi)]
      .map((match) => normalizeContentId(match[1] || ""))
      .filter(Boolean);
    const available = new Map(
      attachments
        .filter((attachment) => attachment.content_id && attachment.preview_state === "ready")
        .map((attachment) => [normalizeContentId(String(attachment.content_id)), attachment]),
    );
    const pending = [...new Set(contentIds)]
      .map((contentId) => ({ contentId, attachment: available.get(contentId) }))
      .filter((item): item is { contentId: string; attachment: { id: string; content_id?: string | null; preview_state?: string } } => Boolean(item.attachment));
    if (!pending.length || !loadAttachmentPreview) return () => { cancelled = true; };
    void Promise.all(pending.map(async ({ contentId, attachment }) => {
      try {
        const source = safeEmailUrl(await loadAttachmentPreview(attachment.id), "image");
        return source ? [contentId, source] as const : null;
      } catch {
        return null;
      }
    })).then((resolved) => {
      if (cancelled) return;
      setInlineImageSources(Object.fromEntries(resolved.filter((item): item is readonly [string, string] => Boolean(item))));
    });
    return () => { cancelled = true; };
  }, [html, attachments, loadAttachmentPreview]);

  const sanitizedHtml = useMemo(
    () => sanitizeEmailHtml(html, showExternalImages, new Map(Object.entries(inlineImageSources))),
    [html, showExternalImages, inlineImageSources],
  );
  const textParts = useMemo(() => splitQuotedBody(plainText), [plainText]);
  const showVisual = Boolean(html) && format === "visual";

  return (
    <section className="email-content-frame" aria-label="Message content">
      <div className="email-content-toolbar">
        <div className="email-content-heading">
          <span className="email-content-title"><Mail size={15} /> Message content</span>
          <span className="email-content-summary">
            {html ? "Rich HTML" : "Plain text"}
            {stats.linkCount > 0 && <> · {stats.linkCount} link{stats.linkCount === 1 ? "" : "s"}</>}
            {stats.tableCount > 0 && <> · formatted layout</>}
          </span>
        </div>
        {html && (
          <div className="email-format-switch" role="group" aria-label="Message format">
            <button className={format === "visual" ? "active" : ""} onClick={() => setFormat("visual")} aria-pressed={format === "visual"}>
              <Eye size={13} /> Visual
            </button>
            <button className={format === "text" ? "active" : ""} onClick={() => setFormat("text")} aria-pressed={format === "text"}>
              <Code2 size={13} /> Text
            </button>
          </div>
        )}
      </div>

      {showVisual && stats.externalImageCount > 0 && (
        <div className="email-external-images-banner" role="status">
          <div className="email-external-images-copy">
            {showExternalImages ? <ShieldCheck size={15} /> : <EyeOff size={15} />}
            <span>
              <strong>{showExternalImages ? "External images are enabled" : "External images are blocked"}</strong>
              <small>{showExternalImages ? "Images load without sending a referrer from Parcel." : "This protects privacy and blocks invisible tracking images."}</small>
            </span>
          </div>
          {!showExternalImages && (
            <button className="email-load-images" onClick={() => setShowExternalImages(true)}>
              <ImageIcon size={13} /> Load images
            </button>
          )}
        </div>
      )}

      {showVisual ? (
        <div className="email-html-surface" dangerouslySetInnerHTML={{ __html: sanitizedHtml || "<p>No message body.</p>" }} />
      ) : (
        <div className="email-text-surface">
          <div className="email-plain-body">{textParts.body || "No message body."}</div>
          {textParts.quote && (
            <details className="quoted-block">
              <summary>Show quoted text</summary>
              <div className="quoted-content">{textParts.quote}</div>
            </details>
          )}
          {html && (
            <p className="email-text-note"><Code2 size={13} /> Text view keeps the original plain-text alternative readable.</p>
          )}
        </div>
      )}

      <div className="email-content-footer">
        <span>{stats.inlineImageCount > 0 ? <><ImageIcon size={12} /> Embedded graphics supported</> : <><ShieldCheck size={12} /> Active content disabled</>}</span>
        {stats.linkCount > 0 && <span><LinkIcon size={12} /> Links open in a new tab</span>}
      </div>
    </section>
  );
}
