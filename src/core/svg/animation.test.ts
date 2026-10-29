import { describe, expect, it } from 'vitest';
import { pack } from '../grid/color';
import { createGrid } from '../grid/grid';
import { checkAnimationCss } from '../sanitize/animationCss';
import {
  type ActiveAnimation, ANIMATION_KINDS, animationCss, animationPrefix, defaultAnimation, LIMITS, NO_ANIMATION, normalizeAnimation, sequenceRanks,
} from './animation';

const ACTIVE = ANIMATION_KINDS.filter((k) => k !== 'none').map((k) => defaultAnimation(k) as ActiveAnimation);

describe('animation CSS', () => {
  it.each(ACTIVE.map((a) => [a.kind, a] as const))('%s passes the sanitizer validator', (_, a) => {
    const css = animationCss('sis-abc123', a);
    expect(checkAnimationCss(css)).toEqual({ ok: true });
    expect(css).toContain('@keyframes sis-abc123-');
    expect(css).toContain('@media (prefers-reduced-motion:reduce){.sis-abc123{animation:none}}');
  });

  it('extreme settings still validate', () => {
    for (const a of ACTIVE) {
      for (const pick of [0, 1] as const) {
        const extreme = normalizeAnimation({
          ...a,
          duration: LIMITS.duration[pick], steps: LIMITS.steps[pick], iterations: LIMITS.iterations[pick], delay: LIMITS.delay[pick],
          scale: LIMITS.scale[pick], minOpacity: LIMITS.minOpacity[pick], height: LIMITS.height[pick],
          easing: pick ? 'linear' : 'steps', direction: pick ? 'alternate' : 'reverse', clockwise: !!pick,
        }) as ActiveAnimation;
        expect(checkAnimationCss(animationCss('sis-000000', extreme)), JSON.stringify(extreme)).toEqual({ ok: true });
      }
    }
  });

  it('writes timing into the animation shorthand', () => {
    const spin = animationCss('sis-a', { kind: 'spin', clockwise: false, duration: 1.25, easing: 'steps', steps: 12, direction: 'normal', iterations: 0, delay: 0.5 });
    expect(spin).toContain('animation:sis-a-spin 1.25s steps(12) 0.5s infinite normal');
    expect(spin).toContain('rotate(-360deg)');
    const fade = animationCss('sis-a', { kind: 'fade', minOpacity: 0.25, duration: 2, easing: 'linear', steps: 8, direction: 'alternate', iterations: 3, delay: 0 });
    expect(fade).toContain('animation:sis-a-fade 2s linear 0s 3 alternate');
    expect(fade).toContain('opacity:0.25');
  });

  it('bounce moves up by the height in grid units', () => {
    const css = animationCss('sis-a', { ...(defaultAnimation('bounce') as ActiveAnimation & { kind: 'bounce' }), height: 3 });
    expect(css).toContain('translateY(-3px)');
  });
});

describe('defaults and normalizing', () => {
  it('spin defaults to stepped timing; switching presets keeps tuned timing', () => {
    const spin = defaultAnimation('spin') as ActiveAnimation;
    expect([spin.easing, spin.steps]).toEqual(['steps', 8]);
    const kept = defaultAnimation('pulse', { duration: 3, easing: 'linear', steps: 4, direction: 'reverse', iterations: 2, delay: 1 }) as ActiveAnimation;
    expect([kept.duration, kept.easing, kept.iterations, kept.delay]).toEqual([3, 'linear', 2, 1]);
  });

  it.each([
    ['null', null],
    ['string', 'spin'],
    ['unknown kind', { kind: 'explode' }],
    ['none', { kind: 'none', duration: 3 }],
  ])('falls back to none for %s', (_, input) => {
    expect(normalizeAnimation(input)).toEqual(NO_ANIMATION);
  });

  it('clamps numbers and replaces bad enums from untrusted files', () => {
    const a = normalizeAnimation({
      kind: 'pulse', scale: 99, duration: -4, steps: 1e9, iterations: 'lots', delay: Infinity,
      easing: 'url(https://evil.example)', direction: '} body { color: red', extra: '<script>',
    }) as ActiveAnimation & { kind: 'pulse' };
    expect(a.scale).toBe(LIMITS.scale[1]);
    expect(a.duration).toBe(LIMITS.duration[0]);
    expect(a.steps).toBe(LIMITS.steps[1]);
    expect(a.iterations).toBe(0);
    expect(a.delay).toBe(0);
    expect(a.easing).toBe('ease-in-out');
    expect(a.direction).toBe('normal');
    expect(a).not.toHaveProperty('extra');
    expect(checkAnimationCss(animationCss('sis-x', a)).ok).toBe(true);
  });
});

describe('class prefix', () => {
  it('is deterministic per icon and differs between icons and settings', () => {
    const a = createGrid(4, 4);
    a.data[0] = pack(255, 0, 0);
    const b = createGrid(4, 4);
    b.data[1] = pack(255, 0, 0);
    const spin = defaultAnimation('spin');
    expect(animationPrefix(a, spin)).toBe(animationPrefix(a, spin));
    expect(animationPrefix(a, spin)).toMatch(/^sis-[0-9a-f]{6}$/);
    expect(animationPrefix(a, spin)).not.toBe(animationPrefix(b, spin));
    expect(animationPrefix(a, spin)).not.toBe(animationPrefix(a, defaultAnimation('fade')));
  });
});

describe('sequence by color', () => {
  // 8 dots around a 9×9 ring, one shade each, plus a static center.
  const DOTS: Array<[number, number]> = [[4, 0], [7, 1], [8, 4], [7, 7], [4, 8], [1, 7], [0, 4], [1, 1]];
  function ring() {
    const g = createGrid(9, 9);
    DOTS.forEach(([x, y], i) => (g.data[y * 9 + x] = pack(10 + i * 20, 0, 0)));
    g.data[4 * 9 + 4] = pack(0, 0, 255);
    return g;
  }
  const shade = (i: number) => pack(10 + i * 20, 0, 0);
  const rankList = (m: Map<number, number>) => [...m.entries()].sort((a, b) => a[1] - b[1]).map(([c]) => c);

  it('orders clockwise from 12 o’clock', () => {
    const ranks = sequenceRanks(ring(), 'clockwise', pack(0, 0, 255));
    expect(rankList(ranks)).toEqual(DOTS.map((_, i) => shade(i)));
  });

  it('orders counter-clockwise from 12 o’clock', () => {
    const ranks = sequenceRanks(ring(), 'counterclockwise', pack(0, 0, 255));
    expect(rankList(ranks)).toEqual([0, 7, 6, 5, 4, 3, 2, 1].map(shade));
  });

  it('drawing order follows first appearance (row-major)', () => {
    const ranks = sequenceRanks(ring(), 'appearance', null);
    // Row 0: dot 0; row 1: dots 7 then 1; row 4: dot 6, center, dot 2; row 7: dots 5, 3; row 8: dot 4.
    expect(rankList(ranks)).toEqual([shade(0), shade(7), shade(1), shade(6), pack(0, 0, 255), shade(2), shade(5), shade(3), shade(4)]);
  });

  it('leaves the base color out', () => {
    const ranks = sequenceRanks(ring(), 'clockwise', pack(0, 0, 255));
    expect(ranks.size).toBe(8);
    expect(ranks.has(pack(0, 0, 255))).toBe(false);
  });

  it('spaces step delays evenly over one cycle, offset by the user delay', () => {
    const a = { ...(defaultAnimation('sequence') as ActiveAnimation & { kind: 'sequence' }), duration: 2, delay: 0.5 };
    const css = animationCss('sis-a', a, 4);
    expect(css).toContain('.sis-a-s0{animation-delay:-1.5s}');
    expect(css).toContain('.sis-a-s1{animation-delay:-1s}');
    expect(css).toContain('.sis-a-s3{animation-delay:0s}');
    expect(css).toContain('transform-box:fill-box');
    expect(checkAnimationCss(css)).toEqual({ ok: true });
  });

  it('pop effect scales each step around its own box', () => {
    const a = { ...(defaultAnimation('sequence') as ActiveAnimation & { kind: 'sequence' }), effect: 'pop' as const, scale: 1.4 };
    const css = animationCss('sis-a', a, 3);
    expect(css).toContain('0%{transform:scale(1.4)}50%,100%{transform:scale(1)}');
    expect(checkAnimationCss(css)).toEqual({ ok: true });
  });

  it('validates with many steps at the limits', () => {
    for (const effect of ['fade', 'pop'] as const) {
      const a = normalizeAnimation({ kind: 'sequence', effect, duration: 0.2, delay: 5, minOpacity: 0, scale: 1.6 }) as ActiveAnimation;
      expect(checkAnimationCss(animationCss('sis-a', a, 64))).toEqual({ ok: true });
    }
  });

  it('normalizes tampered sequence settings', () => {
    const a = normalizeAnimation({ kind: 'sequence', effect: 'explode', order: 'random', baseColor: '#fff', minOpacity: 7 });
    expect(a).toMatchObject({ kind: 'sequence', effect: 'fade', order: 'clockwise', baseColor: null, minOpacity: LIMITS.minOpacity[1] });
    expect(normalizeAnimation({ kind: 'sequence', baseColor: -1 })).toMatchObject({ baseColor: null });
    expect(normalizeAnimation({ kind: 'sequence', baseColor: 1.5 })).toMatchObject({ baseColor: null });
    expect(normalizeAnimation({ kind: 'sequence', baseColor: 0xff0000ff })).toMatchObject({ baseColor: 0xff0000ff });
  });
});
