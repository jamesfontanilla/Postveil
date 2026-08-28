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
  "title", "valign", "width",
];

function isSafeUrl(value: string, kind: "href" | "src"): boolean {
  const normalized = value.trim().toLowerCase();
  if (kind === "href" && normalized.startsWith("mailto:")) return true;
  return normalized.startsWith("https://") || normalized.startsWith("http://");
}

/**
 * Render email HTML as content, never as application markup.
 * Email HTML is treated as hostile: scripts, forms, styles, event handlers,
 * embedded documents, and unsafe URLs are removed before React receives it.
 */
export function sanitizeEmailHtml(value: string | null | undefined): string {
  if (!value?.trim()) return "";
  const sanitized = DOMPurify.sanitize(value, {
    ALLOWED_ATTR: allowedAttributes,
    ALLOWED_TAGS: allowedTags,
    ALLOW_DATA_ATTR: false,
    FORBID_ATTR: ["style"],
    FORBID_TAGS: ["base", "embed", "form", "iframe", "link", "meta", "object", "script", "style", "svg"],
  });
  if (typeof DOMParser === "undefined") return sanitized;

  const document = new DOMParser().parseFromString(sanitized, "text/html");
  document.querySelectorAll("*").forEach((element) => {
    [...element.attributes].forEach((attribute) => {
      if (attribute.name.toLowerCase().startsWith("on")) element.removeAttribute(attribute.name);
    });
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
    const src = image.getAttribute("src");
    if (!src || !isSafeUrl(src, "src")) image.removeAttribute("src");
    image.setAttribute("loading", "lazy");
    image.setAttribute("referrerpolicy", "no-referrer");
  });
  return document.body.innerHTML;
}
