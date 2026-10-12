/** Shared constants for Prow / GCS / openshift/release links. */

export const GCS_BUCKET = 'test-platform-results-public';
export const PROW_DECK = 'https://prow.ci.openshift.org';
export const GCSWEB = 'https://gcsweb-ci.apps.ci.l2s4.p1.openshiftapps.com/gcs';
export const RELEASE_REPO = 'https://github.com/openshift/release';
export const STEPS_CI = 'https://steps.ci.openshift.org';

export const PHASE_META = {
  pre: { label: 'PRE — Provisioning & Installation', short: 'PRE' },
  test: { label: 'TEST — E2E / Upgrade', short: 'TEST' },
  post: { label: 'POST — Gather & Cleanup', short: 'POST' },
} as const;

/** Steps that are typically best_effort / optional_on_success in the VPN workflow. */
export const BEST_EFFORT_STEPS = new Set([
  'gather-must-gather',
  'gather-extra',
  'gather-audit-logs',
  'ipi-conf-debug-kdump-gather-logs',
  'upi-libvirt-cleanup-post',
  'upi-libvirt-cleanup-heterogeneous-post',
]);
