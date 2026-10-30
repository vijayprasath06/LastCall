/* CountdownTimer.jsx — Synchronized countdown display */
import { useCountdown } from '../hooks/useCountdown';

export function CountdownTimer({ expiresAt, className = '' }) {
  const { minutes, seconds, isExpired, urgency } = useCountdown(expiresAt);

  if (isExpired) {
    return <span className={`countdown urgent ${className}`}>Expired</span>;
  }

  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');

  return (
    <span className={`countdown ${urgency} ${className}`}>
      {mm}:{ss}
    </span>
  );
}
