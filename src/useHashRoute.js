import { useState, useEffect, useCallback } from 'react';

// Minimal hash router — enough for a flat set of views plus one level of detail
// ('grades/<courseId>'), and no dependency. Gives us deep links, a working back
// button, and a refresh that stays put instead of bouncing to the dashboard.
//
// Only `#/…` is treated as a route. Supabase delivers auth links as a bare hash
// (`#access_token=…&type=recovery`), so the prefix keeps the two apart.
const PREFIX = '#/';

function readRoute(fallback) {
  const h = typeof window === 'undefined' ? '' : window.location.hash;
  if (!h.startsWith(PREFIX)) return fallback;
  return h.slice(PREFIX.length) || fallback;
}

export function useHashRoute(fallback = 'today') {
  const [route, setRoute] = useState(() => readRoute(fallback));

  useEffect(() => {
    const onChange = () => setRoute(readRoute(fallback));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, [fallback]);

  const navigate = useCallback((next) => {
    if (readRoute(null) === next) return;
    window.location.hash = PREFIX + next;
  }, []);

  return [route, navigate];
}
