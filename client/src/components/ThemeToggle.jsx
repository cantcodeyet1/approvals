import { useEffect, useState } from 'react';
import { initTheme, setTheme } from '../lib/theme';
import { SunIcon, MoonIcon } from './icons.jsx';

export default function ThemeToggle() {
  const [theme, setThemeState] = useState('light');

  useEffect(() => {
    setThemeState(initTheme());
  }, []);

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    setThemeState(next);
  }

  return (
    <button className="theme-toggle" onClick={toggle} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} title="Toggle theme">
      {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
