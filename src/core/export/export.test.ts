import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { pack } from '../grid/color';
import { createGrid, gridsEqual } from '../grid/grid';
import { decodeShare, encodeShare, parseProject, serializeProject } from '../project/project';
import { defaultAnimation } from '../svg/animation';
import { DEFAULT_SVG_OPTIONS, gridToSvg } from '../svg/generate';
import { cssDataUri, fileStem, gridToRgba } from './encode';
import { jsxAttrName, svgToTsx, toComponentName } from './jsx';

function sample() {
  const g = createGrid(4, 3);
  g.data[0] = pack(255, 0, 0);
  g.data[5] = pack(0, 0, 255, 128);
  g.data[11] = pack(0, 0, 255, 128);
  return g;
}

function compileErrors(source: string): string[] {
  const out = ts.transpileModule(source, {
    reportDiagnostics: true,
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext, strict: true },
    fileName: 'Icon.tsx',
  });
  return (out.diagnostics ?? []).map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
}

describe('JSX export', () => {
  it('camelCases attributes', () => {
    expect(jsxAttrName('fill-rule')).toBe('fillRule');
    expect(jsxAttrName('shape-rendering')).toBe('shapeRendering');
    expect(jsxAttrName('aria-hidden')).toBe('aria-hidden');
    expect(jsxAttrName('xlink:href')).toBe('xlinkHref');
  });

  it('builds component names', () => {
    expect(toComponentName('my cool heart')).toBe('MyCoolHeartIcon');
    expect(toComponentName('')).toBe('Icon');
    expect(toComponentName('3d box')).toBe('Icon3dBoxIcon');
  });

  for (const geometry of ['rects', 'paths', 'cells'] as const) {
    it(`produces valid TSX for ${geometry}`, () => {
      const svg = gridToSvg(sample(), { ...DEFAULT_SVG_OPTIONS, geometry, title: 'Brace {test} & <ok>' });
      const tsx = svgToTsx(svg, { componentName: 'HeartIcon', defaultSize: 24 });
      expect(tsx).toContain('{...props}');
      expect(tsx).toContain('width={size}');
      expect(tsx).not.toMatch(/fill-rule|shape-rendering|fill-opacity/);
      expect(compileErrors(tsx)).toEqual([]);
    });
  }

  for (const kind of ['spin', 'pulse', 'fade', 'bounce', 'sequence'] as const) {
    it(`produces valid TSX with a ${kind} animation`, () => {
      const svg = gridToSvg(sample(), { ...DEFAULT_SVG_OPTIONS, format: 'minimal', animation: defaultAnimation(kind) });
      const tsx = svgToTsx(svg, { componentName: 'LoaderIcon', defaultSize: 24 });
      expect(tsx).toMatch(/<style>\s*\{".*@keyframes sis-[0-9a-f]{6}-/);
      expect(tsx).toContain('className="sis-');
      expect(compileErrors(tsx)).toEqual([]);
    });
  }

  it('produces valid TSX with a color-highlight sequence', () => {
    const animation = { ...defaultAnimation('sequence'), effect: 'highlight', highlightColor: pack(255, 204, 0) } as typeof DEFAULT_SVG_OPTIONS.animation;
    const tsx = svgToTsx(gridToSvg(sample(), { ...DEFAULT_SVG_OPTIONS, format: 'minimal', animation }), { componentName: 'LoaderIcon', defaultSize: 24 });
    expect(tsx).toContain('fill:#ffcc00');
    expect(compileErrors(tsx)).toEqual([]);
  });

  it('keeps currentColor for single-color icons', () => {
    const g = createGrid(2, 2);
    g.data[0] = pack(9, 9, 9);
    const tsx = svgToTsx(gridToSvg(g, { ...DEFAULT_SVG_OPTIONS, currentColor: true }), { componentName: 'XIcon', defaultSize: 16 });
    expect(tsx).toContain('fill="currentColor"');
    expect(tsx).toContain('size = 16');
  });
});

describe('encoders', () => {
  it('makes a URL-encoded css data uri', () => {
    const uri = cssDataUri(gridToSvg(sample(), DEFAULT_SVG_OPTIONS));
    expect(uri.startsWith('url("data:image/svg+xml,')).toBe(true);
    expect(uri).not.toContain('base64');
    expect(uri.slice(5, -2)).not.toMatch(/[<>#"]/);
  });

  it('rasterizes the grid exactly at 1× and scales with nearest neighbor', () => {
    const g = sample();
    const px = gridToRgba(g, 1);
    expect([...px.slice(0, 4)]).toEqual([255, 0, 0, 255]);
    expect([...px.slice(4, 8)]).toEqual([0, 0, 0, 0]);
    expect([...px.slice(20, 24)]).toEqual([0, 0, 255, 128]);
    const px2 = gridToRgba(g, 2);
    expect(px2.length).toBe(8 * 6 * 4);
    expect([...px2.slice(4, 8)]).toEqual([255, 0, 0, 255]);
    expect([...px2.slice(8 * 4, 8 * 4 + 4)]).toEqual([255, 0, 0, 255]);
  });

  it('composites over a solid background', () => {
    const g = createGrid(1, 1);
    g.data[0] = pack(0, 0, 0, 128);
    const [r, , , a] = gridToRgba(g, 1, pack(255, 255, 255));
    expect(a).toBe(255);
    expect(r).toBeGreaterThan(120);
    expect(r).toBeLessThan(135);
  });

  it('file stems', () => {
    expect(fileStem('  My Icon!! ')).toBe('my-icon');
    expect(fileStem('***')).toBe('icon');
  });
});

describe('project files and share links', () => {
  it('round-trips a project', () => {
    const g = sample();
    const json = serializeProject({ name: 'Test', grid: g, palette: [pack(1, 2, 3)], svg: { ...DEFAULT_SVG_OPTIONS, geometry: 'paths' } });
    const p = parseProject(json);
    expect(gridsEqual(p.grid, g)).toBe(true);
    expect(p.palette).toEqual([pack(1, 2, 3)]);
    expect(p.svg.geometry).toBe('paths');
    expect(p.name).toBe('Test');
  });

  it('round-trips animation settings and normalizes tampered ones', () => {
    const anim = defaultAnimation('bounce');
    const json = serializeProject({ name: 'Anim', grid: sample(), palette: [], svg: { ...DEFAULT_SVG_OPTIONS, animation: anim } });
    expect(parseProject(json).svg.animation).toEqual(anim);
    const tampered = JSON.parse(json);
    tampered.settings.animation = { kind: 'spin', duration: '1s}*{color:red', easing: 'url(x)' };
    const a = parseProject(JSON.stringify(tampered)).svg.animation;
    expect(a.kind).toBe('spin');
    expect(a.kind !== 'none' && [a.duration, a.easing]).toEqual([1.2, 'steps']);
    delete tampered.settings.animation;
    expect(parseProject(JSON.stringify(tampered)).svg.animation).toEqual({ kind: 'none' });
  });

  it('rejects invalid files', () => {
    expect(() => parseProject('nope')).toThrow(/JSON/);
    expect(() => parseProject('{"app":"other"}')).toThrow();
    expect(() => parseProject('{"app":"svg-icon-studio","width":999,"height":1,"pixels":""}')).toThrow(/between/);
  });

  it('round-trips share links up to 32×32', () => {
    const g = createGrid(32, 32);
    for (let i = 0; i < g.data.length; i += 3) g.data[i] = pack(i & 255, 0, 0);
    const hash = encodeShare(g);
    expect(hash.length).toBeLessThan(2000);
    const back = decodeShare('#' + hash);
    expect(back && gridsEqual(back, g)).toBe(true);
    expect(() => encodeShare(createGrid(33, 1))).toThrow();
    expect(decodeShare('#i=garbage')).toBeNull();
  });
});
