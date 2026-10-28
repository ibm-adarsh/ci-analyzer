import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { HomePage } from './pages/HomePage';
import { ExecutionPage } from './pages/ExecutionPage';
import { WorkflowGuidePage } from './pages/WorkflowGuidePage';

/** Vite `base` is `/ci-analyzer/`; BrowserRouter wants no trailing slash. */
const basename = (import.meta.env.BASE_URL || '/').replace(/\/$/, '') || '/';

export default function App() {
  return (
    <BrowserRouter basename={basename}>
      <Layout>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/guide" element={<WorkflowGuidePage />} />
          <Route path="/execution/:bucketEnc/:pathEnc" element={<ExecutionPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
