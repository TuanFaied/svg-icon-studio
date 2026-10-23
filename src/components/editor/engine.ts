import { alpha, blue, green, type PackedColor, red, toCss, TRANSPARENT } from '@/core/grid/color';
import { constrainSquare, ellipsePoints, linePoints, rectPoints, snapLine } from '@/core/grid/draw';
import type { Grid, Point } from '@/core/grid/grid';
import {
  clearRegion, extractRegion, floodFill, normalizeRect, paintFootprint, paintPoints, pasteRegion,
  type PaintOptions, type Rect,
} from '@/core/grid/ops';
import { PatchRecorder } from '@/core/history/patch';
import { useDocument } from '@/store/document';
import { MAX_ZOOM, MIN_ZOOM, type ToolId, useTool } from '@/store/tool';

type ShapeTool = 'line' | 'rect' | 'ellipse';

type Action =
  | { kind: 'stroke'; pointerId: number; rec: PatchRecorder; last: Point; color: PackedColor; lastBump: number }
  | { kind: 'shape'; pointerId: number; tool: ShapeTool; start: Point; end: Point; color: PackedColor; shift: boolean }
  | { kind: 'pan'; pointerId: number; x0: number; y0: number; panX0: number; panY0: number }
  | { kind: 'pinch'; ids: [number, number]; dist0: number; mid0: Point; zoom0: number; pan0: Point }
  | { kind: 'pick'; pointerId: number; secondary: boolean }
  | { kind: 'marquee'; pointerId: number; start: Point; end: Point }
  | { kind: 'move'; pointerId: number; rect: Rect; buf: Grid; start: Point; dx: number; dy: number };

const PAINT_TOOLS: ToolId[] = ['pencil', 'eraser', 'fill', 'line', 'rect', 'ellipse'];
const LIVE_BUMP_MS = 120;

function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/**
 * Imperative drawing surface. Pointer input writes straight into the grid
 * buffer and schedules a canvas repaint; the React store only hears about it
 * through throttled `bump()` calls and one history commit per action.
 */
export class CanvasEngine {
  private ctx: CanvasRenderingContext2D;
  private octx: CanvasRenderingContext2D;
  private buffer: HTMLCanvasElement;
  private bctx: CanvasRenderingContext2D;
  private image: ImageData | null = null;
  private frame = 0;
  private cssW = 0;
  private cssH = 0;
  private dpr = 1;
  private bufferVersion = -1;
  private bufferGrid: Grid | null = null;
  private action: Action | null = null;
  private hover: Point | null = null;
  private touches = new Map<number, Point>();
  private spaceDown = false;
  private unsubs: Array<() => void> = [];
  private ro: ResizeObserver;
  private lastFit = -1;
  private lastGridSize = '';
  /** View produced by the last fit; while unchanged, container resizes refit automatically. */
  private fitView = '';

  constructor(
    private readonly container: HTMLElement,
    private readonly main: HTMLCanvasElement,
    private readonly overlay: HTMLCanvasElement,
  ) {
    this.ctx = main.getContext('2d') as CanvasRenderingContext2D;
    this.octx = overlay.getContext('2d') as CanvasRenderingContext2D;
    this.buffer = document.createElement('canvas');
    this.bctx = this.buffer.getContext('2d') as CanvasRenderingContext2D;

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();

    const el = overlay;
    el.addEventListener('pointerdown', this.onPointerDown);
    el.addEventListener('pointermove', this.onPointerMove);
    el.addEventListener('pointerup', this.onPointerUp);
    el.addEventListener('pointercancel', this.onPointerCancel);
    el.addEventListener('pointerleave', this.onPointerLeave);
    el.addEventListener('wheel', this.onWheel, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKey);
    window.addEventListener('blur', this.onBlur);

    this.unsubs.push(useDocument.subscribe(() => this.request()));
    this.unsubs.push(useTool.subscribe(() => this.request()));
    const mo = new MutationObserver(() => this.request());
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    this.unsubs.push(() => mo.disconnect());
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onMq = () => this.request();
    mq.addEventListener('change', onMq);
    this.unsubs.push(() => mq.removeEventListener('change', onMq));
  }

  destroy(): void {
    cancelAnimationFrame(this.frame);
    this.ro.disconnect();
    this.unsubs.forEach((u) => u());
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKey);
    window.removeEventListener('blur', this.onBlur);
    const el = this.overlay;
    el.removeEventListener('pointerdown', this.onPointerDown);
    el.removeEventListener('pointermove', this.onPointerMove);
    el.removeEventListener('pointerup', this.onPointerUp);
    el.removeEventListener('pointercancel', this.onPointerCancel);
    el.removeEventListener('pointerleave', this.onPointerLeave);
    el.removeEventListener('wheel', this.onWheel);
  }

  // ---------- layout ----------

  private resize(): void {
    const r = this.container.getBoundingClientRect();
    this.dpr = window.devicePixelRatio || 1;
    this.cssW = Math.max(1, Math.floor(r.width));
    this.cssH = Math.max(1, Math.floor(r.height));
    for (const c of [this.main, this.overlay]) {
      c.width = Math.floor(this.cssW * this.dpr);
      c.height = Math.floor(this.cssH * this.dpr);
      c.style.width = `${this.cssW}px`;
      c.style.height = `${this.cssH}px`;
    }
    const t = useTool.getState();
    if (this.lastFit === -1 || this.fitView === `${t.zoom},${t.panX},${t.panY}`) this.fit();
    this.request();
  }

  fit(): void {
    const { width, height } = useDocument.getState().grid;
    const pad = 32;
    const z = Math.floor(Math.min((this.cssW - pad * 2) / width, (this.cssH - pad * 2) / height));
    const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z || MIN_ZOOM));
    useTool.getState().set({
      zoom,
      panX: Math.round((this.cssW - width * zoom) / 2),
      panY: Math.round((this.cssH - height * zoom) / 2),
    });
    const t = useTool.getState();
    this.lastFit = t.fitRequest;
    this.fitView = `${t.zoom},${t.panX},${t.panY}`;
  }

  // ---------- coordinates ----------

  private local(e: { clientX: number; clientY: number }): Point {
    const r = this.overlay.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private cellAt(p: Point): Point {
    const { zoom, panX, panY } = useTool.getState();
    return { x: Math.floor((p.x - panX) / zoom), y: Math.floor((p.y - panY) / zoom) };
  }

  private paintOpts(): PaintOptions {
    const t = useTool.getState();
    return { brush: t.brush, mirrorX: t.mirrorX, mirrorY: t.mirrorY };
  }

  // ---------- pointer input ----------

  private onPointerDown = (e: PointerEvent): void => {
    e.preventDefault();
    this.overlay.focus({ preventScroll: true });
    const p = this.local(e);

    if (e.pointerType === 'touch') {
      this.touches.set(e.pointerId, p);
      if (this.touches.size === 2) {
        // Second finger: abandon any stroke and start pinch / two-finger pan.
        this.cancelAction();
        const [a, b] = [...this.touches.entries()];
        const t = useTool.getState();
        this.action = {
          kind: 'pinch',
          ids: [a[0], b[0]],
          dist0: Math.hypot(a[1].x - b[1].x, a[1].y - b[1].y) || 1,
          mid0: { x: (a[1].x + b[1].x) / 2, y: (a[1].y + b[1].y) / 2 },
          zoom0: t.zoom,
          pan0: { x: t.panX, y: t.panY },
        };
        return;
      }
      if (this.touches.size > 2) return;
    }
    if (this.action) return;

    this.overlay.setPointerCapture(e.pointerId);
    const t = useTool.getState();
    if (e.button === 1 || this.spaceDown) {
      this.action = { kind: 'pan', pointerId: e.pointerId, x0: p.x, y0: p.y, panX0: t.panX, panY0: t.panY };
      this.updateCursor();
      return;
    }
    if (e.button !== 0 && e.button !== 2) return;

    const secondary = e.button === 2;
    const cell = this.cellAt(p);
    let tool = t.tool;
    if (e.altKey && PAINT_TOOLS.includes(tool)) tool = 'eyedropper';
    const color = tool === 'eraser' ? TRANSPARENT : secondary ? t.secondary : t.primary;
    const doc = useDocument.getState();

    switch (tool) {
      case 'pencil':
      case 'eraser': {
        const rec = new PatchRecorder(doc.grid);
        paintPoints(rec, [cell], color, this.paintOpts());
        this.action = { kind: 'stroke', pointerId: e.pointerId, rec, last: cell, color, lastBump: performance.now() };
        this.request();
        break;
      }
      case 'fill': {
        if (cell.x < 0 || cell.y < 0 || cell.x >= doc.grid.width || cell.y >= doc.grid.height) break;
        const rec = new PatchRecorder(doc.grid);
        floodFill(rec, cell.x, cell.y, color, t.fill8 ? 8 : 4, { mirrorX: t.mirrorX, mirrorY: t.mirrorY });
        doc.commitPatches(rec.toPatches(), 'Fill');
        break;
      }
      case 'line':
      case 'rect':
      case 'ellipse':
        this.action = { kind: 'shape', pointerId: e.pointerId, tool, start: cell, end: cell, color, shift: e.shiftKey };
        this.request();
        break;
      case 'eyedropper':
        this.action = { kind: 'pick', pointerId: e.pointerId, secondary };
        this.pick(cell, secondary);
        break;
      case 'select': {
        const sel = t.selection;
        if (sel && cell.x >= sel.x && cell.y >= sel.y && cell.x < sel.x + sel.w && cell.y < sel.y + sel.h) {
          const buf = extractRegion(doc.grid, sel);
          this.action = { kind: 'move', pointerId: e.pointerId, rect: sel, buf, start: cell, dx: 0, dy: 0 };
        } else {
          t.set({ selection: null });
          this.action = { kind: 'marquee', pointerId: e.pointerId, start: cell, end: cell };
        }
        this.request();
        break;
      }
    }
  };

  private onPointerMove = (e: PointerEvent): void => {
    const p = this.local(e);
    if (e.pointerType === 'touch' && this.touches.has(e.pointerId)) this.touches.set(e.pointerId, p);
    const a = this.action;

    if (!a) {
      const c = this.cellAt(p);
      if (!this.hover || this.hover.x !== c.x || this.hover.y !== c.y) {
        this.hover = c;
        this.request();
      }
      this.updateCursor();
      return;
    }
    if (a.kind === 'pinch') {
      const pa = this.touches.get(a.ids[0]);
      const pb = this.touches.get(a.ids[1]);
      if (!pa || !pb) return;
      const dist = Math.hypot(pa.x - pb.x, pa.y - pb.y);
      const mid = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
      const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, a.zoom0 * (dist / a.dist0)));
      const gx = (a.mid0.x - a.pan0.x) / a.zoom0;
      const gy = (a.mid0.y - a.pan0.y) / a.zoom0;
      useTool.getState().set({ zoom, panX: mid.x - gx * zoom, panY: mid.y - gy * zoom });
      return;
    }
    if ('pointerId' in a && a.pointerId !== e.pointerId) return;

    switch (a.kind) {
      case 'pan':
        useTool.getState().set({ panX: a.panX0 + (p.x - a.x0), panY: a.panY0 + (p.y - a.y0) });
        break;
      case 'stroke': {
        // Coalesced events give every hardware sample; Bresenham fills gaps between them.
        const samples = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
        const list = samples.length ? samples : [e];
        const opts = this.paintOpts();
        for (const s of list) {
          const c = this.cellAt(this.local(s));
          if (c.x === a.last.x && c.y === a.last.y) continue;
          paintPoints(a.rec, linePoints(a.last.x, a.last.y, c.x, c.y), a.color, opts);
          a.last = c;
        }
        this.hover = a.last;
        const now = performance.now();
        if (now - a.lastBump > LIVE_BUMP_MS) {
          a.lastBump = now;
          useDocument.getState().bump();
        } else this.request();
        break;
      }
      case 'shape':
        a.end = this.cellAt(p);
        a.shift = e.shiftKey;
        this.request();
        break;
      case 'pick':
        this.pick(this.cellAt(p), a.secondary);
        break;
      case 'marquee':
        a.end = this.cellAt(p);
        this.request();
        break;
      case 'move': {
        const c = this.cellAt(p);
        a.dx = c.x - a.start.x;
        a.dy = c.y - a.start.y;
        this.request();
        break;
      }
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    this.touches.delete(e.pointerId);
    const a = this.action;
    if (!a) return;
    if (a.kind === 'pinch') {
      if (this.touches.size < 2) this.action = null;
      return;
    }
    if (a.pointerId !== e.pointerId) return;
    this.finishAction(a);
    this.action = null;
    if (this.overlay.hasPointerCapture(e.pointerId)) this.overlay.releasePointerCapture(e.pointerId);
    this.updateCursor();
    this.request();
  };

  private onPointerCancel = (e: PointerEvent): void => {
    this.touches.delete(e.pointerId);
    if (this.action?.kind === 'pinch') {
      if (this.touches.size < 2) this.action = null;
      return;
    }
    if (this.action && 'pointerId' in this.action && this.action.pointerId === e.pointerId) this.cancelAction();
  };

  private onPointerLeave = (): void => {
    if (!this.action) {
      this.hover = null;
      this.request();
    }
  };

  private finishAction(a: Action): void {
    const doc = useDocument.getState();
    const t = useTool.getState();
    switch (a.kind) {
      case 'stroke':
        doc.commitPatches(a.rec.toPatches(), t.tool === 'eraser' ? 'Erase' : 'Draw');
        doc.bump();
        break;
      case 'shape': {
        const rec = new PatchRecorder(doc.grid);
        for (const i of this.shapeFootprint(a)) rec.write(i, a.color);
        doc.commitPatches(rec.toPatches(), a.tool === 'line' ? 'Line' : a.tool === 'rect' ? 'Rectangle' : 'Ellipse');
        break;
      }
      case 'marquee': {
        const r = normalizeRect(a.start, a.end);
        const g = doc.grid;
        const x0 = Math.max(0, r.x), y0 = Math.max(0, r.y);
        const x1 = Math.min(g.width, r.x + r.w), y1 = Math.min(g.height, r.y + r.h);
        t.set({ selection: x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null });
        break;
      }
      case 'move':
        if (a.dx !== 0 || a.dy !== 0) {
          const rec = new PatchRecorder(doc.grid);
          clearRegion(rec, a.rect);
          pasteRegion(rec, a.buf, a.rect.x + a.dx, a.rect.y + a.dy);
          doc.commitPatches(rec.toPatches(), 'Move selection');
          t.set({ selection: { ...a.rect, x: a.rect.x + a.dx, y: a.rect.y + a.dy } });
        }
        break;
      default:
        break;
    }
  }

  /** Abort the current action without leaving a trace in the grid or history. */
  cancelAction(): void {
    const a = this.action;
    if (a?.kind === 'stroke') {
      a.rec.revert();
      useDocument.getState().bump();
    }
    this.action = null;
    this.request();
  }

  private pick(cell: Point, secondary: boolean): void {
    const g = useDocument.getState().grid;
    if (cell.x < 0 || cell.y < 0 || cell.x >= g.width || cell.y >= g.height) return;
    const c = g.data[cell.y * g.width + cell.x];
    const t = useTool.getState();
    if (secondary) t.setSecondary(c);
    else t.setPrimary(c);
  }

  private shapeEnd(a: Extract<Action, { kind: 'shape' }>): Point {
    if (!a.shift) return a.end;
    return a.tool === 'line' ? snapLine(a.start, a.end) : constrainSquare(a.start, a.end);
  }

  private shapeFootprint(a: Extract<Action, { kind: 'shape' }>): Set<number> {
    const end = this.shapeEnd(a);
    const filled = useTool.getState().fillShapes;
    const pts =
      a.tool === 'line'
        ? linePoints(a.start.x, a.start.y, end.x, end.y)
        : a.tool === 'rect'
          ? rectPoints(a.start.x, a.start.y, end.x, end.y, filled)
          : ellipsePoints(a.start.x, a.start.y, end.x, end.y, filled);
    const g = useDocument.getState().grid;
    return paintFootprint(pts, this.paintOpts(), g.width, g.height);
  }

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const p = this.local(e);
    const t = useTool.getState();
    if (e.ctrlKey || e.metaKey) {
      const factor = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0025));
      t.zoomBy(factor, p.x, p.y);
    } else {
      const k = e.deltaMode === 1 ? 16 : 1;
      t.set({ panX: t.panX - (e.shiftKey ? e.deltaY : e.deltaX) * k, panY: t.panY - (e.shiftKey ? 0 : e.deltaY) * k });
    }
  };

  private onKey = (e: KeyboardEvent): void => {
    if (e.code !== 'Space') return;
    const target = e.target as HTMLElement | null;
    if (target && (target.closest('input, textarea, select, [contenteditable="true"], .cm-editor') || (target.tagName === 'BUTTON' && e.type === 'keydown'))) return;
    const down = e.type === 'keydown';
    if (down) e.preventDefault();
    if (this.spaceDown !== down) {
      this.spaceDown = down;
      this.updateCursor();
    }
  };

  private onBlur = (): void => {
    this.spaceDown = false;
    this.updateCursor();
  };

  private updateCursor(): void {
    const a = this.action;
    let cursor = 'crosshair';
    if (a?.kind === 'pan') cursor = 'grabbing';
    else if (this.spaceDown) cursor = 'grab';
    else if (a?.kind === 'move') cursor = 'move';
    else {
      const t = useTool.getState();
      const sel = t.selection;
      const h = this.hover;
      if (t.tool === 'select' && sel && h && h.x >= sel.x && h.y >= sel.y && h.x < sel.x + sel.w && h.y < sel.y + sel.h) cursor = 'move';
      else if (t.tool === 'eyedropper') cursor = 'copy';
    }
    if (this.overlay.style.cursor !== cursor) this.overlay.style.cursor = cursor;
  }

  // ---------- rendering ----------

  request(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.render();
    });
  }

  private syncBuffer(g: Grid, version: number, force: boolean): void {
    if (!force && this.bufferGrid === g && this.bufferVersion === version) return;
    if (this.buffer.width !== g.width || this.buffer.height !== g.height || !this.image) {
      this.buffer.width = g.width;
      this.buffer.height = g.height;
      this.image = this.bctx.createImageData(g.width, g.height);
    }
    const px = this.image.data;
    const d = g.data;
    for (let i = 0, o = 0; i < d.length; i++, o += 4) {
      const c = d[i];
      px[o] = red(c);
      px[o + 1] = green(c);
      px[o + 2] = blue(c);
      px[o + 3] = alpha(c);
    }
    this.bctx.putImageData(this.image, 0, 0);
    this.bufferGrid = g;
    this.bufferVersion = version;
  }

  private render(): void {
    const doc = useDocument.getState();
    const t = useTool.getState();
    const g = doc.grid;

    const sizeKey = `${g.width}x${g.height}`;
    if (t.fitRequest !== this.lastFit || (this.lastGridSize && this.lastGridSize !== sizeKey)) {
      this.lastGridSize = sizeKey;
      this.fit();
      return; // fit() changes the store, which schedules another frame
    }
    this.lastGridSize = sizeKey;

    // Strokes write the grid directly, so always refresh the buffer while one is active.
    this.syncBuffer(g, doc.version, this.action?.kind === 'stroke');

    const { zoom, panX, panY } = t;
    const W = g.width * zoom;
    const H = g.height * zoom;
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssW, this.cssH);
    ctx.fillStyle = cssVar('--canvas-bg', '#e5e7eb');
    ctx.fillRect(0, 0, this.cssW, this.cssH);

    // Background preview (never part of the export).
    if (t.background === 'checker') {
      const cs = Math.max(4, Math.min(zoom / 2, 12));
      ctx.save();
      ctx.beginPath();
      ctx.rect(panX, panY, W, H);
      ctx.clip();
      ctx.fillStyle = cssVar('--checker-a', '#ffffff');
      ctx.fillRect(panX, panY, W, H);
      ctx.fillStyle = cssVar('--checker-b', '#e5e7eb');
      const x0 = Math.max(panX, 0), y0 = Math.max(panY, 0);
      const x1 = Math.min(panX + W, this.cssW), y1 = Math.min(panY + H, this.cssH);
      const sx = panX + Math.floor((x0 - panX) / cs) * cs;
      const sy = panY + Math.floor((y0 - panY) / cs) * cs;
      for (let y = sy; y < y1; y += cs) {
        for (let x = sx; x < x1; x += cs) {
          if ((Math.round((x - panX) / cs) + Math.round((y - panY) / cs)) % 2 === 0) ctx.fillRect(x, y, cs, cs);
        }
      }
      ctx.restore();
    } else {
      ctx.fillStyle = t.background === 'light' ? '#ffffff' : '#111827';
      ctx.fillRect(panX, panY, W, H);
    }

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.buffer, panX, panY, W, H);

    // Grid lines, aligned to device pixels.
    if (t.showGrid && zoom >= 5) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.strokeStyle = cssVar('--grid-line', 'rgba(0,0,0,0.12)');
      ctx.lineWidth = 1;
      ctx.beginPath();
      const d = this.dpr;
      for (let x = 1; x < g.width; x++) {
        const px = Math.round((panX + x * zoom) * d) + 0.5;
        ctx.moveTo(px, Math.round(panY * d));
        ctx.lineTo(px, Math.round((panY + H) * d));
      }
      for (let y = 1; y < g.height; y++) {
        const py = Math.round((panY + y * zoom) * d) + 0.5;
        ctx.moveTo(Math.round(panX * d), py);
        ctx.lineTo(Math.round((panX + W) * d), py);
      }
      ctx.stroke();
      ctx.restore();
    }
    if (t.showBoundary) {
      ctx.strokeStyle = cssVar('--boundary', 'rgba(0,0,0,0.5)');
      ctx.lineWidth = 1;
      ctx.strokeRect(panX - 0.5, panY - 0.5, W + 1, H + 1);
    }

    this.renderOverlay(g, t);
  }

  private renderOverlay(g: Grid, t: ReturnType<typeof useTool.getState>): void {
    const o = this.octx;
    const { zoom, panX, panY } = t;
    o.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    o.clearRect(0, 0, this.cssW, this.cssH);
    const cellRect = (i: number) => [panX + (i % g.width) * zoom, panY + Math.floor(i / g.width) * zoom] as const;
    const accent = cssVar('--accent', '#2563eb');

    // Mirror axes.
    if (t.mirrorX || t.mirrorY) {
      o.save();
      o.strokeStyle = accent;
      o.globalAlpha = 0.6;
      o.setLineDash([4, 4]);
      o.beginPath();
      if (t.mirrorX) {
        o.moveTo(panX + (g.width * zoom) / 2, panY);
        o.lineTo(panX + (g.width * zoom) / 2, panY + g.height * zoom);
      }
      if (t.mirrorY) {
        o.moveTo(panX, panY + (g.height * zoom) / 2);
        o.lineTo(panX + g.width * zoom, panY + (g.height * zoom) / 2);
      }
      o.stroke();
      o.restore();
    }

    const a = this.action;
    if (a?.kind === 'shape') {
      o.fillStyle = a.color === TRANSPARENT ? 'rgba(127,127,127,0.5)' : toCss(a.color);
      for (const i of this.shapeFootprint(a)) {
        const [x, y] = cellRect(i);
        o.fillRect(x, y, zoom, zoom);
      }
    }

    // Floating selection while moving.
    let sel: Rect | null = t.selection;
    if (a?.kind === 'move') {
      const { buf, rect, dx, dy } = a;
      o.fillStyle = cssVar('--canvas-bg', '#e5e7eb');
      o.globalAlpha = 0.85;
      o.fillRect(panX + rect.x * zoom, panY + rect.y * zoom, rect.w * zoom, rect.h * zoom);
      o.globalAlpha = 1;
      for (let y = 0; y < buf.height; y++) {
        for (let x = 0; x < buf.width; x++) {
          const c = buf.data[y * buf.width + x];
          if (c === 0) continue;
          o.fillStyle = toCss(c);
          o.fillRect(panX + (rect.x + dx + x) * zoom, panY + (rect.y + dy + y) * zoom, zoom, zoom);
        }
      }
      sel = { ...rect, x: rect.x + dx, y: rect.y + dy };
    } else if (a?.kind === 'marquee') {
      sel = normalizeRect(a.start, a.end);
    }
    if (sel) {
      const x = panX + sel.x * zoom, y = panY + sel.y * zoom, w = sel.w * zoom, h = sel.h * zoom;
      o.lineWidth = 1;
      o.setLineDash([5, 4]);
      o.strokeStyle = '#ffffff';
      o.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      o.strokeStyle = '#000000';
      o.lineDashOffset = 4.5;
      o.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      o.setLineDash([]);
      o.lineDashOffset = 0;
    }

    // Hover footprint.
    const h = this.hover;
    if (h && (!a || a.kind === 'stroke') && t.tool !== 'select' && h.x >= 0 && h.y >= 0 && h.x < g.width && h.y < g.height) {
      const fp = ['pencil', 'eraser'].includes(t.tool)
        ? paintFootprint([h], this.paintOpts(), g.width, g.height)
        : new Set([h.y * g.width + h.x]);
      o.strokeStyle = accent;
      o.lineWidth = 1.5;
      for (const i of fp) {
        const [x, y] = cellRect(i);
        o.strokeRect(x + 0.75, y + 0.75, zoom - 1.5, zoom - 1.5);
      }
    }
  }
}
