import { deflateSync, inflateSync } from 'fflate';
import { type PackedColor, parseHex, toHex } from '../grid/color';
import { clampDuration, DEFAULT_FRAME_MS, type FrameData, MAX_FRAMES } from '../frames/frames';
import { clampSize, type Grid, MAX_SIZE } from '../grid/grid';
import { normalizeAnimation } from '../svg/animation';
import { DEFAULT_SVG_OPTIONS, type Geometry, type SvgOptions } from '../svg/generate';

/** v2 adds `frames` (frame-by-frame animation); v1 files load as a single frame. */
export const PROJECT_VERSION = 2;

export interface Project {
  name: string;
  /** The first frame (the still image). */
  grid: Grid;
  palette: PackedColor[];
  svg: SvgOptions;
  /** All frames, first one included. Absent means a single frame. */
  frames?: FrameData[];
}

export interface ProjectFile {
  app: 'svg-icon-studio';
  version: number;
  name: string;
  width: number;
  height: number;
  /** Base64 of RGBA bytes, row-major. */
  pixels: string;
  palette: string[];
  settings: SvgOptions;
  /** v2: every frame with its duration in ms. `pixels` stays the first frame so older readers still load it. */
  frames?: Array<{ pixels: string; duration: number }>;
}

function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function base64ToBytes(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function gridToBytes(g: Grid): Uint8Array {
  const out = new Uint8Array(g.data.length * 4);
  for (let i = 0; i < g.data.length; i++) {
    const c = g.data[i];
    out[i * 4] = c >>> 24;
    out[i * 4 + 1] = (c >>> 16) & 255;
    out[i * 4 + 2] = (c >>> 8) & 255;
    out[i * 4 + 3] = c & 255;
  }
  return out;
}

function bytesToData(bytes: Uint8Array, n: number): Uint32Array {
  const data = new Uint32Array(n);
  for (let i = 0; i < n && i * 4 + 3 < bytes.length; i++) {
    const a = bytes[i * 4 + 3];
    data[i] = a === 0 ? 0 : ((bytes[i * 4] << 24) | (bytes[i * 4 + 1] << 16) | (bytes[i * 4 + 2] << 8) | a) >>> 0;
  }
  return data;
}

export function serializeProject(p: Project): string {
  const file: ProjectFile = {
    app: 'svg-icon-studio',
    version: PROJECT_VERSION,
    name: p.name,
    width: p.grid.width,
    height: p.grid.height,
    pixels: bytesToBase64(gridToBytes(p.grid)),
    palette: p.palette.map(toHex),
    settings: p.svg,
    frames: (p.frames ?? [{ grid: p.grid, duration: DEFAULT_FRAME_MS }]).map((f) => ({
      pixels: bytesToBase64(gridToBytes(f.grid)),
      duration: f.duration,
    })),
  };
  return JSON.stringify(file, null, 2);
}

const GEOMETRIES: Geometry[] = ['rects', 'paths', 'cells'];

/** Parses and validates a .icon.json file. Throws a readable Error on bad input. */
export function parseProject(json: string): Project {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error('File is not valid JSON.');
  }
  if (!raw || typeof raw !== 'object') throw new Error('Not a project file.');
  const f = raw as Partial<ProjectFile>;
  if (f.app !== 'svg-icon-studio') throw new Error('Not an SVG Icon Studio project file.');
  const width = Number(f.width);
  const height = Number(f.height);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > MAX_SIZE || height > MAX_SIZE) {
    throw new Error(`Grid size must be between 1 and ${MAX_SIZE}.`);
  }
  if (typeof f.pixels !== 'string') throw new Error('Project has no pixel data.');
  const w = clampSize(width);
  const h = clampSize(height);
  const data = bytesToData(base64ToBytes(f.pixels), width * height);
  let frames: FrameData[] | undefined;
  if (Array.isArray(f.frames) && f.frames.length > 0) {
    if (f.frames.length > MAX_FRAMES) throw new Error(`Projects can have at most ${MAX_FRAMES} frames.`);
    frames = f.frames.map((fr, i) => {
      if (!fr || typeof fr.pixels !== 'string') throw new Error(`Frame ${i + 1} has no pixel data.`);
      return {
        grid: { width: w, height: h, data: bytesToData(base64ToBytes(fr.pixels), width * height) },
        duration: clampDuration(Number(fr.duration) || DEFAULT_FRAME_MS),
      };
    });
  }
  const palette = (Array.isArray(f.palette) ? f.palette : [])
    .map((h) => (typeof h === 'string' ? parseHex(h) : null))
    .filter((c): c is number => c !== null && c !== 0);
  const s = { ...DEFAULT_SVG_OPTIONS, ...(f.settings ?? {}) };
  if (!GEOMETRIES.includes(s.geometry)) s.geometry = 'rects';
  // Untrusted input: rebuild the animation from clamped numbers and known enums.
  s.animation = normalizeAnimation(s.animation);
  return {
    name: typeof f.name === 'string' && f.name.trim() ? f.name.slice(0, 80) : 'Untitled icon',
    grid: frames ? frames[0].grid : { width: w, height: h, data },
    palette,
    svg: s,
    ...(frames ? { frames } : {}),
  };
}

const base64url = (b: Uint8Array) => bytesToBase64(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromBase64url = (s: string) => base64ToBytes(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));

export const SHARE_MAX = 32;

/** Encodes a small grid into a compact URL hash fragment (no server needed). */
export function encodeShare(g: Grid): string {
  if (g.width > SHARE_MAX || g.height > SHARE_MAX) throw new Error(`Share links support up to ${SHARE_MAX}×${SHARE_MAX}.`);
  const header = new Uint8Array([g.width, g.height]);
  const bytes = gridToBytes(g);
  const payload = new Uint8Array(2 + bytes.length);
  payload.set(header);
  payload.set(bytes, 2);
  return 'i=' + base64url(deflateSync(payload, { level: 9 }));
}

export function decodeShare(hash: string): Grid | null {
  const m = hash.replace(/^#/, '').match(/(?:^|&)i=([A-Za-z0-9_-]+)/);
  if (!m) return null;
  try {
    const payload = inflateSync(fromBase64url(m[1]));
    const w = payload[0];
    const h = payload[1];
    if (!w || !h || w > SHARE_MAX || h > SHARE_MAX || payload.length < 2 + w * h * 4) return null;
    return { width: w, height: h, data: bytesToData(payload.subarray(2), w * h) };
  } catch {
    return null;
  }
}
