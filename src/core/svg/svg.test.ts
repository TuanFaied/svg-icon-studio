import { describe, expect, it } from 'vitest';
import { pack } from '../grid/color';
import { createGrid, type Grid, gridsEqual } from '../grid/grid';
import { checkAnimationCss } from '../sanitize/animationCss';
import { ANIMATION_KINDS, defaultAnimation } from './animation';
import { DEFAULT_SVG_OPTIONS, type Geometry, gridToSvg, type SvgOptions } from './generate';
import { optimizeSvg } from './optimize';
import { svgToGrid } from './parse';

/** Deterministic PRNG so failures are reproducible. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PALETTE = [
  pack(0, 0, 0), pack(255, 255, 255), pack(255, 0, 0), pack(18, 52, 86),
  pack(0, 128, 0, 128), pack(10, 20, 30, 1), pack(250, 200, 0, 254),
];

function randomGrid(w: number, h: number, rnd: () => number, density: number, colors: number): Grid {
  const g = createGrid(w, h);
  for (let i = 0; i < g.data.length; i++) {
    if (rnd() < density) g.data[i] = PALETTE[Math.floor(rnd() * colors)];
  }
  return g;
}

/** Blocky random art: larger same-color regions, holes and diagonal touches. */
function blockyGrid(w: number, h: number, rnd: () => number): Grid {
  const g = createGrid(w, h);
  for (let k = 0; k < 12; k++) {
    const c = rnd() < 0.2 ? 0 : PALETTE[Math.floor(rnd() * PALETTE.length)];
    const x0 = Math.floor(rnd() * w), y0 = Math.floor(rnd() * h);
    const bw = 1 + Math.floor(rnd() * w / 2), bh = 1 + Math.floor(rnd() * h / 2);
    for (let y = y0; y < Math.min(h, y0 + bh); y++) for (let x = x0; x < Math.min(w, x0 + bw); x++) g.data[y * w + x] = c;
  }
  return g;
}

const GEOMETRIES: Geometry[] = ['rects', 'paths', 'cells'];
const opts = (geometry: Geometry, extra: Partial<SvgOptions> = {}): SvgOptions => ({ ...DEFAULT_SVG_OPTIONS, geometry, ...extra });

describe('grid → svg → grid round trip', () => {
  const sizes: Array<[number, number]> = [[1, 1], [2, 3], [8, 8], [16, 5], [24, 24], [33, 17]];

  for (const geometry of GEOMETRIES) {
    for (const format of ['readable', 'minimal'] as const) {
      it(`${geometry} / ${format}: randomized grids`, () => {
        const rnd = mulberry32(geometry.length * 1000 + format.length);
        for (const [w, h] of sizes) {
          for (let trial = 0; trial < 8; trial++) {
            const g = trial % 2 ? blockyGrid(w, h, rnd) : randomGrid(w, h, rnd, [0, 0.3, 0.7, 1][trial % 4], 1 + (trial % PALETTE.length));
            const svg = gridToSvg(g, opts(geometry, { format }));
            const back = svgToGrid(svg);
            expect(gridsEqual(back, g), `${w}x${h} trial ${trial}\n${svg}`).toBe(true);
          }
        }
      });
    }

    it(`${geometry}: 128×128 grid`, () => {
      const rnd = mulberry32(128);
      const g = randomGrid(128, 128, rnd, 0.6, PALETTE.length);
      expect(gridsEqual(svgToGrid(gridToSvg(g, opts(geometry, { format: 'minimal' }))), g)).toBe(true);
      const b = blockyGrid(128, 128, rnd);
      expect(gridsEqual(svgToGrid(gridToSvg(b, opts(geometry))), b)).toBe(true);
    });

    it(`${geometry}: optimized (SVGO) output still round-trips`, () => {
      const rnd = mulberry32(7);
      for (let t = 0; t < 6; t++) {
        const g = t % 2 ? blockyGrid(16, 16, rnd) : randomGrid(12, 9, rnd, 0.5, 4);
        const svg = optimizeSvg(gridToSvg(g, opts(geometry, { format: 'optimized' })));
        expect(gridsEqual(svgToGrid(svg), g), svg).toBe(true);
      }
    });
  }

  it('handles holes (ring) in path mode with evenodd', () => {
    const g = createGrid(5, 5);
    const c = pack(1, 2, 3);
    for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) if (x === 0 || y === 0 || x === 4 || y === 4 || (x === 2 && y === 2)) g.data[y * 5 + x] = c;
    const svg = gridToSvg(g, opts('paths'));
    expect(svg).toContain('fill-rule="evenodd"');
    expect((svg.match(/<path/g) ?? []).length).toBe(1);
    expect(svg).toMatch(/d="[Mhvz0-9\s-]+"/);
    expect(gridsEqual(svgToGrid(svg), g)).toBe(true);
  });

  it('ignores <style> animation blocks when parsing', () => {
    const g = randomGrid(8, 8, mulberry32(11), 0.5, 3);
    const svg = gridToSvg(g, opts('rects')).replace(
      /(<svg[^>]*>)/,
      '$1<style>.a { animation: k 1s infinite } @keyframes k { to { transform: rotate(360deg) } }</style>',
    );
    expect(gridsEqual(svgToGrid(svg), g)).toBe(true);
  });

  it('background rect is skipped when parsing with skipBackground', () => {
    const g = randomGrid(6, 6, mulberry32(3), 0.5, 3);
    const svg = gridToSvg(g, opts('rects', { includeBackground: true, background: pack(9, 9, 9) }));
    expect(gridsEqual(svgToGrid(svg, { skipBackground: true }), g)).toBe(true);
  });
});

describe('svg document options', () => {
  it('empty canvas produces a valid empty svg with viewBox', () => {
    const svg = gridToSvg(createGrid(24, 24), opts('rects'));
    expect(svg).toContain('viewBox="0 0 24 24"');
    expect(svg).not.toContain('<rect');
    expect(gridsEqual(svgToGrid(svg), createGrid(24, 24))).toBe(true);
  });

  it('uses currentColor for single-color drawings only', () => {
    const g = createGrid(3, 3);
    g.data[0] = pack(200, 10, 10);
    g.data[4] = pack(200, 10, 10);
    const svg = gridToSvg(g, opts('rects', { currentColor: true }));
    expect(svg).toContain('fill="currentColor"');
    expect(svg).not.toContain('#c80a0a');
    g.data[8] = pack(1, 1, 1);
    expect(gridToSvg(g, opts('rects', { currentColor: true }))).not.toContain('currentColor');
  });

  it('exports alpha with fill-opacity', () => {
    const g = createGrid(1, 1);
    g.data[0] = pack(255, 0, 0, 128);
    const svg = gridToSvg(g, opts('rects'));
    expect(svg).toContain('fill-opacity="0.502"');
    expect(svgToGrid(svg).data[0]).toBe(g.data[0]);
  });

  it('title, role and decorative modes', () => {
    const g = createGrid(2, 2);
    const titled = gridToSvg(g, opts('rects', { title: 'Home <icon>' }));
    expect(titled).toContain('role="img"');
    expect(titled).toContain('<title>Home &lt;icon&gt;</title>');
    const deco = gridToSvg(g, opts('rects', { title: 'x', decorative: true }));
    expect(deco).toContain('aria-hidden="true"');
    expect(deco).not.toContain('<title>');
  });

  it('can omit width/height and crispEdges; uses short hex in minimal', () => {
    const g = createGrid(2, 1);
    g.data[0] = pack(255, 255, 255);
    const svg = gridToSvg(g, opts('rects', { includeSize: false, crispEdges: false, format: 'minimal' }));
    expect(svg).not.toMatch(/\swidth="2"\s.*viewBox/);
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 1">')).toBe(true);
    expect(svg).toContain('fill="#fff"');
    expect(svg).not.toContain('\n');
  });

  it('greedy meshing merges a solid square into one rect', () => {
    const g = createGrid(4, 4);
    g.data.fill(pack(0, 0, 0));
    const svg = gridToSvg(g, opts('rects'));
    expect((svg.match(/<rect/g) ?? []).length).toBe(1);
  });

  it('corner radius only applies to individual cells', () => {
    const g = createGrid(2, 2);
    g.data.fill(pack(0, 0, 0));
    expect(gridToSvg(g, opts('cells', { cornerRadius: 0.25 }))).toContain('rx="0.25"');
    expect(gridToSvg(g, opts('rects', { cornerRadius: 0.25 }))).not.toContain('rx=');
  });
});

describe('animation presets in generated SVG', () => {
  const styleOf = (svg: string) => svg.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';
  const ACTIVE = ANIMATION_KINDS.filter((k) => k !== 'none');

  for (const kind of ACTIVE) {
    it(`${kind}: round-trips for every geometry and format, with valid CSS`, () => {
      const rnd = mulberry32(kind.length * 97);
      for (const geometry of GEOMETRIES) {
        for (const format of ['readable', 'minimal', 'optimized'] as const) {
          const g = blockyGrid(12, 10, rnd);
          const raw = gridToSvg(g, opts(geometry, { format, animation: defaultAnimation(kind), includeBackground: true, background: pack(1, 2, 3) }));
          const svg = format === 'optimized' ? optimizeSvg(raw) : raw;
          const label = `${geometry}/${format}\n${svg}`;
          expect(gridsEqual(svgToGrid(svg, { skipBackground: true }), g), label).toBe(true);
          const css = styleOf(svg);
          expect(css, label).toContain('@keyframes');
          expect(css, label).toContain('prefers-reduced-motion');
          expect(checkAnimationCss(css), label).toEqual({ ok: true });
          const cls = css.match(/\.(sis-[0-9a-f]{6})\{/)?.[1];
          if (kind === 'sequence') {
            // One class pair per animated color; SVGO may put it on the shape itself.
            expect(svg, label).toContain(`class="${cls} ${cls}-s0"`);
          } else {
            expect(svg, label).toContain(`<g class="${cls}">`);
          }
        }
      }
    });
  }

  it('keeps the background outside the animated group', () => {
    const g = createGrid(3, 3);
    g.data[4] = pack(0, 0, 0);
    const svg = gridToSvg(g, opts('rects', { format: 'minimal', animation: defaultAnimation('spin'), includeBackground: true, background: pack(9, 9, 9) }));
    expect(svg.indexOf('fill="#090909"')).toBeLessThan(svg.indexOf('<g class='));
  });

  it('emits no style or group when animation is off or the canvas is empty', () => {
    const g = createGrid(3, 3);
    const empty = gridToSvg(g, opts('rects', { animation: defaultAnimation('spin') }));
    expect(empty).not.toContain('<g class');
    expect(empty).not.toContain('<style');
    g.data[0] = pack(0, 0, 0);
    const still = gridToSvg(g, opts('rects'));
    expect(still).not.toContain('<style');
    expect(still).not.toContain('class=');
  });
});

describe('sequence color highlight in generated SVG', () => {
  const styleOf = (svg: string) => svg.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';
  // Pure red is the case SVGO's CSS minifier used to rewrite as `red`.
  for (const hl of [pack(255, 0, 0), pack(255, 255, 255), pack(18, 52, 86)]) {
    it(`round-trips with valid CSS in every geometry and format (highlight #${hl.toString(16)})`, () => {
      const rnd = mulberry32(hl & 0xffff);
      const animation = { ...defaultAnimation('sequence'), effect: 'highlight', highlightColor: hl } as SvgOptions['animation'];
      for (const geometry of GEOMETRIES) {
        for (const format of ['readable', 'minimal', 'optimized'] as const) {
          const g = blockyGrid(10, 10, rnd);
          const raw = gridToSvg(g, opts(geometry, { format, animation }));
          const svg = format === 'optimized' ? optimizeSvg(raw) : raw;
          const label = `${geometry}/${format}\n${svg}`;
          expect(gridsEqual(svgToGrid(svg), g), label).toBe(true);
          expect(checkAnimationCss(styleOf(svg)), label).toEqual({ ok: true });
          expect(styleOf(svg), label).toMatch(/0%\{fill:#[0-9a-f]{3,6}\}/);
        }
      }
    });
  }
});
