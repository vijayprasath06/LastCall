/* DealDetail.jsx — Deal view with live countdown, Dutch Auction tracker, Claim button */
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api';
import { RUSMeter } from '../components/RUSMeter';
import { CountdownTimer } from '../components/CountdownTimer';
import { useSSE } from '../hooks/useSSE';
import { BottomNav } from '../components/BottomNav';

const DIETARY_EMOJI = { veg: '🌿', vegan: '🌱', dairy: '🥛', contains_gluten: '🌾' };

export function DealDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [deal, setDeal]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [claimResult, setClaimResult] = useState(null);
  const [error, setError]     = useState(null);

  const fetchDeal = useCallback(async () => {
    try {
      const { data } = await api.get(`/deals/${id}`);
      setDeal(data.deal);
    } catch (err) {
      setError(err.response?.data?.error || 'Deal not found');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchDeal(); }, [fetchDeal]);

  // Live SSE updates
  const handleSSE = useCallback((data) => {
    if (data.deal_id === id || data.id === id) {
      setDeal((prev) => prev ? { ...prev, ...data } : prev);
    }
  }, [id]);
  useSSE(['deal:price_drop', 'deal:urgency_update', 'deal:claimed', 'deal:released'], handleSSE);

  const handleClaim = async () => {
    setClaiming(true);
    setError(null);
    try {
      const { data } = await api.post(`/deals/${id}/claim`);
      setClaimResult(data);
      setDeal((prev) => prev ? {
        ...prev,
        claimed_quantity: (prev.claimed_quantity || 0) + 1,
        status: data.claim.deal_new_status || prev.status,
      } : prev);
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.code || 'Claim failed');
    } finally {
      setClaiming(false);
    }
  };

  if (loading) {
    return (
      <div className="detail-page">
        <div className="app-bar">
          <button className="app-bar-action" onClick={() => navigate(-1)}>←</button>
          <span className="app-bar-title">Deal Details</span>
        </div>
        <div className="container" style={{ paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {[160, 100, 80].map((h, i) => <div key={i} className="skeleton" style={{ height: h, borderRadius: 'var(--radius-lg)' }} />)}
        </div>
      </div>
    );
  }

  if (error && !deal) {
    return (
      <div className="detail-page">
        <div className="app-bar">
          <button className="app-bar-action" onClick={() => navigate(-1)}>←</button>
          <span className="app-bar-title">Deal Details</span>
        </div>
        <div className="empty-state">
          <div className="empty-icon">❌</div>
          <div className="empty-title">{error}</div>
          <button className="btn btn-ghost" onClick={() => navigate('/')}>Back to Feed</button>
        </div>
      </div>
    );
  }

  const remaining = deal.total_quantity - deal.claimed_quantity;
  const discount  = Math.round((1 - deal.current_price / deal.original_price) * 100);
  const isClaimed = deal.status === 'CLAIMED' || remaining === 0;
  const isExpired = deal.status === 'EXPIRED';
  const isNGO     = deal.status === 'NGO_HANDOFF';

  return (
    <div className="detail-page animate-fade-in">
      {/* App bar */}
      <div className="app-bar">
        <button className="app-bar-action" onClick={() => navigate(-1)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
        </button>
        <span className="app-bar-title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {deal.title}
        </span>
        <div style={{ width: 40 }} /> {/* spacer */}
      </div>

      <div className="container" style={{ paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

        {/* Hero image */}
        {deal.image_url && (
          <img
            src={deal.image_url}
            alt={deal.title}
            style={{ width: '100%', height: 200, objectFit: 'cover', borderRadius: 'var(--radius-lg)' }}
          />
        )}

        {/* Urgency + Countdown hero */}
        <div className="card" style={{
          padding: '1.25rem',
          display: 'flex', alignItems: 'center', gap: '1rem',
          borderColor: deal.urgency_label === 'GOING_NOW' ? 'rgba(255,77,77,0.3)' : undefined,
          background: deal.urgency_label === 'GOING_NOW'
            ? 'linear-gradient(135deg, rgba(255,77,77,0.06), rgba(8,12,17,0))'
            : undefined,
        }}>
          <RUSMeter urgencyLabel={deal.urgency_label} size={80} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 2 }}>
              Closes in
            </div>
            <CountdownTimer expiresAt={deal.expires_at} className="" />
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginTop: 4 }}>
              {remaining} of {deal.total_quantity} slots remaining
            </div>
          </div>
        </div>

        {/* Price card — Dutch Auction */}
        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 6, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Dutch Auction Price
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', flexWrap: 'wrap' }}>
            <span className="price">₹{Number(deal.current_price).toFixed(0)}</span>
            <span className="price-original">₹{Number(deal.original_price).toFixed(0)}</span>
            {discount > 0 && <span className="price-discount">{discount}% OFF</span>}
          </div>
          <div style={{ marginTop: 8, display: 'flex', gap: '1rem' }}>
            <div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Start Price</div>
              <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>₹{Number(deal.start_price).toFixed(0)}</div>
            </div>
            <div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Floor Price</div>
              <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--color-going-now)' }}>₹{Number(deal.min_rescue_price).toFixed(0)}</div>
            </div>
          </div>
        </div>

        {/* Vendor info */}
        <div className="card" style={{ padding: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontWeight: 700 }}>{deal.vendor_name}</div>
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>{deal.vendor_type}</div>
            </div>
            {deal.distance_meters != null && (
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
                📍 {deal.distance_meters < 1000 ? `${Math.round(deal.distance_meters)}m` : `${(deal.distance_meters / 1000).toFixed(1)}km`}
              </span>
            )}
          </div>
        </div>

        {/* Items */}
        {deal.items?.length > 0 && (
          <div className="card" style={{ padding: '1rem' }}>
            <div className="section-header">
              <span className="section-title">What You Get</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {deal.items.map((item, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)' }}>
                  <span style={{ color: 'var(--text-primary)' }}>{item.name}</span>
                  <span style={{ color: 'var(--text-muted)' }}>{item.quantity}{item.unit ? ` ${item.unit}` : ''}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Dietary tags */}
        {deal.dietary_tags?.length > 0 && (
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            {deal.dietary_tags.map((tag) => (
              <span key={tag} className={`tag tag-${tag.replace('contains_', '')}`}>
                {DIETARY_EMOJI[tag] || ''} {tag}
              </span>
            ))}
          </div>
        )}

        {/* Description */}
        {deal.description && (
          <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>{deal.description}</p>
        )}

        {/* Status banners */}
        {isClaimed && !claimResult && (
          <div style={{ textAlign: 'center', padding: '1rem', background: 'rgba(255,170,0,0.08)', border: '1px solid rgba(255,170,0,0.25)', borderRadius: 'var(--radius-lg)', color: 'var(--color-act-soon)' }}>
            ⚡ All slots claimed
          </div>
        )}
        {isExpired && (
          <div style={{ textAlign: 'center', padding: '1rem', background: 'rgba(255,77,77,0.08)', border: '1px solid rgba(255,77,77,0.2)', borderRadius: 'var(--radius-lg)', color: 'var(--color-going-now)' }}>
            ⏱️ This deal has expired
          </div>
        )}
        {isNGO && (
          <div style={{ textAlign: 'center', padding: '1rem', background: 'rgba(0,229,160,0.06)', border: '1px solid var(--border-brand)', borderRadius: 'var(--radius-lg)', color: 'var(--color-brand)' }}>
            🤝 Handed off to NGO partner
          </div>
        )}

        {/* Claim result */}
        {claimResult && (
          <div className="card animate-scale-in" style={{
            padding: '1.25rem', textAlign: 'center',
            background: 'rgba(0,229,160,0.08)', borderColor: 'var(--border-brand)',
          }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>✅</div>
            <div style={{ fontWeight: 800, fontSize: 'var(--text-xl)', color: 'var(--color-brand)', marginBottom: 4 }}>
              Claimed!
            </div>
            <p style={{ fontSize: 'var(--text-sm)', marginBottom: '1rem' }}>
              Your QR code is ready. Pick up before{' '}
              <strong>{new Date(claimResult.claim.qr_expires_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong>
            </p>
            <button className="btn btn-primary btn-full" onClick={() => navigate('/my-claims')}>
              View My QR Code
            </button>
          </div>
        )}

        {/* Claim button */}
        {!claimResult && !isClaimed && !isExpired && !isNGO && (
          <div style={{ paddingBottom: '1rem' }}>
            {error && (
              <div style={{ background: 'rgba(255,77,77,0.08)', border: '1px solid rgba(255,77,77,0.25)', borderRadius: 'var(--radius-md)', padding: '0.75rem', marginBottom: '0.75rem', color: 'var(--color-going-now)', fontSize: 'var(--text-sm)' }}>
                {error}
              </div>
            )}
            <button
              className="btn btn-primary btn-full btn-lg"
              onClick={handleClaim}
              disabled={claiming}
              style={{ fontSize: 'var(--text-lg)' }}
            >
              {claiming
                ? <><span className="spinner" style={{ borderTopColor: '#000' }} /> Claiming…</>
                : `⚡ Claim for ₹${Number(deal.current_price).toFixed(0)}`}
            </button>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textAlign: 'center', marginTop: '0.5rem' }}>
              You can cancel at any time with zero penalty
            </p>
          </div>
        )}

      </div>
      <BottomNav role="consumer" />
    </div>
  );
}
