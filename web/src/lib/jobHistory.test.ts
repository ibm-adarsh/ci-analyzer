import { describe, expect, it } from 'vitest';
import { buildsPrefixFromGcsPath } from './jobHistory';

describe('job history helpers', () => {
  it('strips build id from periodic gcs path', () => {
    expect(
      buildsPrefixFromGcsPath(
        'logs/periodic-ci-openshift-multiarch-main-nightly-4.20-ocp-e2e-ovn-remote-libvirt-multi-z-z/2109449138415341568',
      ),
    ).toBe(
      'logs/periodic-ci-openshift-multiarch-main-nightly-4.20-ocp-e2e-ovn-remote-libvirt-multi-z-z/',
    );
  });

  it('strips build id from pr-logs path', () => {
    expect(
      buildsPrefixFromGcsPath(
        'pr-logs/pull/openshift_release/86277/rehearse-86277-periodic-ci-openshift-multiarch-main-nightly-5.1-ocp-e2e-ovn-remote-libvirt-multi-z-za/2109621341937209344',
      ),
    ).toBe(
      'pr-logs/pull/openshift_release/86277/rehearse-86277-periodic-ci-openshift-multiarch-main-nightly-5.1-ocp-e2e-ovn-remote-libvirt-multi-z-za/',
    );
  });
});
