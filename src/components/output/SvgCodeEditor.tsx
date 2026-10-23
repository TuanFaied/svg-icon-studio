'use client';

import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { xml } from '@codemirror/lang-xml';
import { bracketMatching, defaultHighlightStyle, foldGutter, foldKeymap, HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import { AlertTriangle, Check, Copy, Pencil, RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { validateSvg } from '@/core/sanitize/sanitize';
import { formatBytes, gzipSize, svgStats } from '@/core/svg/stats';
import { Button } from '@/components/ui/primitives';
import { copyText } from '@/lib/files';
import { useActiveSvg } from '@/lib/svgOutput';
import { useDocument } from '@/store/document';
import { useUi } from '@/store/ui';

const darkHighlight = HighlightStyle.define([
  { tag: tags.tagName, color: '#7cc4ff' },
  { tag: tags.attributeName, color: '#c3a6ff' },
  { tag: tags.attributeValue, color: '#a5e3a0' },
  { tag: tags.comment, color: '#7d8590', fontStyle: 'italic' },
  { tag: tags.angleBracket, color: '#8b949e' },
]);

const baseTheme = EditorView.theme({
  '&': { backgroundColor: 'var(--panel)', color: 'var(--text)' },
  '.cm-gutters': { backgroundColor: 'var(--panel-2)', color: 'var(--muted)', borderRight: '1px solid var(--border)' },
  '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--accent) 7%, transparent)' },
  '.cm-activeLineGutter': { backgroundColor: 'color-mix(in srgb, var(--accent) 12%, transparent)' },
  '.cm-content': { fontFamily: 'var(--font-mono)', caretColor: 'var(--text)' },
  '.cm-scroller': { fontFamily: 'var(--font-mono)' },
  '.cm-panels': { backgroundColor: 'var(--panel-2)', color: 'var(--text)' },
  '.cm-searchMatch': { backgroundColor: 'color-mix(in srgb, #facc15 40%, transparent)' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: 'color-mix(in srgb, var(--accent) 25%, transparent) !important' },
});

function isDark(): boolean {
  return document.documentElement.dataset.theme === 'dark';
}

export function SvgCodeEditor() {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const readOnly = useRef(new Compartment());
  const highlight = useRef(new Compartment());
  const { svg, source } = useActiveSvg();
  const manual = source === 'manual';
  const setManual = useDocument((s) => s.setManualSvg);
  const version = useDocument((s) => s.version);
  const toast = useUi((s) => s.toast);
  const [forkVersion, setForkVersion] = useState<number | null>(null);
  const [gz, setGz] = useState<number | null>(null);
  const manualRef = useRef(manual);
  manualRef.current = manual;

  // Create the editor once.
  useEffect(() => {
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: svg,
        extensions: [
          lineNumbers(),
          foldGutter(),
          highlightActiveLine(),
          highlightActiveLineGutter(),
          history(),
          bracketMatching(),
          search({ top: true }),
          highlightSelectionMatches(),
          xml(),
          baseTheme,
          highlight.current.of(syntaxHighlighting(isDark() ? darkHighlight : defaultHighlightStyle)),
          readOnly.current.of([EditorState.readOnly.of(true), EditorView.editable.of(true)]),
          keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, ...foldKeymap]),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({ 'aria-label': 'SVG code' }),
          EditorView.updateListener.of((u) => {
            if (u.docChanged && manualRef.current) setManual(u.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = v;
    const mo = new MutationObserver(() =>
      v.dispatch({ effects: highlight.current.reconfigure(syntaxHighlighting(isDark() ? darkHighlight : defaultHighlightStyle)) }),
    );
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      mo.disconnect();
      v.destroy();
      view.current = null;
    };
  }, []);

  // Keep the document in sync with generated output while not manually edited.
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    v.dispatch({ effects: readOnly.current.reconfigure([EditorState.readOnly.of(!manual)]) });
    if (manual) return;
    const cur = v.state.doc.toString();
    if (cur !== svg) v.dispatch({ changes: { from: 0, to: cur.length, insert: svg } });
  }, [svg, manual]);

  const validation = useMemo(() => (manual ? validateSvg(svg) : { ok: true as const }), [svg, manual]);
  const stats = useMemo(() => svgStats(svg), [svg]);

  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => void gzipSize(svg).then((n) => alive && setGz(n)), 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [svg]);

  const startEditing = () => {
    setManual(svg);
    setForkVersion(version);
    // Converted output becomes a manual document in Draw mode, where it can be edited.
    if (source === 'convert') useUi.getState().setMode('draw');
    requestAnimationFrame(() => view.current?.focus());
  };

  const regenerate = () => {
    if (!window.confirm('Discard your manual edits and regenerate the SVG from the drawing?')) return;
    setManual(null);
    setForkVersion(null);
  };

  const drawingChanged = manual && forkVersion !== null && forkVersion !== version;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-1 border-b border-line px-3 py-1.5">
        <h2 className="mr-auto text-[11px] font-semibold uppercase tracking-wide text-muted">SVG code</h2>
        {!manual && (
          <Button size="sm" variant="ghost" onClick={startEditing} title={source === 'convert' ? 'Edit the converted SVG as code (switches to Draw mode)' : 'Fork the code for manual edits'}>
            <Pencil size={13} /> {source === 'convert' ? 'Edit as code' : 'Edit'}
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={async () => toast((await copyText(svg)) ? 'SVG copied to clipboard' : 'Copy failed', 'success')}
        >
          <Copy size={13} /> Copy
        </Button>
      </div>
      {manual && (
        <div role="status" className="space-y-1.5 border-b border-line bg-warn-bg px-3 py-2 text-warn-fg">
          <p className="flex items-center gap-1.5 font-medium">
            <AlertTriangle size={14} aria-hidden /> Manual edits — not linked to drawing.
          </p>
          {drawingChanged && <p className="text-[12px]">The drawing changed since you started editing. Those changes are not in this code.</p>}
          <div className="flex gap-1.5">
            <Button size="sm" onClick={regenerate}>
              <RefreshCw size={13} /> Regenerate from drawing
            </Button>
            <Button size="sm" onClick={() => setForkVersion(version)} disabled={!drawingChanged}>
              <Check size={13} /> Keep edits
            </Button>
          </div>
        </div>
      )}
      <div ref={host} className="min-h-0 flex-1 overflow-hidden" data-testid="code-editor" />
      {!validation.ok && (
        <p role="alert" className="border-t border-line bg-panel-2 px-3 py-1.5 text-[12px] text-danger">
          {validation.line ? `Line ${validation.line}: ` : ''}
          {validation.error}
        </p>
      )}
      <footer className="flex gap-3 border-t border-line px-3 py-1.5 text-[11px] tabular-nums text-muted">
        <span>{formatBytes(stats.bytes)}</span>
        <span>{gz === null ? '—' : `${formatBytes(gz)} gzip`}</span>
        <span>{stats.elements} elements</span>
      </footer>
    </div>
  );
}
