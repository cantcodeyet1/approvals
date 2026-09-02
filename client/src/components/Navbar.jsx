import { NavLink } from 'react-router-dom';
import ThemeToggle from './ThemeToggle.jsx';
import { GearIcon } from './icons.jsx';

export default function Navbar() {
  return (
    <header className="navbar">
      <NavLink to="/" className="navbar-brand">
        Approvals
      </NavLink>
      <nav className="navbar-links">
        <ThemeToggle />
        <NavLink to="/settings" className="btn-icon" aria-label="Settings" title="Settings">
          <GearIcon size={17} />
        </NavLink>
      </nav>
    </header>
  );
}
