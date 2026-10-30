/* DealCard.jsx — Deal feed card with urgency badge, price, countdown */
import { useNavigate } from 'react-router-dom';
import { RUSMeter } from './RUSMeter';
import { CountdownTimer } from './CountdownTimer';

const DIETARY_EMOJI = { veg: '🌿', vegan: '🌱', dairy: '🥛', contains_gluten: '🌾' };

const FOOD_EMOJI = {
  biryani: '🍛', pizza: '🍕', burger: '🍔', sandwich: '🥪',
  idli: '🫓', dosa: '🥞', samosa: '🫔', cake: '🎂',
  curry: '🍲', rice: '🍚', default: '🍱',
};

function getFoodEmoji(title = '') {
  const t = title.toLowerCase();
  for (const [key, emoji] of Object.entries(FOOD_EMOJI)) {
    if (t.includes(key)) return emoji;
  }
  return FOOD_EMOJI.default;
}

function formatDistance(m) {
  if (!m && m !== 0) return '';
  if (m < 1000) return `${Math.round(m)}m away`;
  return `${(m / 1000).toFixed(1)}km away`;
}

function discountPct(original, current) {
  if (!original || !current) return 0;
  return Math.round((1 - current / original) * 100);
}

export function DealCard({ deal }) {
  const navigate = useNavigate();
  const discount = discountPct(deal.original_price, deal.current_price);
  const remaining = deal.items_remaining ?? (deal.total_quantity - deal.claimed_quantity);
  const totalQty = deal.total_quantity || 1;
  const claimedPct = Math.min(100, Math.round(((totalQty - remaining) / totalQty) * 100));

  const urgencyClass = deal.urgency_label === 'GOING_NOW'
    ? 'badge-going-now'
    : deal.urgency_label === 'ACT_SOON'
      ? 'badge-act-soon'
      : 'badge-comfortable';

  const borderGlow = deal.urgency_label === 'GOING_NOW'
    ? 'rgba(255,77,77,0.30)'
    : deal.urgency_label === 'ACT_SOON'
      ? 'rgba(255,170,0,0.20)'
      : undefined;

  return (
    <div
      className="card animate-fade-in"
      onClick={() => navigate(`/deal/${deal.id}`)}
      style={{
        padding: '0.875rem 1rem',
        cursor: 'pointer',
        display: 'flex',
        gap: '0.875rem',
        borderColor: borderGlow,
        transition: 'transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease',
        position: 'relative',
        overflow: 'hidden',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 8px 32px rgba(0,0,0,0.4)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}
      onTouchStart={(e) => { e.currentTarget.style.transform = 'scale(0.985)'; }}
      onTouchEnd={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
    >
      {/* Urgency glow strip */}
      {deal.urgency_label === 'GOING_NOW' && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 2,
          background: 'linear-gradient(90deg, transparent, #ff4d4d, transparent)',
          opacity: 0.8,
        }} />
      )}

      {/* Food image / emoji placeholder */}
      {deal.image_url ? (
        <img
          src={deal.image_url}
          alt={deal.title}
          style={{
            width: 84, height: 84, borderRadius: 10,
            objectFit: 'cover', flexShrink: 0,
            border: '1px solid var(--border-subtle)',
          }}
        />
      ) : (
        <div style={{
          width: 84, height: 84, borderRadius: 10, flexShrink: 0,
          background: 'linear-gradient(135deg, rgba(0,229,160,0.08), rgba(0,229,160,0.03))',
          border: '1px solid var(--border-subtle)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '2.2rem',
        }}>
          {getFoodEmoji(deal.title)}
        </div>
      )}

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {/* Vendor + distance */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 500 }}>
            {deal.vendor_name}
          </span>
          {deal.distance_meters != null && (
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 2 }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" style={{ opacity: 0.7 }}>
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
              </svg>
              {formatDistance(deal.distance_meters)}
            </span>
          )}
        </div>

        {/* Title */}
        <h3 style={{
          fontSize: 'var(--text-base)', fontWeight: 700,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          color: 'var(--text-primary)',
        }}>
          {deal.title}
        </h3>

        {/* Dietary tags */}
        {deal.dietary_tags?.length > 0 && (
          <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
            {deal.dietary_tags.slice(0, 3).map((tag) => (
              <span key={tag} className={`tag tag-${tag.replace('contains_', '')}`} style={{ fontSize: '0.65rem', padding: '1px 7px' }}>
                {DIETARY_EMOJI[tag] || ''} {tag}
              </span>
            ))}
          </div>
        )}

        {/* Price row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
          <span className="price" style={{ fontSize: 'var(--text-xl)' }}>
            ₹{Number(deal.current_price).toFixed(0)}
          </span>
          <span className="price-original">₹{Number(deal.original_price).toFixed(0)}</span>
          {discount > 0 && <span className="price-discount">{discount}% off</span>}
        </div>

        {/* Quantity progress */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div className="progress-bar" style={{ flex: 1 }}>
            <div
              className={`progress-fill ${claimedPct > 75 ? 'urgent' : claimedPct > 40 ? 'warning' : ''}`}
              style={{ width: `${claimedPct}%` }}
            />
          </div>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', flexShrink: 0 }}>
            {remaining} left
          </span>
        </div>
      </div>

      {/* Right: RUS meter + countdown */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flexShrink: 0, justifyContent: 'center' }}>
        <RUSMeter urgencyLabel={deal.urgency_label} size={60} />
        <CountdownTimer expiresAt={deal.expires_at} />
      </div>
    </div>
  );
}
