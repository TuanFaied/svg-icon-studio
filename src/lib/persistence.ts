'use client';

import { createStore, del, get, set } from 'idb-keyval';
import { gridToRgba } from '@/core/export/encode';
import { decodeShare, parseProject, serializeProject } from '@/core/project/project';
import { currentProject, useDocument } from '@/store/document';

const store = typeof indexedDB !== 'undefined' ? createStore('svg-icon-studio', 'projects') : undefined;

const CURRENT_KEY = 'current';
const RECENT_KEY = 'recent';
const RECENT_LIMIT = 10;

export interface RecentEntry {
  id: string;
  name: string;
  updatedAt: number;
  width: number;
  height: number;
  thumbnail: string;
  json: string;
}

function thumbnail(): string {
  const { grid } = useDocument.getState();
  const scale = Math.max(1, Math.floor(64 / Math.max(grid.width, grid.height)));
  const c = document.createElement('canvas');
  c.width = grid.width * scale;
  c.height = grid.height * scale;
  const ctx = c.getContext('2d');
  if (!ctx) return '';
  ctx.putImageData(new ImageData(new Uint8ClampedArray(gridToRgba(grid, scale)), c.width, c.height), 0, 0);
  return c.toDataURL('image/png');
}

export async function saveNow(): Promise<void> {
  if (!store) return;
  const s = useDocument.getState();
  const json = serializeProject(currentProject());
  await set(CURRENT_KEY, { id: s.id, json }, store);
  const recent = ((await get<RecentEntry[]>(RECENT_KEY, store)) ?? []).filter((r) => r.id !== s.id);
  recent.unshift({ id: s.id, name: s.name, updatedAt: Date.now(), width: s.grid.width, height: s.grid.height, thumbnail: thumbnail(), json });
  await set(RECENT_KEY, recent.slice(0, RECENT_LIMIT), store);
}

export async function listRecent(): Promise<RecentEntry[]> {
  if (!store) return [];
  return (await get<RecentEntry[]>(RECENT_KEY, store)) ?? [];
}

export async function removeRecent(id: string): Promise<void> {
  if (!store) return;
  const recent = ((await get<RecentEntry[]>(RECENT_KEY, store)) ?? []).filter((r) => r.id !== id);
  await set(RECENT_KEY, recent, store);
}

export function openRecent(entry: RecentEntry): void {
  useDocument.getState().loadProject(parseProject(entry.json), entry.id);
}

/** Restores from a share link first, then from the autosave. Returns what was restored. */
export async function restore(): Promise<'share' | 'autosave' | null> {
  const shared = typeof location !== 'undefined' ? decodeShare(location.hash) : null;
  if (shared) {
    useDocument.getState().loadProject({ name: 'Shared icon', grid: shared, palette: [], svg: { ...useDocument.getState().svg, width: shared.width, height: shared.height } });
    history.replaceState(null, '', location.pathname + location.search);
    return 'share';
  }
  if (!store) return null;
  try {
    const saved = await get<{ id: string; json: string }>(CURRENT_KEY, store);
    if (!saved) return null;
    useDocument.getState().loadProject(parseProject(saved.json), saved.id);
    return 'autosave';
  } catch {
    await del(CURRENT_KEY, store);
    return null;
  }
}

/** Debounced autosave whenever the document changes. Returns an unsubscribe. */
export function startAutosave(delay = 800): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const unsub = useDocument.subscribe((s, prev) => {
    if (s.version === prev.version && s.name === prev.name && s.palette === prev.palette && s.svg === prev.svg) return;
    clearTimeout(timer);
    timer = setTimeout(() => void saveNow().catch(() => undefined), delay);
  });
  const flush = () => {
    clearTimeout(timer);
    void saveNow().catch(() => undefined);
  };
  window.addEventListener('pagehide', flush);
  return () => {
    unsub();
    clearTimeout(timer);
    window.removeEventListener('pagehide', flush);
  };
}
