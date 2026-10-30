/* CancelClaimButton.jsx — Voluntary claim cancellation with confirmation */
import { useState } from 'react';
import api from '../api';

export function CancelClaimButton({ claimId, dealId, onCancelled }) {
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);

  const handleCancel = async () => {
    setLoading(true);
    setError(null);
    try {
      await api.delete(`/claims/${claimId}`);
      setConfirming(false);
      onCancelled?.();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to cancel claim');
    } finally {
      setLoading(false);
    }
  };

  if (confirming) {
    return (
      <div style={{
        background: 'rgba(255,77,77,0.08)',
        border: '1px solid rgba(255,77,77,0.25)',
        borderRadius: 'var(--radius-lg)',
        padding: '1rem',
        display: 'flex', flexDirection: 'column', gap: '0.75rem',
      }}>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)', fontWeight: 600 }}>
          Cancel this claim?
        </p>
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
          Your reliability score will <strong style={{ color: 'var(--color-brand)' }}>not</strong> be affected.
          The slot will be released for others.
        </p>
        {error && <p className="form-error">{error}</p>}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-danger btn-sm" style={{ flex: 1 }} onClick={handleCancel} disabled={loading}>
            {loading ? <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> : 'Yes, cancel'}
          </button>
          <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={() => setConfirming(false)} disabled={loading}>
            Keep claim
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      className="btn btn-ghost btn-sm"
      onClick={() => setConfirming(true)}
      style={{ color: 'var(--color-going-now)', borderColor: 'rgba(255,77,77,0.25)' }}
    >
      Cancel claim
    </button>
  );
}
