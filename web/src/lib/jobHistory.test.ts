import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  buildsPrefixFromGcsPath,
  findLastGreenBuild,
} from './jobHistory';
import * as gcs from './gcs';

describe('job history helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

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

  it('prefers an older green, then falls back to a later green', async () => {
    const ids = [
      '2120630340555902976', // newer SUCCESS
      '2118818372148793344', // current FAILURE
      '2118455900262895616', // older FAILURE
    ];
    vi.spyOn(gcs, 'listPrefix').mockResolvedValue({
      prefixes: ids.map(
        (id) =>
          `logs/periodic-ci-openshift-hypershift-release-5.1-periodics-mce-e2e-ibmz-s390x-mgmt-ovn-conformance-virt-z-z/${id}/`,
      ),
    });
    vi.spyOn(gcs, 'fetchJson').mockImplementation(async (url: string) => {
      if (url.includes('2120630340555902976')) {
        return { passed: true, result: 'SUCCESS', timestamp: 100 };
      }
      if (url.includes('2118455900262895616')) {
        return { passed: false, result: 'FAILURE', timestamp: 50 };
      }
      return { passed: false, result: 'FAILURE', timestamp: 80 };
    });

    const hit = await findLastGreenBuild(
      'test-platform-results-public',
      'logs/periodic-ci-openshift-hypershift-release-5.1-periodics-mce-e2e-ibmz-s390x-mgmt-ovn-conformance-virt-z-z/',
      '2118818372148793344',
    );
    expect(hit?.buildId).toBe('2120630340555902976');
    expect(hit?.relation).toBe('later');
  });

  it('returns previous when an older success exists', async () => {
    const ids = ['300', '200', '100'];
    vi.spyOn(gcs, 'listPrefix').mockResolvedValue({
      prefixes: ids.map((id) => `logs/job/${id}/`),
    });
    vi.spyOn(gcs, 'fetchJson').mockImplementation(async (url: string) => {
      if (url.includes('/100/')) return { passed: true, result: 'SUCCESS' };
      if (url.includes('/200/')) return { passed: false, result: 'FAILURE' };
      return { passed: true, result: 'SUCCESS' };
    });

    const hit = await findLastGreenBuild('bucket', 'logs/job/', '200');
    expect(hit?.buildId).toBe('100');
    expect(hit?.relation).toBe('previous');
  });
});
