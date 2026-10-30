/* QRScanner.jsx — Camera-based QR scanner for vendor pickup verification */
import React, { useEffect, useState } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { useNavigate } from 'react-router-dom';
import api from '../../api';
import { BottomNav } from '../../components/BottomNav';

export default function QRScanner() {
  const navigate = useNavigate();
  const [scanResult, setScanResult] = useState(null);
  const [error, setError]           = useState(null);
  const [loading, setLoading]       = useState(false);

  useEffect(() => {
    let scanner = new Html5QrcodeScanner(
      'qr-reader',
      { fps: 10, qrbox: { width: 250, height: 250 } },
      false,
    );

    scanner.render(
      (decodedText) => {
        scanner.clear();
        handleVerification(decodedText);
      },
      () => { /* ignore scan errors */ },
    );

    return () => { scanner.clear().catch(() => {}); };
  }, []);

  const handleVerification = async (qrToken) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.post('/vendor/verify-pickup', { token: qrToken });
      setScanResult(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid or Expired QR Code');
    } finally {
      setLoading(false);
    }
  };

  const handleScanAgain = () => {
    setScanResult(null);
    setError(null);
    window.location.reload();
  };

  return (
    <div className="page animate-fade-in">
      <div className="app-bar">
        <button className="app-bar-action" onClick={() => navigate('/vendor/dashboard')}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
        </button>
        <span className="app-bar-title">Scan Pickup QR</span>
        <div style={{ width: 40 }} />
      </div>

      <div className="container" style={{ paddingTop: '1.5rem', paddingBottom: '6rem' }}>

        {/* Instructions */}
        {!scanResult && !loading && !error && (
          <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
            <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>📷</div>
            <h2 style={{ fontSize: 'var(--text-xl)', marginBottom: 4 }}>Scan Customer QR</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
              Point your camera at the customer's QR code to verify their pickup
            </p>
          </div>
        )}

        {/* Scanner frame */}
        {!scanResult && !loading && (
          <div className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
            <div id="qr-reader" style={{ width: '100%', maxWidth: 400, margin: '0 auto' }} />
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', padding: '2rem' }}>
            <div className="loader" />
            <p style={{ color: 'var(--text-secondary)' }}>Verifying QR code…</p>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="card animate-scale-in" style={{
            padding: '2rem', textAlign: 'center',
            background: 'rgba(255,77,77,0.06)', borderColor: 'rgba(255,77,77,0.3)',
          }}>
            <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>❌</div>
            <h2 style={{ color: 'var(--color-going-now)', marginBottom: 8 }}>Verification Failed</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1.25rem', fontSize: 'var(--text-sm)' }}>{error}</p>
            <button className="btn btn-primary btn-full" onClick={handleScanAgain}>
              Try Again
            </button>
          </div>
        )}

        {/* Success state */}
        {scanResult && (
          <div className="card animate-scale-in" style={{
            padding: '2rem', textAlign: 'center',
            background: 'rgba(0,229,160,0.06)', borderColor: 'var(--border-brand)',
          }}>
            <div style={{ fontSize: '3.5rem', marginBottom: '0.75rem' }}>✅</div>
            <h2 style={{ color: 'var(--color-brand)', marginBottom: 8 }}>Pickup Confirmed!</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem', fontSize: 'var(--text-sm)' }}>
              Claim <strong>#{scanResult.claim_id?.substring(0, 8)}</strong> has been marked as picked up.
            </p>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
              Customer's reliability score has been updated.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleScanAgain}>
                Scan Next
              </button>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => navigate('/vendor/dashboard')}>
                Dashboard
              </button>
            </div>
          </div>
        )}
      </div>

      <BottomNav role="vendor" />
    </div>
  );
}
