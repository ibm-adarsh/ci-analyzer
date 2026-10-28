import { describe, expect, it } from 'vitest';
import { keyArtifactsFor } from './analyze';

describe('keyArtifactsFor', () => {
  const base = 'https://storage.googleapis.com/bucket/job/artifacts/test/upi-install-libvirt';

  it('points install log under artifacts/', () => {
    const arts = keyArtifactsFor('upi-install-libvirt', base);
    expect(arts.map((a) => a.label)).toEqual([
      'build-log.txt',
      'artifacts/.openshift_install.log',
    ]);
    expect(arts[1].url).toBe(`${base}/artifacts/.openshift_install.log`);
  });

  it('does not invent an install log for hetero worker-add', () => {
    const arts = keyArtifactsFor(
      'upi-install-libvirt-heterogeneous',
      base.replace(/upi-install-libvirt$/, 'upi-install-libvirt-heterogeneous'),
    );
    expect(arts.map((a) => a.label)).toEqual(['build-log.txt']);
  });

  it('points test + must-gather archives under artifacts/', () => {
    const test = keyArtifactsFor(
      'openshift-e2e-libvirt-test',
      'https://example/openshift-e2e-libvirt-test',
    );
    expect(test.map((a) => a.url)).toEqual([
      'https://example/openshift-e2e-libvirt-test/build-log.txt',
      'https://example/openshift-e2e-libvirt-test/artifacts/junit/',
      'https://example/openshift-e2e-libvirt-test/artifacts/e2e.log',
    ]);
    const mg = keyArtifactsFor(
      'gather-must-gather',
      'https://example/gather-must-gather',
    );
    expect(mg.map((a) => a.url)).toContain(
      'https://example/gather-must-gather/artifacts/must-gather.tar.gz',
    );
  });
});
