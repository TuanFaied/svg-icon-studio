'use client';

import { ArrowLeft, ArrowLeftRight, ArrowRight, Download, Plus, RotateCcw, Trash2, Upload } from 'lucide-react';
import { useMemo, useState } from 'react';
import { alpha, DEFAULT_PALETTE, opaque, pack, type PackedColor, parseHex, toCss, toHex, toHexRGB } from '@/core/grid/color';
import { usedColorsAll } from '@/core/grid/grid';
import { Button, cx, IconButton, Section } from '@/components/ui/primitives';
import { downloadText, pickFile } from '@/lib/files';
import { fileStem } from '@/core/export/encode';
import { useDocument } from '@/store/document';
import { useTool } from '@/store/tool';
import { useUi } from '@/store/ui';

function Swatch({
  color, selected, onClick, onContextMenu, label, size = 'md',
}: { color: PackedColor; selected?: boolean; onClick?: () => void; onContextMenu?: () => void; label: string; size?: 'md' | 'lg' }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={selected}
      onClick={onClick}
      onContextMenu={(e) => {
        if (!onContextMenu) return;
        e.preventDefault();
        onContextMenu();
      }}
      className={cx(
        'checker relative shrink-0 overflow-hidden rounded border',
        size === 'lg' ? 'size-9' : 'size-6',
        selected ? 'border-accent ring-2 ring-accent ring-offset-1 ring-offset-panel' : 'border-line-strong',
      )}
    >
      <span className="absolute inset-0" style={{ background: toCss(color) }} />
    </button>
  );
}

/** Hex + alpha color editor for one color slot. */
function ColorEditor({ color, onChange }: { color: PackedColor; onChange: (c: PackedColor) => void }) {
  const [text, setText] = useState(toHex(color));
  const [lastColor, setLastColor] = useState(color);
  if (color !== lastColor) {
    setLastColor(color);
    setText(color === 0 ? 'transparent' : toHex(color));
  }
  const a = color === 0 ? 0 : alpha(color);
  const rgb = color === 0 ? '#000000' : toHexRGB(color);

  const withAlpha = (base: PackedColor, al: number) => (al <= 0 ? 0 : pack(base >>> 24, (base >>> 16) & 255, (base >>> 8) & 255, al));

  return (
    <div className="mt-2 space-y-2 rounded-md border border-line bg-panel-2 p-2">
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label="Pick color"
          value={rgb}
          onChange={(e) => onChange(withAlpha(parseHex(e.target.value) as PackedColor, a || 255))}
          className="h-8 w-10 cursor-pointer rounded border border-line bg-transparent p-0"
        />
        <input
          aria-label="Hex color (#rrggbb or #rrggbbaa)"
          value={text}
          spellCheck={false}
          onChange={(e) => {
            setText(e.target.value);
            const c = parseHex(e.target.value);
            if (c !== null) onChange(c);
          }}
          className="h-8 min-w-0 flex-1 rounded-md border border-line bg-panel px-2 font-mono text-[12px] uppercase"
        />
      </div>
      <label className="flex items-center gap-2">
        <span className="w-12 text-muted">Alpha</span>
        <input
          type="range"
          min={0}
          max={255}
          value={a}
          aria-valuetext={`${Math.round((a / 255) * 100)}%`}
          onChange={(e) => onChange(withAlpha(color === 0 ? (parseHex('#000') as PackedColor) : opaque(color), Number(e.target.value)))}
          className="flex-1"
        />
        <span className="w-9 text-right tabular-nums text-muted">{Math.round((a / 255) * 100)}%</span>
      </label>
    </div>
  );
}

export function ColorPalette() {
  const primary = useTool((s) => s.primary);
  const secondary = useTool((s) => s.secondary);
  const setPrimary = useTool((s) => s.setPrimary);
  const setSecondary = useTool((s) => s.setSecondary);
  const swap = useTool((s) => s.swapColors);
  const palette = useDocument((s) => s.palette);
  const setPalette = useDocument((s) => s.setPalette);
  const version = useDocument((s) => s.version);
  const frames = useDocument((s) => s.frames);
  const replaceColor = useDocument((s) => s.replaceColor);
  const name = useDocument((s) => s.name);
  const toast = useUi((s) => s.toast);

  const [editing, setEditing] = useState<'primary' | 'secondary'>('primary');
  const [selected, setSelected] = useState<number | null>(null);
  const [replaceFrom, setReplaceFrom] = useState<PackedColor | null>(null);
  const used = useMemo(() => usedColorsAll(frames.map((f) => f.grid)), [frames, version]);

  const move = (dir: -1 | 1) => {
    if (selected === null) return;
    const j = selected + dir;
    if (j < 0 || j >= palette.length) return;
    const next = [...palette];
    [next[selected], next[j]] = [next[j], next[selected]];
    setPalette(next, 'Reorder palette');
    setSelected(j);
  };

  const importHex = async () => {
    const file = await pickFile('.hex,.txt,text/plain');
    if (!file) return;
    const colors = (await file.text())
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => parseHex(l))
      .filter((c): c is number => c !== null && c !== 0);
    if (!colors.length) {
      toast('No colors found in that file. Expected one hex color per line.', 'error');
      return;
    }
    setPalette(colors.slice(0, 256), 'Import palette');
    setSelected(null);
    toast(`Imported ${colors.length} colors`, 'success');
  };

  const exportHex = () => {
    downloadText(palette.map((c) => toHexRGB(c).slice(1)).join('\n') + '\n', `${fileStem(name)}.hex`, 'text/plain');
  };

  return (
    <Section title="Color">
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5">
          <div className="flex flex-col items-center gap-0.5">
            <Swatch size="lg" color={primary} label={`Primary color ${toHex(primary)}`} selected={editing === 'primary'} onClick={() => setEditing('primary')} />
            <span className="text-[10px] text-muted">Primary</span>
          </div>
          <IconButton label="Swap colors" onClick={swap}>
            <ArrowLeftRight size={14} />
          </IconButton>
          <div className="flex flex-col items-center gap-0.5">
            <Swatch size="lg" color={secondary} label={`Secondary color ${toHex(secondary)}`} selected={editing === 'secondary'} onClick={() => setEditing('secondary')} />
            <span className="text-[10px] text-muted">Secondary</span>
          </div>
        </div>
      </div>
      <ColorEditor color={editing === 'primary' ? primary : secondary} onChange={editing === 'primary' ? setPrimary : setSecondary} />

      <div className="mt-3 mb-1.5 flex items-center justify-between">
        <span className="text-[12px] font-medium">Project palette</span>
        <div className="flex">
          <IconButton label="Add primary color to palette" onClick={() => !palette.includes(primary) && primary !== 0 && setPalette([...palette, primary], 'Add color')}>
            <Plus size={14} />
          </IconButton>
          <IconButton label="Remove selected color" disabled={selected === null} onClick={() => {
            if (selected === null) return;
            setPalette(palette.filter((_, i) => i !== selected), 'Remove color');
            setSelected(null);
          }}>
            <Trash2 size={14} />
          </IconButton>
          <IconButton label="Move selected color left" disabled={selected === null || selected === 0} onClick={() => move(-1)}>
            <ArrowLeft size={14} />
          </IconButton>
          <IconButton label="Move selected color right" disabled={selected === null || selected === palette.length - 1} onClick={() => move(1)}>
            <ArrowRight size={14} />
          </IconButton>
        </div>
      </div>
      <div className="flex flex-wrap gap-1" role="group" aria-label="Project palette. Click sets primary, right click sets secondary.">
        {palette.map((c, i) => (
          <Swatch
            key={`${c}-${i}`}
            color={c}
            label={`${toHex(c)}${selected === i ? ' (selected)' : ''}`}
            selected={selected === i}
            onClick={() => {
              setPrimary(c);
              setSelected(i);
            }}
            onContextMenu={() => setSecondary(c)}
          />
        ))}
        {palette.length === 0 && <p className="text-[11px] text-muted">Palette is empty. Add the primary color with +.</p>}
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        <Button size="sm" onClick={importHex}><Upload size={13} /> Import .hex</Button>
        <Button size="sm" onClick={exportHex} disabled={!palette.length}><Download size={13} /> Export .hex</Button>
        <Button size="sm" variant="ghost" onClick={() => { setPalette([...DEFAULT_PALETTE], 'Reset palette'); setSelected(null); }}>
          <RotateCcw size={13} /> Default
        </Button>
      </div>

      <div className="mt-3 mb-1.5 text-[12px] font-medium">Used in this drawing</div>
      {used.length === 0 ? (
        <p className="text-[11px] text-muted">Nothing drawn yet. Colors you use show up here.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-1" role="group" aria-label="Colors used in the drawing">
            {used.slice(0, 64).map((c) => (
              <Swatch
                key={c}
                color={c}
                label={`${toHex(c)} — click to pick, choose to replace`}
                selected={replaceFrom === c}
                onClick={() => {
                  setPrimary(c);
                  setReplaceFrom(c);
                }}
                onContextMenu={() => setSecondary(c)}
              />
            ))}
          </div>
          {used.length > 64 && <p className="mt-1 text-[11px] text-muted">+{used.length - 64} more colors</p>}
          <div className="mt-2 flex items-center gap-1.5">
            <Button
              size="sm"
              disabled={replaceFrom === null || !used.includes(replaceFrom) || replaceFrom === secondary}
              onClick={() => {
                if (replaceFrom === null) return;
                replaceColor(replaceFrom, secondary);
                setReplaceFrom(secondary === 0 ? null : secondary);
                toast('Color replaced', 'success');
              }}
            >
              Replace selected with secondary
            </Button>
          </div>
          <p className="mt-1 text-[11px] leading-snug text-muted">Click a used color, set the new color as secondary, then replace. One undo step.</p>
        </>
      )}
    </Section>
  );
}
