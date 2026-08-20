import { useState, useEffect, useCallback } from 'react';

// Light or dark, stamped on <html>. The palettes are CSS custom properties, so
// switching re-renders nothing — no context threaded through every component.
//
// Mode 'system' means "keep following the OS", and keeps following it, so a
// phone that flips to dark at sunset comes along too.

const MODE_KEY = 'cadence.mode';
const MODES = ['system', 'light', 'dark'];

const prefersDark = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;

export function storedMode() {
  try {
    const v = localStorage.getItem(MODE_KEY);
    return MODES.includes(v) ? v : 'system';
  } catch {
    // Private browsing can throw on localStorage access.
    return 'system';
  }
}

export const resolveMode = (mode) => (mode === 'system' ? (prefersDark() ? 'dark' : 'light') : mode);

// Status bar / installed-app title bar colour, read back off the stylesheet so
// it can't drift from the palette it's meant to match.
function paintMeta() {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--c-bg').trim();
  if (bg) meta.setAttribute('content', bg);
}

export function applyTheme(mode) {
  document.documentElement.dataset.mode = resolveMode(mode);
  paintMeta();
}

export function useTheme() {
  const [mode, setModeState] = useState(storedMode);

  useEffect(() => {
    applyTheme(mode);
  }, [mode]);

  // Only while following the OS.
  useEffect(() => {
    if (mode !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => applyTheme('system');
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [mode]);

  const setMode = useCallback((next) => {
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch {
      // Not being able to remember the choice shouldn't stop it applying now.
    }
    setModeState(next);
  }, []);

  return { mode, resolvedMode: resolveMode(mode), setMode };
}
