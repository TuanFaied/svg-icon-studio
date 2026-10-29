import { beforeEach, describe, expect, it } from 'vitest';
import { pack } from '@/core/grid/color';
import { createGrid, gridsEqual } from '@/core/grid/grid';
import { PatchRecorder } from '@/core/history/patch';
import { setPixel } from '@/core/grid/ops';
import { serializeProject, parseProject } from '@/core/project/project';
import { currentProject, useDocument } from './document';

const RED = pack(255, 0, 0);
const BLUE = pack(0, 0, 255);
const doc = () => useDocument.getState();

/** Paints one cell on the current frame as one history step, like a pencil click. */
function paint(x: number, y: number, c: number) {
  const rec = new PatchRecorder(doc().grid);
  setPixel(rec, x, y, c);
  doc().commitPatches(rec.toPatches(), 'Draw');
}

const cell = (frame: number, x: number, y: number) => {
  const g = doc().frames[frame].grid;
  return g.data[y * g.width + x];
};

beforeEach(() => doc().newProject(4, 4));

describe('frame list', () => {
  it('starts with one frame whose grid is the editing grid', () => {
    expect(doc().frames).toHaveLength(1);
    expect(doc().grid).toBe(doc().frames[0].grid);
  });

  it('adds, duplicates, deletes and reorders with undo/redo for each', () => {
    paint(0, 0, RED);
    doc().duplicateCurrentFrame();
    expect(doc().frames).toHaveLength(2);
    expect(doc().frameIndex).toBe(1);
    expect(cell(1, 0, 0)).toBe(RED);
    // The duplicate is independent.
    paint(1, 1, BLUE);
    expect(cell(0, 1, 1)).toBe(0);

    doc().addFrame();
    expect(doc().frames).toHaveLength(3);
    expect(doc().frameIndex).toBe(2);
    expect(doc().grid.data.every((v) => v === 0)).toBe(true);

    const ids = doc().frames.map((f) => f.id);
    doc().moveFrame(2, 0);
    expect(doc().frames.map((f) => f.id)).toEqual([ids[2], ids[0], ids[1]]);
    expect(doc().frameIndex).toBe(0); // selection follows the moved frame

    doc().undo(); // reorder
    expect(doc().frames.map((f) => f.id)).toEqual(ids);
    doc().undo(); // add
    expect(doc().frames).toHaveLength(2);
    doc().redo();
    expect(doc().frames).toHaveLength(3);

    doc().selectFrame(1);
    doc().deleteCurrentFrame();
    expect(doc().frames.map((f) => f.id)).toEqual([ids[0], ids[2]]);
    doc().undo();
    expect(doc().frames.map((f) => f.id)).toEqual(ids);
    expect(cell(1, 1, 1)).toBe(BLUE); // deleted frame comes back with its pixels
  });

  it('never deletes the last frame', () => {
    doc().deleteCurrentFrame();
    expect(doc().frames).toHaveLength(1);
    expect(doc().canUndo).toBe(false);
  });
});

describe('pixel history across frames', () => {
  it('undo jumps to the frame that was edited', () => {
    paint(0, 0, RED);
    doc().addFrame();
    paint(3, 3, BLUE);
    doc().selectFrame(0);

    doc().undo(); // the blue dot on frame 1
    expect(doc().frameIndex).toBe(1);
    expect(cell(1, 3, 3)).toBe(0);
    expect(cell(0, 0, 0)).toBe(RED);
    doc().redo();
    expect(cell(1, 3, 3)).toBe(BLUE);
  });

  it('edits still find their frame after reordering', () => {
    paint(0, 0, RED);
    doc().addFrame();
    paint(2, 2, BLUE);
    doc().moveFrame(1, 0);
    doc().undo(); // reorder
    doc().undo(); // blue dot, still on the frame that is back at index 1
    expect(cell(1, 2, 2)).toBe(0);
    expect(cell(0, 0, 0)).toBe(RED);
  });

  it('replace color and clear act on every frame as one step', () => {
    paint(0, 0, RED);
    doc().duplicateCurrentFrame();
    paint(1, 0, RED);
    doc().replaceColor(RED, BLUE);
    expect([cell(0, 0, 0), cell(1, 0, 0), cell(1, 1, 0)]).toEqual([BLUE, BLUE, BLUE]);
    doc().undo();
    expect([cell(0, 0, 0), cell(1, 0, 0), cell(1, 1, 0)]).toEqual([RED, RED, RED]);
    doc().clearCanvas();
    expect(doc().frames.every((f) => f.grid.data.every((v) => v === 0))).toBe(true);
    doc().undo();
    expect(cell(0, 0, 0)).toBe(RED);
  });
});

describe('resizing and durations', () => {
  it('resizes every frame and undoes as one step, keeping later pixel undo working', () => {
    paint(3, 3, RED);
    doc().addFrame();
    paint(0, 0, BLUE);
    doc().resizeCanvas(8, 6, 'tl');
    expect(doc().frames.every((f) => f.grid.width === 8 && f.grid.height === 6)).toBe(true);
    expect(doc().svg.width).toBe(8); // export size followed the grid
    doc().undo();
    expect(doc().frames.every((f) => f.grid.width === 4)).toBe(true);
    expect(doc().svg.width).toBe(4);
    doc().undo(); // blue dot
    expect(cell(1, 0, 0)).toBe(0);
  });

  it('sets one or all durations, clamped, undoable', () => {
    doc().addFrame();
    doc().setFrameDuration(0, 250);
    expect(doc().frames.map((f) => f.duration)).toEqual([250, 100]);
    doc().setAllFrameDurations(5);
    expect(doc().frames.map((f) => f.duration)).toEqual([20, 20]);
    doc().undo();
    expect(doc().frames.map((f) => f.duration)).toEqual([250, 100]);
  });
});

describe('projects and templates', () => {
  it('saves and loads every frame', () => {
    paint(0, 0, RED);
    doc().addFrame();
    paint(1, 1, BLUE);
    doc().setFrameDuration(1, 300);
    const saved = currentProject();
    doc().newProject(4, 4);
    doc().loadProject(parseProject(serializeProject(saved)));
    expect(doc().frames).toHaveLength(2);
    expect([cell(0, 0, 0), cell(1, 1, 1)]).toEqual([RED, BLUE]);
    expect(doc().frames[1].duration).toBe(300);
    expect(doc().canUndo).toBe(false);
  });

  it('a pixel-art import replaces all frames with one, undoably', () => {
    doc().addFrame();
    const g = createGrid(5, 5);
    g.data[0] = RED;
    doc().replaceGrid(g, 'Import');
    expect(doc().frames).toHaveLength(1);
    expect(gridsEqual(doc().grid, g)).toBe(true);
    doc().undo();
    expect(doc().frames).toHaveLength(2);
  });

  it('a template replaces a multi-frame document and undo restores all frames', () => {
    paint(0, 0, RED);
    doc().duplicateCurrentFrame();
    const before = doc().frames.map((f) => f.id);
    doc().replaceDocument({ name: 'T', grid: createGrid(4, 4), palette: [], svg: doc().svg }, 'Template');
    expect(doc().frames).toHaveLength(1);
    doc().undo();
    expect(doc().frames.map((f) => f.id)).toEqual(before);
    expect([cell(0, 0, 0), cell(1, 0, 0)]).toEqual([RED, RED]);
  });
});
