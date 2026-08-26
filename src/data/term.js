import { useMemo } from 'react';
import { useSemester } from './SemesterProvider';
import { termProgress } from '../term';
import { useNow } from '../useNow';

// The term in view, measured — see src/term.js for what the numbers mean.
//
// Ticks with `useNow` rather than reading the clock once, so a laptop left open
// overnight doesn't still say "Week 6" on the Monday of week 7.

export function useTermProgress() {
  const { activeTerm, breaks, meetings } = useSemester();
  const now = useNow();

  // Which weekdays you actually have class on, so "class days left" counts the
  // days you have to show up rather than every weekday on the calendar — a
  // Tuesday/Thursday semester is a very different number from a five-day one.
  const meetingDays = useMemo(
    () => new Set(meetings.map((m) => m.day_of_week)),
    [meetings],
  );

  return useMemo(
    () => termProgress(activeTerm, { now, breaks, meetingDays }),
    [activeTerm, now, breaks, meetingDays],
  );
}
