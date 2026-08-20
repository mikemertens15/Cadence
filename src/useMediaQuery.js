import { useState, useEffect } from 'react';

// Tracks a CSS media query, so a layout can genuinely change shape on a phone
// rather than just reflowing — the schedule is a week grid on a laptop and a
// day agenda on a phone, which is a different component, not a narrower one.
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches,
  );

  useEffect(() => {
    const mq = window.matchMedia(query);
    const update = () => setMatches(mq.matches);
    update();
    mq.addEventListener('change', update);
    // `resize` is a belt-and-suspenders fallback: some embedded webviews don't
    // reliably dispatch matchMedia 'change' events on viewport changes.
    window.addEventListener('resize', update);
    return () => {
      mq.removeEventListener('change', update);
      window.removeEventListener('resize', update);
    };
  }, [query]);

  return matches;
}

// The two breakpoints in the spec: dense table layouts above 1024, single
// column below 640. `useIsNarrow` covers the tablet middle, where the week grid
// still fits but the desktop nav doesn't.
export const useIsNarrow = () => useMediaQuery('(max-width: 1023px)');
export const useIsPhone = () => useMediaQuery('(max-width: 639px)');
