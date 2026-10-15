/**
 * Strip executable content from EPUB (X)HTML/SVG before foliate-js renders it.
 *
 * foliate-js renders sections in same-origin `blob:` iframes and must allow
 * scripts in the sandbox (WebKit bug 218086), so its README requires a CSP
 * that blocks inline scripts. The app's /content routes don't set one, so we
 * remove scripts and event handlers at the source instead: external script
 * files are already dropped by foliate's loader (`allowScript = false`); this
 * handles inline <script>, on* attributes, javascript: URLs and embeds.
 */

const DANGEROUS_ELEMENTS = ["script", "iframe", "frame", "frameset", "embed", "base", "meta[http-equiv]"];
const URL_ATTRIBUTES = ["href", "src", "xlink:href", "action", "formaction", "data"];

function scrub(doc: Document): void {
  for (const selector of DANGEROUS_ELEMENTS) {
    for (const element of Array.from(doc.querySelectorAll(selector))) element.remove();
  }
  for (const element of Array.from(doc.querySelectorAll("*"))) {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      if (name.startsWith("on")) {
        element.removeAttribute(attribute.name);
        continue;
      }
      if (
        URL_ATTRIBUTES.includes(name) &&
        /^\s*(javascript|vbscript|data:text\/html)/i.test(attribute.value)
      ) {
        element.removeAttribute(attribute.name);
      }
    }
  }
}

export function sanitizeBookMarkup(markup: string, type: string): string {
  const mime = type.split(";")[0].trim().toLowerCase();
  const isXml = mime === "application/xhtml+xml" || mime === "image/svg+xml" || mime.endsWith("+xml");
  const parser = new DOMParser();
  const doc = parser.parseFromString(markup, (isXml ? mime : "text/html") as DOMParserSupportedType);
  if (isXml && doc.querySelector("parsererror")) {
    // Malformed XHTML: fall back to the HTML parser rather than render raw.
    const htmlDoc = parser.parseFromString(markup, "text/html");
    scrub(htmlDoc);
    return `<!DOCTYPE html>\n${htmlDoc.documentElement.outerHTML}`;
  }
  scrub(doc);
  return isXml
    ? new XMLSerializer().serializeToString(doc)
    : `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`;
}

const SANITIZED_TYPES = /(x?html|svg)/i;

interface TransformDetail {
  data: string | Blob | Promise<string | Blob>;
  type: string;
}

/** Attach to a foliate book's `transformTarget` before rendering. */
export function attachSanitizer(target: EventTarget | undefined): void {
  target?.addEventListener("data", (event) => {
    const detail = (event as CustomEvent<TransformDetail>).detail;
    if (!SANITIZED_TYPES.test(detail.type)) return;
    detail.data = Promise.resolve(detail.data).then(async (data) => {
      const markup = typeof data === "string" ? data : await data.text();
      return sanitizeBookMarkup(markup, detail.type);
    });
  });
}
