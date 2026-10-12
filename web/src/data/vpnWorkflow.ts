/**
 * Authoritative expansion of openshift-e2e-libvirt-vpn from openshift/release
 * step-registry (ci-operator/step-registry/openshift/e2e/libvirt/vpn/).
 *
 * Workflow → chains → leaf refs. Used to show pending / not-started steps
 * that have no GCS directory yet (critical for RUNNING jobs).
 */

export type WorkflowPhase = 'pre' | 'test' | 'post';

export interface WorkflowStepDef {
  name: string;
  phase: WorkflowPhase;
  /** Chain that introduced this leaf step, if any */
  via?: string;
  bestEffort?: boolean;
}

/** Leaf steps for openshift-e2e-libvirt-vpn (homogeneous IBM Z VPN). */
export const VPN_WORKFLOW_STEPS: WorkflowStepDef[] = [
  { name: 'upi-libvirt-cleanup-pre', phase: 'pre' },
  { name: 'ipi-install-rbac', phase: 'pre', via: 'upi-conf-libvirt' },
  { name: 'upi-conf-libvirt-network', phase: 'pre', via: 'upi-conf-libvirt' },
  { name: 'upi-conf-libvirt-agent', phase: 'pre', via: 'upi-conf-libvirt' },
  { name: 'upi-conf-libvirt', phase: 'pre', via: 'upi-conf-libvirt' },
  { name: 'ipi-conf-debug-kdump-configure-logs', phase: 'pre', via: 'upi-conf-libvirt' },
  { name: 'ipi-debug-missing-static-pod-controller-degraded', phase: 'pre' },
  { name: 'ipi-conf-etcd-on-ramfs', phase: 'pre' },
  { name: 'upi-install-libvirt-network', phase: 'pre', via: 'upi-install-libvirt' },
  { name: 'rhcos-conf-osstream', phase: 'pre', via: 'upi-install-libvirt' },
  { name: 'upi-install-libvirt', phase: 'pre', via: 'upi-install-libvirt' },
  { name: 'openshift-e2e-libvirt-conf', phase: 'test', via: 'openshift-e2e-libvirt-test' },
  { name: 'openshift-e2e-libvirt-test', phase: 'test', via: 'openshift-e2e-libvirt-test' },
  { name: 'ipi-conf-debug-kdump-gather-logs', phase: 'post', bestEffort: true },
  { name: 'gather-must-gather', phase: 'post', via: 'gather', bestEffort: true },
  { name: 'gather-extra', phase: 'post', via: 'gather', bestEffort: true },
  { name: 'gather-audit-logs', phase: 'post', via: 'gather', bestEffort: true },
  { name: 'upi-libvirt-cleanup-post', phase: 'post' },
];

/** FIPS workflow adds fips-check after install. */
export const VPN_FIPS_EXTRA_STEPS: WorkflowStepDef[] = [
  { name: 'fips-check', phase: 'pre' },
];

/** Heterogeneous leaf names sometimes seen under z-za / mixed jobs. */
export const HETERO_ALIASES: Record<string, string> = {
  'upi-libvirt-cleanup-heterogeneous-pre': 'upi-libvirt-cleanup-pre',
  'upi-libvirt-cleanup-heterogeneous-post': 'upi-libvirt-cleanup-post',
  'upi-conf-libvirt-heterogeneous': 'upi-conf-libvirt',
  'upi-conf-libvirt-heterogeneous-network': 'upi-conf-libvirt-network',
  'upi-install-libvirt-heterogeneous': 'upi-install-libvirt',
  'upi-install-libvirt-heterogeneous-network': 'upi-install-libvirt-network',
};

export const VPN_PROFILES = new Set([
  'libvirt-s390x-vpn',
  'libvirt-s390x-vpn-oz',
  'libvirt-s390x-vpn-arm64',
  'libvirt-ppc64le-vpn',
]);

export function workflowForJob(jobName: string, profile?: string | null): WorkflowStepDef[] {
  const steps = [...VPN_WORKFLOW_STEPS];
  if (/fips/i.test(jobName) || profile?.includes('fips')) {
    // Insert fips-check after upi-install-libvirt
    const idx = steps.findIndex((s) => s.name === 'upi-install-libvirt');
    if (idx >= 0) steps.splice(idx + 1, 0, ...VPN_FIPS_EXTRA_STEPS);
  }
  return steps;
}

export const WORKFLOW_SOURCE = {
  name: 'openshift-e2e-libvirt-vpn',
  yaml: 'https://github.com/openshift/release/blob/main/ci-operator/step-registry/openshift/e2e/libvirt/vpn/openshift-e2e-libvirt-vpn-workflow.yaml',
  stepsCi: 'https://steps.ci.openshift.org/workflow/openshift-e2e-libvirt-vpn',
};
