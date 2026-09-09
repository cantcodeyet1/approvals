import { Link, NavLink, useLocation } from 'react-router-dom';
import ThemeToggle from './ThemeToggle.jsx';
import { GearIcon } from './icons.jsx';

export default function Navbar() {
  const location = useLocation();
  const isApprovedFilter = new URLSearchParams(location.search).get('filter') === 'approved';
  const onDashboard = location.pathname === '/';
  const onSettings = location.pathname === '/settings';

  const tabs = [
    { to: '/', label: 'Dashboard', active: onDashboard && !isApprovedFilter },
    { to: '/settings#projects', label: 'Projects', active: onSettings && location.hash === '#projects' },
    { to: '/settings#signers', label: 'Signers', active: onSettings && location.hash === '#signers' },
    { to: '/?filter=approved', label: 'History', active: onDashboard && isApprovedFilter },
  ];

  return (
    <header className="navbar">
      <div className="navbar-left">
        <NavLink to="/" className="navbar-brand">
          <span className="navbar-brand-mark">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 13l4 4L19 7" />
            </svg>
          </span>
          Approvals
        </NavLink>
        <nav className="navbar-tabs">
          {tabs.map((tab) => (
            <Link key={tab.label} to={tab.to} className={tab.active ? 'active' : ''}>
              {tab.label}
            </Link>
          ))}
        </nav>
      </div>
      <nav className="navbar-links">
        <ThemeToggle />
        <NavLink to="/settings" className="btn-icon" aria-label="Settings" title="Settings">
          <GearIcon size={17} />
        </NavLink>
      </nav>
    </header>
  );
}
