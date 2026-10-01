import { useCallback, useMemo, useState } from 'react';

import type { RepEvent, RepRejectedEvent, RepRejectionReason } from './types';

export interface RepStats {
  /** Counted reps across the tracked exercises. */
  count: number;
  /** Peak mode only: reps per side, e.g. jabs and crosses. */
  left: number;
  right: number;
  /** Reps in a row, each within `comboGapMs` of the last. */
  combo: number;
  best: number;
  /** Counted reps since the last rejected one. */
  streak: number;
  missed: number;
  lastMiss: RepRejectionReason | null;
  /** Native timestamp of the last counted rep. */
  lastRepAt: number | null;
}

export interface RepStatsOptions {
  /** Exercise ids to track. Default all. */
  exercises?: string[];
  /** Reps further apart than this end the combo. Default 900. */
  comboGapMs?: number;
}

export const EMPTY_REP_STATS: RepStats = {
  count: 0,
  left: 0,
  right: 0,
  combo: 0,
  best: 0,
  streak: 0,
  missed: 0,
  lastMiss: null,
  lastRepAt: null,
};

export function addRep(s: RepStats, e: RepEvent, comboGapMs = 900): RepStats {
  const combo = s.lastRepAt !== null && e.timestamp - s.lastRepAt <= comboGapMs ? s.combo + 1 : 1;
  return {
    ...s,
    count: s.count + 1,
    left: s.left + (e.side === 'left' ? 1 : 0),
    right: s.right + (e.side === 'right' ? 1 : 0),
    combo,
    best: Math.max(s.best, combo),
    streak: s.streak + 1,
    lastRepAt: e.timestamp,
  };
}

export function addMiss(s: RepStats, e: RepRejectedEvent): RepStats {
  return { ...s, streak: 0, missed: s.missed + 1, lastMiss: e.reason };
}

/**
 * Running numbers for a workout or game: count, per-side counts, combo, best combo, streak and
 * misses. Spread `track` onto the view, read `stats` anywhere.
 *
 *     const { stats, track, reset } = useRepStats();
 *     <BodyVisionView rules={[punch()]} {...track} />
 *
 * `track` sets `onRep` and `onRepRejected`. To handle them yourself too, call
 * `track.onRep(e)` from your own handler.
 */
export function useRepStats({ exercises, comboGapMs }: RepStatsOptions = {}) {
  const [stats, setStats] = useState<RepStats>(EMPTY_REP_STATS);
  // A string key so an inline array doesn't make new handlers every render.
  const tracked = exercises ? exercises.join('|') : null;

  const track = useMemo(() => {
    const wanted = (id: string) => tracked === null || tracked.split('|').includes(id);
    return {
      onRep: (e: RepEvent) => {
        if (wanted(e.exercise)) setStats((s) => addRep(s, e, comboGapMs));
      },
      onRepRejected: (e: RepRejectedEvent) => {
        if (wanted(e.exercise)) setStats((s) => addMiss(s, e));
      },
    };
  }, [tracked, comboGapMs]);
  const reset = useCallback(() => setStats(EMPTY_REP_STATS), []);
  return { stats, track, reset };
}
