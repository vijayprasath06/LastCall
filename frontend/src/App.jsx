import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SSEProvider } from './context/SSEContext';
import { DealProvider } from './context/DealContext';

import { Auth } from './pages/Auth';
import { ConsentScreen } from './pages/ConsentScreen';
import { HomeFeed } from './pages/HomeFeed';
import { DealDetail } from './pages/DealDetail';
import { MyClaims } from './pages/MyClaims';
import { Profile } from './pages/Profile';

import VendorOnboard from './pages/vendor/VendorOnboard';
import { PostDeal } from './pages/vendor/PostDeal';
import VendorDashboard from './pages/vendor/VendorDashboard';
import QRScanner from './pages/vendor/QRScanner';
import Analytics from './pages/vendor/Analytics';
import AdminDashboard from './pages/admin/AdminDashboard';

import './App.css';

const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user } = useAuth();
  if (!user) return <Navigate to="/auth" replace />;
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to={user.role === 'vendor' ? '/vendor/dashboard' : '/'} replace />;
  }
  return children;
};

// Consumer routes wrap with consent gate
const ConsumerRoute = ({ children }) => {
  const { user } = useAuth();
  if (!user) return <Navigate to="/auth" replace />;
  if (user.role !== 'consumer') return <Navigate to="/vendor/dashboard" replace />;

  const hasConsent = localStorage.getItem('egpp_location_consent');
  if (!hasConsent) {
    return (
      <ConsentScreen onConsented={() => {
        // force re-render by setting the key in localStorage and navigating
        window.location.reload();
      }} />
    );
  }
  return children;
};

function AppRoutes() {
  return (
    <Routes>
      <Route path="/auth" element={<Auth />} />

      {/* Consumer Routes */}
      <Route path="/" element={
        <ConsumerRoute>
          <HomeFeed />
        </ConsumerRoute>
      } />
      <Route path="/deal/:id" element={
        <ConsumerRoute>
          <DealDetail />
        </ConsumerRoute>
      } />
      <Route path="/my-claims" element={
        <ConsumerRoute>
          <MyClaims />
        </ConsumerRoute>
      } />
      <Route path="/profile" element={
        <ProtectedRoute allowedRoles={['consumer', 'vendor']}>
          <Profile />
        </ProtectedRoute>
      } />

      {/* Admin Route */}
      <Route path="/admin" element={
        <ProtectedRoute allowedRoles={['admin']}>
          <AdminDashboard />
        </ProtectedRoute>
      } />

      {/* Vendor Routes */}
      <Route path="/vendor/onboard" element={
        <ProtectedRoute allowedRoles={['vendor']}>
          <VendorOnboard />
        </ProtectedRoute>
      } />
      <Route path="/vendor/dashboard" element={
        <ProtectedRoute allowedRoles={['vendor']}>
          <VendorDashboard />
        </ProtectedRoute>
      } />
      <Route path="/vendor/post" element={
        <ProtectedRoute allowedRoles={['vendor']}>
          <PostDeal />
        </ProtectedRoute>
      } />
      <Route path="/vendor/scan" element={
        <ProtectedRoute allowedRoles={['vendor']}>
          <QRScanner />
        </ProtectedRoute>
      } />
      <Route path="/vendor/analytics" element={
        <ProtectedRoute allowedRoles={['vendor']}>
          <Analytics />
        </ProtectedRoute>
      } />

      {/* Catch-all redirect */}
      <Route path="*" element={<Navigate to="/auth" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <DealProvider>
        <SSEProvider>
          <Router>
            <AppRoutes />
          </Router>
        </SSEProvider>
      </DealProvider>
    </AuthProvider>
  );
}

export default App;
