import { describe, expect, it } from 'vitest';
import { pack } from '@/core/grid/color';
import { createGrid, gridsEqual } from '@/core/grid/grid';
import { buildTemplate } from '@/core/templates/templates';
import { useDocument } from './document';

describe('replaceDocument (templates)', () => {
  it('swaps everything in one undo step, with a fresh id, and redo brings it back', () => {
    const doc = useDocument.getState();
    doc.newProject(10, 10);
    const g = createGrid(10, 10);
    g.data[3] = pack(1, 2, 3);
    useDocument.getState().replaceGrid(g, 'setup');
    useDocument.getState().setName('My icon');
    useDocument.getState().setManualSvg('<svg xmlns="http://www.w3.org/2000/svg"/>');
    const before = useDocument.getState();
    const beforeGrid = createGrid(10, 10);
    beforeGrid.data.set(before.grid.data);

    const t = buildTemplate('chasing-dots', 24);
    useDocument.getState().replaceDocument(
      { name: t.name, grid: t.grid, palette: t.palette, svg: { ...before.svg, width: 24, height: 24, animation: t.animation } },
      'Load template',
    );
    const after = useDocument.getState();
    expect(after.id).not.toBe(before.id);
    expect(after.name).toBe('Chasing dots');
    expect(gridsEqual(after.grid, t.grid)).toBe(true);
    expect(after.palette).toEqual(t.palette);
    expect(after.svg.animation).toEqual(t.animation);
    expect(after.manualSvg).toBeNull();
    // The template grid is copied, not shared with the caller.
    expect(after.grid.data).not.toBe(t.grid.data);

    useDocument.getState().undo();
    const undone = useDocument.getState();
    expect(undone.id).toBe(before.id);
    expect(undone.name).toBe('My icon');
    expect(gridsEqual(undone.grid, beforeGrid)).toBe(true);
    expect(undone.palette).toEqual(before.palette);
    expect(undone.svg).toEqual(before.svg);
    expect(undone.manualSvg).toBe('<svg xmlns="http://www.w3.org/2000/svg"/>');

    useDocument.getState().redo();
    expect(useDocument.getState().id).toBe(after.id);
    expect(gridsEqual(useDocument.getState().grid, t.grid)).toBe(true);
    expect(useDocument.getState().svg.animation).toEqual(t.animation);
  });
});
