/* PostDeal.jsx — Snap-to-Post: camera → AI → form auto-fill → publish */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api';
import { FoodImageCapture } from '../../components/FoodImageCapture';
import { BottomNav } from '../../components/BottomNav';

const DEFAULT_ITEMS = [{ name: '', quantity: 1, unit: 'serving' }];

export function PostDeal() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const [aiDone,  setAiDone]  = useState(false);

  const [form, setForm] = useState({
    title: '',
    description: '',
    items: DEFAULT_ITEMS,
    original_price: '',
    start_price: '',
    min_rescue_price: '',
    total_quantity: 1,
    expires_minutes: 60,
    dietary_tags: [],
    image_url: '',
  });

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // AI auto-fill callback
  const handleAIResult = (data) => {
    const p = data.pricing_suggestion || {};
    const cls = data.classification?.predictions?.[0] || {};
    setForm((f) => ({
      ...f,
      title:            cls.label || f.title,
      items:            [{ name: cls.label || '', quantity: 1, unit: 'serving' }],
      original_price:   p.original_price || f.original_price,
      start_price:      p.start_price    || f.start_price,
      min_rescue_price: p.min_rescue_price || f.min_rescue_price,
      dietary_tags:     data.classification?.dietary_tags || f.dietary_tags,
      image_url:        data.image_url || f.image_url,
    }));
    setAiDone(true);
  };

  const toggleTag = (tag) => {
    setForm((f) => ({
      ...f,
      dietary_tags: f.dietary_tags.includes(tag)
        ? f.dietary_tags.filter((t) => t !== tag)
        : [...f.dietary_tags, tag],
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const expiresAt = new Date(Date.now() + Number(form.expires_minutes) * 60000).toISOString();

    try {
      await api.post('/deals', {
        title:            form.title,
        description:      form.description,
        items:            form.items.filter((i) => i.name),
        original_price:   Number(form.original_price),
        start_price:      Number(form.start_price),
        min_rescue_price: Number(form.min_rescue_price),
        total_quantity:   Number(form.total_quantity),
        dietary_tags:     form.dietary_tags,
        expires_at:       expiresAt,
        image_url:        form.image_url || undefined,
      });
      navigate('/vendor/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to post deal');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page animate-fade-in">
      <div className="app-bar">
        <button className="app-bar-action" onClick={() => navigate(-1)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
        </button>
        <span className="app-bar-title">Post a Deal</span>
      </div>

      <div className="container" style={{ paddingTop: '1rem' }}>
        <form onSubmit={handleSubmit} className="form" style={{ paddingBottom: '2rem' }}>

          {/* Snap-to-Post */}
          <div className="card" style={{ padding: '1rem' }}>
            <div className="section-header" style={{ marginBottom: '0.75rem' }}>
              <span className="section-title">📸 Snap-to-Post</span>
              {aiDone && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-brand)' }}>✓ AI filled</span>}
            </div>
            <FoodImageCapture onResult={handleAIResult} />
          </div>

          {/* Deal info */}
          <div className="card" style={{ padding: '1rem' }}>
            <div className="form-section">
              <div className="input-group">
                <label className="input-label">Deal Title</label>
                <input className="input" required placeholder="e.g. Veg Biryani Box"
                  value={form.title} onChange={(e) => set('title', e.target.value)} />
              </div>
              <div className="input-group">
                <label className="input-label">Description (optional)</label>
                <textarea className="input" rows={2} placeholder="Freshly cooked, best before 10pm"
                  value={form.description} onChange={(e) => set('description', e.target.value)}
                  style={{ resize: 'none' }} />
              </div>

              {/* Items */}
              <div className="input-group">
                <div className="section-header" style={{ marginBottom: '0.25rem' }}>
                  <label className="input-label" style={{ margin: 0 }}>Items</label>
                  <button type="button" className="btn btn-ghost btn-sm"
                    onClick={() => set('items', [...form.items, { name: '', quantity: 1, unit: 'serving' }])}>
                    + Add
                  </button>
                </div>
                {form.items.map((item, i) => (
                  <div key={i} style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                    <input className="input" style={{ flex: 2 }} placeholder="Item name"
                      value={item.name}
                      onChange={(e) => {
                        const items = [...form.items];
                        items[i] = { ...items[i], name: e.target.value };
                        set('items', items);
                      }} />
                    <input className="input" style={{ flex: 1 }} type="number" min={1} placeholder="Qty"
                      value={item.quantity}
                      onChange={(e) => {
                        const items = [...form.items];
                        items[i] = { ...items[i], quantity: e.target.value };
                        set('items', items);
                      }} />
                    {form.items.length > 1 && (
                      <button type="button"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1.1rem', flexShrink: 0 }}
                        onClick={() => set('items', form.items.filter((_, j) => j !== i))}>
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Pricing */}
          <div className="card" style={{ padding: '1rem' }}>
            <div className="section-title" style={{ marginBottom: '0.75rem' }}>Dutch Auction Pricing</div>
            <div className="form-row">
              <div className="input-group">
                <label className="input-label">Original ₹</label>
                <input className="input" type="number" required min={1} placeholder="200"
                  value={form.original_price} onChange={(e) => set('original_price', e.target.value)} />
              </div>
              <div className="input-group">
                <label className="input-label">Start Price ₹</label>
                <input className="input" type="number" required min={1} placeholder="150"
                  value={form.start_price} onChange={(e) => set('start_price', e.target.value)} />
              </div>
              <div className="input-group">
                <label className="input-label">Floor Price ₹</label>
                <input className="input" type="number" required min={1} placeholder="50"
                  value={form.min_rescue_price} onChange={(e) => set('min_rescue_price', e.target.value)} />
                <span className="form-hint">Minimum rescue price</span>
              </div>
              <div className="input-group">
                <label className="input-label">Quantity</label>
                <input className="input" type="number" required min={1} max={50} placeholder="5"
                  value={form.total_quantity} onChange={(e) => set('total_quantity', e.target.value)} />
              </div>
            </div>

            <div className="input-group" style={{ marginTop: '0.75rem' }}>
              <label className="input-label">Expires In</label>
              <select className="input" value={form.expires_minutes} onChange={(e) => set('expires_minutes', e.target.value)}>
                <option value={30}>30 minutes</option>
                <option value={45}>45 minutes</option>
                <option value={60}>1 hour</option>
                <option value={90}>1.5 hours</option>
                <option value={120}>2 hours</option>
                <option value={180}>3 hours</option>
              </select>
            </div>
          </div>

          {/* Dietary tags */}
          <div className="card" style={{ padding: '1rem' }}>
            <div className="section-title" style={{ marginBottom: '0.75rem' }}>Dietary Tags</div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {['veg', 'vegan', 'dairy', 'contains_gluten'].map((tag) => (
                <button
                  key={tag} type="button"
                  className={`tag tag-${tag.replace('contains_', '')} btn`}
                  style={{
                    cursor: 'pointer',
                    opacity: form.dietary_tags.includes(tag) ? 1 : 0.45,
                    fontFamily: 'var(--font-sans)',
                    transition: 'opacity var(--transition-fast)',
                  }}
                  onClick={() => toggleTag(tag)}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div style={{ background: 'rgba(255,77,77,0.1)', border: '1px solid rgba(255,77,77,0.3)', borderRadius: 'var(--radius-md)', padding: '0.75rem', color: 'var(--color-going-now)', fontSize: 'var(--text-sm)' }}>
              {error}
            </div>
          )}

          <button className="btn btn-primary btn-full btn-lg" type="submit" disabled={loading}>
            {loading ? <span className="spinner" style={{ borderTopColor: '#000' }} /> : '🚀 Post Deal'}
          </button>
        </form>
      </div>
      <BottomNav role="vendor" />
    </div>
  );
}
