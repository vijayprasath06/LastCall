/* AdminDashboard.jsx — Admin oversight, vendor approval, NGO DPA allowlist */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [stats, setStats]               = useState(null);
  const [pendingVendors, setPendingVendors] = useState([]);
  const [ngos, setNgos]                 = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);
  const [newNgo, setNewNgo] = useState({
    name: '', webhook_url: '', contact_email: '', dpa_agreement_signed: false,
  });

  const fetchData = async () => {
    try {
      const [statsRes, vendorsRes, ngosRes] = await Promise.all([
        api.get('/admin/stats'),
        api.get('/admin/vendors/pending'),
        api.get('/admin/ngos'),
      ]);
      setStats(statsRes.data);
      setPendingVendors(vendorsRes.data.vendors || []);
      setNgos(ngosRes.data.ngos || []);
    } catch (err) {
      setError('Failed to load admin data. Ensure you have admin privileges.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleApproveVendor = async (id) => {
    try { await api.post(`/admin/vendors/${id}/approve`); fetchData(); }
    catch { alert('Failed to approve vendor'); }
  };

  const handleRejectVendor = async (id) => {
    try { await api.post(`/admin/vendors/${id}/reject`, { reason: 'Rejected by admin' }); fetchData(); }
    catch { alert('Failed to reject vendor'); }
  };

  const handleAddNgo = async (e) => {
    e.preventDefault();
    try {
      await api.post('/admin/ngos', newNgo);
      setNewNgo({ name: '', webhook_url: '', contact_email: '', dpa_agreement_signed: false });
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to add NGO');
    }
  };

  const handleToggleNgo = async (id, is_active, is_approved) => {
    try { await api.patch(`/admin/ngos/${id}`, { is_active, is_approved }); fetchData(); }
    catch { alert('Failed to update NGO'); }
  };

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-base)' }}>
      <div className="loader" />
    </div>
  );
  if (error) return (
    <div className="container" style={{ paddingTop: '2rem', color: 'var(--color-going-now)' }}>
      <div className="empty-state">
        <div className="empty-icon">⚠</div>
        <div className="empty-title">Access Denied</div>
        <p className="empty-desc">{error}</p>
        <button className="btn btn-ghost" onClick={() => navigate('/auth')}>Go Back</button>
      </div>
    </div>
  );

  return (
    <div className="page animate-fade-in">
      <div className="app-bar">
        <span className="app-bar-title">⚙️ Admin Panel</span>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/profile')}>Profile</button>
      </div>

      <div className="container" style={{ paddingTop: '1.5rem', paddingBottom: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

        {/* Platform stats */}
        <section>
          <div className="section-header"><span className="section-title">Platform Impact</span></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            {[
              { label: 'Total Users',       value: stats?.users?.total_users       || 0, icon: '👤' },
              { label: 'Vendors',           value: stats?.vendors?.total_vendors   || 0, icon: '🏪' },
              { label: 'Deals Posted',      value: stats?.deals?.total_deals       || 0, icon: '🍱' },
              { label: 'Successful Pickups',value: stats?.claims?.successful_pickups || 0, icon: '✅' },
            ].map(({ label, value, icon }) => (
              <div key={label} className="stat-card" style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem', marginBottom: 4 }}>{icon}</div>
                <span className="stat-value">{value}</span>
                <span className="stat-label">{label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Pending vendors */}
        <section>
          <div className="section-header">
            <span className="section-title">Pending Vendors</span>
            {pendingVendors.length > 0 && (
              <span style={{
                background: 'rgba(255,170,0,0.15)', color: 'var(--color-act-soon)',
                fontSize: 'var(--text-xs)', fontWeight: 700, padding: '2px 8px',
                borderRadius: 'var(--radius-full)',
              }}>
                {pendingVendors.length} awaiting
              </span>
            )}
          </div>

          {pendingVendors.length === 0 ? (
            <div className="card" style={{ padding: '1.25rem', color: 'var(--text-muted)', textAlign: 'center' }}>
              <div style={{ fontSize: '1.5rem', marginBottom: 4 }}>✅</div>
              No pending vendors to review.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {pendingVendors.map((vendor) => (
                <div key={vendor.vendor_id} className="card" style={{ padding: '1rem', borderLeft: '3px solid var(--color-act-soon)' }}>
                  <div style={{ fontWeight: 700, fontSize: 'var(--text-base)', marginBottom: 4 }}>{vendor.business_name}</div>
                  <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginBottom: '0.875rem', lineHeight: 1.6 }}>
                    📍 {vendor.verified_address}<br/>
                    ✉️ {vendor.email}
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={() => handleApproveVendor(vendor.vendor_id)}>
                      ✓ Approve
                    </button>
                    <button className="btn btn-danger btn-sm" style={{ flex: 1 }} onClick={() => handleRejectVendor(vendor.vendor_id)}>
                      ✗ Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* NGO DPA Allowlist */}
        <section>
          <div className="section-header"><span className="section-title">NGO DPA Allowlist</span></div>

          {/* Add NGO form */}
          <form className="card" style={{ padding: '1.25rem', marginBottom: '1rem' }} onSubmit={handleAddNgo}>
            <div style={{ fontWeight: 700, marginBottom: '0.875rem', fontSize: 'var(--text-sm)' }}>Register NGO Partner</div>
            <div className="form" style={{ gap: '0.75rem' }}>
              <div className="form-row">
                <div className="input-group">
                  <label className="input-label">NGO Name</label>
                  <input className="input" placeholder="Organisation name" required
                    value={newNgo.name} onChange={(e) => setNewNgo({ ...newNgo, name: e.target.value })} />
                </div>
                <div className="input-group">
                  <label className="input-label">Contact Email</label>
                  <input className="input" type="email" placeholder="contact@ngo.org" required
                    value={newNgo.contact_email} onChange={(e) => setNewNgo({ ...newNgo, contact_email: e.target.value })} />
                </div>
              </div>
              <div className="input-group">
                <label className="input-label">Webhook URL</label>
                <input className="input" type="url" placeholder="https://ngo.org/webhook" required
                  value={newNgo.webhook_url} onChange={(e) => setNewNgo({ ...newNgo, webhook_url: e.target.value })} />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: 'var(--text-sm)', cursor: 'pointer' }}>
                <input type="checkbox"
                  checked={newNgo.dpa_agreement_signed}
                  onChange={(e) => setNewNgo({ ...newNgo, dpa_agreement_signed: e.target.checked })} />
                <span style={{ color: 'var(--text-secondary)' }}>DPA Agreement Signed & Verified</span>
              </label>
              <button className="btn btn-primary" type="submit" disabled={!newNgo.dpa_agreement_signed}>
                Add NGO Partner
              </button>
            </div>
          </form>

          {/* NGO list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            {ngos.map((ngo) => (
              <div key={ngo.id} className="card" style={{
                padding: '1rem',
                borderLeft: `3px solid ${ngo.is_active ? 'var(--color-brand)' : 'var(--text-muted)'}`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{ngo.name}</div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 2 }}>
                      {ngo.contact_email} · Approved: {ngo.is_approved ? 'Yes ✓' : 'No ✗'}
                    </div>
                  </div>
                  <span style={{
                    fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px',
                    borderRadius: 'var(--radius-full)', textTransform: 'uppercase',
                    background: ngo.is_active ? 'rgba(0,229,160,0.12)' : 'rgba(255,255,255,0.06)',
                    color: ngo.is_active ? 'var(--color-brand)' : 'var(--text-muted)',
                  }}>
                    {ngo.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {!ngo.is_approved && (
                    <button className="btn btn-primary btn-sm" onClick={() => handleToggleNgo(ngo.id, ngo.is_active, true)}>
                      Approve DPA
                    </button>
                  )}
                  <button className="btn btn-ghost btn-sm" onClick={() => handleToggleNgo(ngo.id, !ngo.is_active, ngo.is_approved)}>
                    {ngo.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

      </div>
    </div>
  );
}
