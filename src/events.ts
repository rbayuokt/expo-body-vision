import { createContext, useContext, useEffect, useRef } from 'react';

import type { NativeEvent } from './NativeBodyVisionView';

export type BodyVisionEvent = NativeEvent;

type Subscribe = (listener: (event: BodyVisionEvent) => void) => () => void;

export const BodyEventsContext = createContext<Subscribe | null>(null);

/**
 * Calls `listener` with every event of the enclosing `BodyVisionView`, the same ones its
 * callbacks get. For overlays and effects that live inside the view.
 */
export function useBodyVisionEvents(listener: (event: BodyVisionEvent) => void): void {
  const subscribe = useContext(BodyEventsContext);
  const latest = useRef(listener);
  useEffect(() => {
    latest.current = listener;
  });
  useEffect(() => subscribe?.((event) => latest.current(event)), [subscribe]);
}
