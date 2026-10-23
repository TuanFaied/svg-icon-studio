import { describe, expect, it } from 'vitest';
import { History } from './history';
import { applyPatches, PatchRecorder } from './patch';
import { createGrid } from '../grid/grid';
import { drawLine } from '../grid/ops';

describe('patch recorder', () => {
  it('groups a whole stroke into one patch list and keeps original before values', () => {
    const g = createGrid(4, 1);
    const rec = new PatchRecorder(g);
    drawLine(rec, { x: 0, y: 0 }, { x: 3, y: 0 }, 1);
    drawLine(rec, { x: 0, y: 0 }, { x: 3, y: 0 }, 2); // overdraw in same stroke
    const patches = rec.toPatches();
    expect(patches).toHaveLength(4);
    expect(patches.every((p) => p.before === 0 && p.after === 2)).toBe(true);
    applyPatches(g, patches, 'undo');
    expect([...g.data]).toEqual([0, 0, 0, 0]);
    applyPatches(g, patches, 'redo');
    expect([...g.data]).toEqual([2, 2, 2, 2]);
  });

  it('drops cells that end up unchanged', () => {
    const g = createGrid(1, 1);
    const rec = new PatchRecorder(g);
    rec.write(0, 5);
    rec.write(0, 0);
    expect(rec.toPatches()).toHaveLength(0);
  });
});

describe('history', () => {
  it('undo / redo order', () => {
    const h = new History<number>();
    h.push(1);
    h.push(2);
    expect(h.undo()).toBe(2);
    expect(h.undo()).toBe(1);
    expect(h.undo()).toBeUndefined();
    expect(h.redo()).toBe(1);
    expect(h.canRedo).toBe(true);
  });

  it('clears redo after a new action', () => {
    const h = new History<number>();
    h.push(1);
    h.undo();
    h.push(3);
    expect(h.canRedo).toBe(false);
    expect(h.redo()).toBeUndefined();
  });

  it('caps the number of entries', () => {
    const h = new History<number>(200);
    for (let i = 0; i < 250; i++) h.push(i);
    expect(h.size).toBe(200);
    let last: number | undefined;
    let n = 0;
    while (h.canUndo) {
      last = h.undo();
      n++;
    }
    expect(n).toBe(200);
    expect(last).toBe(50);
  });
});
