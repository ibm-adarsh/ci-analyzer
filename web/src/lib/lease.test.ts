import { describe, expect, it } from 'vitest';
import {
  extractLeaseInfo,
  parseClusterProfileFromProwLog,
  parseLeaseFromProwLog,
  parseLibvirtConnectionFromSteps,
} from './lease';
import { resolveLpar } from './lparResolve';
import { mergeReleaseInfo, parseReleaseFromProwLog } from './release';

const SAMPLE_PROW = `
INFO[2026-10-06T13:03:52Z] Imported release 4.22.0-0.nightly-multi-2026-10-05-071148 created at 2026-10-05 08:06:01 +0000 UTC with 191 images to tag release:initial
INFO[2026-10-06T13:04:21Z] Imported release 5.0.0-0.nightly-multi-2026-10-02-094431 created at 2026-10-02 20:29:57 +0000 UTC with 197 images to tag release:latest
INFO[2026-10-06T12:01:37Z] Resolved release ppc64le-latest to registry.ci.openshift.org/ocp-ppc64le/release-5-ppc64le:bad
INFO[2026-10-06T12:01:38Z] Resolved release multi-latest to quay.io/openshift-release-dev/ocp-release-nightly@sha256:good
INFO[2026-10-06T13:04:21Z] Acquired 1 lease(s) for libvirt-s390x-vpn-quota-slice: [libvirt-s390x-2-3]
INFO[2026-10-06T13:04:21Z] Loading information from https://config.ci.openshift.org for cluster profile libvirt-s390x-vpn
`;

describe('lease + release parsing', () => {
  it('parses lease slot and pool from ci-operator log', () => {
    const lease = parseLeaseFromProwLog(SAMPLE_PROW);
    expect(lease).toEqual({
      slot: 'libvirt-s390x-2-3',
      pool: 'libvirt-s390x-vpn-quota-slice',
    });
  });

  it('parses cluster profile from build-log', () => {
    expect(parseClusterProfileFromProwLog(SAMPLE_PROW)).toBe('libvirt-s390x-vpn');
  });

  it('prefers release:latest and multi-latest pullspec (not first Resolved)', () => {
    const rel = parseReleaseFromProwLog(SAMPLE_PROW);
    expect(rel?.tag).toBe('5.0.0-0.nightly-multi-2026-10-02-094431');
    expect(rel?.initialTag).toBe('4.22.0-0.nightly-multi-2026-10-05-071148');
    expect(rel?.pullSpec).toContain('sha256:good');
    expect(rel?.pullSpec).not.toContain('ppc64le');
  });

  it('does not treat s390x-latest as upgrade-from initial', () => {
    const log = `
Imported release 5.0.0-0.nightly-s390x-2026-10-12-040926 created at 2026-10-12 04:10:45 +0000 UTC with 196 images to tag release:s390x-latest
Imported release 5.0.0-0.nightly-multi-2026-10-11-210711 created at 2026-10-11 23:47:33 +0000 UTC with 197 images to tag release:latest
Resolved release multi-latest to quay.io/openshift-release-dev/ocp-release-nightly@sha256:abc
`;
    const rel = parseReleaseFromProwLog(log);
    expect(rel?.tag).toBe('5.0.0-0.nightly-multi-2026-10-11-210711');
    expect(rel?.initialTag).toBeNull();
  });

  it('treats release:s390x-initial as upgrade-from on older Z upgrades', () => {
    const log = `
Imported release 4.13.0-0.nightly-s390x-2024-11-20-091923 created at 2024-11-20 09:19:27 +0000 UTC with 181 images to tag release:s390x-initial
Imported release 4.14.0-0.nightly-s390x-2026-10-08-100525 created at 2026-10-08 10:06:44 +0000 UTC with 186 images to tag release:s390x-latest
Imported release 4.14.0-0.nightly-2026-09-30-024514 created at 2026-09-30 02:46:48 +0000 UTC with 187 images to tag release:latest
Resolved release s390x-initial to registry.ci.openshift.org/ocp-s390x/release-s390x:4.13.0-0.nightly-s390x-2024-11-20-091923
Resolved release latest to registry.ci.openshift.org/ocp/release:4.14.0-0.nightly-2026-09-30-024514
`;
    const rel = parseReleaseFromProwLog(log);
    expect(rel?.tag).toBe('4.14.0-0.nightly-2026-09-30-024514');
    expect(rel?.initialTag).toBe('4.13.0-0.nightly-s390x-2024-11-20-091923');
  });

  it('merges artifact initialTag when log has target but no upgrade-from', () => {
    const fromLog = parseReleaseFromProwLog(`
Imported release 4.15.0-0.nightly-2026-09-15-112245 created at 2026-09-15 with 187 images to tag release:latest
`);
    const merged = mergeReleaseInfo(fromLog, {
      tag: '4.15.0-0.nightly-2026-09-15-112245',
      createdAt: null,
      pullSpec: null,
      initialTag: '4.14.0-0.nightly-s390x-2026-10-08-100525',
      source: 'artifacts/release/artifacts/release-images-s390x-initial',
    });
    expect(merged?.tag).toBe('4.15.0-0.nightly-2026-09-15-112245');
    expect(merged?.initialTag).toBe('4.14.0-0.nightly-s390x-2026-10-08-100525');
  });

  it('ignores Resolved release initial on non-upgrade jobs (no Imported *-initial)', () => {
    const log = `
Resolved release initial to registry.ci.openshift.org/ocp/release:4.14.0-0.nightly-2026-09-29-024514
Resolved release s390x-initial to registry.ci.openshift.org/ocp-s390x/release-s390x:4.14.0-0.nightly-s390x-2026-10-07-100525
Imported release 4.14.0-0.nightly-s390x-2026-10-08-100525 created at 2026-10-08 10:06:44 +0000 UTC with 186 images to tag release:s390x-latest
Imported release 4.14.0-0.nightly-2026-09-30-024514 created at 2026-09-30 02:46:48 +0000 UTC with 187 images to tag release:latest
`;
    const rel = parseReleaseFromProwLog(log);
    expect(rel?.tag).toBe('4.14.0-0.nightly-2026-09-30-024514');
    expect(rel?.initialTag).toBeNull();
  });

  it('reads observed qemu URI from step logs and prefers it over static map', () => {
    // Fixture uses a fake FQDN — resolveLpar must shorten it for display.
    const steps = {
      'upi-libvirt-cleanup-post': {
        logTail: 'Using libvirt connection for qemu+tcp://lnxocp04.example.test/system\n',
        logText: 'Using libvirt connection for qemu+tcp://lnxocp04.example.test/system\n',
      },
    };
    const conn = parseLibvirtConnectionFromSteps(steps);
    expect(conn?.hostname).toBe('lnxocp04.example.test');
    expect(conn?.qemuUri).toBe('qemu+tcp://lnxocp04.example.test/system');

    const lease = extractLeaseInfo(SAMPLE_PROW, steps);
    expect(lease?.slot).toBe('libvirt-s390x-2-3');
    expect(lease?.hostname).toBe('lnxocp04.example.test');

    const lpar = resolveLpar(lease!.slot, lease);
    expect(lpar?.lpar).toBe('lnxocp04');
    expect(lpar?.observed).toBe(true);
    expect(lpar?.hostname).toBe('lnxocp04');
    expect(lpar?.qemuUri).toBe('qemu+tcp://lnxocp04/system');
  });

  it('static map for lease index 2 is lnxocp04 (not the obsolete lnxocp06)', () => {
    const lpar = resolveLpar('libvirt-s390x-2-3');
    expect(lpar?.lpar).toBe('lnxocp04');
  });

  it('resolves OZ and heterogeneous leases from catalog', () => {
    expect(resolveLpar('libvirt-s390x-oz-1-2')?.lpar).toBe('lnxocp12');
    expect(resolveLpar('libvirt-s390x-oz-3-0')?.lpar).toBe('lnxocp14');
    const amd = resolveLpar('libvirt-s390x-vpn-amd64-0-0');
    expect(amd?.lpar).toBe('lnxocp11');
    expect(amd?.hostnameAdditional).toContain('xkvmocp08');
    expect(amd?.vxlanBridge).toBe('ocp1-amd');
    const arm = resolveLpar('libvirt-s390x-arm64-0-0');
    expect(arm?.hostnameAdditional).toContain('akvmocp03');
    expect(arm?.vxlanBridge).toBe('ocp2-arm');
  });

  it('falls back to LEASED_RESOURCE in step logs', () => {
    const steps = {
      'upi-libvirt-cleanup-pre': {
        logTail: '+ export LEASED_RESOURCE=libvirt-s390x-0-1\n',
        logText: '+ export LEASED_RESOURCE=libvirt-s390x-0-1\n',
      },
    };
    const lease = extractLeaseInfo(null, steps);
    expect(lease?.slot).toBe('libvirt-s390x-0-1');
    expect(lease?.source).toContain('upi-libvirt-cleanup-pre');
  });
});
