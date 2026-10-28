import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

// Migrate old HashRouter bookmarks (#/guide → /ci-analyzer/guide).
if (typeof window !== 'undefined' && window.location.hash.startsWith('#/')) {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
  const path = window.location.hash.slice(1); // "/guide" or "/execution/..."
  window.location.replace(`${base}${path}${window.location.search}`);
} else {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
