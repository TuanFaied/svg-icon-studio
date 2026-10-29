'use client';

import { Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ResizeDialog } from '@/components/editor/CanvasSettings';
import { TemplatesDialog } from '@/components/editor/TemplatesDialog';
import { ExportDialog } from '@/components/output/ExportDialog';
import { Dialog } from '@/components/ui/Dialog';
import { Button, IconButton, Kbd } from '@/components/ui/primitives';
import { listRecent, openRecent, type RecentEntry, removeRecent, saveNow } from '@/lib/persistence';
import { SHORTCUTS } from '@/lib/shortcuts';
import { useDocument } from '@/store/document';
import { useTool } from '@/store/tool';
import { useUi } from '@/store/ui';

function ShortcutsDialog() {
  const open = useUi((s) => s.dialog === 'shortcuts');
  return (
    <Dialog open={open} onClose={() => useUi.getState().openDialog(null)} title="Keyboard shortcuts">
      <p className="mb-2 text-[12px] text-muted">Shortcuts are paused while typing in a field or the code editor.</p>
      <table className="w-full">
        <tbody>
          {SHORTCUTS.map((s) => (
            <tr key={s.keys} className="border-b border-line last:border-0">
              <td className="py-1.5 pr-3 align-top"><Kbd>{s.keys}</Kbd></td>
              <td className="py-1.5">{s.action}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Dialog>
  );
}

function ResetDialog() {
  const open = useUi((s) => s.dialog === 'reset');
  const close = () => useUi.getState().openDialog(null);
  const toast = useUi((s) => s.toast);
  return (
    <Dialog
      open={open}
      onClose={close}
      title="Reset"
      footer={<Button onClick={close}>Cancel</Button>}
    >
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-medium">Clear canvas</p>
            <p className="text-[12px] text-muted">Erase every pixel. Can be undone.</p>
          </div>
          <Button variant="danger" onClick={() => { useDocument.getState().clearCanvas(); useTool.getState().set({ selection: null }); close(); }}>
            Clear
          </Button>
        </div>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-medium">New project</p>
            <p className="text-[12px] text-muted">Start fresh at 24 × 24. The current project stays in Recent projects.</p>
          </div>
          <Button
            variant="danger"
            onClick={async () => {
              await saveNow().catch(() => undefined);
              useDocument.getState().newProject(24, 24);
              useTool.getState().set({ selection: null });
              useUi.getState().setMode('draw');
              toast('New project started');
              close();
            }}
          >
            New
          </Button>
        </div>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-medium">Start from a template</p>
            <p className="text-[12px] text-muted">Pick an animated loader to edit. Can be undone.</p>
          </div>
          <Button onClick={() => useUi.getState().openDialog('templates')}>Templates</Button>
        </div>
      </div>
    </Dialog>
  );
}

function RecentDialog() {
  const open = useUi((s) => s.dialog === 'recent');
  const close = () => useUi.getState().openDialog(null);
  const currentId = useDocument((s) => s.id);
  const [items, setItems] = useState<RecentEntry[] | null>(null);

  useEffect(() => {
    if (!open) return;
    setItems(null);
    void saveNow()
      .catch(() => undefined)
      .then(listRecent)
      .then(setItems);
  }, [open]);

  return (
    <Dialog open={open} onClose={close} title="Recent projects">
      {items === null ? (
        <p className="text-muted">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-muted">No saved projects yet. Your work is saved automatically as you draw.</p>
      ) : (
        <ul className="space-y-1">
          {items.map((r) => (
            <li key={r.id} className="flex items-center gap-2 rounded-md border border-line p-1.5">
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2 rounded text-left hover:bg-panel-2"
                onClick={() => {
                  openRecent(r);
                  useUi.getState().setMode('draw');
                  close();
                }}
              >
                <span className="checker flex size-11 shrink-0 items-center justify-center overflow-hidden rounded border border-line">
                  {r.thumbnail ? <img src={r.thumbnail} alt="" className="pixelated max-h-full max-w-full" /> : null}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-medium">{r.name}{r.id === currentId ? ' (open)' : ''}</span>
                  <span className="block text-[11px] text-muted">
                    {r.width} × {r.height} · {new Date(r.updatedAt).toLocaleString()}
                  </span>
                </span>
              </button>
              <IconButton
                label={`Remove ${r.name} from recent`}
                disabled={r.id === currentId}
                onClick={async () => {
                  await removeRecent(r.id);
                  setItems(await listRecent());
                }}
              >
                <Trash2 size={14} />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

export function Dialogs() {
  return (
    <>
      <ExportDialog />
      <ShortcutsDialog />
      <ResizeDialog />
      <ResetDialog />
      <RecentDialog />
      <TemplatesDialog />
    </>
  );
}
