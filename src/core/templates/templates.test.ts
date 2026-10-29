import { describe, expect, it } from 'vitest';
import { gridsEqual, usedColors } from '../grid/grid';
import { checkAnimationCss } from '../sanitize/animationCss';
import { normalizeAnimation, sequenceRanks } from '../svg/animation';
import { DEFAULT_SVG_OPTIONS, gridToSvg } from '../svg/generate';
import { optimizeSvg } from '../svg/optimize';
import { svgToGrid } from '../svg/parse';
import { buildTemplate, stepShades, TEMPLATE_SIZES, TEMPLATES } from './templates';

const STEPS: Record<string, number> = { 'ring-spinner': 2, 'chasing-dots': 8, 'three-dot-pulse': 3, 'bar-loader': 5 };

describe('loader templates', () => {
  for (const info of TEMPLATES) {
    for (const size of TEMPLATE_SIZES) {
      it(`${info.id} at ${size}×${size} builds a valid, animated grid`, () => {
        const t = buildTemplate(info.id, size);
        expect([t.grid.width, t.grid.height]).toEqual([size, size]);
        expect(t.grid.data.length).toBe(size * size);
        expect(t.name).toBe(info.name);

        const colors = usedColors(t.grid);
        expect(colors).toHaveLength(STEPS[info.id]);
        expect(new Set(t.palette)).toEqual(new Set(colors));

        // Settings are already in their normalized form (what a saved project reloads as).
        expect(normalizeAnimation(t.animation)).toEqual(t.animation);
        expect(t.animation.kind).not.toBe('none');

        // Exports with valid animation CSS and round-trips in every format.
        for (const format of ['readable', 'minimal', 'optimized'] as const) {
          const raw = gridToSvg(t.grid, { ...DEFAULT_SVG_OPTIONS, format, animation: t.animation });
          const svg = format === 'optimized' ? optimizeSvg(raw) : raw;
          const css = svg.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';
          expect(checkAnimationCss(css), `${format}\n${svg}`).toEqual({ ok: true });
          expect(gridsEqual(svgToGrid(svg), t.grid), format).toBe(true);
        }
      });
    }
  }

  it('keeps shapes inside the canvas with a margin', () => {
    for (const info of TEMPLATES) {
      for (const size of TEMPLATE_SIZES) {
        const g = buildTemplate(info.id, size).grid;
        for (let i = 0; i < size; i++) {
          // First and last rows and columns stay empty.
          for (const idx of [i, (size - 1) * size + i, i * size, i * size + size - 1]) {
            expect(g.data[idx], `${info.id} ${size} edge cell ${idx}`).toBe(0);
          }
        }
      }
    }
  });

  it('chasing dots light up clockwise starting at the top', () => {
    for (const size of TEMPLATE_SIZES) {
      const t = buildTemplate('chasing-dots', size);
      const ranks = sequenceRanks(t.grid, 'clockwise', null);
      // Dot k was drawn with shade k at angle k × 45° from 12 o'clock.
      expect([...ranks.entries()].sort((a, b) => a[1] - b[1]).map(([c]) => c)).toEqual(stepShades(8));
    }
  });

  it('three-dot pulse and bar loader run left to right', () => {
    for (const id of ['three-dot-pulse', 'bar-loader'] as const) {
      const t = buildTemplate(id, 24);
      const ranks = sequenceRanks(t.grid, 'appearance', null);
      expect([...ranks.entries()].sort((a, b) => a[1] - b[1]).map(([c]) => c), id).toEqual(stepShades(STEPS[id]));
    }
  });

  it('ring spinner highlights one quarter of the ring', () => {
    const t = buildTemplate('ring-spinner', 32);
    const [arc, track] = t.palette;
    const count = (c: number) => t.grid.data.filter((v) => v === c).length;
    const share = count(arc) / (count(arc) + count(track));
    expect(share).toBeGreaterThan(0.2);
    expect(share).toBeLessThan(0.3);
    expect(t.animation).toMatchObject({ kind: 'spin', easing: 'steps', steps: 8 });
  });

  it('step shades are distinct', () => {
    expect(new Set(stepShades(8)).size).toBe(8);
  });
});
