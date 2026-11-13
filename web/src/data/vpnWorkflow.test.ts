import { describe, expect, it } from 'vitest';
import {
  HYPERSHIFT_MCE_IBMZ_CONFORMANCE_OZ_STEPS,
  inferStepPhase,
  inferWorkflowName,
  stepsForWorkflow,
} from './vpnWorkflow';

describe('hypershift HCP workflow', () => {
  it('infers the MCE IBM Z conformance workflow for HCP jobs', () => {
    expect(
      inferWorkflowName(
        'periodic-ci-openshift-hypershift-release-5.1-periodics-mce-e2e-ibmz-s390x-mgmt-ovn-conformance-virt-z-z',
        'libvirt-s390x-vpn-hcp',
      ),
    ).toBe('hypershift-mce-ibmz-conformance-s390xmgmt-kubevirt-oz');
  });

  it('places HCP create in pre and conformance-tests in test (after create)', () => {
    const steps = stepsForWorkflow(
      'hypershift-mce-ibmz-conformance-s390xmgmt-kubevirt-oz',
    );
    const createIdx = steps.findIndex(
      (s) => s.name === 'hypershift-mce-ibmz-create-hcpvirt-oz',
    );
    const confIdx = steps.findIndex((s) => s.name === 'conformance-tests');
    expect(createIdx).toBeGreaterThan(0);
    expect(confIdx).toBeGreaterThan(createIdx);
    expect(steps[createIdx].phase).toBe('pre');
    expect(steps[confIdx].phase).toBe('test');
    expect(steps.find((s) => s.name === 'test-ibmz-hostedcluster')?.phase).toBe(
      'test',
    );
    expect(steps.find((s) => s.name === 'gather-extra')?.phase).toBe('post');
  });

  it('matches the release-repo leaf set size', () => {
    expect(HYPERSHIFT_MCE_IBMZ_CONFORMANCE_OZ_STEPS.length).toBeGreaterThan(15);
  });

  it('infers phases for unknown step names', () => {
    expect(inferStepPhase('conformance-tests')).toBe('test');
    expect(inferStepPhase('test-ibmz-hostedcluster')).toBe('test');
    expect(inferStepPhase('gather-must-gather')).toBe('post');
    expect(inferStepPhase('hypershift-mce-ibmz-create-hcpvirt-oz')).toBe('pre');
  });
});
