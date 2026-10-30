/* Profile.jsx — Consumer settings, Go Offline toggle, reliability score */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api';
import { BottomNav } from '../components/BottomNav';

export function Profile() {
  const { user, logout, refreshUser } = useAuth();
  const navigate = useNavigate();

  const [goingOffline, setGoingOffline] = useState(false);
  const [erasing, setErasing]           = useState(false);
  const [confirmErase, setConfirmErase] = useState(false);
  const [offlineMsg, setOfflineMsg]     = useState(null);

  const handleGoOffline = async () => {
    setGoingOffline(true);
    setOfflineMsg(null);
    try {
      await api.post('/users/go-offline');
      localStorage.removeItem('egpp_location_consent');
      setOfflineMsg('You are now offline. Location cleared, notifications paused.');
      refreshUser();
    } catch (err) {
      setOfflineMsg(err.response?.data?.error || 'Failed to go offline');
    } finally {
      setGoingOffline(false);
    }
  };

  const handleEraseData = async () => {
    setErasing(true);
    try {
      await api.delete('/users/me/data');
      localStorage.clear();
      navigate('/auth');
    } catch (err) {
      alert(err.response?.data?.error || 'Erase failed');
      setErasing(false);
      setConfirmErase(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/auth');
  };

  const score = user?.reliability_score ?? 1.0;
  const scoreColor = score >= 0.8 ? 'var(--color-brand)' : score >= 0.5 ? 'var(--color-act-soon)' : 'var(--color-going-now)';

  return (
    <div className="page animate-fade-in">
      <div className="app-bar">
        <span className="app-bar-title">Profile</span>
      </div>

      <div className="container" style={{ paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

        {/* User card */}
        <div className="card" style={{ padding: '1.25rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <div style={{
            width: 60, height: 60, borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--color-brand), var(--color-brand-dim))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.5rem', fontWeight: 800, color: '#000',
            flexShrink: 0,
          }}>
            {(user?.name || 'U')[0].toUpperCase()}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 'var(--text-lg)' }}>{user?.name}</div>
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
              {user?.email || user?.phone}
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textTransform: 'capitalize', marginTop: 2 }}>
              {user?.role}
            </div>
          </div>
        </div>

        {/* Reliability score (consumer only) */}
        {user?.role === 'consumer' && (
          <div className="card" style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <span style={{ fontWeight: 700 }}>Reliability Score</span>
              <span style={{ fontSize: 'var(--text-xl)', fontWeight: 800, color: scoreColor }}>
                {(score * 100).toFixed(0)}%
              </span>
            </div>
            <div style={{ height: 6, background: 'var(--border-subtle)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${(score * 100).toFixed(0)}%`,
                background: scoreColor,
                borderRadius: 'var(--radius-full)',
                transition: 'width 0.5s ease',
              }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.75rem' }} className="grid-2">
              <div className="stat-card">
                <span className="stat-value">{user?.total_claims ?? 0}</span>
                <span className="stat-label">Total Claims</span>
              </div>
              <div className="stat-card">
                <span className="stat-value">{user?.successful_pickups ?? 0}</span>
                <span className="stat-label">Picked Up</span>
              </div>
            </div>
            {user?.is_flagged && (
              <div style={{ marginTop: '0.75rem', background: 'rgba(255,77,77,0.08)', border: '1px solid rgba(255,77,77,0.25)', borderRadius: 'var(--radius-md)', padding: '0.6rem', fontSize: 'var(--text-xs)', color: 'var(--color-going-now)' }}>
                ⚠ Account flagged for {user.no_show_count} no-shows. Contact support.
              </div>
            )}
          </div>
        )}

        {/* Privacy controls */}
        <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <span style={{ fontWeight: 700, fontSize: 'var(--text-sm)', textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)' }}>
            Privacy Controls
          </span>

          {/* Go Offline */}
          <div>
            <button
              className="btn btn-danger btn-full"
              onClick={handleGoOffline}
              disabled={goingOffline}
            >
              {goingOffline ? <span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /> : '🛑'} Go Offline
            </button>
            {offlineMsg && (
              <p style={{ fontSize: 'var(--text-xs)', marginTop: '0.5rem', color: 'var(--color-brand)', textAlign: 'center' }}>
                {offlineMsg}
              </p>
            )}
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: '0.4rem', textAlign: 'center' }}>
              Immediately clears your location and stops all notifications (DPDP Act 2023)
            </p>
          </div>

          <div className="divider" />

          {/* Right to erasure */}
          {!confirmErase ? (
            <button
              className="btn btn-ghost btn-full"
              onClick={() => setConfirmErase(true)}
              style={{ color: 'var(--color-going-now)', borderColor: 'rgba(255,77,77,0.25)', fontSize: 'var(--text-sm)' }}
            >
              🗑️ Delete My Data & Account
            </button>
          ) : (
            <div style={{ background: 'rgba(255,77,77,0.06)', border: '1px solid rgba(255,77,77,0.2)', borderRadius: 'var(--radius-lg)', padding: '1rem' }}>
              <p style={{ fontWeight: 700, marginBottom: '0.4rem', fontSize: 'var(--text-sm)' }}>This is irreversible</p>
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                Your personal data will be erased. Claims older than 30 days are anonymized for dispute resolution.
              </p>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-danger btn-sm" style={{ flex: 1 }} onClick={handleEraseData} disabled={erasing}>
                  {erasing ? <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> : 'Yes, erase all'}
                </button>
                <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={() => setConfirmErase(false)} disabled={erasing}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Sign out */}
        <button className="btn btn-ghost btn-full" onClick={handleLogout} style={{ marginBottom: '1rem' }}>
          Sign Out
        </button>

      </div>

      <BottomNav role={user?.role === 'vendor' ? 'vendor' : 'consumer'} />
    </div>
  );
}
