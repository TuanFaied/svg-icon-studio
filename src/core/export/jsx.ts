/**
 * Converts an SVG string (as produced by this app) into a typed React TSX component.
 */

const ATTR_RENAMES: Record<string, string> = {
  class: 'className',
  'xlink:href': 'xlinkHref',
  'xml:space': 'xmlSpace',
  'xmlns:xlink': 'xmlnsXlink',
};

export function jsxAttrName(name: string): string {
  if (ATTR_RENAMES[name]) return ATTR_RENAMES[name];
  if (name.startsWith('aria-') || name.startsWith('data-')) return name;
  return name.replace(/[-:]([a-z])/g, (_, c: string) => c.toUpperCase());
}

export function toComponentName(projectName: string): string {
  const words = projectName.replace(/[^a-zA-Z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  let name = words.map((w) => w[0].toUpperCase() + w.slice(1)).join('');
  if (!name) name = 'Icon';
  if (/^[0-9]/.test(name)) name = `Icon${name}`;
  if (!/Icon$/.test(name)) name += 'Icon';
  return name;
}

const TAG_RE = /<(\/?)([a-zA-Z][\w:-]*)((?:\s+[\w:-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
const ATTR_RE = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

function decodeEntities(s: string): string {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
}

export interface JsxOptions {
  componentName: string;
  defaultSize: number;
}

export function svgToTsx(svg: string, { componentName, defaultSize }: JsxOptions): string {
  const lines: string[] = [];
  let depth = 0;
  const pad = () => '      ' + '  '.repeat(depth);
  let sawRoot = false;

  for (const m of svg.matchAll(TAG_RE)) {
    const [, closing, name, rawAttrs = '', selfClosing, text] = m;
    if (text !== undefined) {
      const t = text.trim();
      if (t) lines.push(`${pad()}{${JSON.stringify(decodeEntities(t))}}`);
      continue;
    }
    if (closing) {
      depth--;
      lines.push(`${pad()}</${name}>`);
      continue;
    }
    const attrs: string[] = [];
    const isRoot = name === 'svg' && !sawRoot;
    for (const a of rawAttrs.matchAll(ATTR_RE)) {
      const key = a[1];
      const value = a[2] ?? a[3] ?? '';
      if (isRoot && (key === 'width' || key === 'height')) continue;
      attrs.push(`${jsxAttrName(key)}=${JSON.stringify(decodeEntities(value))}`);
    }
    if (isRoot) {
      sawRoot = true;
      attrs.push('width={size}', 'height={size}', 'color={color}', '{...props}');
    }
    const open = `${pad()}<${name}${attrs.length ? ' ' + attrs.join(' ') : ''}`;
    if (selfClosing) lines.push(`${open} />`);
    else {
      lines.push(`${open}>`);
      depth++;
    }
  }

  return `import type { SVGProps } from 'react';

export interface ${componentName}Props extends Omit<SVGProps<SVGSVGElement>, 'color'> {
  /** Width and height in px (or any CSS length). */
  size?: number | string;
  /** Sets CSS color; drives fills that use currentColor. */
  color?: string;
}

export function ${componentName}({ size = ${defaultSize}, color = 'currentColor', ...props }: ${componentName}Props) {
  return (
${lines.join('\n')}
  );
}

export default ${componentName};
`;
}
