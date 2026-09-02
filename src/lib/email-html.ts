import DOMPurify from "dompurify";

const allowedTags = [
  "a", "abbr", "b", "blockquote", "br", "caption", "code", "col", "colgroup",
  "div", "em", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "i", "img", "li",
  "ol", "p", "pre", "small", "span", "strong", "sub", "sup", "table", "tbody",
  "td", "tfoot", "th", "thead", "tr", "u", "ul",
];

const allowedAttributes = [
  "align", "alt", "aria-label", "bgcolor", "border", "cellpadding", "cellspacing",
  "colspan", "height", "href", "loading", "rel", "role", "rowspan", "src", "target",
  "style", "title", "valign", "width",
];

const allowedStyleProperties = new Set([
  "background", "background-color", "border", "border-bottom", "border-collapse",
  "border-left", "border-radius", "border-right", "border-spacing", "border-top",
  "color", "display", "font-family", "font-size", "font-style", "font-weight",
  "height", "letter-spacing", "line-height", "margin", "margin-bottom", "margin-left",
  "margin-right", "margin-top", "max-width", "min-width", "padding", "padding-bottom",
  "padding-left", "padding-right", "padding-top", "text-align", "text-decoration",
  "vertical-align", "width", "white-space",
]);

function isSafeUrl(value: string, kind: "href" | "src"): boolean {
  const normalized = value.trim().toLowerCase();
  if (kind === "href" && normalized.startsWith("mailto:")) return true;
  return normalized.startsWith("https://") || normalized.startsWith("http://");
}

function sanitizeStyle(value: string): string {
  return value
    .split(";")
    .map((declaration) => {
      const separator = declaration.indexOf(":");
      if (separator < 1) return "";

      const property = declaration.slice(0, separator).trim().toLowerCase();
      const rawValue = declaration.slice(separator + 1).trim();
      if (!allowedStyleProperties.has(property) || !rawValue) return "";
      if (/(?:url\s*\(|expression\s*\(|javascript:|@import|-moz-binding|behavior\s*:)/i.test(rawValue)) {
        return "";
      }

      return `${property}: ${rawValue}`;
    })
    .filter(Boolean)
    .join("; ");
}

function normalizeContentId(value: string): string {
  return value.trim().replace(/^<|>$/g, "").toLowerCase();
}

function normalizeDimension(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  if (trimmed === "auto") return "auto";
  const match = trimmed.match(/^(\d+(?:\.\d+)?)(px|%|em|rem|vw|vh)?$/);
  return match ? `${match[1]}${match[2] || "px"}` : null;
}

function preserveEmailDimension(element: HTMLElement, attribute: "width" | "height"): void {
  const normalized = normalizeDimension(element.getAttribute(attribute));
  if (!normalized) {
    if (element.hasAttribute(attribute)) element.removeAttribute(attribute);
    return;
  }
  if (!element.style.getPropertyValue(attribute)) element.style.setProperty(attribute, normalized);
}

export type EmailHtmlOptions = {
  inlineImageUrls?: Record<string, string>;
  /** Remote images are rendered by default; callers can disable them for privacy. */
  loadExternalImages?: boolean;
};

/**
 * Render email HTML as content, never as application markup.
 * Email HTML is treated as hostile: scripts, forms, styles, event handlers,
 * embedded documents, unsafe URLs, and executable CSS are removed before React
 * receives it. Safe email presentation styles are preserved because table-based
 * email layouts depend on them.
 */
export function sanitizeEmailHtml(value: string | null | undefined, options: EmailHtmlOptions = {}): string {
  if (!value?.trim()) return "";
  const loadExternalImages = options.loadExternalImages !== false;
  const sanitized = DOMPurify.sanitize(value, {
    ALLOWED_ATTR: allowedAttributes,
    ALLOWED_TAGS: allowedTags,
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ["base", "embed", "form", "iframe", "link", "meta", "object", "script", "style", "svg"],
  });
  if (typeof DOMParser === "undefined") return sanitized;

  const document = new DOMParser().parseFromString(sanitized, "text/html");
  document.querySelectorAll("*").forEach((element) => {
    [...element.attributes].forEach((attribute) => {
      if (attribute.name.toLowerCase().startsWith("on")) element.removeAttribute(attribute.name);
    });
    if (element.hasAttribute("style")) {
      const style = sanitizeStyle(element.getAttribute("style") || "");
      if (style) element.setAttribute("style", style);
      else element.removeAttribute("style");
    }
    if (element instanceof HTMLElement && (element.tagName === "TABLE" || element.tagName === "TD" || element.tagName === "TH")) {
      preserveEmailDimension(element, "width");
      preserveEmailDimension(element, "height");
    }
  });
  document.querySelectorAll("a").forEach((link) => {
    const href = link.getAttribute("href");
    if (!href || !isSafeUrl(href, "href")) {
      link.removeAttribute("href");
      link.removeAttribute("target");
      link.removeAttribute("rel");
      return;
    }
    if (/^https?:\/\//i.test(href)) {
      link.setAttribute("target", "_blank");
      link.setAttribute("rel", "noopener noreferrer");
    }
  });
  document.querySelectorAll("img").forEach((image) => {
    const originalSrc = image.getAttribute("src") || "";
    const inlineKey = originalSrc.toLowerCase().startsWith("cid:")
      ? normalizeContentId(originalSrc.slice(4))
      : "";
    const inlineUrl = inlineKey ? options.inlineImageUrls?.[inlineKey] : undefined;
    if (inlineUrl) image.setAttribute("src", inlineUrl);
    preserveEmailDimension(image, "width");
    const src = image.getAttribute("src");
    if (!src || !isSafeUrl(src, "src") || (!loadExternalImages && !inlineUrl)) image.removeAttribute("src");
    image.setAttribute("loading", loadExternalImages || inlineUrl ? "eager" : "lazy");
    image.setAttribute("referrerpolicy", "no-referrer");
    image.setAttribute("decoding", "async");
  });
  return document.body.innerHTML;
}
