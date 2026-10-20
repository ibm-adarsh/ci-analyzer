import { describe, expect, it } from 'vitest';
import { buildCompareRows, type CompareSnapshot } from './compare';

function snap(over: Partial<CompareSnapshot> = {}): CompareSnapshot {
  return {
    buildId: '1',
    gcsPath: 'logs/job/1',
    raw: 'https://prow/view/gs/b/logs/job/1',
    appPath: '/execution/b/logs%2Fjob%2F1',
    result: 'FAILED',
    started: '2026-10-12T00:00:00.000Z',
    durationSec: 100,
    profile: 'libvirt-s390x-vpn',
    releaseTag: '4.20.0-0.nightly-multi-a',
    initialTag: null,
    leaseSlot: 'libvirt-s390x-0-1',
    lpar: 'lnxocp01',
    qemuUri: 'qemu+tcp://lnxocp01.example/system',
    firstFailed: 'openshift-e2e-libvirt-test',
    failedTests: ['[sig-node] foo'],
    testSuiteSummary: '1 Conformance parallel',
    ...over,
  };
}

describe('buildCompareRows', () => {
  it('marks changed fields between current failure and last green', () => {
    const current = snap();
    const baseline = snap({
      buildId: '0',
      result: 'PASSED',
      releaseTag: '4.20.0-0.nightly-multi-b',
      leaseSlot: 'libvirt-s390x-2-3',
      lpar: 'lnxocp04',
      firstFailed: null,
      failedTests: [],
      testSuiteSummary: null,
    });
    const rows = buildCompareRows(current, baseline);
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
    expect(byKey.releaseTag.changed).toBe(true);
    expect(byKey.leaseSlot.changed).toBe(true);
    expect(byKey.lpar.changed).toBe(true);
    expect(byKey.firstFailed.changed).toBe(true);
    expect(byKey.profile.changed).toBe(false);
  });
});
