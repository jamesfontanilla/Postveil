const MAX_INLINE_IMAGE_BYTES = 2_000_000;

const blockedTags = new Set([
  "applet",
  "base",
  "button",
  "canvas",
  "embed",
  "form",
  "frame",
  "frameset",
  "iframe",
  "input",
  "link",
  "meta",
  "noscript",
  "object",
  "option",
  "script",
  "select",
  "source",
  "style",
  "svg",
  "textarea",
  "track",
  "video",
]);

const allowedTags = new Set([
  "a",
  "abbr",
  "b",
  "blockquote",
  "br",
  "caption",
  "center",
  "code",
  "col",
  "colgroup",
  "dd",
  "del",
  "div",
  "em",
  "figcaption",
  "figure",
  "font",
  "h1",
  "h2",
  "h3",
  "h4",
  "hr",
  "i",
  "img",
  "kbd",
  "li",
  "ol",
  "p",
  "pre",
  "q",
  "s",
  "small",
  "span",
  "strong",
  "sub",
  "sup",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
]);

const allowedAttributes = new Set([
  "alt",
  "align",
  "border",
  "cellpadding",
  "cellspacing",
  "color",
  "colspan",
  "dir",
  "face",
  "height",
  "href",
  "lang",
  "rowspan",
  "src",
  "style",
  "title",
  "valign",
  "width",
]);

const transparentPixel =
  "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";

function unwrap(element: Element) {
  const parent = element.parentNode;
  if (!parent) return;
  while (element.firstChild) parent.insertBefore(element.firstChild, element);
  element.remove();
}

function isDataImage(value: string) {
  return /^data:image\/(?:png|jpe?g|gif|webp|avif);base64,/i.test(value) && value.length <= MAX_INLINE_IMAGE_BYTES;
}

function isRemoteImage(value: string) {
  return /^https?:\/\//i.test(value) || /^\/\//.test(value);
}

function normalizeContentId(value: string) {
  return value.replace(/^cid:/i, "").replace(/^<|>$/g, "").trim().toLowerCase();
}

export function safeEmailUrl(value: string, kind: "link" | "image" = "link"): string | null {
  const raw = value.trim();
  if (!raw || raw.length > 4096) return null;
  if (kind === "link" && /^#[a-z0-9._:-]{0,200}$/i.test(raw)) return raw;
  const normalized = raw.startsWith("//") ? `https:${raw}` : raw;
  if (kind === "image" && isDataImage(normalized)) return normalized;
  try {
    const url = new URL(normalized, "https://postveil.invalid");
    const allowedProtocols = kind === "image"
      ? new Set(["http:", "https:"])
      : new Set(["http:", "https:", "mailto:", "tel:"]);
    if (!allowedProtocols.has(url.protocol)) return null;
    if (url.protocol === "#") return raw;
    return url.href;
  } catch {
    return null;
  }
}

export function sanitizeInlineStyle(value: string): string {
  return value
    .split(";")
    .map((declaration) => declaration.trim())
    .filter(Boolean)
    .map((declaration) => {
      const separator = declaration.indexOf(":");
      if (separator <= 0) return null;
      const property = declaration.slice(0, separator).trim().toLowerCase();
      const propertyValue = declaration.slice(separator + 1).trim();
      if (!/^[a-z][a-z-]*$/i.test(property)) return null;
      if (["position", "z-index", "behavior", "filter", "-moz-binding", "pointer-events"].includes(property)) return null;
      if (/url\s*\(|expression\s*\(|javascript\s*:|vbscript\s*:|data\s*:|@import/i.test(propertyValue)) return null;
      return `${property}: ${propertyValue}`;
    })
    .filter((declaration): declaration is string => Boolean(declaration))
    .join("; ");
}

function replaceRemoteImage(element: HTMLImageElement, showExternalImages: boolean, trustedImageSources: ReadonlyMap<string, string>) {
  const source = element.getAttribute("src")?.trim() || "";
  const declaredWidth = Number(element.getAttribute("width"));
  const declaredHeight = Number(element.getAttribute("height"));
  if ((Number.isFinite(declaredWidth) && declaredWidth > 0 && declaredWidth <= 4) || (Number.isFinite(declaredHeight) && declaredHeight > 0 && declaredHeight <= 4)) {
    element.remove();
    return;
  }
  if (/^cid:/i.test(source)) {
    const inlineSource = trustedImageSources.get(normalizeContentId(source));
    if (inlineSource) {
      element.setAttribute("src", inlineSource);
      element.setAttribute("loading", "lazy");
      element.setAttribute("decoding", "async");
      element.setAttribute("referrerpolicy", "no-referrer");
      element.setAttribute("data-inline-image", "true");
      return;
    }
    const placeholder = element.ownerDocument.createElement("span");
    placeholder.className = "email-external-image-placeholder";
    placeholder.setAttribute("role", "img");
    placeholder.textContent = element.getAttribute("alt")?.trim() || "Embedded image unavailable";
    element.replaceWith(placeholder);
    return;
  }
  const safeSource = safeEmailUrl(source, "image");
  if (!safeSource || (!isRemoteImage(safeSource) && !isDataImage(safeSource))) {
    const placeholder = element.ownerDocument.createElement("span");
    placeholder.className = "email-external-image-placeholder";
    placeholder.setAttribute("role", "img");
    placeholder.textContent = element.getAttribute("alt")?.trim() || "Embedded image unavailable";
    element.replaceWith(placeholder);
    return;
  }
  if (isDataImage(safeSource)) {
    element.setAttribute("src", safeSource);
    return;
  }
  if (!showExternalImages) {
    const placeholder = element.ownerDocument.createElement("span");
    placeholder.className = "email-external-image-placeholder";
    placeholder.setAttribute("role", "img");
    placeholder.textContent = element.getAttribute("alt")?.trim()
      ? `External image hidden · ${element.getAttribute("alt")}`
      : "External image hidden";
    element.replaceWith(placeholder);
    return;
  }
  element.setAttribute("src", safeSource);
  element.setAttribute("loading", "lazy");
  element.setAttribute("decoding", "async");
  element.setAttribute("referrerpolicy", "no-referrer");
  element.setAttribute("data-external-image", "true");
}

function escapeFallback(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] || character);
}

export function sanitizeEmailHtml(source: string, showExternalImages = false, trustedImageSources: ReadonlyMap<string, string> = new Map()): string {
  if (!source.trim()) return "";
  if (typeof DOMParser === "undefined") return `<p>${escapeFallback(source.replace(/<[^>]*>/g, " ").trim())}</p>`;

  const document = new DOMParser().parseFromString(source, "text/html");
  const root = document.body;
  for (const element of Array.from(root.querySelectorAll("*"))) {
    const tag = element.tagName.toLowerCase();
    if (blockedTags.has(tag)) {
      element.remove();
      continue;
    }
    if (!allowedTags.has(tag)) {
      unwrap(element);
      continue;
    }

    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      if (name.startsWith("on") || name === "class" || name === "id" || name === "srcset" || name === "sizes" || !allowedAttributes.has(name)) {
        element.removeAttribute(attribute.name);
      }
    }
    if (element.hasAttribute("style")) {
      const style = sanitizeInlineStyle(element.getAttribute("style") || "");
      if (style) element.setAttribute("style", style);
      else element.removeAttribute("style");
    }

    if (tag === "a") {
      const href = element.getAttribute("href");
      const safeHref = href ? safeEmailUrl(href, "link") : null;
      if (safeHref) {
        element.setAttribute("href", safeHref);
        element.setAttribute("target", "_blank");
        element.setAttribute("rel", "noopener noreferrer nofollow");
        element.setAttribute("referrerpolicy", "no-referrer");
      } else {
        element.removeAttribute("href");
        element.setAttribute("data-blocked-link", "true");
      }
    }
    if (tag === "img") replaceRemoteImage(element as HTMLImageElement, showExternalImages, trustedImageSources);
    if (tag === "img") {
      element.setAttribute("alt", element.getAttribute("alt") || "Message image");
      element.removeAttribute("usemap");
      element.removeAttribute("ismap");
    }
  }
  root.querySelectorAll("img").forEach((image) => {
    if (!image.getAttribute("src")) image.setAttribute("src", transparentPixel);
  });
  return root.innerHTML;
}

export type EmailHtmlStats = {
  externalImageCount: number;
  inlineImageCount: number;
  linkCount: number;
  tableCount: number;
  hasRichStructure: boolean;
};

export function inspectEmailHtml(source: string): EmailHtmlStats {
  const externalImageCount = (source.match(/<img\b[^>]*\bsrc\s*=\s*["'](?:https?:)?\/\//gi) || []).length;
  const inlineImageCount = (source.match(/<img\b[^>]*\bsrc\s*=\s*["'](?:data:image\/|cid:)/gi) || []).length;
  const linkCount = (source.match(/<a\b[^>]*\bhref\s*=/gi) || []).length;
  const tableCount = (source.match(/<table\b/gi) || []).length;
  const hasRichStructure = /<(?:img|table|h[1-6]|ul|ol|blockquote|figure)\b/i.test(source);
  return { externalImageCount, inlineImageCount, linkCount, tableCount, hasRichStructure };
}
