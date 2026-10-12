import { describe, expect, it } from 'vitest';
import { workflowByJobHints, workflowByName } from './workflowGuide';

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
});
