import { describe, expect, it } from 'vitest';
import { checkAnimationCss, isAllowedAnimationCss } from './animationCss';

const SPIN = `
.sis-a1 { transform-box: fill-box; transform-origin: center; animation: sis-spin 1.2s steps(8) infinite }
@keyframes sis-spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
@media (prefers-reduced-motion: reduce) { .sis-a1 { animation: none !important } }
`;

describe('animation CSS validator', () => {
  it.each([
    ['spin with steps and reduced motion', SPIN],
    ['pulse with cubic-bezier', '.p g{animation:pulse 2s cubic-bezier(0.4,0,0.2,1) infinite alternate}@keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.15) translateY(-1px)}}'],
    ['staggered sequence', '.s rect{opacity:.3}.s .c1{animation:seq 1s infinite;animation-delay:-0.125s}@keyframes seq{0%{opacity:1}12.5%{opacity:0.3}}'],
    ['element selectors', 'svg path, g { opacity: 0.5 }'],
    ['fill hex inside keyframes (#14)', '.s{animation:k 1s linear infinite}@keyframes k{0%{fill:#FFF}50%{fill:#1a2b3c;opacity:1}}'],
    ['empty stylesheet', '   '],
  ])('accepts %s', (_, css) => {
    expect(checkAnimationCss(css)).toEqual({ ok: true });
  });

  it.each([
    ['url()', '.a { animation: x 1s } @keyframes x { to { transform: rotate(1deg) } } .b { opacity: url(x) }'],
    ['@import', '@import "https://evil.example/x.css";'],
    ['@font-face', '@font-face { font-family: x }'],
    ['background property', '.a { background: red }'],
    ['fill property (could hide content)', '.a { fill: red }'],
    ['fill hex outside keyframes', '.a { fill: #fff }'],
    ['fill in a reduced-motion rule', '@media (prefers-reduced-motion: reduce) { .a { fill: #fff } }'],
    ['fill keyword in keyframes', '@keyframes k { 0% { fill: red } }'],
    ['fill currentColor in keyframes', '@keyframes k { 0% { fill: currentColor } }'],
    ['fill url() in keyframes', '@keyframes k { 0% { fill: url(#g) } }'],
    ['fill var() in keyframes', '@keyframes k { 0% { fill: var(--c) } }'],
    ['fill 5-digit hex in keyframes', '@keyframes k { 0% { fill: #12345 } }'],
    ['fill 8-digit hex (alpha) in keyframes', '@keyframes k { 0% { fill: #11223344 } }'],
    ['fill !important in keyframes', '@keyframes k { 0% { fill: #fff !important } }'],
    ['fill with extra tokens in keyframes', '@keyframes k { 0% { fill: #fff #000 } }'],
    ['fill-opacity property', '@keyframes k { 0% { fill-opacity: 0 } }'],
    ['content property', '.a { content: x }'],
    ['expression()', '.a { opacity: expression(alert(1)) }'],
    ['javascript', '.a { opacity: 1 } /* javascript: */'],
    ['comments', '.a { opacity: 1 /* hi */ }'],
    ['escapes', '.a { opacity: \\31 }'],
    ['quotes', '.a { animation-name: "x" }'],
    ['attribute selector', '[href] { opacity: 0 }'],
    ['id selector', '#x { opacity: 0 }'],
    ['pseudo selector', '.a:hover { opacity: 0 }'],
    ['child combinator', '.a > g { opacity: 0 }'],
    ['unknown function', '.a { transform: matrix(1,0,0,1,0,0) }'],
    ['var()', '.a { opacity: var(--x) }'],
    ['nested functions', '.a { transform: rotate(calc(1deg)) }'],
    ['other media query', '@media screen { .a { opacity: 0 } }'],
    ['nested media', '@media (prefers-reduced-motion: reduce) { @media (prefers-reduced-motion: reduce) { .a { opacity: 0 } } }'],
    ['keyframes in media', '@media (prefers-reduced-motion: reduce) { @keyframes k { to { opacity: 0 } } }'],
    ['bad keyframe selector', '@keyframes k { .a { opacity: 0 } }'],
    ['unbalanced braces', '.a { opacity: 0'],
    ['stray text', 'opacity: 0'],
    ['html breakout', '.a { opacity: 0 } </style><script>alert(1)</script>'],
    ['huge input', `.a{opacity:1}`.repeat(3000)],
  ])('rejects %s', (_, css) => {
    expect(isAllowedAnimationCss(css)).toBe(false);
  });

  it('explains why it rejected', () => {
    const r = checkAnimationCss('.a { color: red }');
    expect(r).toEqual({ ok: false, reason: 'Property not allowed: color' });
  });
});
