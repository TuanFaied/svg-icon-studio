// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createSanitizer, validateSvg } from './sanitize';

const sanitize = createSanitizer(window);

describe('sanitizer', () => {
  it('strips script and foreignObject', () => {
    const out = sanitize('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><foreignObject><div>x</div></foreignObject><rect width="1" height="1"/></svg>');
    expect(out).not.toMatch(/script/i);
    expect(out).not.toMatch(/foreignObject/i);
    expect(out).toContain('<rect');
  });

  it('strips event handlers', () => {
    const out = sanitize('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect onclick="x()" onmouseover="y()" width="2" height="2"/></svg>');
    expect(out).not.toMatch(/on(load|click|mouseover)/i);
    expect(out).toContain('width="2"');
  });

  it('strips javascript: urls and external references, keeps local ones', () => {
    const out = sanitize(
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">' +
        '<defs><linearGradient id="g"/></defs>' +
        '<a href="javascript:alert(1)"><rect width="1" height="1"/></a>' +
        '<use xlink:href="https://evil.example/x.svg#a"/>' +
        '<use href="#g"/>' +
        '<rect fill="url(https://evil.example/p.svg#x)" width="1" height="1"/>' +
        '<rect fill="url(#g)" width="1" height="1"/>' +
        '</svg>',
    );
    expect(out).not.toMatch(/javascript:/i);
    expect(out).not.toMatch(/evil\.example/);
    // DOMPurify drops <use> entirely, which is stricter than needed but safe.
    expect(out).toContain('url(#g)');
  });

  it('keeps the attributes this app generates', () => {
    const src = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 2" shape-rendering="crispEdges" role="img"><title>t</title><g fill="#f00" fill-opacity="0.5"><path fill-rule="evenodd" d="M0 0h1v1h-1z"/></g></svg>';
    const out = sanitize(src);
    for (const s of ['viewBox="0 0 2 2"', 'shape-rendering="crispEdges"', 'fill-opacity="0.5"', 'fill-rule="evenodd"', '<title>t</title>']) {
      expect(out).toContain(s);
    }
  });
});

describe('animation CSS', () => {
  const css =
    '.sis-a { transform-origin: center; animation: sis-spin 1s steps(8) infinite } ' +
    '@keyframes sis-spin { to { transform: rotate(360deg) } } ' +
    '@media (prefers-reduced-motion: reduce) { .sis-a { animation: none } }';
  const animated = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 4"><style>${css}</style><g class="sis-a" fill="#000"><rect width="2" height="2"/></g></svg>`;

  it('removes every <style> by default', () => {
    const out = sanitize(animated);
    expect(out).not.toContain('<style');
    expect(out).toContain('class="sis-a"');
    expect(out).toContain('<rect');
  });

  it('keeps valid animation CSS when allowed', () => {
    const out = sanitize(animated, { allowAnimationCss: true });
    expect(out).toContain('<style>');
    expect(out).toContain('@keyframes sis-spin');
    expect(out).toContain('prefers-reduced-motion');
  });

  it('removes a <style> that fails validation even when allowed', () => {
    for (const bad of [
      '.a { background: url(https://evil.example/x.png) }',
      '@import url(https://evil.example/x.css);',
      '.a { fill: red }',
      '.a { opacity: expression(alert(1)) }',
    ]) {
      const out = sanitize(`<svg xmlns="http://www.w3.org/2000/svg"><style>${bad}</style><rect width="1" height="1"/></svg>`, { allowAnimationCss: true });
      expect(out, bad).not.toContain('<style');
      expect(out, bad).toContain('<rect');
    }
  });

  it('keeps only the valid one of several <style> blocks', () => {
    const out = sanitize(
      `<svg xmlns="http://www.w3.org/2000/svg"><style>.a { color: red }</style><style>${css}</style><rect width="1" height="1"/></svg>`,
      { allowAnimationCss: true },
    );
    expect(out.match(/<style>/g)).toHaveLength(1);
    expect(out).toContain('sis-spin');
  });

  it('does not leak the option into later calls', () => {
    sanitize(animated, { allowAnimationCss: true });
    expect(sanitize(animated)).not.toContain('<style');
  });

  it('strips SMIL animation elements', () => {
    const out = sanitize(
      '<svg xmlns="http://www.w3.org/2000/svg"><a><animate attributeName="href" to="javascript:alert(1)"/><rect width="1" height="1"><animateTransform attributeName="transform" type="rotate" to="360"/><set attributeName="fill" to="red"/></rect></a><animateMotion path="M0 0h1"/></svg>',
      { allowAnimationCss: true },
    );
    expect(out).not.toMatch(/<animate|<set|<animateTransform|<animateMotion/i);
    expect(out).toContain('<rect');
  });
});

describe('validateSvg', () => {
  it('accepts valid svg', () => {
    expect(validateSvg('<svg xmlns="http://www.w3.org/2000/svg"/>').ok).toBe(true);
  });
  it('rejects malformed xml and non-svg roots', () => {
    expect(validateSvg('<svg><g></svg>').ok).toBe(false);
    expect(validateSvg('<html/>').ok).toBe(false);
    expect(validateSvg('').ok).toBe(false);
  });
});
