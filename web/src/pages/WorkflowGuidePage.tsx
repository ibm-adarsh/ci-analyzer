import { Link } from 'react-router-dom';
import { WorkflowGuideView } from '../components/WorkflowGuideView';

export function WorkflowGuidePage() {
  return (
    <div className="guide-page">
      <div className="guide-page-bar">
        <Link to="/" className="guide-page-back">
          ← Debugger
        </Link>
        <p className="guide-page-note">
          Select a workflow to see PRE → TEST → POST steps for IBM Z libvirt CI.
        </p>
      </div>
      <WorkflowGuideView />
    </div>
  );
}
