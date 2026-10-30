import { GifReader } from 'omggif';
import { describe, expect, it } from 'vitest';
import { pack, type PackedColor } from '../grid/color';
import { createGrid, type Grid, gridsEqual } from '../grid/grid';
import { gridsToSheet } from '../export/encode';
import { framesToGif } from '../export/gif';
import { svgToTsx } from '../export/jsx';
import { parseProject, serializeProject } from '../project/project';
import { checkAnimationCss } from '../sanitize/animationCss';
import { defaultAnimation } from '../svg/animation';
import { DEFAULT_SVG_OPTIONS, framesToSvg, type Geometry, gridToSvg, type SvgOptions } from '../svg/generate';
import { optimizeSvg } from '../svg/optimize';
import { svgToGrid } from '../svg/parse';
import { clampDuration, formatTime, fpsToMs, frameAt, MAX_FRAME_MS, MIN_FRAME_MS, moveItem, msToFps, totalDuration } from './frames';
import * as ts from 'typescript';

const RED = pack(255, 0, 0);
const BLUE = pack(0, 0, 255, 200);

function dotFrames(n: number, size = 6): Array<{ grid: Grid; duration: number }> {
  return Array.from({ length: n }, (_, i) => {
    const g = createGrid(size, size);
    g.data[(i % size) + size * 2] = RED;
    g.data[size * size - 1 - i] = BLUE;
    return { grid: g, duration: 100 + i * 50 };
  });
}

const opts = (extra: Partial<SvgOptions> = {}): SvgOptions => ({ ...DEFAULT_SVG_OPTIONS, ...extra });
const styleOf = (svg: string) => svg.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';

/** Pulls out one frame group and parses it as a standalone SVG. */
function frameFromSvg(svg: string, i: number): Grid {
  const root = svg.match(/<svg[^>]*>/)?.[0] as string;
  const open = new RegExp(`<g class="sis-[0-9a-f]{6}-fr sis-[0-9a-f]{6}-f${i}"(/?)>`).exec(svg);
  if (!open) throw new Error(`frame ${i} not found`);
  if (open[1] === '/') return svgToGrid(`${root}</svg>`);
  // Frame groups never nest, so the matching </g> is the one that closes depth 0.
  let depth = 1;
  const re = /<(\/?)g\b[^>]*?(\/?)>/g;
  re.lastIndex = open.index + open[0].length;
  let m: RegExpExecArray | null;
  while ((m = re.exec(svg))) {
    if (m[2]) continue;
    depth += m[1] ? -1 : 1;
    if (depth === 0) return svgToGrid(`${root}${svg.slice(open.index + open[0].length, m.index)}</svg>`);
  }
  throw new Error('unclosed frame group');
}

describe('frame helpers', () => {
  it('clamps durations and converts fps', () => {
    expect(clampDuration(1)).toBe(MIN_FRAME_MS);
    expect(clampDuration(1e9)).toBe(MAX_FRAME_MS);
    expect(clampDuration(Number.NaN)).toBe(100);
    expect(fpsToMs(10)).toBe(100);
    expect(msToFps(250)).toBe(4);
    expect(totalDuration(dotFrames(3))).toBe(100 + 150 + 200);
  });

  it('moves items', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
    expect(moveItem(['a', 'b'], 0, 5)).toEqual(['a', 'b']);
  });
});

describe('multi-frame SVG', () => {
  it('a single frame is exactly the still SVG', () => {
    const [f] = dotFrames(1);
    expect(framesToSvg([f], opts())).toBe(gridToSvg(f.grid, opts()));
  });

  for (const geometry of ['rects', 'paths', 'cells'] as Geometry[]) {
    for (const format of ['readable', 'minimal'] as const) {
      it(`${geometry}/${format}: every frame group round-trips`, () => {
        const frames = dotFrames(4);
        const svg = framesToSvg(frames, opts({ geometry, format }));
        frames.forEach((f, i) => expect(gridsEqual(frameFromSvg(svg, i), f.grid), `frame ${i}\n${svg}`).toBe(true));
        expect(checkAnimationCss(styleOf(svg))).toEqual({ ok: true });
      });
    }
  }

  it('times each frame by its duration, shows frame 0 when motion is off', () => {
    const svg = framesToSvg(dotFrames(3), opts());
    const css = styleOf(svg);
    // 100 + 150 + 200 = 450 ms loop; frame 1 runs from 22.222% to 55.556%.
    expect(css).toContain('animation-duration:0.45s');
    expect(css).toMatch(/-k1\{0%\{opacity:0\}22\.222%\{opacity:1\}55\.556%\{opacity:0\}100%\{opacity:0\}\}/);
    expect(css).toMatch(/-f0\{animation-name:/);
    expect(css).toMatch(/-f1\{opacity:0;animation-name:/);
    expect(css).toMatch(/-f2\{opacity:0;animation-name:/);
    expect(css).toMatch(/@media \(prefers-reduced-motion:reduce\)\{\.sis-[0-9a-f]{6}-fr\{animation:none\}\}/);
    expect(css).toMatch(/timing-function:steps\(1\)/);
  });

  it('SVGO keeps every drawn frame and valid CSS', () => {
    const frames = dotFrames(4);
    const svg = optimizeSvg(framesToSvg(frames, opts({ format: 'optimized' })));
    for (let i = 0; i < 4; i++) expect(svg).toMatch(new RegExp(`-f${i}[" ]`));
    expect(checkAnimationCss(styleOf(svg))).toEqual({ ok: true });
  });

  it('wraps frames in a whole-icon preset and ignores sequence', () => {
    const frames = dotFrames(2);
    const spun = framesToSvg(frames, opts({ animation: defaultAnimation('spin') }));
    expect(styleOf(spun)).toMatch(/-spin\{/);
    expect(spun).toMatch(/<g class="sis-[0-9a-f]{6}">\n\s+<g class="sis-[0-9a-f]{6}-fr /);
    expect(checkAnimationCss(styleOf(spun))).toEqual({ ok: true });
    const seq = framesToSvg(frames, opts({ animation: defaultAnimation('sequence') }));
    expect(styleOf(seq)).not.toContain('-sequence');
    expect(seq).not.toMatch(/-s0"/);
  });

  it('builds TSX that compiles', () => {
    const tsx = svgToTsx(framesToSvg(dotFrames(3), opts({ format: 'minimal' })), { componentName: 'WalkIcon', defaultSize: 24 });
    const out = ts.transpileModule(tsx, { reportDiagnostics: true, compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext }, fileName: 'x.tsx' });
    expect(out.diagnostics ?? []).toEqual([]);
  });

  it('16 frames at 128×128 regenerate quickly after a small edit (per-frame cache)', () => {
    const big = Array.from({ length: 16 }, (_, k) => {
      const g = createGrid(128, 128);
      let seed = k + 1;
      for (let i = 0; i < g.data.length; i++) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        if (seed % 3 === 0) g.data[i] = [RED, BLUE, pack(0, 160, 0)][seed % 7 % 3];
      }
      return { grid: g, duration: 80 };
    });
    let t = performance.now();
    framesToSvg(big, opts());
    const cold = performance.now() - t;
    big[5].grid.data[100] = pack(9, 9, 9);
    t = performance.now();
    const svg = framesToSvg(big, opts());
    const warm = performance.now() - t;
    expect(svg).toContain('#090909');
    expect(warm, `cold ${cold.toFixed(0)}ms, warm ${warm.toFixed(0)}ms`).toBeLessThan(cold / 2);
  });
});

describe('GIF export', () => {
  function decode(bytes: Uint8Array) {
    const r = new GifReader(bytes);
    return Array.from({ length: r.numFrames() }, (_, i) => {
      const px = new Uint8Array(r.width * r.height * 4);
      r.decodeAndBlitFrameRGBA(i, px);
      return { info: r.frameInfo(i), px, width: r.width, height: r.height, loop: r.loopCount() };
    });
  }
  const expected = (c: PackedColor) => (c === 0 || (c & 255) < 128 ? [0, 0, 0, 0] : [c >>> 24, (c >>> 16) & 255, (c >>> 8) & 255, 255]);

  it('encodes every frame with its delay, exact colors and transparency', () => {
    const frames = dotFrames(3);
    const out = decode(framesToGif(frames, 2));
    expect(out).toHaveLength(3);
    expect(out[0].loop).toBe(0);
    out.forEach((f, n) => {
      expect([f.width, f.height]).toEqual([12, 12]);
      expect(f.info.delay).toBe(Math.round(frames[n].duration / 10));
      const g = frames[n].grid;
      for (let y = 0; y < 12; y++) {
        for (let x = 0; x < 12; x++) {
          const c = g.data[Math.floor(y / 2) * g.width + Math.floor(x / 2)];
          const p = (y * 12 + x) * 4;
          const got = Array.from(f.px.slice(p, p + 4));
          expect(got[3] === 0 ? [0, 0, 0, 0] : got, `frame ${n} (${x},${y})`).toEqual(expected(c));
        }
      }
    });
  });

  it('composites onto a solid background', () => {
    const out = decode(framesToGif(dotFrames(1), 1, pack(255, 255, 255)));
    expect(Array.from(out[0].px.slice(0, 4))).toEqual([255, 255, 255, 255]);
  });

  it('quantizes when there are more than 255 colors and still decodes', () => {
    const g = createGrid(32, 32);
    for (let i = 0; i < g.data.length; i++) g.data[i] = pack(i & 255, (i >> 2) & 255, (i * 7) & 255);
    const out = decode(framesToGif([{ grid: g, duration: 100 }], 1));
    expect(out).toHaveLength(1);
    expect(out[0].px[3]).toBe(255);
  });
});

describe('sprite sheet', () => {
  it('lays frames out left to right', () => {
    const frames = dotFrames(3);
    const sheet = gridsToSheet(frames.map((f) => f.grid), 1);
    expect([sheet.width, sheet.height]).toEqual([18, 6]);
    // Frame 2's red dot at (2, 2) lands at x = 12 + 2.
    const p = (2 * 18 + 14) * 4;
    expect(Array.from(sheet.data.slice(p, p + 4))).toEqual([255, 0, 0, 255]);
  });
});

describe('project files with frames', () => {
  it('round-trips frames and durations (v2)', () => {
    const frames = dotFrames(4);
    const json = serializeProject({ name: 'Walk', grid: frames[0].grid, palette: [], svg: DEFAULT_SVG_OPTIONS, frames });
    expect(JSON.parse(json).version).toBe(2);
    const p = parseProject(json);
    expect(p.frames).toHaveLength(4);
    p.frames?.forEach((f, i) => {
      expect(gridsEqual(f.grid, frames[i].grid)).toBe(true);
      expect(f.duration).toBe(frames[i].duration);
    });
    expect(gridsEqual(p.grid, frames[0].grid)).toBe(true);
  });

  it('opens v1 files (no frames) as a single frame', () => {
    const [f] = dotFrames(1);
    const v2 = JSON.parse(serializeProject({ name: 'Old', grid: f.grid, palette: [], svg: DEFAULT_SVG_OPTIONS }));
    delete v2.frames;
    v2.version = 1;
    const p = parseProject(JSON.stringify(v2));
    expect(p.frames).toBeUndefined();
    expect(gridsEqual(p.grid, f.grid)).toBe(true);
  });

  it('clamps tampered durations and rejects too many frames', () => {
    const frames = dotFrames(2);
    const file = JSON.parse(serializeProject({ name: 'X', grid: frames[0].grid, palette: [], svg: DEFAULT_SVG_OPTIONS, frames }));
    file.frames[0].duration = -5;
    file.frames[1].duration = 'slow';
    const p = parseProject(JSON.stringify(file));
    expect(p.frames?.map((f) => f.duration)).toEqual([MIN_FRAME_MS, 100]);
    file.frames = Array.from({ length: 65 }, () => file.frames[0]);
    expect(() => parseProject(JSON.stringify(file))).toThrow(/at most 64 frames/);
  });
});

describe('timeline helpers', () => {
  it('formats times as m:ss.cc', () => {
    expect(formatTime(0)).toBe('0:00.00');
    expect(formatTime(400)).toBe('0:00.40');
    expect(formatTime(61_234)).toBe('1:01.23');
    expect(formatTime(-5)).toBe('0:00.00');
  });

  it('finds the frame showing at a time', () => {
    const starts = [0, 100, 400, 450];
    expect([0, 99, 100, 399, 400, 449, 450, 2000].map((t) => frameAt(starts, t))).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
    expect(frameAt(starts, -10)).toBe(0);
  });
});
