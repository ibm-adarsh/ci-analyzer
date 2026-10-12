import type { JobResult, StepStatus } from '../types';

export function StatusBadge({ status }: { status: JobResult | StepStatus | string }) {
  const s = String(status).toUpperCase();
  const cls =
    s === 'PASSED' || s === 'PASS'
      ? 'pass'
      : s === 'FAILED' || s === 'FAIL'
        ? 'fail'
        : s === 'RUNNING' || s === 'RUN'
          ? 'run'
          : 'unk';
  return <span className={`badge ${cls}`}>{s}</span>;
}
