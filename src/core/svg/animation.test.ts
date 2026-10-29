import { describe, expect, it } from 'vitest';
import { pack } from '../grid/color';
import { createGrid } from '../grid/grid';
import { checkAnimationCss } from '../sanitize/animationCss';
import {
  type ActiveAnimation, ANIMATION_KINDS, animationCss, animationPrefix, defaultAnimation, LIMITS, NO_ANIMATION, normalizeAnimation,
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
