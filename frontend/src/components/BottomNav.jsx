/* BottomNav.jsx — Shared consumer bottom navigation */
import { useNavigate, useLocation } from 'react-router-dom';

const CONSUMER_NAV = [
  {
    path: '/',
    label: 'Feed',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  {
    path: '/my-claims',
    label: 'My Claims',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    path: '/profile',
    label: 'Profile',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
];

const VENDOR_NAV = [
  {
    path: '/vendor/dashboard',
    label: 'Dashboard',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="7" height="9" rx="1" />
        <rect x="14" y="3" width="7" height="5" rx="1" />
        <rect x="14" y="12" width="7" height="9" rx="1" />
        <rect x="3" y="16" width="7" height="5" rx="1" />
      </svg>
    ),
  },
  {
    path: '/vendor/post',
    label: 'Post Deal',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="16" />
        <line x1="8" y1="12" x2="16" y2="12" />
      </svg>
    ),
    primary: true,
  },
  {
    path: '/vendor/analytics',
    label: 'Analytics',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
  },
];

export function BottomNav({ role = 'consumer' }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const items = role === 'vendor' ? VENDOR_NAV : CONSUMER_NAV;

  return (
    <nav className="bottom-nav">
      {items.map((item) => {
        const isActive = pathname === item.path || (item.path !== '/' && pathname.startsWith(item.path));
        return (
          <button
            key={item.path}
            className={`nav-item${isActive ? ' active' : ''}`}
            onClick={() => navigate(item.path)}
            style={item.primary ? {
              background: 'linear-gradient(135deg, var(--color-brand), var(--color-brand-dim))',
              color: '#000',
              borderRadius: 'var(--radius-full)',
              padding: '0.5rem 1.2rem',
              boxShadow: '0 0 20px var(--color-brand-glow)',
              marginBottom: 4,
            } : {}}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

