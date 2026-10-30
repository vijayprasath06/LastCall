/* SSEContext.jsx — Live SSE stream subscription manager */
import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { API_URL } from '../api';

const SSEContext = createContext(null);

export function SSEProvider({ children }) {
  const { user } = useAuth();
  const esRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const listenersRef = useRef({}); // { eventName: Set<callback> }

  const emit = useCallback((eventName, data) => {
    const set = listenersRef.current[eventName];
    if (set) set.forEach((cb) => cb(data));
    // also fire wildcard listeners
    const wild = listenersRef.current['*'];
    if (wild) wild.forEach((cb) => cb({ event: eventName, data }));
  }, []);

  useEffect(() => {
    if (!user || user.role !== 'consumer') return;

    const token = localStorage.getItem('egpp_access_token');
    if (!token) return;

    const connect = () => {
      if (esRef.current) esRef.current.close();

      const url = `${API_URL}/api/sse/consumer?token=${encodeURIComponent(token)}`;
      const es = new EventSource(url);
      esRef.current = es;

      es.onopen = () => setConnected(true);

      const events = [
        'deal:new', 'deal:update', 'deal:price_drop', 'deal:urgency_update',
        'deal:claimed', 'deal:released', 'deal:expired', 'deal:ngo_handoff',
        'deal:items_updated', 'claim:expired', 'claim:cancelled',
      ];

      events.forEach((evtName) => {
        es.addEventListener(evtName, (e) => {
          try { emit(evtName, JSON.parse(e.data)); } catch { emit(evtName, e.data); }
        });
      });

      es.onerror = () => {
        setConnected(false);
        es.close();
        // Reconnect after 5s
        setTimeout(connect, 5000);
      };
    };

    connect();
    return () => {
      esRef.current?.close();
      setConnected(false);
    };
  }, [user, emit]);

  const on = useCallback((eventName, cb) => {
    if (!listenersRef.current[eventName]) listenersRef.current[eventName] = new Set();
    listenersRef.current[eventName].add(cb);
    return () => listenersRef.current[eventName]?.delete(cb);
  }, []);

  return (
    <SSEContext.Provider value={{ connected, on }}>
      {children}
    </SSEContext.Provider>
  );
}

export const useSSEContext = () => useContext(SSEContext);
