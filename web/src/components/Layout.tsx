import { Link, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';

export function Layout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const onGuide = pathname.startsWith('/guide');
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
    <div className="app-shell">
      <header className="topbar">
        <Link to="/" className="brand" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="brand-mark">Z</div>
          <div>
            <h1>IBM Z · Job Debugger</h1>
            <p>Paste a Prow URL · vpn / vpn-oz · libvirt workflow</p>
          </div>
        </Link>
        <div className="topbar-actions">
          <Link to="/guide" className={onGuide ? 'btn btn-primary' : 'btn'}>
            Workflow guide
          </Link>
          <button
            type="button"
            className="btn"
            onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
          >
            {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
        </div>
      </header>
      {children}
    </div>
  );
}
