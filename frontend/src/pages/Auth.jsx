/* Auth.jsx — Login / Register with role toggle and live DOB age gate */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const MIN_AGE = 13;

function ageIsValid(dob) {
  if (!dob) return false;
  const birth = new Date(dob);
  const now = new Date();
  const age = now.getFullYear() - birth.getFullYear()
    - (now < new Date(now.getFullYear(), birth.getMonth(), birth.getDate()) ? 1 : 0);
  return age >= MIN_AGE;
}

const BUSINESS_TYPES = [
  { value: 'restaurant', label: '🍽️ Restaurant' },
  { value: 'bakery',     label: '🥐 Bakery' },
  { value: 'cafe',       label: '☕ Café' },
  { value: 'hotel',      label: '🏨 Hotel' },
  { value: 'cloud_kitchen', label: '🍳 Cloud Kitchen' },
  { value: 'street_food',   label: '🛒 Street Food' },
  { value: 'catering',      label: '🎪 Catering' },
];

export function Auth() {
  const navigate = useNavigate();
  const { login, register } = useAuth();

  const [tab, setTab]         = useState('login');
  const [role, setRole]       = useState('consumer');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [success, setSuccess] = useState(null);

  const [form, setForm] = useState({
    name: '', email: '', phone: '', password: '',
    dob: '', identifier: '',
    businessName: '', businessType: 'restaurant',
    address: '', city: 'Chennai',
  });

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (tab === 'register') {
      if (!ageIsValid(form.dob)) {
        setError('You must be at least 13 years old to register (DPDP Act 2023)');
        return;
      }
      if (!form.email && !form.phone) {
        setError('Provide at least one of: email or phone number');
        return;
      }
    }

    setLoading(true);
    try {
      if (tab === 'login') {
        const user = await login(form.identifier, form.password);
        redirectAfterAuth(user);
      } else {
        const payload = {
          name: form.name,
          email: form.email || undefined,
          phone: form.phone || undefined,
          password: form.password,
          date_of_birth: form.dob,
          role,
          data_processing_consent: true,
        };
        if (role === 'vendor') {
          payload.business_name = form.businessName;
          payload.business_type = form.businessType;
          payload.address = form.address;
          payload.city = form.city;
        }
        const user = await register(payload);
        if (user?.role === 'vendor') {
          setSuccess('Vendor account created! An admin will verify your profile. Please log in after approval.');
          setTab('login');
          setForm((f) => ({ ...f, name: '', password: '' }));
        } else {
          redirectAfterAuth(user);
        }
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const redirectAfterAuth = (user) => {
    if (user.role === 'vendor') navigate('/vendor/dashboard');
    else if (user.role === 'admin') navigate('/admin');
    else navigate('/');
  };

  const dobOk  = ageIsValid(form.dob);
  const dobBad = form.dob && !dobOk;

  return (
    <div className="auth-page">
      <div style={{ width: '100%', maxWidth: 420 }} className="animate-fade-in">

        {/* Logo hero */}
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <div style={{
            width: 72, height: 72, borderRadius: 20, margin: '0 auto 1rem',
            background: 'linear-gradient(135deg, rgba(0,229,160,0.2), rgba(0,180,130,0.1))',
            border: '1px solid var(--border-brand)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '2.2rem',
            boxShadow: '0 0 32px rgba(0,229,160,0.2)',
          }}>
            ♻️
          </div>
          <h1 style={{
            background: 'linear-gradient(135deg, #00e5a0, #00b37e)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            fontSize: 'var(--text-3xl)', marginBottom: '0.25rem',
          }}>
            FoodRescue
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
            Zero-Waste Food Rescue · EGPP Protocol
          </p>
        </div>

        {/* Tab switch */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr',
          background: 'var(--bg-card)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-lg)',
          padding: 4, marginBottom: '1.25rem',
        }}>
          {[
            { id: 'login', label: 'Sign In' },
            { id: 'register', label: 'Register' },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setError(null); setSuccess(null); }}
              style={{
                border: 'none', cursor: 'pointer',
                padding: '0.65rem',
                borderRadius: 'var(--radius-md)',
                fontFamily: 'var(--font-sans)',
                fontWeight: 600, fontSize: 'var(--text-sm)',
                transition: 'all var(--transition-base)',
                background: tab === t.id
                  ? 'linear-gradient(135deg, var(--color-brand), var(--color-brand-dim))'
                  : 'transparent',
                color: tab === t.id ? '#000' : 'var(--text-secondary)',
                boxShadow: tab === t.id ? '0 0 12px rgba(0,229,160,0.25)' : 'none',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Register — role toggle */}
        {tab === 'register' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '1rem' }}>
            {[
              { val: 'consumer', emoji: '🛒', label: 'Consumer', sub: 'Rescue surplus food' },
              { val: 'vendor',   emoji: '🍴', label: 'Vendor',   sub: 'List your surplus' },
            ].map(({ val, emoji, label, sub }) => (
              <button
                key={val}
                onClick={() => setRole(val)}
                style={{
                  background: role === val ? 'rgba(0,229,160,0.10)' : 'var(--bg-card)',
                  border: `2px solid ${role === val ? 'var(--color-brand)' : 'var(--border-subtle)'}`,
                  borderRadius: 'var(--radius-md)',
                  padding: '0.875rem 0.5rem',
                  cursor: 'pointer',
                  textAlign: 'center',
                  transition: 'all var(--transition-fast)',
                  boxShadow: role === val ? '0 0 16px rgba(0,229,160,0.15)' : 'none',
                }}
              >
                <div style={{ fontSize: '1.5rem', marginBottom: 4 }}>{emoji}</div>
                <div style={{ fontWeight: 700, fontSize: 'var(--text-sm)', color: role === val ? 'var(--color-brand)' : 'var(--text-primary)' }}>
                  {label}
                </div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>
              </button>
            ))}
          </div>
        )}

        {/* Success banner */}
        {success && (
          <div style={{
            background: 'rgba(0,229,160,0.10)', border: '1px solid rgba(0,229,160,0.35)',
            borderRadius: 'var(--radius-md)', padding: '0.875rem',
            color: 'var(--color-brand)', fontSize: 'var(--text-sm)',
            marginBottom: '1rem', display: 'flex', gap: '0.5rem', alignItems: 'flex-start',
          }}>
            <span style={{ flexShrink: 0, fontSize: '1.1rem' }}>✅</span>
            <span>{success}</span>
          </div>
        )}

        {/* Form card */}
        <form onSubmit={handleSubmit} className="card" style={{ padding: '1.5rem' }}>
          <div className="form">

            {tab === 'login' ? (
              <>
                <div className="input-group">
                  <label className="input-label">Email or Phone</label>
                  <input
                    className="input" type="text" required
                    placeholder="email@example.com or 9xxxxxxxxx"
                    value={form.identifier}
                    onChange={(e) => set('identifier', e.target.value)}
                    autoComplete="username"
                  />
                </div>
                <div className="input-group">
                  <label className="input-label">Password</label>
                  <input
                    className="input" type="password" required
                    placeholder="••••••••"
                    value={form.password}
                    onChange={(e) => set('password', e.target.value)}
                    autoComplete="current-password"
                  />
                </div>
              </>
            ) : (
              <>
                <div className="input-group">
                  <label className="input-label">Full Name</label>
                  <input className="input" type="text" required placeholder="Your name"
                    value={form.name} onChange={(e) => set('name', e.target.value)} />
                </div>

                <div className="form-row">
                  <div className="input-group">
                    <label className="input-label">Email</label>
                    <input className="input" type="email" placeholder="optional if phone given"
                      value={form.email} onChange={(e) => set('email', e.target.value)} />
                  </div>
                  <div className="input-group">
                    <label className="input-label">Phone</label>
                    <input className="input" type="tel" placeholder="optional if email given"
                      value={form.phone} onChange={(e) => set('phone', e.target.value)} />
                  </div>
                </div>

                {/* Age gate */}
                <div className="input-group">
                  <label className="input-label">Date of Birth <span style={{ color: 'var(--color-going-now)' }}>*</span></label>
                  <input className="input" type="date" required
                    value={form.dob}
                    max={new Date().toISOString().split('T')[0]}
                    onChange={(e) => set('dob', e.target.value)}
                    style={{ borderColor: dobBad ? 'var(--color-going-now)' : undefined }}
                  />
                  {dobBad && (
                    <span className="form-error">⚠ Must be at least 13 years old (DPDP Act 2023)</span>
                  )}
                  {dobOk && (
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-brand)' }}>✓ Age verified</span>
                  )}
                </div>

                {/* Vendor-only fields */}
                {role === 'vendor' && (
                  <>
                    <div className="divider-text" style={{ margin: '0.25rem 0' }}>Business Details</div>
                    <div className="input-group">
                      <label className="input-label">Business Name</label>
                      <input className="input" type="text" required
                        placeholder="e.g. Murugan Idli Shop"
                        value={form.businessName} onChange={(e) => set('businessName', e.target.value)} />
                    </div>
                    <div className="input-group">
                      <label className="input-label">Business Type</label>
                      <select className="input" value={form.businessType} onChange={(e) => set('businessType', e.target.value)}>
                        {BUSINESS_TYPES.map((bt) => (
                          <option key={bt.value} value={bt.value}>{bt.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="input-group">
                      <label className="input-label">Business Address</label>
                      <input className="input" type="text" required
                        placeholder="Full address for map pin"
                        value={form.address} onChange={(e) => set('address', e.target.value)} />
                    </div>
                    <div className="input-group">
                      <label className="input-label">City</label>
                      <input className="input" type="text" required
                        placeholder="Chennai"
                        value={form.city} onChange={(e) => set('city', e.target.value)} />
                    </div>
                  </>
                )}

                <div className="input-group">
                  <label className="input-label">Password</label>
                  <input className="input" type="password" required placeholder="Min 8 characters"
                    minLength={8} value={form.password} onChange={(e) => set('password', e.target.value)}
                    autoComplete="new-password" />
                </div>

                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  🔐 By registering you consent to data processing as per the DPDP Act 2023 and GDPR.
                </p>
              </>
            )}

            {/* Error banner */}
            {error && (
              <div style={{
                background: 'rgba(255,77,77,0.08)', border: '1px solid rgba(255,77,77,0.3)',
                borderRadius: 'var(--radius-md)', padding: '0.75rem',
                color: 'var(--color-going-now)', fontSize: 'var(--text-sm)',
                display: 'flex', gap: '0.5rem', alignItems: 'flex-start',
              }}>
                <span style={{ flexShrink: 0 }}>⚠</span>
                <span>{error}</span>
              </div>
            )}

            <button
              className="btn btn-primary btn-full btn-lg"
              type="submit"
              disabled={loading || (tab === 'register' && form.dob && !dobOk)}
              style={{ marginTop: 4 }}
            >
              {loading
                ? <span className="spinner" style={{ borderTopColor: '#000' }} />
                : tab === 'login'
                  ? 'Sign In →'
                  : `Create ${role === 'vendor' ? 'Vendor' : 'Consumer'} Account`}
            </button>
          </div>
        </form>

        <p style={{ textAlign: 'center', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: '1.25rem' }}>
          EGPP · Ephemeral Geospatial Push Protocol · v1.0
        </p>
      </div>
    </div>
  );
}
