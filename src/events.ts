import { createContext, useContext, useEffect, useRef, useState } from 'react';

import type { NativeEvent } from './NativeBodyVisionView';
import type { BodyVisionStats } from './types';

export type BodyVisionEvent = NativeEvent;

export interface BodyEventsContextValue {
  subscribe: (listener: (event: BodyVisionEvent) => void) => () => void;
  /** Turns native stats on until the returned function is called. */
  wantStats: () => () => void;
}

export const BodyEventsContext = createContext<BodyEventsContextValue | null>(null);

/**
 * Calls `listener` with every event of the enclosing `BodyVisionView`, the same ones its
 * callbacks get. For overlays and effects that live inside the view.
 */
export function useBodyVisionEvents(listener: (event: BodyVisionEvent) => void): void {
  const context = useContext(BodyEventsContext);
  const latest = useRef(listener);
  useEffect(() => {
    latest.current = listener;
  });
  useEffect(() => context?.subscribe((event) => latest.current(event)), [context]);
}

/**
 * Live performance numbers of the enclosing `BodyVisionView`, about once a second: render fps,
 * poses per second, time per pose, latency, backend and more. Turns native stats on while
 * mounted, so a debug overlay needs no `onStats` wiring. Null until the first report.
 */
export function useBodyVisionStats(): BodyVisionStats | null {
  const context = useContext(BodyEventsContext);
  const [stats, setStats] = useState<BodyVisionStats | null>(null);
  useEffect(() => context?.wantStats(), [context]);
  useBodyVisionEvents((event) => {
    if (event.type === 'stats') setStats(event as unknown as BodyVisionStats);
  });
  return stats;
}
