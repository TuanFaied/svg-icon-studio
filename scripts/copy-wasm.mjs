// Copies runtime-loaded WASM tracers into public/ so they are served as static assets.
// vtracer-wasm resolves its .wasm via `new URL(..., import.meta.url)` with a filename that
// does not exist in the package, so it is loaded at runtime instead of through the bundler.
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'wasm');
mkdirSync(out, { recursive: true });
for (const f of ['vtracer.js', 'vtracer.wasm']) copyFileSync(join(root, 'node_modules', 'vtracer-wasm', f), join(out, f));
console.log('copied vtracer to public/wasm');
