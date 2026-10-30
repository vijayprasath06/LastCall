/* RUSMeter.jsx — Visual Real-Time Urgency Score arc */
import { useMemo } from 'react';

const URGENCY_CONFIG = {
  GOING_NOW:   { color: '#ff4d4d', glow: 'rgba(255,77,77,0.4)',  label: '🔥 GOING NOW',   arc: 0.95 },
  ACT_SOON:    { color: '#ffaa00', glow: 'rgba(255,170,0,0.35)', label: '⚡ ACT SOON',    arc: 0.60 },
  COMFORTABLE: { color: '#00e5a0', glow: 'rgba(0,229,160,0.25)', label: '✅ COMFORTABLE', arc: 0.30 },
};

const SIZE = 80;
const STROKE = 7;
const R = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * R;

export function RUSMeter({ urgencyLabel = 'COMFORTABLE', score = 0, size = SIZE }) {
  const cfg = URGENCY_CONFIG[urgencyLabel] ?? URGENCY_CONFIG.COMFORTABLE;
  const pct = cfg.arc;
  const offset = CIRCUMFERENCE * (1 - pct);
  const isGoing = urgencyLabel === 'GOING_NOW';
  const scale = size / SIZE;

  const svgStyle = useMemo(() => ({
    width: size,
    height: size,
    transform: `rotate(-90deg)`,
    filter: `drop-shadow(0 0 ${isGoing ? 10 : 6}px ${cfg.glow})`,
    animation: isGoing ? 'glowPulse 1.2s ease-in-out infinite' : undefined,
  }), [size, cfg.glow, isGoing]);

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        style={svgStyle}
      >
        {/* Track */}
        <circle
          cx={SIZE / 2} cy={SIZE / 2} r={R}
          fill="none"
          stroke="rgba(255,255,255,0.07)"
          strokeWidth={STROKE}
        />
        {/* Fill */}
        <circle
          cx={SIZE / 2} cy={SIZE / 2} r={R}
          fill="none"
          stroke={cfg.color}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.6s cubic-bezier(0.4,0,0.2,1)' }}
        />
      </svg>

      {/* Center label */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 2,
      }}>
        <span style={{
          fontSize: 9 * scale,
          fontWeight: 800,
          letterSpacing: '0.03em',
          color: cfg.color,
          textAlign: 'center',
          lineHeight: 1.1,
          maxWidth: size * 0.7,
        }}>
          {cfg.label.split(' ').slice(1).join(' ')}
        </span>
      </div>
    </div>
  );
}
