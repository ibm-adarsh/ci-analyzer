import { describe, expect, it } from 'vitest';
import { buildJobFacets } from './jobFacets';
import type { JobMeta } from '../types';

function baseMeta(over: Partial<JobMeta> = {}): JobMeta {
  return {
    jobName: 'periodic-ci-openshift-multiarch-main-nightly-5.0-upgrade-from-nightly-4.22-ocp-ovn-remote-libvirt-multi-z-z',
    ocpVersion: '5.0',
    fromVersion: '4.22',
    topology: 'multi-z-z',
    topologyShort: 'Homogeneous (z-z)',
    topologyKind: 'homogeneous',
    workerArch: null,
    suiteLabel: 'Upgrade',
    testType: 'upgrade',
    installerLabel: 'Classical UPI',
    installer: 'upi',
    installerKind: 'upi',
    fips: false,
    techPreview: false,
    arch: 's390x',
    profile: 'libvirt-s390x-vpn',
    workflow: 'openshift-e2e-libvirt-vpn',
    ...over,
  } as JobMeta;
}

describe('buildJobFacets', () => {
  it('shows the full workflow name (not a truncated vpn label)', () => {
    const facets = buildJobFacets(baseMeta());
    const wf = facets.find((f) => f.id === 'workflow');
    expect(wf?.value).toBe('openshift-e2e-libvirt-vpn');
  });
});
