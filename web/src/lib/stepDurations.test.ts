import { describe, expect, it } from 'vitest';
import { assignStepDurations } from './analyze';

describe('assignStepDurations', () => {
  it('uses chronological finished.json order, not object-key order', () => {
    // Simulates HCP leaves listed after POST (old bug → many 0s).
    const started = 1_794_000_644;
    const results = {
      'upi-libvirt-cleanup-post': {
        duration: null as number | null,
        finJson: { timestamp: 1_794_015_838, passed: true },
      },
      'hypershift-mce-ibmz-install-metallb-oz': {
        duration: null as number | null,
        finJson: { timestamp: 1_794_003_901, passed: true },
      },
      'hypershift-mce-install': {
        duration: null as number | null,
        finJson: { timestamp: 1_794_004_381, passed: true },
      },
      'conformance-tests': {
        duration: null as number | null,
        finJson: { timestamp: 1_794_014_137, passed: false },
      },
      'upi-install-libvirt': {
        duration: null as number | null,
        finJson: { timestamp: 1_794_003_644, passed: true },
      },
    };

    assignStepDurations(results, started);

    expect(results['upi-install-libvirt'].duration).toBe(1_794_003_644 - started);
    expect(results['hypershift-mce-ibmz-install-metallb-oz'].duration).toBe(257);
    expect(results['hypershift-mce-install'].duration).toBe(480);
    expect(results['conformance-tests'].duration).toBe(
      1_794_014_137 - 1_794_004_381,
    );
    expect(results['upi-libvirt-cleanup-post'].duration).toBe(
      1_794_015_838 - 1_794_014_137,
    );
  });

  it('leaves duration null when finished.json has no timestamp', () => {
    const results = {
      running: { duration: null as number | null, finJson: null },
      done: {
        duration: null as number | null,
        finJson: { timestamp: 100, passed: true },
      },
    };
    assignStepDurations(results, 50);
    expect(results.running.duration).toBeNull();
    expect(results.done.duration).toBe(50);
  });
});
