/* Analytics.jsx — Vendor impact metrics & food rescue statistics */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api';
import { BottomNav } from '../../components/BottomNav';

const METRICS = [
  { key: 'food_saved_kg',      label: 'Food Saved',       unit: 'kg',  icon: '🌿', color: 'var(--color-brand)',    max: 100 },
  { key: 'revenue_recovered',  label: 'Revenue Recovered', unit: '₹',   icon: '💰', color: '#fbbf24',              max: null },
  { key: 'total_claims',       label: 'Total Pickups',    unit: '',    icon: '✅', color: '#6ee7b7',              max: null },
  { key: 'claim_rate',         label: 'Claim Rate',       unit: '%',   icon: '📊', color: 'var(--color-act-soon)', max: 100  },
];

export default function Analytics() {
  const navigate = useNavigate();
  const [stats, setStats]   = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const res = await api.get('/vendor/analytics');
        setStats(res.data);
      } catch (err) {
        console.error('Failed to load analytics', err);
        // Fallback mock data
        setStats({
          food_saved_kg: 42.5,
          revenue_recovered: 15400,
          total_claims: 86,
          claim_rate: 92,
        });
      } finally {
        setLoading(false);
      }
    };
    fetchAnalytics();
  }, []);

  const formatValue = (key, val) => {
    if (key === 'revenue_recovered') return `₹${Number(val).toLocaleString('en-IN')}`;
    if (key === 'food_saved_kg')     return `${val} kg`;
    if (key === 'claim_rate')        return `${val}%`;
    return String(val);
  };

  return (
    <div className="page animate-fade-in">
      <div className="app-bar">
        <span className="app-bar-title">Impact & Analytics</span>
      </div>

      <div className="container" style={{ paddingTop: '1.25rem', paddingBottom: '6rem' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '4rem' }}>
            <div className="loader" />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

            {/* Hero revenue card */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(0,229,160,0.14), rgba(0,180,130,0.06))',
              border: '1px solid var(--border-brand)',
              borderRadius: 'var(--radius-xl)',
              padding: '1.75rem',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                💰 Total Revenue Recovered
              </div>
              <div style={{ fontSize: '2.75rem', fontWeight: 800, color: 'var(--color-brand)', letterSpacing: '-0.03em' }}>
                ₹{Number(stats.revenue_recovered).toLocaleString('en-IN')}
              </div>
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginTop: 4 }}>
                from food that would have been wasted
              </div>
            </div>

            {/* 2x2 stat grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              {/* Food saved */}
              <div className="card" style={{ padding: '1.125rem' }}>
                <div style={{ fontSize: '1.5rem', marginBottom: 4 }}>🌿</div>
                <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 800, color: 'var(--color-brand)' }}>
                  {stats.food_saved_kg}
                </div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Food Saved (kg)
                </div>
                <div className="progress-bar" style={{ marginTop: '0.75rem' }}>
                  <div className="progress-fill" style={{ width: `${Math.min(100, (stats.food_saved_kg / 100) * 100)}%` }} />
                </div>
              </div>

              {/* Total pickups */}
              <div className="card" style={{ padding: '1.125rem' }}>
                <div style={{ fontSize: '1.5rem', marginBottom: 4 }}>✅</div>
                <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 800, color: '#6ee7b7' }}>
                  {stats.total_claims}
                </div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Total Pickups
                </div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginTop: 6 }}>
                  successful rescues
                </div>
              </div>
            </div>

            {/* Claim rate card */}
            <div className="card" style={{ padding: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 'var(--text-base)' }}>📊 Claim Rate</div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                    Percentage of posted deals that got picked up
                  </div>
                </div>
                <div style={{ fontSize: 'var(--text-3xl)', fontWeight: 800, color: 'var(--color-act-soon)' }}>
                  {stats.claim_rate}%
                </div>
              </div>
              <div className="progress-bar" style={{ height: 10 }}>
                <div
                  className={`progress-fill ${stats.claim_rate < 50 ? 'urgent' : stats.claim_rate < 70 ? 'warning' : ''}`}
                  style={{ width: `${stats.claim_rate}%`, transition: 'width 1s ease' }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                <span>0%</span>
                <span style={{ color: stats.claim_rate >= 80 ? 'var(--color-brand)' : 'var(--text-muted)' }}>
                  {stats.claim_rate >= 80 ? '🏆 Excellent!' : stats.claim_rate >= 60 ? '👍 Good' : '💡 Improve pricing'}
                </span>
                <span>100%</span>
              </div>
            </div>

            {/* Impact equivalents */}
            <div className="card" style={{ padding: '1.25rem' }}>
              <div style={{ fontWeight: 700, marginBottom: '0.875rem' }}>🌍 Environmental Impact</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                {[
                  { icon: '🐄', label: 'CO₂ Prevented', value: `${(stats.food_saved_kg * 2.5).toFixed(1)} kg` },
                  { icon: '💧', label: 'Water Saved',    value: `${(stats.food_saved_kg * 1000).toLocaleString('en-IN')} L` },
                  { icon: '🥗', label: 'Meals Rescued',  value: `~${Math.round(stats.food_saved_kg * 2.5)} meals` },
                ].map(({ icon, label, value }) => (
                  <div key={label} className="info-row">
                    <span style={{ fontSize: '1.2rem', flexShrink: 0 }}>{icon}</span>
                    <span className="info-label">{label}</span>
                    <span className="info-value" style={{ color: 'var(--color-brand)' }}>{value}</span>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}
      </div>

      <BottomNav role="vendor" />
    </div>
  );
}
