/* FoodImageCapture.jsx — Native camera capture + preview + AI analysis */
import { useState, useRef } from 'react';
import api from '../api';

export function FoodImageCapture({ onResult }) {
  const [preview, setPreview]   = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const fileRef = useRef(null);

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreview({ url, file });
    setError(null);
  };

  const handleAnalyze = async () => {
    if (!preview) return;
    setLoading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('image', preview.file);
      form.append('minutes_until_close', '60');
      const { data } = await api.post('/ai/snap-to-post', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      onResult?.(data);
    } catch (err) {
      setError(err.response?.data?.error || 'AI analysis failed. Try again or fill manually.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

      {/* Camera button */}
      <div
        style={{
          border: `2px dashed ${preview ? 'var(--border-brand)' : 'var(--border-subtle)'}`,
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden',
          cursor: 'pointer',
          position: 'relative',
          minHeight: preview ? 'auto' : 140,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: preview ? 'transparent' : 'var(--bg-card)',
          transition: 'border-color var(--transition-fast)',
        }}
        onClick={() => fileRef.current?.click()}
      >
        {preview ? (
          <img
            src={preview.url}
            alt="Food preview"
            style={{ width: '100%', maxHeight: 220, objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <div style={{ textAlign: 'center', padding: '1.5rem' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>📸</div>
            <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>Snap Food Photo</div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 4 }}>
              AI will identify the dish and suggest prices
            </div>
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFile}
          style={{ display: 'none' }}
        />
      </div>

      {preview && (
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            className="btn btn-primary"
            style={{ flex: 1 }}
            onClick={handleAnalyze}
            disabled={loading}
          >
            {loading
              ? <><span className="spinner" style={{ borderTopColor: '#000', width: 18, height: 18, borderWidth: 2 }} /> Analyzing…</>
              : '🤖 Analyze with AI'}
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => { setPreview(null); setError(null); }}
          >
            Retake
          </button>
        </div>
      )}

      {error && <p className="form-error">{error}</p>}
    </div>
  );
}
