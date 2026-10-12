/** Workflow order and phase classification for openshift-e2e-libvirt-vpn (IBM Z). */
export const STEP_ORDER = [
  "upi-libvirt-cleanup-pre",
  "upi-libvirt-cleanup-heterogeneous-pre",
  "ipi-install-rbac",
  "upi-conf-libvirt-network",
  "upi-conf-libvirt-heterogeneous-network",
  "upi-conf-libvirt-agent",
  "upi-conf-libvirt",
  "upi-conf-libvirt-heterogeneous",
  "ipi-conf-debug-kdump-configure-logs",
  "ipi-debug-missing-static-pod-controller-degraded",
  "ipi-conf-etcd-on-ramfs",
  "upi-install-libvirt-network",
  "upi-install-libvirt-heterogeneous-network",
  "rhcos-conf-osstream",
  "upi-install-libvirt",
  "upi-install-libvirt-heterogeneous",
  "openshift-e2e-libvirt-conf",
  "openshift-e2e-libvirt-test",
  "ipi-conf-debug-kdump-gather-logs",
  "gather-must-gather",
  "gather-extra",
  "gather-audit-logs",
  "upi-libvirt-cleanup-post",
  "upi-libvirt-cleanup-heterogeneous-post"
] as const;

export const PHASE_MAP: Record<'pre'|'test'|'post', string[]> = {
  "pre": [
    "upi-libvirt-cleanup-pre",
    "upi-libvirt-cleanup-heterogeneous-pre",
    "ipi-install-rbac",
    "upi-conf-libvirt-network",
    "upi-conf-libvirt-heterogeneous-network",
    "upi-conf-libvirt-agent",
    "upi-conf-libvirt",
    "upi-conf-libvirt-heterogeneous",
    "ipi-conf-debug-kdump-configure-logs",
    "ipi-debug-missing-static-pod-controller-degraded",
    "ipi-conf-etcd-on-ramfs",
    "upi-install-libvirt-network",
    "upi-install-libvirt-heterogeneous-network",
    "rhcos-conf-osstream",
    "upi-install-libvirt",
    "upi-install-libvirt-heterogeneous"
  ],
  "test": [
    "openshift-e2e-libvirt-conf",
    "openshift-e2e-libvirt-test"
  ],
  "post": [
    "ipi-conf-debug-kdump-gather-logs",
    "gather-must-gather",
    "gather-extra",
    "gather-audit-logs",
    "upi-libvirt-cleanup-post",
    "upi-libvirt-cleanup-heterogeneous-post"
  ]
};

export const PHASE_META = {
  pre:  { label: 'PRE — Provisioning & Installation', short: 'PRE' },
  test: { label: 'TEST — E2E / Upgrade', short: 'TEST' },
  post: { label: 'POST — Gather & Cleanup', short: 'POST' },
} as const;

export const BEST_EFFORT_STEPS = new Set(["gather-must-gather", "gather-extra", "gather-audit-logs", "ipi-conf-debug-kdump-gather-logs", "upi-libvirt-cleanup-post", "upi-libvirt-cleanup-heterogeneous-post"]);

export const GCS_BUCKET = 'test-platform-results-public';
export const PROW_DECK = 'https://prow.ci.openshift.org';
export const GCSWEB = 'https://gcsweb-ci.apps.ci.l2s4.p1.openshiftapps.com/gcs';
export const RELEASE_REPO = 'https://github.com/openshift/release';
export const STEPS_CI = 'https://steps.ci.openshift.org';
