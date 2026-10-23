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
