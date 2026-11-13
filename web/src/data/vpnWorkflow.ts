/**
 * Authoritative expansion of IBM Z libvirt workflows from openshift/release
 * step-registry (ci-operator/step-registry/openshift/e2e/libvirt/).
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

/**
 * openshift-e2e-libvirt-heterogeneous-vpn
 * (s390x CP + amd64/arm64 workers on VPN leases — z-xz on 5.0, z-za).
 */
export const HETERO_VPN_WORKFLOW_STEPS: WorkflowStepDef[] = [
  { name: 'upi-libvirt-cleanup-heterogeneous-pre', phase: 'pre' },
  { name: 'ipi-install-rbac', phase: 'pre', via: 'upi-conf-libvirt-heterogeneous' },
  { name: 'upi-conf-libvirt-heterogeneous', phase: 'pre', via: 'upi-conf-libvirt-heterogeneous' },
  {
    name: 'ipi-conf-debug-kdump-configure-logs',
    phase: 'pre',
    via: 'upi-conf-libvirt-heterogeneous',
  },
  { name: 'ipi-debug-missing-static-pod-controller-degraded', phase: 'pre' },
  { name: 'ipi-conf-etcd-on-ramfs', phase: 'pre' },
  {
    name: 'upi-install-libvirt-heterogeneous-network',
    phase: 'pre',
    via: 'upi-install-libvirt-heterogeneous',
  },
  { name: 'rhcos-conf-osstream', phase: 'pre', via: 'upi-install-libvirt-heterogeneous' },
  { name: 'upi-install-libvirt', phase: 'pre', via: 'upi-install-libvirt-heterogeneous' },
  {
    name: 'upi-install-libvirt-heterogeneous',
    phase: 'pre',
    via: 'upi-install-libvirt-heterogeneous',
  },
  { name: 'openshift-e2e-libvirt-conf', phase: 'test', via: 'openshift-e2e-libvirt-test' },
  { name: 'openshift-e2e-libvirt-test', phase: 'test', via: 'openshift-e2e-libvirt-test' },
  { name: 'ipi-conf-debug-kdump-gather-logs', phase: 'post', bestEffort: true },
  { name: 'gather-must-gather', phase: 'post', via: 'gather', bestEffort: true },
  { name: 'gather-extra', phase: 'post', via: 'gather', bestEffort: true },
  { name: 'gather-audit-logs', phase: 'post', via: 'gather', bestEffort: true },
  { name: 'upi-libvirt-cleanup-heterogeneous-post', phase: 'post' },
];

/**
 * openshift-e2e-libvirt-upi-heterogeneous
 * (classical UPI / sshd-bastion hetero — typical z-xz on 4.22/4.23/5.1).
 */
export const UPI_HETERO_WORKFLOW_STEPS: WorkflowStepDef[] = [
  { name: 'upi-libvirt-conf', phase: 'pre', via: 'upi-libvirt-heterogeneous-pre' },
  { name: 'ipi-conf-etcd-on-ramfs', phase: 'pre', via: 'upi-libvirt-heterogeneous-pre' },
  { name: 'ipi-install-rbac', phase: 'pre', via: 'upi-libvirt-install' },
  { name: 'upi-libvirt-install-install', phase: 'pre', via: 'upi-libvirt-install' },
  { name: 'upi-libvirt-install-heterogeneous', phase: 'pre' },
  { name: 'openshift-e2e-libvirt-conf', phase: 'test', via: 'openshift-e2e-libvirt-test' },
  { name: 'openshift-e2e-libvirt-test', phase: 'test', via: 'openshift-e2e-libvirt-test' },
  { name: 'gather-must-gather', phase: 'post', via: 'gather', bestEffort: true },
  { name: 'gather-extra', phase: 'post', via: 'gather', bestEffort: true },
  { name: 'gather-audit-logs', phase: 'post', via: 'gather', bestEffort: true },
  { name: 'upi-libvirt-deprovision', phase: 'post' },
];

/** Map observed GCS / hetero step name onto the VPN leaf used for UI ids when shared. */
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
  'libvirt-s390x-vpn-hcp',
  'libvirt-s390x-vpn-arm64',
  'libvirt-s390x-vpn-amd64',
  'libvirt-s390x-amd64',
  'libvirt-ppc64le-vpn',
  'libvirt-ppc64le-s2s',
]);

/**
 * Inventory workflows currently used by the IBM Z CI dashboard (matched to
 * openshift/release). Analysis must cover each of these.
 */
export const INVENTORY_WORKFLOWS = [
  'openshift-e2e-libvirt-vpn',
  'openshift-e2e-libvirt-vpn-fips',
  'openshift-e2e-libvirt-heterogeneous-vpn',
  'hypershift-mce-ibmz-conformance-s390xmgmt-kubevirt-oz',
] as const satisfies readonly WorkflowKind[];

/** Steps that run openshift-tests / produce junit under artifacts/junit/. */
export const TEST_SUITE_STEPS = [
  'openshift-e2e-libvirt-test',
  'conformance-tests',
] as const;

export function isTestSuiteStep(name: string | null | undefined): boolean {
  return !!name && (TEST_SUITE_STEPS as readonly string[]).includes(name);
}

/** Prefer a failed suite step when present; otherwise the workflow's primary test leaf. */
export function resolveTestSuiteStep(
  steps: Record<string, { status?: string }>,
  workflow?: string | null,
): string {
  for (const n of TEST_SUITE_STEPS) {
    if (steps[n]?.status === 'failed') return n;
  }
  if (workflow === 'hypershift-mce-ibmz-conformance-s390xmgmt-kubevirt-oz') {
    if (steps['conformance-tests']) return 'conformance-tests';
  }
  for (const n of TEST_SUITE_STEPS) {
    if (steps[n]) return n;
  }
  return 'openshift-e2e-libvirt-test';
}

/**
 * hypershift-mce-ibmz-conformance-s390xmgmt-kubevirt-oz
 * (IBM Z HCP / KubeVirt hosted cluster on a libvirt OZ management cluster).
 *
 * Source: openshift/release step-registry
 *   hypershift/mce/ibmz/conformance-s390xmgmt-kubevirt-oz/
 *
 * Order matters: mgmt install → operators → HCP create → then conformance.
 */
export const HYPERSHIFT_MCE_IBMZ_CONFORMANCE_OZ_STEPS: WorkflowStepDef[] = [
  // PRE — management cluster
  { name: 'upi-libvirt-cleanup-pre', phase: 'pre', via: 'hypershift-mce-ibmz-create-s390xmgmt-oz' },
  { name: 'ipi-install-rbac', phase: 'pre', via: 'upi-conf-libvirt' },
  { name: 'upi-conf-libvirt-network', phase: 'pre', via: 'upi-conf-libvirt' },
  { name: 'upi-conf-libvirt-agent', phase: 'pre', via: 'upi-conf-libvirt' },
  { name: 'upi-conf-libvirt', phase: 'pre', via: 'upi-conf-libvirt' },
  { name: 'ipi-conf-debug-kdump-configure-logs', phase: 'pre', via: 'upi-conf-libvirt' },
  {
    name: 'ipi-debug-missing-static-pod-controller-degraded',
    phase: 'pre',
    via: 'hypershift-mce-ibmz-create-s390xmgmt-oz',
  },
  { name: 'ipi-conf-etcd-on-ramfs', phase: 'pre', via: 'hypershift-mce-ibmz-create-s390xmgmt-oz' },
  { name: 'upi-install-libvirt-network', phase: 'pre', via: 'upi-install-libvirt' },
  { name: 'rhcos-conf-osstream', phase: 'pre', via: 'upi-install-libvirt' },
  { name: 'upi-install-libvirt', phase: 'pre', via: 'upi-install-libvirt' },
  // PRE — operators on mgmt
  {
    name: 'hypershift-mce-ibmz-install-metallb-oz',
    phase: 'pre',
    via: 'hypershift-mce-ibmz-install-operators-mgmt',
  },
  { name: 'hypershift-mce-install', phase: 'pre', via: 'hypershift-mce-ibmz-install-operators-mgmt' },
  {
    name: 'hypershift-kubevirt-install',
    phase: 'pre',
    via: 'hypershift-mce-ibmz-install-operators-mgmt',
  },
  {
    name: 'hypershift-mce-ibmz-install-hpp',
    phase: 'pre',
    via: 'hypershift-mce-ibmz-install-operators-mgmt',
  },
  // PRE — create hosted control plane (must come before conformance)
  { name: 'hypershift-mce-ibmz-create-hcpvirt-oz', phase: 'pre' },
  // TEST — guest readiness then openshift-tests conformance
  { name: 'test-ibmz-hostedcluster', phase: 'test', via: 'hypershift-mce-ibmz-test' },
  { name: 'conformance-tests', phase: 'test', via: 'hypershift-conformance' },
  // POST
  { name: 'ipi-conf-debug-kdump-gather-logs', phase: 'post', bestEffort: true },
  { name: 'gather-must-gather', phase: 'post', via: 'gather', bestEffort: true },
  { name: 'gather-extra', phase: 'post', via: 'gather', bestEffort: true },
  { name: 'gather-audit-logs', phase: 'post', via: 'gather', bestEffort: true },
  { name: 'upi-libvirt-cleanup-post', phase: 'post' },
];

export type WorkflowKind =
  | 'openshift-e2e-libvirt-vpn'
  | 'openshift-e2e-libvirt-vpn-fips'
  | 'openshift-e2e-libvirt-upi'
  | 'openshift-e2e-libvirt-upi-heterogeneous'
  | 'openshift-e2e-libvirt-heterogeneous-vpn'
  | 'hypershift-mce-ibmz-conformance-s390xmgmt-kubevirt-oz';

export function stepsForWorkflow(workflow: string | null | undefined): WorkflowStepDef[] {
  switch (workflow) {
    case 'hypershift-mce-ibmz-conformance-s390xmgmt-kubevirt-oz':
      return [...HYPERSHIFT_MCE_IBMZ_CONFORMANCE_OZ_STEPS];
    case 'openshift-e2e-libvirt-heterogeneous-vpn':
      return [...HETERO_VPN_WORKFLOW_STEPS];
    case 'openshift-e2e-libvirt-upi-heterogeneous':
      return [...UPI_HETERO_WORKFLOW_STEPS];
    case 'openshift-e2e-libvirt-vpn-fips':
    case 'openshift-e2e-libvirt-upi-fips': {
      const steps = [...VPN_WORKFLOW_STEPS];
      const idx = steps.findIndex((s) => s.name === 'upi-install-libvirt');
      if (idx >= 0) steps.splice(idx + 1, 0, ...VPN_FIPS_EXTRA_STEPS);
      return steps;
    }
    case 'openshift-e2e-libvirt-upi':
    case 'openshift-e2e-libvirt-vpn':
    default:
      return [...VPN_WORKFLOW_STEPS];
  }
}

export function workflowForJob(jobName: string, profile?: string | null): WorkflowStepDef[] {
  const wf = inferWorkflowName(jobName, profile);
  return stepsForWorkflow(wf);
}

/** Infer phase for a step name not present in a known workflow definition. */
export function inferStepPhase(name: string): WorkflowPhase {
  if (/gather|cleanup-post|deprovision|kdump-gather|hypershift-dump/i.test(name)) {
    return 'post';
  }
  if (
    /conformance-tests|openshift-e2e-libvirt-test|test-ibmz-hostedcluster|(^|-)e2e-test|(^|-)test$/i.test(
      name,
    )
  ) {
    return 'test';
  }
  return 'pre';
}

/** Infer workflow name from job + profile (profile from prowjob wins when passed). */
export function inferWorkflowName(
  jobName: string,
  profile?: string | null,
): WorkflowKind | null {
  const p = profile || '';

  // IBM Z HyperShift / MCE HCP (KubeVirt) — must win over generic libvirt VPN.
  if (
    /hypershift/i.test(jobName) ||
    /vpn-hcp/i.test(p) ||
    /mce-e2e-ibmz|ibmz-s390x-mgmt|hcpvirt|kubevirt-oz/i.test(jobName)
  ) {
    if (/conformance/i.test(jobName) || /kubevirt|virt|hcp/i.test(jobName + p)) {
      return 'hypershift-mce-ibmz-conformance-s390xmgmt-kubevirt-oz';
    }
  }

  if (!/libvirt/.test(jobName) && !p.includes('libvirt')) return null;

  const fips = /fips/i.test(jobName) || p.includes('fips');

  if (
    p.includes('vpn-amd64') ||
    p.includes('vpn-arm64') ||
    (/z-za/.test(jobName) && !p.includes('amd64'))
  ) {
    return 'openshift-e2e-libvirt-heterogeneous-vpn';
  }

  // Job names use multi-z-xz and multi-z-zx for the same s390x+amd64 topology.
  const heteroZx = /z-xz|z-zx/.test(jobName);

  if (p === 'libvirt-s390x-amd64' || (heteroZx && !p.includes('vpn'))) {
    // Classical UPI hetero (4.22/4.23/5.1 z-xz/z-zx). 5.0 uses vpn-amd64 above.
    if (p.includes('vpn-amd64') || (p.includes('vpn') && heteroZx)) {
      return 'openshift-e2e-libvirt-heterogeneous-vpn';
    }
    if (heteroZx && /nightly-5\.0/.test(jobName)) {
      return 'openshift-e2e-libvirt-heterogeneous-vpn';
    }
    if (p === 'libvirt-s390x-amd64' || heteroZx) {
      return 'openshift-e2e-libvirt-upi-heterogeneous';
    }
  }

  if (/heterogeneous|z-za|z-xz|z-zx/.test(jobName)) {
    if (/z-za/.test(jobName) || /nightly-5\.0.*z-x[zs]/.test(jobName)) {
      return 'openshift-e2e-libvirt-heterogeneous-vpn';
    }
    return 'openshift-e2e-libvirt-upi-heterogeneous';
  }

  if (/external-ibmz-upi/.test(jobName)) {
    return fips ? 'openshift-e2e-libvirt-vpn-fips' : 'openshift-e2e-libvirt-upi';
  }

  if (fips) return 'openshift-e2e-libvirt-vpn-fips';
  return 'openshift-e2e-libvirt-vpn';
}

export const WORKFLOW_SOURCE = {
  name: 'openshift-e2e-libvirt-vpn',
  yaml: 'https://github.com/openshift/release/blob/main/ci-operator/step-registry/openshift/e2e/libvirt/vpn/openshift-e2e-libvirt-vpn-workflow.yaml',
  stepsCi: 'https://steps.ci.openshift.org/workflow/openshift-e2e-libvirt-vpn',
};

export const WORKFLOW_DOCS: Record<string, { yaml: string; stepsCi: string }> = {
  'openshift-e2e-libvirt-vpn': {
    yaml: WORKFLOW_SOURCE.yaml,
    stepsCi: WORKFLOW_SOURCE.stepsCi,
  },
  'openshift-e2e-libvirt-vpn-fips': {
    yaml: 'https://github.com/openshift/release/blob/main/ci-operator/step-registry/openshift/e2e/libvirt/vpn/fips/openshift-e2e-libvirt-vpn-fips-workflow.yaml',
    stepsCi: 'https://steps.ci.openshift.org/workflow/openshift-e2e-libvirt-vpn-fips',
  },
  'openshift-e2e-libvirt-upi': {
    yaml: 'https://github.com/openshift/release/blob/main/ci-operator/step-registry/openshift/e2e/libvirt/upi/openshift-e2e-libvirt-upi-workflow.yaml',
    stepsCi: 'https://steps.ci.openshift.org/workflow/openshift-e2e-libvirt-upi',
  },
  'openshift-e2e-libvirt-upi-heterogeneous': {
    yaml: 'https://github.com/openshift/release/blob/main/ci-operator/step-registry/openshift/e2e/libvirt/upi/heterogeneous/openshift-e2e-libvirt-upi-heterogeneous-workflow.yaml',
    stepsCi: 'https://steps.ci.openshift.org/workflow/openshift-e2e-libvirt-upi-heterogeneous',
  },
  'openshift-e2e-libvirt-heterogeneous-vpn': {
    yaml: 'https://github.com/openshift/release/blob/main/ci-operator/step-registry/openshift/e2e/libvirt/heterogeneous/vpn/openshift-e2e-libvirt-heterogeneous-vpn-workflow.yaml',
    stepsCi: 'https://steps.ci.openshift.org/workflow/openshift-e2e-libvirt-heterogeneous-vpn',
  },
  'hypershift-mce-ibmz-conformance-s390xmgmt-kubevirt-oz': {
    yaml: 'https://github.com/openshift/release/blob/master/ci-operator/step-registry/hypershift/mce/ibmz/conformance-s390xmgmt-kubevirt-oz/hypershift-mce-ibmz-conformance-s390xmgmt-kubevirt-oz-workflow.yaml',
    stepsCi:
      'https://steps.ci.openshift.org/workflow/hypershift-mce-ibmz-conformance-s390xmgmt-kubevirt-oz',
  },
};
