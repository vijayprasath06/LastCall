/* useCountdown.js — Synchronized countdown clock from ISO expires_at */
import { useState, useEffect, useRef } from 'react';

/**
 * Returns { minutes, seconds, isExpired, urgency: 'urgent'|'warning'|'normal' }
 * @param {string} expiresAt — ISO timestamp
 */
export function useCountdown(expiresAt) {
  const [remaining, setRemaining] = useState(0);
  const rafRef = useRef(null);

  useEffect(() => {
    if (!expiresAt) return;
    const target = new Date(expiresAt).getTime();

    const tick = () => {
      const diff = Math.max(0, target - Date.now());
      setRemaining(diff);
      if (diff > 0) rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [expiresAt]);

  const totalSeconds = Math.floor(remaining / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const isExpired = remaining === 0 && !!expiresAt;

  let urgency = 'normal';
  if (minutes < 5)  urgency = 'urgent';
  else if (minutes < 15) urgency = 'warning';

  return { minutes, seconds, remaining, isExpired, urgency };
}
