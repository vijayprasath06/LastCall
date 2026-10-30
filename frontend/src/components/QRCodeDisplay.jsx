/* QRCodeDisplay.jsx — Fullscreen QR code for pickup verification */
import { QRCodeSVG } from 'qrcode.react';

export function QRCodeDisplay({ token, expiresAt }) {
  const isExpired = expiresAt && new Date(expiresAt) < new Date();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
      {isExpired ? (
        <div style={{
          width: 220, height: 220,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: 8,
          background: 'rgba(255,77,77,0.08)',
          border: '2px solid rgba(255,77,77,0.3)',
          borderRadius: 'var(--radius-lg)',
          color: 'var(--color-going-now)',
          textAlign: 'center',
          padding: '1rem',
        }}>
          <span style={{ fontSize: '3rem' }}>⏱️</span>
          <span style={{ fontWeight: 700 }}>QR Expired</span>
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
            Your pickup window has closed
          </span>
        </div>
      ) : (
        <div className="qr-container">
          <QRCodeSVG
            value={token}
            size={200}
            level="H"
            includeMargin={false}
          />
        </div>
      )}

      {!isExpired && (
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textAlign: 'center' }}>
          Show this QR code to the vendor at pickup
        </p>
      )}
    </div>
  );
}
