import { describe, expect, it } from 'vitest';
import { stepCi, workflowByJobHints, workflowByName } from './workflowGuide';

describe('workflow guide helpers', () => {
  it('defaults to vpn workflow', () => {
    expect(workflowByName(null).id).toBe('vpn');
    expect(workflowByJobHints('ocp-e2e-ovn-remote-libvirt-multi-z-z').id).toBe('vpn');
  });

  it('detects fips and heterogeneous from job name', () => {
    expect(workflowByJobHints('ocp-fips-ovn-remote-libvirt-multi-z-z').id).toBe('vpn-fips');
    expect(workflowByJobHints('ocp-e2e-ovn-remote-libvirt-multi-z-xz').id).toBe('hetero');
  });

  it('prefers explicit workflow name', () => {
    expect(
      workflowByJobHints('something-fips', 'openshift-e2e-libvirt-upi-heterogeneous').id,
    ).toBe('hetero');
  });

  it('builds steps.ci URLs with /reference/ (not /ref/)', () => {
    expect(stepCi('ref', 'ipi-conf-etcd-on-ramfs')).toBe(
      'https://steps.ci.openshift.org/reference/ipi-conf-etcd-on-ramfs',
    );
    expect(stepCi('chain', 'upi-conf-libvirt')).toBe(
      'https://steps.ci.openshift.org/chain/upi-conf-libvirt',
    );
    expect(stepCi('workflow', 'openshift-e2e-libvirt-vpn')).toBe(
      'https://steps.ci.openshift.org/workflow/openshift-e2e-libvirt-vpn',
    );
  });
});
