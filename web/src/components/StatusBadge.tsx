import type { JobResult, StepStatus } from '../types';

export function StatusBadge({ status }: { status: JobResult | StepStatus | string }) {
  const raw = String(status);
  const s = raw.toUpperCase();
  const cls =
    s === 'PASSED' || s === 'PASS'
      ? 'pass'
      : s === 'FAILED' || s === 'FAIL'
        ? 'fail'
        : s === 'RUNNING' || s === 'RUN' || s === 'CURRENT'
          ? 'run'
          : s === 'PENDING'
            ? 'unk'
            : 'unk';
  const label = s === 'CURRENT' ? 'CURRENT' : s;
  return <span className={`badge ${cls}`}>{label}</span>;
}
