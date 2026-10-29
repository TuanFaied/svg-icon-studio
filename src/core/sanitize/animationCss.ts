/**
 * Strict validator for the small CSS dialect the app uses to animate icons.
 *
 * Accepted stylesheet shapes:
 *   .cls, .cls g, path { animation: spin 1s steps(8) infinite; transform-origin: center }
 *   @keyframes spin { from { transform: rotate(0deg) } 50%, to { opacity: .5 } }
 *   @media (prefers-reduced-motion: reduce) { .cls { animation: none !important } }
 *
 * Anything else (comments, quotes, escapes, url(), @import, unknown properties,
 * unknown functions, attribute selectors, nested media, ...) is rejected, so a
 * passing stylesheet cannot load resources or run code.
 */

export const ALLOWED_PROPERTIES: ReadonlySet<string> = new Set([
  'animation',
  'animation-name',
  'animation-duration',
  'animation-timing-function',
  'animation-delay',
  'animation-iteration-count',
  'animation-direction',
  'animation-fill-mode',
  'animation-play-state',
  'transform',
  'transform-origin',
  'transform-box',
  'opacity',
]);

export const ALLOWED_FUNCTIONS: ReadonlySet<string> = new Set([
  'rotate',
  'rotatez',
  'scale',
  'scalex',
  'scaley',
  'translate',
  'translatex',
  'translatey',
  'steps',
  'cubic-bezier',
]);

const MAX_LENGTH = 20_000;
const IDENT = /^-?[a-zA-Z_][\w-]*$/;
/** Selector parts: class, universal, or one of the element names the generator emits. */
const SELECTOR_PART = /^(?:\.-?[a-zA-Z_][\w-]*|\*|svg|g|path|rect)$/;
const KEYFRAME_SELECTOR = /^(?:from|to|\d{1,3}(?:\.\d+)?%)$/;
const VALUE_CHARS = /^[a-zA-Z0-9\s.,%()+\-_]*$/;
const REDUCED_MOTION = /^\(\s*prefers-reduced-motion\s*:\s*(?:reduce|no-preference)\s*\)$/;

export type CssCheck = { ok: true } | { ok: false; reason: string };

class Reject extends Error {}

const fail = (reason: string): never => {
  throw new Reject(reason);
};

/** Splits `text` into top-level `prelude { body }` blocks, honoring nested braces. */
function blocks(text: string): Array<{ prelude: string; body: string }> {
  const out: Array<{ prelude: string; body: string }> = [];
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf('{', i);
    if (open < 0) {
      if (text.slice(i).trim()) fail('Unexpected text outside a block');
      break;
    }
    let depth = 1;
    let j = open + 1;
    for (; j < text.length && depth > 0; j++) {
      if (text[j] === '{') depth++;
      else if (text[j] === '}') depth--;
    }
    if (depth !== 0) fail('Unbalanced braces');
    out.push({ prelude: text.slice(i, open).trim(), body: text.slice(open + 1, j - 1) });
    i = j;
  }
  return out;
}

function checkSelectorList(prelude: string): void {
  if (!prelude) fail('Empty selector');
  for (const sel of prelude.split(',')) {
    const parts = sel.trim().split(/\s+/);
    if (parts.length === 0 || parts.some((p) => !SELECTOR_PART.test(p))) fail(`Selector not allowed: "${sel.trim()}"`);
  }
}

function checkValue(prop: string, raw: string): void {
  const value = raw.replace(/\s*!important\s*$/i, '');
  if (!value.trim()) fail(`Empty value for ${prop}`);
  if (!VALUE_CHARS.test(value)) fail(`Characters not allowed in ${prop}`);
  for (const m of value.matchAll(/([a-zA-Z-]+)\s*\(/g)) {
    if (!ALLOWED_FUNCTIONS.has(m[1].toLowerCase())) fail(`Function not allowed: ${m[1]}()`);
  }
  // Parentheses must balance and never nest (no function-in-function tricks).
  let depth = 0;
  for (const ch of value) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (depth < 0 || depth > 1) fail(`Bad parentheses in ${prop}`);
  }
  if (depth !== 0) fail(`Bad parentheses in ${prop}`);
}

function checkDeclarations(body: string): void {
  if (body.includes('{') || body.includes('}')) fail('Nested block inside a rule');
  for (const decl of body.split(';')) {
    if (!decl.trim()) continue;
    const colon = decl.indexOf(':');
    if (colon < 0) fail(`Malformed declaration: "${decl.trim()}"`);
    const prop = decl.slice(0, colon).trim().toLowerCase();
    if (!ALLOWED_PROPERTIES.has(prop)) fail(`Property not allowed: ${prop}`);
    checkValue(prop, decl.slice(colon + 1));
  }
}

function checkKeyframes(name: string, body: string): void {
  if (!IDENT.test(name)) fail(`Invalid keyframes name: "${name}"`);
  for (const { prelude, body: decls } of blocks(body)) {
    for (const sel of prelude.split(',')) {
      if (!KEYFRAME_SELECTOR.test(sel.trim())) fail(`Invalid keyframe selector: "${sel.trim()}"`);
    }
    checkDeclarations(decls);
  }
}

function checkStylesheet(css: string, insideMedia: boolean): void {
  for (const { prelude, body } of blocks(css)) {
    if (prelude.startsWith('@')) {
      const m = prelude.match(/^@([a-z-]+)\s*(.*)$/is);
      const rule = m?.[1].toLowerCase();
      const rest = (m?.[2] ?? '').trim();
      if (rule === 'keyframes' && !insideMedia) checkKeyframes(rest, body);
      else if (rule === 'media' && !insideMedia && REDUCED_MOTION.test(rest)) checkStylesheet(body, true);
      else fail(`At-rule not allowed: ${prelude}`);
    } else {
      checkSelectorList(prelude);
      checkDeclarations(body);
    }
  }
}

/** Returns ok when `css` uses only the allowed animation subset. */
export function checkAnimationCss(css: string): CssCheck {
  if (css.length > MAX_LENGTH) return { ok: false, reason: 'Stylesheet too long' };
  // Comments, escapes, quotes and angle brackets never appear in the dialect.
  if (/\/\*|\*\/|\\|[`"'<>&]/.test(css)) return { ok: false, reason: 'Disallowed characters' };
  if (/url\s*\(|expression|javascript|behavior|-moz-binding/i.test(css)) return { ok: false, reason: 'Disallowed token' };
  try {
    checkStylesheet(css, false);
    return { ok: true };
  } catch (e) {
    if (e instanceof Reject) return { ok: false, reason: e.message };
    throw e;
  }
}

export const isAllowedAnimationCss = (css: string): boolean => checkAnimationCss(css).ok;
