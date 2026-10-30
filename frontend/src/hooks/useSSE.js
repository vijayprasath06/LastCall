/* useSSE.js — Subscribe to SSE events from SSEContext */
import { useEffect } from 'react';
import { useSSEContext } from '../context/SSEContext';

/**
 * Subscribe to one or more SSE event types.
 * @param {string|string[]} events
 * @param {function} handler
 */
export function useSSE(events, handler) {
  const ctx = useSSEContext();

  useEffect(() => {
    if (!ctx) return;
    const names = Array.isArray(events) ? events : [events];
    const unsubs = names.map((name) => ctx.on(name, handler));
    return () => unsubs.forEach((u) => u?.());
  }, [events, handler, ctx]);

  return ctx?.connected ?? false;
}
