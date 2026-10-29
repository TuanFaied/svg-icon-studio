# SVG Icon Studio

[![CI](https://github.com/TuanFaied/svg-icon-studio/actions/workflows/ci.yml/badge.svg)](https://github.com/TuanFaied/svg-icon-studio/actions/workflows/ci.yml)

A client-side web app for making SVG icons two ways:

1. **Draw** icons on a pixel grid and export clean SVG.
2. **Convert** PNG / JPG / WebP / GIF / BMP images into real vector SVG.

Both modes share one preview, one code panel and one export pipeline. Everything runs in the browser; there is no server.

## Setup

Requires Node 20+.

```bash
npm install        # also copies the VTracer WASM into public/wasm (postinstall)
npm run dev        # http://localhost:3000
```

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Next.js dev server |
| `npm run build` | Static export to `out/` (`output: 'export'`) |
| `npm start` | Serves `out/` on http://localhost:4173 (`scripts/serve.mjs`) |
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm test` | Vitest unit tests (`src/**/*.test.ts`) |
| `npm run test:e2e` | Builds, then runs Playwright (desktop + Pixel 7 projects). First run: `npx playwright install chromium` |

Deploy by uploading `out/` to any static host.

## Continuous integration

`.github/workflows/ci.yml` runs on every pull request and on pushes to `main`:

| Check | Steps |
|---|---|
| **Typecheck, unit tests, build** | `npm ci`, `npm run typecheck`, `npm test`, `npm run build` |
| **End-to-end tests** | `npm ci`, install Playwright Chromium, `npm run build`, `npx playwright test` (Playwright traces are uploaded when it fails) |

`main` is protected: changes land through pull requests, and both checks must pass before merging.

## Features

**Draw**
- Canvas 1×1 to 128×128 (presets 8–64); resizing a non-empty drawing asks to crop/pad with a 9-point anchor.
- Tools: pencil (B), eraser (E), fill (F, 4- or 8-way), line (L, Shift snaps 45°), rectangle (R) and ellipse (O) outlined or filled (Shift = square/circle), eyedropper (I, or Alt with any paint tool), select/move (M: drag, arrows nudge, Delete, Ctrl+C/V). Mirror X/Y. Brush 1–4. Right click paints with the secondary color.
- Pointer events with capture, coalesced events and Bresenham interpolation, so fast drags never leave gaps. Zoom (buttons, Ctrl+scroll, pinch), pan (Space+drag, middle mouse, two fingers, scroll), fit (0).
- Patch-based undo/redo (one entry per action, 200-entry cap) covering drawing, fills, moves, clears, resizes and palette edits.
- Palette: primary/secondary with hex + alpha, project palette (add/remove/reorder, Lospec `.hex` import/export), auto “used in this drawing” list, replace-color in one undo step.
- `?` shows all shortcuts. Shortcuts pause while typing in fields or the code editor.

**SVG output**
- Geometry: merged rectangles (greedy meshing, default), outline paths (`M/h/v/z`, `fill-rule="evenodd"`, one path per color), or individual cells (optional rounded corners).
- Formats: readable, minimal, optimized (SVGO with geometry-safe settings).
- Options: width/height or viewBox only, title + `role="img"` or `aria-hidden`, `currentColor` for single-color icons, background rect, `shape-rendering="crispEdges"`.
- Code panel (CodeMirror 6): read-only by default; **Edit** forks the code with a “Manual edits — not linked to drawing” banner, live DOMParser validation, and **Regenerate from drawing** / **Keep edits**. Footer shows bytes, gzip size and element count.
- Preview is an `<img>` from a sanitized blob URL, with checker/light/dark/custom backgrounds, a 16–128px size strip, and in-context mocks (tab favicon, nav bar, buttons).

**Convert**
- Drag-and-drop, file picker or clipboard paste. Files are validated by decoding; over 20 MB is rejected, over 2048px is downscaled (and you’re told).
- Modes: **Pixel Art** (nearest-neighbor downsample + median-cut quantize → opens in the pixel editor), **Black & White** (threshold or Otsu → Potrace), **Silhouette** (alpha or threshold → Potrace), **Color Vector** (quantize → VTracer, falling back to ImageTracerJS).
- Settings: palette size, threshold, detail, speckle filter, precision, simple background removal (edge flood fill with tolerance), output size with aspect lock.
- Tracing runs in a Web Worker, re-runs 300ms after a change, and can be cancelled. Before/after split slider and path-outline view. Stats compare SVG size to the original and warn when vectorizing isn’t paying off. Raster data is never embedded in the output.

**Export:** SVG file, copy SVG, PNG (1/2/4/8× or custom, nearest neighbor, transparent or solid), typed React TSX component (`size`, `color`, `{...props}`), URL-encoded CSS data URI, favicon pack zip (SVG + 16/32/180/192/512 PNG), `.icon.json` project file, and share links (≤32×32, compressed into the URL hash).

**Persistence:** autosave to IndexedDB (debounced), restore on reload, last 10 projects with thumbnails, open/save `.icon.json` (Ctrl+S).

## Architecture

```
src/
  app/            Next.js App Router entry (page renders <App/> client-side only)
  components/
    layout/       AppHeader, WorkspaceLayout (resizable panels), MobileSheet, Dialogs
    editor/       engine.ts (imperative canvas + pointer input), PixelCanvas, DrawingToolbar, ColorPalette, CanvasSettings
    convert/      ImageUploader, ConversionSettings, TracePreview (split view), useConversion
    output/       SvgCodeEditor, SvgPreview (+ SizeStrip, ContextPreview), DocumentSettings, ExportDialog
    ui/           Button, IconButton (tooltips with shortcuts), Toggle, Slider, Select, Segmented, Dialog, Toasts
  core/           Pure TypeScript, no React/DOM (except sanitize, which takes a window)
    grid/         Packed-RGBA grid, drawing algorithms, flood fill, move, resize
    history/      Patch recorder + bounded undo stack
    svg/          Grid → SVG (rects / paths / cells), parser for round-trip, SVGO wrapper, stats
    convert/      Otsu, binarize, quantize, background removal, downsample, traced-SVG post-processing
    export/       JSX component, data URI, grid → RGBA
    project/      .icon.json and share-link encoding
    sanitize/     DOMPurify SVG profile + validation
  workers/        trace.worker.ts (Potrace / VTracer / ImageTracerJS)
  store/          Zustand: document (grid, palette, options, history), tool, ui, convert
  lib/            Hooks and browser glue: SVG memoization, files/PNG/zip, persistence, shortcuts, worker client
```

Key decisions:
- Pixels live in a `Uint32Array` (`0xRRGGBBAA`, `0` = transparent). Pointer input writes straight into it and repaints via `requestAnimationFrame`; React only hears about strokes through a throttled version bump (live preview) and one history commit at stroke end.
- The canvas draws the grid as a 1-px-per-cell bitmap scaled with smoothing off, plus a separate overlay canvas for hover, shape previews, mirror axes and selections.
- SVG generation is memoized on the grid version number.
- **Correctness guarantee:** `svg.test.ts` parses generated SVG back into a grid and asserts equality for every geometry and format (including SVGO output), across randomized grids with transparency, semi-transparent colors, holes, and 1×1 to 128×128 sizes.

## Tests

- Unit (Vitest, 92 tests): drawing algorithms in all octants, flood fill edges/holes/connectivity, move, resize with all nine anchors, undo grouping/redo clearing/cap, SVG round trip, empty canvas, `currentColor`, alpha, sanitizer (scripts, handlers, `javascript:`, external refs), JSX output compiled with the TypeScript compiler, project files, share links, conversion helpers.
- End-to-end (Playwright, 9 tests): gap-free fast drags, keyboard undo/redo, shortcuts paused in text fields, SVG + PNG download with PNG pixels compared to the grid at 1×, transparent PNG trace, large photo (downscaled, UI stays responsive, size warning), renamed `.txt` rejection, pixel-art import, touch drawing on a phone viewport without page scroll. Every e2e test also fails on any console error.
- The `?e2e` URL flag exposes a read-only `window.__SIS__` snapshot for these tests.

## Known limitations

- **Licensing:** `esm-potrace-wasm` is GPL-2.0 (inherited from Potrace). If you distribute this app under a non-GPL license, replace the Black & White / Silhouette tracer.
- VTracer is loaded at runtime from `public/wasm/` (its package hardcodes a wasm filename that bundlers can’t resolve). The app assumes it is served from the site root or a path where `wasm/` resolves relative to the page.
- Background removal is a color flood fill from the image edges; it is not subject-aware and works best on solid backgrounds.
- The SVG parser used for the round trip handles this app’s output (rects and rectilinear paths), not arbitrary SVG.
- DOMPurify’s SVG profile strips `<use>` entirely, so hand-edited SVGs that rely on `<use href="#id">` lose those references in previews and PNG exports.
- Icons using `currentColor` show as black inside `<img>`; the previews draw them through a CSS mask so they take the surrounding text color.
- Lighthouse has not been run as part of this build; accessibility work includes labelled icon buttons, tooltips with shortcuts, focus rings, native `<dialog>`, ARIA radio groups/switches, reduced-motion support and both themes, but the ≥95 score is not yet verified.
- Not built (Phase 4 ideas): icon sets / sprites, animation frames, layers, stroke-icon mode, templates, Vue/Svelte export, ML background removal, PWA/offline.
