import { Link } from 'react-router-dom';
import { WorkflowGuideView } from '../components/WorkflowGuideView';

export function WorkflowGuidePage() {
  return (
    <>
      <div style={{ marginBottom: 12 }}>
        <Link to="/" className="muted">
          ← Back to debugger
        </Link>
      </div>
      <WorkflowGuideView />
    </>
  );
}
