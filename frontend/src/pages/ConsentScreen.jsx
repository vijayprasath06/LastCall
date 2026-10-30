/* ConsentScreen.jsx — DPDP Act 2023 location consent modal */
import { useState } from 'react';
import api from '../api';

export function ConsentScreen({ onConsented }) {
  const [loading, setLoading] = useState(false);

  const handleConsent = async () => {
    setLoading(true);
    try {
      // Grant location consent in DB first
      await api.patch('/users/notifications', { notifications_enabled: true });

      // Then request GPS and send coordinates
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          try {
            await api.patch('/users/location', {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
            });
          } catch { /* non-fatal */ }
          localStorage.setItem('egpp_location_consent', '1');
          setLoading(false);
          onConsented();
        },
        () => {
          // User denied GPS — still mark consent as given in localStorage
          localStorage.setItem('egpp_location_consent', '1');
          setLoading(false);
          onConsented();
        }
      );
    } catch {
      localStorage.setItem('egpp_location_consent', '1');
      setLoading(false);
      onConsented();
    }
  };

  const handleDecline = () => {
    localStorage.setItem('egpp_location_consent', '0');
    onConsented(); // Let them in without location
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(ellipse at 50% 20%, rgba(0,229,160,0.12) 0%, transparent 65%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1.5rem',
    }}>
      <div className="card animate-scale-in" style={{ maxWidth: 400, width: '100%', padding: '2rem', textAlign: 'center' }}>
        <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>📍</div>

        <h1 style={{ fontSize: 'var(--text-2xl)', marginBottom: '0.5rem' }}>
          Enable Location
        </h1>
        <p style={{ marginBottom: '1.5rem', color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
          EGPP uses your real-time location to show food rescue deals within your walking distance.
        </p>

        {/* Privacy highlights */}
        <div style={{
          background: 'var(--bg-glass)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-lg)',
          padding: '1rem',
          marginBottom: '1.5rem',
          textAlign: 'left',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.6rem',
        }}>
          {[
            ['🔐', 'No location history stored'],
            ['⏱️', 'Only your current position is used'],
            ['🛑', '"Go Offline" removes you instantly'],
            ['🇮🇳', 'DPDP Act 2023 compliant'],
          ].map(([icon, text]) => (
            <div key={text} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>{icon}</span>
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>{text}</span>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <button className="btn btn-primary btn-full btn-lg" onClick={handleConsent} disabled={loading}>
            {loading ? <span className="spinner" style={{ borderTopColor: '#000' }} /> : '📍 Enable Location & Continue'}
          </button>
          <button className="btn btn-ghost btn-full" onClick={handleDecline} style={{ fontSize: 'var(--text-sm)' }}>
            Continue without location
          </button>
        </div>

        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: '1rem' }}>
          You can revoke access anytime from Profile → Go Offline
        </p>
      </div>
    </div>
  );
}
