import createDOMPurify, { type WindowLike } from 'dompurify';
import { isAllowedAnimationCss } from './animationCss';

type Purifier = ReturnType<typeof createDOMPurify>;

export interface SanitizeOptions {
  /**
   * Keep `<style>` elements whose CSS passes the strict animation validator
   * (see animationCss.ts). Off by default: every `<style>` is removed.
   */
  allowAnimationCss?: boolean;
}

export type Sanitizer = (svg: string, options?: SanitizeOptions) => string;

const isLocalRef = (v: string) => v.trim().startsWith('#');
const EXTERNAL_URL_RE = /url\(\s*['"]?\s*(?!#)[^)]*\)/i;

/**
 * SMIL animation is not supported: it can retarget attributes such as href,
 * which the attribute hooks can't police. Listed in both cases because the
 * HTML parser lowercases SVG tag names.
 */
const SMIL_TAGS = ['animate', 'animateMotion', 'animateTransform', 'animateColor', 'set', 'discard'];

/**
 * Builds an SVG sanitizer bound to a window (the browser's, or jsdom's in tests).
 * Strips <script>, <foreignObject>, SMIL, event handlers, javascript: URLs,
 * and every href / xlink:href / url() that is not a same-document `#id` reference.
 * `<style>` is removed unless `allowAnimationCss` is set and the CSS validates.
 */
export function createSanitizer(win: WindowLike): Sanitizer {
  const purify: Purifier = createDOMPurify(win);
  let allowAnimation = false;

  purify.addHook('uponSanitizeElement', (node, data) => {
    if (data.tagName !== 'style') return;
    const el = node as Element;
    const textOnly = Array.from(el.childNodes).every((c) => c.nodeType === 3);
    if (!allowAnimation || !textOnly || !isAllowedAnimationCss(el.textContent ?? '')) el.parentNode?.removeChild(el);
  });
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

  return (svg, options = {}) => {
    allowAnimation = !!options.allowAnimationCss;
    try {
      return purify.sanitize(svg, {
        USE_PROFILES: { svg: true, svgFilters: true },
        FORBID_TAGS: ['script', 'foreignObject', 'iframe', 'image', ...SMIL_TAGS, ...SMIL_TAGS.map((t) => t.toLowerCase())],
        // <style> passes DOMPurify only to reach the validator hook above.
        ADD_TAGS: ['style'],
        ADD_ATTR: ['shape-rendering', 'fill-rule', 'fill-opacity', 'aria-hidden', 'role', 'viewBox'],
        KEEP_CONTENT: false,
      });
    } finally {
      allowAnimation = false;
    }
  };
}

let browserSanitizer: Sanitizer | null = null;

/** Sanitizes with the browser window. Must be called client-side. */
export function sanitizeSvg(svg: string, options?: SanitizeOptions): string {
  if (!browserSanitizer) browserSanitizer = createSanitizer(window);
  return browserSanitizer(svg, options);
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
