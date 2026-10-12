import { Link, useLocation } from 'react-router-dom';
import { useEffect, useState, type ReactNode } from 'react';

export function Layout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const onGuide = pathname.startsWith('/guide');
  const onHome = pathname === '/' || pathname === '';
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      return (localStorage.getItem('ibmz_theme') as 'dark' | 'light') || 'dark';
    } catch {
      return 'dark';
    }
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('ibmz_theme', theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  return (
    <div className={`app-shell${onHome ? ' is-home' : ''}`}>
      <header className="topbar">
        <Link to="/" className="brand">
          <span className="brand-mark" aria-hidden>
            Z
          </span>
          <span className="brand-text">
            <span className="brand-name">IBM Z</span>
            <span className="brand-sep">Job Debugger</span>
          </span>
        </Link>
        <nav className="topbar-nav" aria-label="Primary">
          <Link to="/" className={!onGuide ? 'nav-link on' : 'nav-link'}>
            Debug
          </Link>
          <Link to="/guide" className={onGuide ? 'nav-link on' : 'nav-link'}>
            Guide
          </Link>
          <button
            type="button"
            className="nav-theme"
            onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
        </nav>
      </header>
      <main className="app-main">{children}</main>
    </div>
  );
}
