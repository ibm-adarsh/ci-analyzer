import { Link } from 'react-router-dom';
import { WorkflowGuideView } from '../components/WorkflowGuideView';

export function WorkflowGuidePage() {
  return (
    <div className="wg-page">
      <div className="wg-page-bar">
        <Link to="/" className="wg-page-back">
          ← Debugger
        </Link>
        <p className="wg-page-note">
          Developer reference for IBM Z libvirt workflows — pair with a Prow URL in the debugger.
        </p>
      </div>
      <WorkflowGuideView />
    </div>
  );
}
