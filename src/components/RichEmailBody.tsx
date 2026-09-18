import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import {
  EyeOff,
  ExternalLink,
  FileDown,
  Image as ImageIcon,
  BookOpen,
  Languages,
  Link2,
  Minus,
  Moon,
  Plus,
  Printer,
  Search,
  SlidersHorizontal,
  Quote,
  ShieldAlert,
  ShieldCheck,
  Sun,
  Volume2,
  Square,
  X,
} from "lucide-react";
import { inspectEmailHtml } from "../lib/email-renderer";
import { sanitizeEmailHtml } from "../lib/email-html";

type LinkInspection = {
  ok: boolean;
  url: string;
  finalUrl?: string;
  chain?: Array<{ url: string; status: number; location?: string | null }>;
  warning?: string;
};

type RichEmailBodyProps = {
  htmlBody?: string | null;
  textBody?: string | null;
  fallback?: string | null;
  inlineImageUrls?: Record<string, string>;
  loadRemoteImages?: boolean;
  loadExternalImage?: (source: string) => Promise<string>;
  inspectLink?: (source: string) => Promise<LinkInspection>;
};

function splitQuotedBody(value: string) {
  const lines = value.split(/\r?\n/);
  const quoteStart = lines.findIndex((line, index) =>
    index > 0 && (/^On .+wrote:\s*$/i.test(line.trim()) || /^>/.test(line.trim())),
  );
  if (quoteStart < 0) return { body: value.trim(), quote: "" };
  return { body: lines.slice(0, quoteStart).join("\n").trim(), quote: lines.slice(quoteStart).join("\n").trim() };
}

function splitSignature(value: string) {
  const lines = value.split(/\r?\n/);
  const signatureStart = lines.findIndex((line, index) => index > 0 && /^(?:--\s*|—\s*)$/.test(line.trim()));
  if (signatureStart < 0) return { body: value.trim(), signature: "" };
  return { body: lines.slice(0, signatureStart).join("\n").trim(), signature: lines.slice(signatureStart).join("\n").trim() };
}

function trackingPixelCount(source: string) {
  return (source.match(/<img\b[^>]*(?:width\s*=\s*["']?\s*[0-4]\s*["']?|height\s*=\s*["']?\s*[0-4]\s*["']?|(?:pixel|beacon|track|open)[^>]*src)/gi) || []).length;
}

function remoteImageSources(sanitized: string) {
  if (typeof DOMParser === "undefined") return [];
  const document = new DOMParser().parseFromString(sanitized, "text/html");
  return [...document.querySelectorAll("img[data-postveil-remote-src]")]
    .map((image) => image.getAttribute("data-postveil-remote-src") || "")
    .filter(Boolean);
}

function sourceLabel(source: string) {
  try {
    return new URL(source).hostname.replace(/^www\./i, "");
  } catch {
    return source;
  }
}

function readableStatus(inspection?: LinkInspection | null) {
  if (!inspection) return "Not inspected yet";
  if (!inspection.ok) return inspection.warning || "Destination could not be inspected";
  if (inspection.warning) return inspection.warning;
  return inspection.finalUrl && inspection.finalUrl !== inspection.url
    ? `Redirects to ${sourceLabel(inspection.finalUrl)}`
    : "Destination inspected";
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] || character);
}

function plainTextToHtml(value: string) {
  const { body, quote } = splitQuotedBody(value);
  const renderParagraphs = (text: string) => text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\r?\n/g, "<br />")}</p>`)
    .join("");
  const bodyHtml = renderParagraphs(body);
  const quoteHtml = quote ? `<blockquote>${renderParagraphs(quote)}</blockquote>` : "";
  return bodyHtml || quoteHtml || "<p>No message body.</p>";
}

export default function RichEmailBody({
  htmlBody,
  textBody,
  fallback,
  inlineImageUrls = {},
  loadRemoteImages = false,
  loadExternalImage,
  inspectLink,
}: RichEmailBodyProps) {
  const html = htmlBody?.trim() || "";
  const plainText = textBody?.trim() || fallback?.trim() || "";
  const stats = useMemo(() => inspectEmailHtml(html), [html]);
  const trackerCount = useMemo(() => trackingPixelCount(html), [html]);
  const textParts = useMemo(() => splitQuotedBody(plainText), [plainText]);
  const signatureParts = useMemo(() => splitSignature(textParts.body), [textParts.body]);
  const [showRemoteImages, setShowRemoteImages] = useState(loadRemoteImages);
  const [externalImageUrls, setExternalImageUrls] = useState<Record<string, string>>({});
  const [loadingImages, setLoadingImages] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [darkEmail, setDarkEmail] = useState(false);
  const [responsive, setResponsive] = useState(true);
  const [showQuotes, setShowQuotes] = useState(false);
  const [translationOpen, setTranslationOpen] = useState(false);
  const [translationLanguage, setTranslationLanguage] = useState("browser");
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [immersiveOpen, setImmersiveOpen] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [linkTarget, setLinkTarget] = useState<string | null>(null);
  const [linkInspection, setLinkInspection] = useState<LinkInspection | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);
  const objectUrls = useRef<string[]>([]);

  useEffect(() => {
    setShowRemoteImages(loadRemoteImages);
    setExternalImageUrls({});
    setZoom(100);
    setDarkEmail(false);
    setShowQuotes(false);
    setLinkTarget(null);
    setLinkInspection(null);
    setFindOpen(false);
    setFindQuery("");
    setImmersiveOpen(false);
    setSpeaking(false);
  }, [html, plainText, loadRemoteImages]);

  useEffect(() => () => {
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
  }, []);

  const visualSource = useMemo(() => html || plainTextToHtml(plainText), [html, plainText]);
  const sourceHtml = useMemo(
    () => sanitizeEmailHtml(visualSource, { inlineImageUrls, loadExternalImages: false }),
    [inlineImageUrls, visualSource],
  );

  useEffect(() => {
    if (!showRemoteImages || !loadExternalImage) return undefined;
    const sources = [...new Set(remoteImageSources(sourceHtml))].slice(0, 16);
    const pending = sources.filter((source) => !externalImageUrls[source]);
    if (!pending.length) return undefined;
    let cancelled = false;
    setLoadingImages(true);
    void Promise.allSettled(pending.map(async (source) => ({ source, url: await loadExternalImage(source) })))
      .then((results) => {
        if (cancelled) return;
        const loaded: Record<string, string> = {};
        results.forEach((result) => {
          if (result.status === "fulfilled") {
            loaded[result.value.source] = result.value.url;
            if (result.value.url.startsWith("blob:")) objectUrls.current.push(result.value.url);
          }
        });
        setExternalImageUrls((current) => ({ ...current, ...loaded }));
      })
      .finally(() => {
        if (!cancelled) setLoadingImages(false);
      });
    return () => { cancelled = true; };
  }, [externalImageUrls, loadExternalImage, showRemoteImages, sourceHtml]);

  useEffect(() => () => {
    objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrls.current = [];
  }, []);

  const sanitizedHtml = useMemo(
    () => sanitizeEmailHtml(visualSource, { inlineImageUrls, loadExternalImages: showRemoteImages, externalImageUrls }),
    [externalImageUrls, inlineImageUrls, showRemoteImages, visualSource],
  );
  const externalImageCount = stats.externalImageCount;
  const findMatchCount = findQuery.trim()
    ? (plainText.toLowerCase().match(new RegExp(findQuery.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length
    : 0;

  function printEmail() {
    document.body.classList.add("printing-email");
    window.setTimeout(() => {
      window.print();
      window.setTimeout(() => document.body.classList.remove("printing-email"), 500);
    }, 0);
  }

  function openInNewWindow() {
    const popup = window.open("", "postveil-email", "noopener,noreferrer,width=920,height=760");
    if (!popup) return;
    popup.document.write(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Email · Postveil</title><style>body{margin:0;background:#f4f6f2;color:#17221f;font:16px/1.6 system-ui,sans-serif}.email{box-sizing:border-box;width:min(860px,100%);margin:0 auto;padding:40px 28px;background:#fff;min-height:100vh;overflow-wrap:anywhere}.email img{max-width:100%;height:auto}.email table{max-width:100%}a{color:#3156d8}</style></head><body><main class="email" aria-label="Email message">${sanitizedHtml || `<pre>${plainText.replace(/[&<>]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[character] || character)}</pre>`}</main></body></html>`);
    popup.document.close();
  }

  function findNextMatch() {
    if (!findQuery.trim()) return;
    const finder = (window as Window & { find?: (...args: unknown[]) => boolean }).find;
    finder?.(findQuery.trim(), false, false, true, false, false, false);
  }

  function toggleReadAloud() {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(signatureParts.body || plainText || "No message body.");
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    setSpeaking(true);
  }

  async function handleContentClick(event: ReactMouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    const link = target.closest("a");
    if (!link) return;
    const href = link.getAttribute("href") || "";
    if (!/^https?:\/\//i.test(href)) return;
    event.preventDefault();
    setLinkTarget(href);
    setLinkInspection(null);
    if (!inspectLink) return;
    setLinkBusy(true);
    try {
      setLinkInspection(await inspectLink(href));
    } catch {
      setLinkInspection({ ok: false, url: href, warning: "Destination inspection is unavailable right now." });
    } finally {
      setLinkBusy(false);
    }
  }

  return (
    <section className="rich-email-reader" aria-label="Message content">
      <div className="rich-email-toolbar">
        <details className="rich-email-toolbar-menu">
          <summary><SlidersHorizontal size={13} /> View</summary>
          <div className="rich-email-toolbar-popover">
            <div className="rich-email-toolbar-group rich-email-reader-tools" role="group" aria-label="Reading tools">
              <button onClick={() => setZoom((value) => Math.max(75, value - 10))} aria-label="Zoom out" title="Zoom out"><Minus size={13} /></button>
              <span className="rich-email-zoom" aria-live="polite">{zoom}%</span>
              <button onClick={() => setZoom((value) => Math.min(180, value + 10))} aria-label="Zoom in" title="Zoom in"><Plus size={13} /></button>
              <button className={responsive ? "is-active" : ""} onClick={() => setResponsive((value) => !value)} aria-pressed={responsive} title="Toggle responsive preview"><span className="rich-email-responsive-icon">↔</span><span className="rich-email-tool-label">Responsive</span></button>
              <button onClick={() => setDarkEmail((value) => !value)} aria-pressed={darkEmail} title="Toggle email dark mode">{darkEmail ? <Sun size={13} /> : <Moon size={13} />}<span className="rich-email-tool-label">Email theme</span></button>
              <button onClick={printEmail} title="Print or save as PDF"><FileDown size={13} /><span className="rich-email-tool-label">PDF / Print</span></button>
              <button onClick={openInNewWindow} title="Open message in a new window"><ExternalLink size={13} /><span className="rich-email-tool-label">New window</span></button>
              <button className={findOpen ? "is-active" : ""} onClick={() => setFindOpen((value) => !value)} aria-expanded={findOpen} title="Find in message"><Search size={13} /><span className="rich-email-tool-label">Find</span></button>
              <button onClick={() => setImmersiveOpen(true)} title="Open Immersive Reader"><BookOpen size={13} /><span className="rich-email-tool-label">Immersive</span></button>
            </div>
          </div>
        </details>
      </div>

      {findOpen && <div className="rich-email-find" role="search" aria-label="Find in message"><Search size={14} /><input autoFocus value={findQuery} onChange={(event) => setFindQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); findNextMatch(); } }} placeholder="Find in this message" aria-label="Find in this message" /><span>{findQuery ? `${findMatchCount} match${findMatchCount === 1 ? "" : "es"}` : "Type to search"}</span><button onClick={findNextMatch} disabled={!findQuery.trim()}>Next</button><button onClick={() => { setFindOpen(false); setFindQuery(""); }} aria-label="Close message search"><X size={14} /></button></div>}

      <div className="rich-email-security-strip" role="status" aria-live="polite">
        <span><ShieldCheck size={13} /> Safe renderer</span>
        {trackerCount > 0 && <span className="rich-email-warning"><ShieldAlert size={13} /> {trackerCount} tracking pixel{trackerCount === 1 ? "" : "s"} blocked</span>}
        {externalImageCount > 0 && <span><ImageIcon size={13} /> {showRemoteImages ? (loadingImages ? "Loading images privately…" : "Images loaded privately") : `${externalImageCount} external image${externalImageCount === 1 ? "" : "s"} blocked`}</span>}
        {stats.linkCount > 0 && <span><Link2 size={13} /> {stats.linkCount} link{stats.linkCount === 1 ? "" : "s"} require inspection</span>}
      </div>

      {externalImageCount > 0 && (
        <div className="rich-email-content-warning" role="status">
          <div><EyeOff size={15} /><span><strong>{showRemoteImages ? "External images use a privacy proxy" : "External images are blocked"}</strong><small>{showRemoteImages ? "The sender receives a request from Postveil, not your device." : "Inline images remain available. Remote images and invisible beacons stay off until you choose otherwise."}</small></span></div>
          {!showRemoteImages && loadExternalImage && <button onClick={() => setShowRemoteImages(true)}><ImageIcon size={13} /> Load privately</button>}
        </div>
      )}

      {trackerCount > 0 && <div className="rich-email-tracker-note"><ShieldAlert size={14} /><span>Postveil removed likely tracking pixels. Images with meaningful dimensions are still available as inline graphics.</span></div>}

      <div className={`rich-email-surface ${darkEmail ? "rich-email-dark" : ""} ${responsive ? "rich-email-responsive" : "rich-email-original-width"}`} style={{ fontSize: `${zoom}%` }} onClick={(event) => void handleContentClick(event)} role="document" aria-label="Sanitized HTML email">
        <div className={showQuotes ? "rich-email-html" : "rich-email-html rich-email-quoted-collapsed"} dangerouslySetInnerHTML={{ __html: sanitizedHtml || "<p>No message body.</p>" }} />
      </div>

      <div className="rich-email-footer-tools">
        <button onClick={() => setShowQuotes((value) => !value)} aria-pressed={showQuotes}><Quote size={13} /> {showQuotes ? "Hide quoted replies" : "Show quoted replies"}</button>
        <button onClick={() => setTranslationOpen((value) => !value)} aria-expanded={translationOpen}><Languages size={13} /> Translate</button>
        <span className="rich-email-footer-note">Scripts, forms, frames, SVG, unsafe CSS, and active content are removed.</span>
      </div>

      {translationOpen && <div className="rich-email-translation-panel"><Languages size={15} /><div><strong>Message translation</strong><p>Translation stays opt-in so private messages are not sent to a third-party service automatically.</p><label htmlFor="translation-language">Language<select id="translation-language" value={translationLanguage} onChange={(event) => setTranslationLanguage(event.target.value)}><option value="browser">Use browser translation</option><option value="en">English</option><option value="fil">Filipino</option><option value="es">Spanish</option><option value="fr">French</option></select></label><small>{translationLanguage === "browser" ? "Use your browser’s Translate command to keep the message in this page." : "A translation provider must be configured by the deployment owner before translated text can be generated."}</small></div><button onClick={() => setTranslationOpen(false)} aria-label="Close translation panel"><X size={14} /></button></div>}

      {immersiveOpen && <div className="immersive-reader-backdrop" role="presentation"><section className="immersive-reader" role="dialog" aria-modal="true" aria-labelledby="immersive-reader-title"><header><div><p className="eyebrow">READING MODE</p><h2 id="immersive-reader-title">Immersive Reader</h2><span>Focused reading with no message chrome.</span></div><button className="icon-button" onClick={() => { setImmersiveOpen(false); if (speaking) toggleReadAloud(); }} aria-label="Close Immersive Reader"><X size={18} /></button></header><article className="immersive-reader-body">{signatureParts.body || plainText || "No message body."}</article><footer><button className="secondary-button" onClick={toggleReadAloud}>{speaking ? <Square size={14} /> : <Volume2 size={14} />}{speaking ? "Stop reading" : "Read aloud"}</button><small>Read aloud uses your browser’s local speech service.</small></footer></section></div>}

      {linkTarget && <div className="rich-email-link-panel" role="dialog" aria-label="Link destination inspection"><div className="rich-email-link-head"><span><Link2 size={14} /> Link destination</span><button onClick={() => { setLinkTarget(null); setLinkInspection(null); }} aria-label="Close link inspection"><X size={14} /></button></div><strong>{sourceLabel(linkTarget)}</strong><code>{linkTarget}</code><p className={linkInspection?.warning || !linkInspection?.ok ? "is-warning" : "is-safe"}>{linkBusy ? "Inspecting destination…" : readableStatus(linkInspection)}</p>{linkInspection?.chain && linkInspection.chain.length > 1 && <div className="rich-email-redirect-chain"><span>Redirect chain</span>{linkInspection.chain.map((hop, index) => <code key={`${hop.url}-${index}`}>{hop.status} · {sourceLabel(hop.url)}</code>)}</div>}<div><button className="secondary-button" onClick={() => { window.open(linkTarget, "_blank", "noopener,noreferrer"); setLinkTarget(null); }} disabled={linkBusy}><ExternalLink size={13} /> Open link</button></div></div>}

      <div className="rich-email-print-only"><Printer size={13} /> Printed from Postveil · remote content is privacy-proxied</div>
    </section>
  );
}
