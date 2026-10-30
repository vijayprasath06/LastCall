/* DealContext.jsx — Active deals cache, updated by SSE events */
import { createContext, useContext, useState, useCallback } from 'react';
import api from '../api';

const DealContext = createContext(null);

export function DealProvider({ children }) {
  const [deals, setDeals]     = useState([]);
  const [loading, setLoading] = useState(false);
  const [lastFetch, setLastFetch] = useState(null);

  const fetchNearby = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/deals/nearby');
      setDeals(data.deals || []);
      setLastFetch(Date.now());
    } finally {
      setLoading(false);
    }
  }, []);

  // Called by SSE event handlers
  const applyDealEvent = useCallback((event, payload) => {
    setDeals((prev) => {
      switch (event) {
        case 'deal:new':
          if (prev.find((d) => d.id === payload.id)) return prev;
          return [payload, ...prev];

        case 'deal:price_drop':
        case 'deal:urgency_update':
        case 'deal:update':
        case 'deal:items_updated':
          return prev.map((d) => d.id === payload.deal_id ? { ...d, ...payload } : d);

        case 'deal:claimed':
        case 'deal:released':
          return prev.map((d) =>
            d.id === payload.deal_id
              ? { ...d, claimed_quantity: payload.claimed_quantity, status: payload.status }
              : d
          );

        case 'deal:expired':
        case 'deal:ngo_handoff':
          return prev.filter((d) => d.id !== payload.deal_id);

        default:
          return prev;
      }
    });
  }, []);

  return (
    <DealContext.Provider value={{ deals, loading, fetchNearby, applyDealEvent, lastFetch }}>
      {children}
    </DealContext.Provider>
  );
}

export const useDealContext = () => useContext(DealContext);
