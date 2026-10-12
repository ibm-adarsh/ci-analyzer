import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';

export function Layout({ children }: { children: React.ReactNode }) {
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
            <h1>IBM Z · CI Debugging Workbench</h1>
            <p>OpenShift CI · Prow · s390x / z-z / z-za</p>
          </div>
        </Link>
        <div className="topbar-actions">
          <a
            className="btn"
            href="https://prow.ci.openshift.org/?job=*z-z"
            target="_blank"
            rel="noreferrer"
          >
            Prow *z-z
          </a>
          <a
            className="btn"
            href="https://prow.ci.openshift.org/?job=*s390x"
            target="_blank"
            rel="noreferrer"
          >
            Prow *s390x
          </a>
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
