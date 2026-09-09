import { NavLink } from 'react-router-dom';
import ThemeToggle from './ThemeToggle.jsx';
import { GearIcon } from './icons.jsx';

export default function Navbar() {
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
          <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>
            Dashboard
          </NavLink>
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
