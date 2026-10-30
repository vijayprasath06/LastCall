/* MyClaims.jsx — Active claims with QR codes and voluntary cancel */
import { useState, useEffect, useCallback } from 'react';
import api from '../api';
import { QRCodeDisplay } from '../components/QRCodeDisplay';
import { CancelClaimButton } from '../components/CancelClaimButton';
import { CountdownTimer } from '../components/CountdownTimer';
import { useSSE } from '../hooks/useSSE';
import { BottomNav } from '../components/BottomNav';

const STATUS_LABEL = {
  CONFIRMED:  { label: 'Active',     class: 'status-confirmed' },
  PICKED_UP:  { label: 'Picked up',  class: 'status-picked-up' },
  EXPIRED:    { label: 'Expired',    class: 'status-expired' },
  CANCELLED:  { label: 'Cancelled',  class: 'status-cancelled' },
};

export function MyClaims() {
  const [claims, setClaims]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);

  const fetchClaims = useCallback(async () => {
    try {
      const { data } = await api.get('/deals/my-claims');
      setClaims(data.claims || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchClaims(); }, [fetchClaims]);

  // SSE: update claims on timeout/cancel
  const handleSSE = useCallback((data) => {
    setClaims((prev) => prev.map((c) =>
      c.deal_id === data.deal_id ? { ...c, status: 'EXPIRED' } : c
    ));
  }, []);
  useSSE(['claim:expired', 'claim:cancelled'], handleSSE);

  const active = claims.filter((c) => c.status === 'CONFIRMED');
  const past   = claims.filter((c) => c.status !== 'CONFIRMED');

  return (
    <div className="page animate-fade-in">
      <div className="app-bar">
        <span className="app-bar-title">My Claims</span>
      </div>

      <div className="container" style={{ paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

        {loading ? (
          [1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 100, borderRadius: 'var(--radius-lg)' }} />)
        ) : active.length === 0 && past.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🎟️</div>
            <div className="empty-title">No claims yet</div>
            <p className="empty-desc">Claim a food rescue deal and your QR code will appear here.</p>
          </div>
        ) : (
          <>
            {/* Active claims */}
            {active.length > 0 && (
              <div>
                <div className="section-header">
                  <span className="section-title">Active Claims</span>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{active.length} pending</span>
                </div>

                {active.map((claim) => (
                  <div key={claim.id} className="card" style={{ padding: '1rem', marginBottom: '0.75rem', borderColor: 'var(--border-brand)' }}>
                    <div
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', cursor: 'pointer' }}
                      onClick={() => setExpanded(expanded === claim.id ? null : claim.id)}
                    >
                      <div>
                        <div style={{ fontWeight: 700, marginBottom: 2 }}>{claim.deal_title || 'Food Deal'}</div>
                        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>{claim.vendor_name}</div>
                        <div style={{ marginTop: 4, display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          <span className="status-pill status-confirmed">Active</span>
                          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                            Pickup by: <CountdownTimer expiresAt={claim.qr_expires_at} />
                          </span>
                        </div>
                      </div>
                      <span style={{ fontSize: '1.25rem', transition: 'transform 200ms', transform: expanded === claim.id ? 'rotate(180deg)' : 'none' }}>
                        ⌄
                      </span>
                    </div>

                    {/* Expanded: QR + cancel */}
                    {expanded === claim.id && (
                      <div className="animate-fade-in" style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                        <QRCodeDisplay token={claim.qr_token} expiresAt={claim.qr_expires_at} />
                        <div style={{ fontSize: 'var(--text-sm)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                          ₹{Number(claim.current_price || 0).toFixed(0)}
                          <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 4 }}>locked price</span>
                        </div>
                        <CancelClaimButton
                          claimId={claim.id}
                          dealId={claim.deal_id}
                          onCancelled={() => {
                            setExpanded(null);
                            fetchClaims();
                          }}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Past claims */}
            {past.length > 0 && (
              <div>
                <div className="section-header">
                  <span className="section-title" style={{ color: 'var(--text-secondary)' }}>History</span>
                </div>
                {past.map((claim) => {
                  const st = STATUS_LABEL[claim.status] || { label: claim.status, class: '' };
                  return (
                    <div key={claim.id} className="card" style={{ padding: '0.875rem', marginBottom: '0.5rem', opacity: 0.75 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>{claim.deal_title || 'Food Deal'}</div>
                          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{claim.vendor_name}</div>
                        </div>
                        <span className={`status-pill ${st.class}`}>{st.label}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      <BottomNav role="consumer" />
    </div>
  );
}
