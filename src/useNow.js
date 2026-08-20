import { useState, useEffect } from 'react';

// A ticking clock, so "next class in 20 minutes" counts down on its own and the
// now-line on the schedule slides instead of freezing where the page loaded.
//
// Aligned to the top of each period rather than set to a bare interval: an
// app left open all afternoon otherwise drifts, and a countdown that updates at
// :47 past every minute looks broken next to the phone's own clock.
export function useNow(periodMs = 60_000) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let timer;
    const schedule = () => {
      const delay = periodMs - (Date.now() % periodMs);
      timer = setTimeout(() => {
        setNow(new Date());
        schedule();
      }, delay);
    };
    schedule();
    return () => clearTimeout(timer);
  }, [periodMs]);

  return now;
}
