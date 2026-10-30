import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MapView from '../../components/MapView';
import api from '../../api';

export default function VendorOnboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [address, setAddress] = useState('');
  const [location, setLocation] = useState(null); // [lat, lng]
  const [error, setError] = useState('');
  const [businessName, setBusinessName] = useState('');

  const handleGeocode = async () => {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`);
      const data = await res.json();
      if (data && data.length > 0) {
        setLocation([parseFloat(data[0].lat), parseFloat(data[0].lon)]);
      } else {
        setError('Location not found. Please refine your address.');
      }
    } catch (err) {
      setError('Geocoding failed.');
    }
  };

  const handleOnboard = async (e) => {
    e.preventDefault();
    if (!location) {
      setError('Please verify your location on the map before continuing.');
      return;
    }
    setLoading(true);
    try {
      await api.post('/vendor/onboard', {
        business_name: businessName,
        verified_address: address,
        verified_location: {
          lat: location[0],
          lng: location[1]
        }
      });
      navigate('/vendor/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to onboard.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page animate-fade-in">
      <div className="app-bar">
        <span className="app-bar-title">Vendor Onboarding</span>
      </div>
      <div className="container" style={{ paddingTop: '2rem' }}>
        <form onSubmit={handleOnboard} className="form">
          <div className="card" style={{ padding: '1rem' }}>
            <h2>Business Details</h2>
            <div className="input-group">
              <label className="input-label">Business Name</label>
              <input 
                className="input" 
                required 
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="e.g. Anand Bhavan"
              />
            </div>
            
            <div className="input-group">
              <label className="input-label">Verified Address</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input 
                  className="input" 
                  required 
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Enter full address"
                />
                <button type="button" className="btn btn-primary" onClick={handleGeocode}>
                  Locate
                </button>
              </div>
            </div>

            {location && (
              <div style={{ marginTop: '1rem' }}>
                <label className="input-label">Confirm Location</label>
                <MapView 
                  center={location} 
                  markers={[{ position: location, popup: businessName || 'Your Business' }]} 
                />
              </div>
            )}
          </div>
          
          {error && <div style={{ color: 'var(--color-going-now)', margin: '1rem 0' }}>{error}</div>}
          
          <button type="submit" className="btn btn-primary btn-lg btn-full" disabled={loading || !location}>
            {loading ? 'Verifying...' : 'Complete Onboarding'}
          </button>
        </form>
      </div>
    </div>
  );
}
