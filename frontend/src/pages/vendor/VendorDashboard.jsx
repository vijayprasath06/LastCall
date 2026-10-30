/* VendorDashboard.jsx — Live claim stream, active deals, vendor stats */
import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api';
import { useSSE } from '../../hooks/useSSE';
import { BottomNav } from '../../components/BottomNav';
import { CountdownTimer } from '../../components/CountdownTimer';

const STATUS_COLORS = {
  ACTIVE:           { color: 'var(--color-brand)',    bg: 'rgba(0,229,160,0.12)',   label: 'Active' },
  PARTIALLY_CLAIMED:{ color: 'var(--color-act-soon)', bg: 'rgba(255,170,0,0.12)',  label: 'Partial' },
  CLAIMED:          { color: 'var(--text-muted)',      bg: 'rgba(255,255,255,0.06)', label: 'Claimed' },
  EXPIRED:          { color: 'var(--color-going-now)', bg: 'rgba(255,77,77,0.10)',  label: 'Expired' },
  NGO_HANDOFF:      { color: '#6ee7b7',                bg: 'rgba(110,231,183,0.10)', label: 'NGO' },
};

export default function VendorDashboard() {
  const navigate = useNavigate();
  const [deals, setDeals]   = useState([]);
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [dealsRes, claimsRes] = await Promise.all([
        api.get('/vendor/deals'),
        api.get('/vendor/claims'),
      ]);
      setDeals(Array.isArray(dealsRes.data) ? dealsRes.data : dealsRes.data.deals || []);
      setClaims(Array.isArray(claimsRes.data) ? claimsRes.data : claimsRes.data.claims || []);
    } catch (err) {
      console.error('Failed to fetch dashboard data', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // SSE: real-time claim updates
  const handleSSE = useCallback((data) => {
    if (data.type === 'claim:new' || data.event === 'claim:new') {
      setClaims((prev) => [data.payload || data, ...prev]);
    } else if (data.type === 'claim:cancelled' || data.event === 'claim:cancelled') {
      setClaims((prev) => prev.map((c) => c.id === (data.payload?.id || data.id) ? { ...c, status: 'CANCELLED' } : c));
    }
  }, []);

  useSSE(['claim:new', 'claim:cancelled', 'claim:expired'], handleSSE);

  const activeDeals    = deals.filter((d) => ['ACTIVE', 'PARTIALLY_CLAIMED'].includes(d.status));
  const activeClaims   = claims.filter((c) => c.status === 'CONFIRMED');
  const totalRevenue   = claims
    .filter((c) => c.status === 'PICKED_UP')
    .reduce((sum, c) => sum + Number(c.current_price || 0), 0);

  return (
    <div className="page animate-fade-in">
      {/* App bar */}
      <div className="app-bar">
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 'var(--text-lg)', display: 'flex', alignItems: 'center', gap: 6 }}>
            🏪 Dashboard
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            {activeDeals.length} active deal{activeDeals.length !== 1 ? 's' : ''} · {activeClaims.length} pending pickup{activeClaims.length !== 1 ? 's' : ''}
          </div>
        </div>
        <button className="app-bar-action" onClick={fetchData} title="Refresh">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
            <path d="M1 4v6h6M23 20v-6h-6"/>
            <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/>
          </svg>
        </button>
      </div>

      <div className="container" style={{ paddingBottom: '6rem', paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

        {/* Quick stats */}
        <div className="vendor-stat-grid">
          <div className="stat-card">
            <span className="stat-value">{activeDeals.length}</span>
            <span className="stat-label">Live Deals</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{activeClaims.length}</span>
            <span className="stat-label">Pending QR</span>
          </div>
          <div className="stat-card">
            <span className="stat-value" style={{ fontSize: 'var(--text-xl)' }}>
              ₹{totalRevenue > 0 ? (totalRevenue >= 1000 ? `${(totalRevenue / 1000).toFixed(1)}k` : totalRevenue) : '0'}
            </span>
            <span className="stat-label">Recovered</span>
          </div>
        </div>

        {/* Quick actions */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <button
            className="btn btn-primary"
            onClick={() => navigate('/vendor/post')}
            style={{ padding: '0.875rem', display: 'flex', flexDirection: 'column', gap: 4, height: 'auto' }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
            <span style={{ fontSize: 'var(--text-sm)' }}>📸 Snap Deal</span>
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => navigate('/vendor/scan')}
            style={{ padding: '0.875rem', display: 'flex', flexDirection: 'column', gap: 4, height: 'auto' }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
              <rect x="3" y="3" width="5" height="5" rx="1"/>
              <rect x="16" y="3" width="5" height="5" rx="1"/>
              <rect x="3" y="16" width="5" height="5" rx="1"/>
              <rect x="16" y="16" width="5" height="5" rx="1"/>
              <line x1="10" y1="3" x2="10" y2="5"/>
              <line x1="10" y1="8" x2="10" y2="10"/>
              <line x1="14" y1="3" x2="14" y2="5"/>
            </svg>
            <span style={{ fontSize: 'var(--text-sm)' }}>📷 Scan QR</span>
          </button>
        </div>

        {/* Active deals */}
        <section>
          <div className="section-header">
            <span className="section-title">Active Deals</span>
            {activeDeals.length > 0 && (
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-brand)', fontWeight: 600 }}>
                {activeDeals.length} live
              </span>
            )}
          </div>

          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {[1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 90, borderRadius: 'var(--radius-lg)' }} />)}
            </div>
          ) : activeDeals.length === 0 ? (
            <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🍱</div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>No active deals</div>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                Post a deal with Snap-to-Post to start rescuing food
              </p>
              <button className="btn btn-primary btn-sm" onClick={() => navigate('/vendor/post')}>
                Post Your First Deal
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {activeDeals.map((deal) => {
                const st = STATUS_COLORS[deal.status] || STATUS_COLORS.ACTIVE;
                const remaining = deal.total_quantity - deal.claimed_quantity;
                const pct = Math.round((deal.claimed_quantity / deal.total_quantity) * 100);
                return (
                  <div key={deal.id} className="card" style={{
                    padding: '1rem',
                    borderLeft: `3px solid ${st.color}`,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 'var(--text-base)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {deal.title}
                        </div>
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 2, display: 'flex', gap: 8 }}>
                          <span>₹{Number(deal.current_price).toFixed(0)} current</span>
                          <span>·</span>
                          <span>{remaining}/{deal.total_quantity} remaining</span>
                        </div>
                      </div>
                      <span style={{
                        background: st.bg, color: st.color,
                        fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px',
                        borderRadius: 'var(--radius-full)', flexShrink: 0, marginLeft: 8,
                        textTransform: 'uppercase', letterSpacing: '0.06em',
                      }}>
                        {st.label}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div className="progress-bar" style={{ flex: 1 }}>
                        <div className={`progress-fill ${pct > 75 ? 'warning' : ''}`} style={{ width: `${pct}%` }} />
                      </div>
                      <CountdownTimer expiresAt={deal.expires_at} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Recent Claims stream */}
        <section>
          <div className="section-header">
            <span className="section-title">Claim Activity</span>
            {activeClaims.length > 0 && (
              <span style={{
                background: 'rgba(0,229,160,0.12)', color: 'var(--color-brand)',
                fontSize: 'var(--text-xs)', fontWeight: 700, padding: '2px 8px',
                borderRadius: 'var(--radius-full)',
              }}>
                {activeClaims.length} pending
              </span>
            )}
          </div>

          {claims.length === 0 && !loading ? (
            <div className="card" style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '2rem', marginBottom: 8 }}>📋</div>
              <div>No claim activity yet</div>
            </div>
          ) : (
            <div className="card" style={{ padding: '0.25rem 1rem' }}>
              {claims.slice(0, 10).map((claim) => (
                <div key={claim.id} className="claim-stream-item">
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                    background: claim.status === 'CONFIRMED'
                      ? 'rgba(0,229,160,0.15)'
                      : claim.status === 'PICKED_UP'
                        ? 'rgba(110,211,110,0.15)'
                        : 'rgba(255,255,255,0.06)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '1.1rem',
                  }}>
                    {claim.status === 'CONFIRMED' ? '🎟️' : claim.status === 'PICKED_UP' ? '✅' : claim.status === 'CANCELLED' ? '❌' : '⏱️'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      Claim #{claim.id?.substring(0, 6)}
                    </div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                      Expires {new Date(claim.qr_expires_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  <span style={{
                    fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px',
                    borderRadius: 'var(--radius-full)', flexShrink: 0, textTransform: 'uppercase',
                    background: claim.status === 'CONFIRMED' ? 'rgba(0,229,160,0.12)' : 'rgba(255,255,255,0.06)',
                    color: claim.status === 'CONFIRMED' ? 'var(--color-brand)' : 'var(--text-muted)',
                  }}>
                    {claim.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

      </div>

      <BottomNav role="vendor" />
    </div>
  );
}
