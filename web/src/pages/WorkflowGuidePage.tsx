import { Link } from 'react-router-dom';
import { WorkflowGuideView } from '../components/WorkflowGuideView';

export function WorkflowGuidePage() {
  return (
    <div className="wg-page">
      <div style={{ marginBottom: 8 }}>
        <Link to="/" className="muted">
          ← Back to debugger
        </Link>
      </div>
      <WorkflowGuideView />
    </div>
  );
}
