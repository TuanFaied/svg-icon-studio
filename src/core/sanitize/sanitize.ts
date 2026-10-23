import createDOMPurify, { type WindowLike } from 'dompurify';

type Purifier = ReturnType<typeof createDOMPurify>;

const isLocalRef = (v: string) => v.trim().startsWith('#');
const EXTERNAL_URL_RE = /url\(\s*['"]?\s*(?!#)[^)]*\)/i;

/**
 * Builds an SVG sanitizer bound to a window (the browser's, or jsdom's in tests).
 * Strips <script>, <foreignObject>, <style>, event handlers, javascript: URLs,
 * and every href / xlink:href / url() that is not a same-document `#id` reference.
 */
export function createSanitizer(win: WindowLike): (svg: string) => string {
  const purify: Purifier = createDOMPurify(win);
  purify.addHook('afterSanitizeAttributes', (node) => {
    const el = node as Element;
    if (!el.getAttribute) return;
    for (const name of ['href', 'xlink:href']) {
      const v = el.getAttribute(name);
      if (v !== null && !isLocalRef(v)) el.removeAttribute(name);
    }
    for (const attr of Array.from(el.attributes ?? [])) {
      if (/^on/i.test(attr.name)) el.removeAttribute(attr.name);
      else if (EXTERNAL_URL_RE.test(attr.value) || /javascript:/i.test(attr.value)) el.removeAttribute(attr.name);
    }
  });
  return (svg: string) =>
    purify.sanitize(svg, {
      USE_PROFILES: { svg: true, svgFilters: true },
      FORBID_TAGS: ['script', 'foreignObject', 'style', 'iframe', 'image'],
      ADD_ATTR: ['shape-rendering', 'fill-rule', 'fill-opacity', 'aria-hidden', 'role', 'viewBox'],
      KEEP_CONTENT: false,
    });
}

let browserSanitizer: ((svg: string) => string) | null = null;

/** Sanitizes with the browser window. Must be called client-side. */
export function sanitizeSvg(svg: string): string {
  if (!browserSanitizer) browserSanitizer = createSanitizer(window);
  return browserSanitizer(svg);
}

export interface SvgValidation {
  ok: boolean;
  error?: string;
  line?: number;
}

/** Validates XML well-formedness and an <svg> root via DOMParser. */
export function validateSvg(svg: string, parser: DOMParser = new DOMParser()): SvgValidation {
  if (!svg.trim()) return { ok: false, error: 'Document is empty' };
  const doc = parser.parseFromString(svg, 'image/svg+xml');
  const err = doc.getElementsByTagName('parsererror')[0];
  if (err) {
    const text = err.textContent ?? 'Parse error';
    const m = text.match(/line\s*(?:number\s*)?(\d+)/i) ?? text.match(/(\d+):\d+/);
    return { ok: false, error: text.replace(/\s+/g, ' ').trim().slice(0, 240), line: m ? Number(m[1]) : undefined };
  }
  const root = doc.documentElement;
  if (!root || root.localName !== 'svg') return { ok: false, error: 'Root element must be <svg>' };
  return { ok: true };
}
