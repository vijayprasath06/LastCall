/* useLocation.js — GPS watch + 10-minute heartbeat to backend */
import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../api';
import { useAuth } from '../context/AuthContext';

const HEARTBEAT_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

export function useLocation() {
  const { user } = useAuth();
  const [location, setLocation]     = useState(null);
  const [error, setError]           = useState(null);
  const [permitted, setPermitted]   = useState(false);
  const watchIdRef                  = useRef(null);
  const heartbeatRef                = useRef(null);
  const lastSentRef                 = useRef(0);

  const sendHeartbeat = useCallback(async (lat, lng) => {
    const now = Date.now();
    if (now - lastSentRef.current < 9 * 60 * 1000) return; // debounce
    lastSentRef.current = now;
    try {
      await api.patch('/users/location', { latitude: lat, longitude: lng });
    } catch { /* non-fatal */ }
  }, []);

  const startWatching = useCallback(() => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported on this device');
      return;
    }

    const onSuccess = (pos) => {
      const { latitude, longitude } = pos.coords;
      setLocation({ lat: latitude, lng: longitude });
      setPermitted(true);
      sendHeartbeat(latitude, longitude);
    };

    const onError = (err) => {
      setError(err.message);
      setPermitted(false);
    };

    const opts = { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 };

    watchIdRef.current = navigator.geolocation.watchPosition(onSuccess, onError, opts);

    // Periodic heartbeat even if position hasn't changed
    heartbeatRef.current = setInterval(() => {
      if (location) sendHeartbeat(location.lat, location.lng);
    }, HEARTBEAT_INTERVAL_MS);
  }, [location, sendHeartbeat]);

  useEffect(() => {
    if (!user || user.role !== 'consumer') return;

    // Check if consent already granted
    if (!localStorage.getItem('egpp_location_consent')) return;

    startWatching();

    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
      if (heartbeatRef.current)        clearInterval(heartbeatRef.current);
    };
  }, [user]); // eslint-disable-line

  const requestPermission = useCallback(() => {
    localStorage.setItem('egpp_location_consent', '1');
    startWatching();
  }, [startWatching]);

  return { location, error, permitted, requestPermission };
}
