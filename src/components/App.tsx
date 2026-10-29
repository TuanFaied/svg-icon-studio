'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { AppHeader } from '@/components/layout/AppHeader';
import { Dialogs } from '@/components/layout/Dialogs';
import { MobileWorkspace } from '@/components/layout/MobileSheet';
import { DesktopWorkspace } from '@/components/layout/WorkspaceLayout';
import { Toasts } from '@/components/ui/Toasts';
import { restore, startAutosave } from '@/lib/persistence';
import { useShortcuts } from '@/lib/shortcuts';
import { useDocument } from '@/store/document';
import { useTool } from '@/store/tool';
import { initUiFromStorage, useUi } from '@/store/ui';

const DESKTOP_QUERY = '(min-width: 1024px)';

function useIsDesktop(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(DESKTOP_QUERY);
      mq.addEventListener('change', cb);
      return () => mq.removeEventListener('change', cb);
    },
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => true,
  );
}

/** Applies the theme preference (system / light / dark) to <html data-theme>. */
function useTheme() {
  const theme = useUi((s) => s.theme);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
}

export default function App() {
  const desktop = useIsDesktop();
  const [ready, setReady] = useState(false);
  useShortcuts();
  useTheme();

  useEffect(() => {
    // Read-only state snapshot for end-to-end tests; only exposed with ?e2e in the URL.
    if (new URLSearchParams(location.search).has('e2e')) {
      (window as unknown as { __SIS__: unknown }).__SIS__ = {
        grid: () => {
          const g = useDocument.getState().grid;
          return { width: g.width, height: g.height, data: Array.from(g.data) };
        },
        view: () => {
          const t = useTool.getState();
          return { zoom: t.zoom, panX: t.panX, panY: t.panY };
        },
        frames: () => {
          const s = useDocument.getState();
          return { index: s.frameIndex, frames: s.frames.map((f) => ({ duration: f.duration, data: Array.from(f.grid.data) })) };
        },
      };
    }
    initUiFromStorage();
    let stop: (() => void) | undefined;
    void restore()
      .then((what) => {
        if (what === 'share') useUi.getState().toast('Loaded icon from share link', 'success');
        useTool.getState().requestFit();
      })
      .finally(() => {
        stop = startAutosave();
        setReady(true);
      });
    return () => stop?.();
  }, []);

  return (
    <div className="flex h-dvh flex-col overflow-hidden" data-ready={ready || undefined}>
      <AppHeader compact={!desktop} />
      {desktop ? <DesktopWorkspace /> : <MobileWorkspace />}
      <Dialogs />
      <Toasts />
    </div>
  );
}
