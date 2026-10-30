/* HomeFeed.jsx — SSE-driven deal feed sorted by Real-Time Urgency Score */
import { useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDealContext } from '../context/DealContext';
import { useSSE } from '../hooks/useSSE';
import { DealCard } from '../components/DealCard';
import { BottomNav } from '../components/BottomNav';

const SSE_EVENTS = [
  'deal:new', 'deal:price_drop', 'deal:urgency_update', 'deal:update',
  'deal:claimed', 'deal:released', 'deal:expired', 'deal:ngo_handoff',
];

const URGENCY_RANK = { GOING_NOW: 0, ACT_SOON: 1, COMFORTABLE: 2 };
const LEVEL_META = {
  GOING_NOW:   { emoji: '🔥', label: 'Ending Now',   desc: 'Grab these before they\'re gone' },
  ACT_SOON:    { emoji: '⚡', label: 'Act Soon',     desc: 'Filling up fast' },
  COMFORTABLE: { emoji: '✅', label: 'Available',    desc: 'Take your time' },
};

export function HomeFeed() {
  const navigate = useNavigate();
  const { deals, loading, fetchNearby, applyDealEvent, lastFetch } = useDealContext();

  useEffect(() => {
    if (!lastFetch) fetchNearby();
  }, [lastFetch, fetchNearby]);

  const handleSSE = useCallback((data) => {
    if (data.deal_id || data.id) {
      applyDealEvent(data.event || 'deal:update', data);
    }
  }, [applyDealEvent]);

  const connected = useSSE(SSE_EVENTS, handleSSE);

  const sorted = [...deals].sort((a, b) => {
    const ra = URGENCY_RANK[a.urgency_label] ?? 3;
    const rb = URGENCY_RANK[b.urgency_label] ?? 3;
    if (ra !== rb) return ra - rb;
    return (b.urgency_score || 0) - (a.urgency_score || 0);
  });

  const goingNowCount = sorted.filter(d => d.urgency_label === 'GOING_NOW').length;

  return (
    <div className="feed-page">
      {/* App bar */}
      <div className="app-bar">
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '1.4rem' }}>♻️</span>
            <span style={{ fontWeight: 800, fontSize: 'var(--text-lg)', letterSpacing: '-0.02em', background: 'linear-gradient(135deg, #00e5a0, #00b37e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              FoodRescue
            </span>
            {connected && goingNowCount > 0 && (
              <span style={{
                background: 'rgba(255,77,77,0.15)', color: 'var(--color-going-now)',
                border: '1px solid rgba(255,77,77,0.3)',
                fontSize: '0.65rem', fontWeight: 700, padding: '1px 7px',
                borderRadius: 'var(--radius-full)', animation: 'pulse-red 1.4s infinite',
              }}>
                🔥 {goingNowCount} LIVE
              </span>
            )}
          </div>
          <div style={{ fontSize: 'var(--text-xs)', marginTop: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
            {connected ? (
              <span style={{ color: 'var(--color-brand)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-brand)', display: 'inline-block', animation: 'glowPulse 2s infinite' }} />
                Live
              </span>
            ) : (
              <span style={{ color: 'var(--text-muted)' }}>Connecting…</span>
            )}
            <span style={{ color: 'var(--text-muted)' }}>•</span>
            <span style={{ color: 'var(--text-secondary)' }}>{deals.length} deals nearby</span>
          </div>
        </div>
        <button
          className="app-bar-action"
          onClick={fetchNearby}
          title="Refresh deals"
          disabled={loading}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18"
            style={{ animation: loading ? 'spin 0.7s linear infinite' : 'none' }}>
            <path d="M1 4v6h6M23 20v-6h-6"/>
            <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/>
          </svg>
        </button>
      </div>

      {/* Feed */}
      <div className="container" style={{ paddingTop: '1rem' }}>
        {loading && deals.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton" style={{ height: 120, borderRadius: 'var(--radius-lg)' }} />
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <div className="empty-state" style={{ marginTop: '2rem' }}>
            <div className="empty-icon">🍃</div>
            <div className="empty-title">No deals nearby right now</div>
            <p className="empty-desc">
              Vendors post deals as they approach closing time. Check back soon!
            </p>
            <button className="btn btn-ghost" onClick={fetchNearby} style={{ marginTop: 4 }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                <path d="M1 4v6h6M23 20v-6h-6"/>
                <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/>
              </svg>
              Refresh
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {['GOING_NOW', 'ACT_SOON', 'COMFORTABLE'].map((level) => {
              const group = sorted.filter((d) => d.urgency_label === level);
              if (group.length === 0) return null;
              const meta = LEVEL_META[level];

              return (
                <div key={level}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: '0.6rem' }}>
                    <span style={{ fontSize: '1.1rem' }}>{meta.emoji}</span>
                    <div>
                      <span style={{ fontWeight: 700, fontSize: 'var(--text-base)', color: 'var(--text-primary)' }}>
                        {meta.label}
                      </span>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginLeft: 6 }}>
                        {meta.desc}
                      </span>
                    </div>
                    <span style={{
                      marginLeft: 'auto', fontSize: 'var(--text-xs)', color: 'var(--text-muted)',
                      background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
                      padding: '1px 8px', borderRadius: 'var(--radius-full)',
                    }}>
                      {group.length}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                    {group.map((deal) => <DealCard key={deal.id} deal={deal} />)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <BottomNav role="consumer" />
    </div>
  );
}
