import { Link, useLocation } from 'react-router-dom';
import { useEffect, useState, type ReactNode } from 'react';
import { BrandMark } from './BrandMark';
import { HeaderWatch } from './HeaderWatch';
import { TopbarSignal } from './TopbarSignal';

export function Layout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const onGuide = pathname.startsWith('/guide');
  const onHome = pathname === '/' || pathname === '';
  const onExecution = pathname.startsWith('/execution');
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

  const frameClass = [
    'app-frame',
    onHome ? 'is-home' : '',
    onExecution ? 'is-execution' : '',
    onGuide ? 'is-guide' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={frameClass}>
      <header className="topbar">
        <TopbarSignal />
        <div className="app-rail topbar-inner">
          <Link to="/" className="brand" aria-label="IBM Z CI Job Debugger home">
            <span className="brand-mark" aria-hidden>
              <BrandMark />
            </span>
            <span className="brand-text">
              <span className="brand-name">
                IBM <span className="brand-z">Z</span>
              </span>
              <span className="brand-sep">
                <span className="brand-sep-rule" aria-hidden />
                CI Job Debugger
              </span>
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
            <HeaderWatch />
          </nav>
        </div>
      </header>
      <main className="app-main">
        <div className="app-rail">{children}</div>
      </main>
    </div>
  );
}
