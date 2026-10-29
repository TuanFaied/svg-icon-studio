'use client';

import { create } from 'zustand';

export type Mode = 'draw' | 'convert';
export type ThemePref = 'system' | 'light' | 'dark';
export type DialogId = 'export' | 'shortcuts' | 'resize' | 'recent' | 'reset' | 'templates' | null;

export interface Toast {
  id: number;
  message: string;
  tone: 'info' | 'success' | 'error';
}

export interface UiState {
  mode: Mode;
  theme: ThemePref;
  dialog: DialogId;
  /** Pending canvas size waiting on the crop/pad confirmation dialog. */
  pendingResize: { width: number; height: number } | null;
  toasts: Toast[];
  setMode: (m: Mode) => void;
  setTheme: (t: ThemePref) => void;
  openDialog: (d: DialogId) => void;
  requestResize: (width: number, height: number) => void;
  toast: (message: string, tone?: Toast['tone']) => void;
  dismissToast: (id: number) => void;
}

let toastId = 0;

const readTheme = (): ThemePref => {
  try {
    const t = localStorage.getItem('sis.theme');
    return t === 'light' || t === 'dark' ? t : 'system';
  } catch {
    return 'system';
  }
};

export const useUi = create<UiState>()((set, get) => ({
  mode: 'draw',
  theme: 'system',
  dialog: null,
  pendingResize: null,
  toasts: [],
  setMode: (mode) => set({ mode }),
  setTheme: (theme) => {
    try {
      localStorage.setItem('sis.theme', theme);
    } catch {
      /* storage unavailable */
    }
    set({ theme });
  },
  openDialog: (dialog) => set({ dialog }),
  requestResize: (width, height) => set({ pendingResize: { width, height }, dialog: 'resize' }),
  toast: (message, tone = 'info') => {
    const id = ++toastId;
    set({ toasts: [...get().toasts, { id, message, tone }] });
    setTimeout(() => get().dismissToast(id), 3200);
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

export function initUiFromStorage(): void {
  useUi.setState({ theme: readTheme() });
}
