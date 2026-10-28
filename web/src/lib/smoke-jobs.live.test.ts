/**
 * Live smoke against real IBM Z / s390x Prow jobs.
 * Skipped unless RUN_LIVE_SMOKE=1 (needs network to prow / GCS).
 */
import { describe, expect, it } from 'vitest';
import { analyzeExecution } from './analyze';
import { buildJobFacets } from './jobFacets';
import { resolveLpar } from './lparResolve';
import { parseProwUrl } from './url';

const live = process.env.RUN_LIVE_SMOKE === '1';

const FIXED = [
  {
    label: 'serial · z-z',
    url: 'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-5.0-ocp-e2e-serial-ovn-remote-libvirt-multi-z-z/2107441095997657088',
    expect: {
      topologyKind: 'homogeneous',
      testType: 'conformance-serial',
      fips: false,
    },
  },
  {
    label: 'upgrade · z-z',
    url: 'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-5.0-upgrade-from-nightly-4.22-ocp-ovn-remote-libvirt-multi-z-z/2107456138294333440',
    expect: {
      topologyKind: 'homogeneous',
      testType: 'upgrade',
      fromVersion: '4.22',
    },
  },
  {
    label: 'fips + techpreview · z-z',
    url: 'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-4.23-ocp-fips-ovn-techpreview-multi-z-z/2107396006764089344',
    expect: {
      topologyKind: 'homogeneous',
      fips: true,
      techPreview: true,
      workflow: 'openshift-e2e-libvirt-vpn-fips',
    },
  },
];

const HISTORY_JOBS = [
  {
    job: 'periodic-ci-openshift-multiarch-main-nightly-5.0-ocp-e2e-ovn-agent-remote-libvirt-multi-z-z',
    expect: { installerKind: 'agent', topologyKind: 'homogeneous' },
  },
  {
    job: 'periodic-ci-openshift-multiarch-main-nightly-5.0-ocp-e2e-ovn-remote-libvirt-multi-z-xz',
    expect: {
      topologyKind: 'heterogeneous',
      workerArch: 'amd64',
      workflow: 'openshift-e2e-libvirt-heterogeneous-vpn',
    },
  },
  {
    job: 'periodic-ci-openshift-multiarch-main-nightly-5.0-ocp-image-ecosystem-ovn-remote-libvirt-multi-z-z',
    expect: { testType: 'image-ecosystem', topologyKind: 'homogeneous' },
  },
  {
    job: 'periodic-ci-openshift-multiarch-main-nightly-5.1-ocp-e2e-ovn-remote-libvirt-multi-z-za',
    expect: {
      topologyKind: 'heterogeneous',
      workerArch: 'arm64',
      workflow: 'openshift-e2e-libvirt-heterogeneous-vpn',
    },
  },
  {
    job: 'periodic-ci-openshift-multiarch-main-nightly-5.1-ocp-e2e-ovn-remote-libvirt-multi-z-xz',
    expect: {
      topologyKind: 'heterogeneous',
      workerArch: 'amd64',
      workflow: 'openshift-e2e-libvirt-upi-heterogeneous',
    },
  },
  {
    job: 'periodic-ci-openshift-multiarch-main-nightly-5.0-ocp-fips-ovn-remote-libvirt-multi-z-z',
    expect: { fips: true, workflow: 'openshift-e2e-libvirt-vpn-fips' },
  },
];

async function latestUrl(job: string): Promise<string | null> {
  // Prefer GCS prefix listing — prow job-history?mode=json often returns HTML.
  const gcs = `https://storage.googleapis.com/storage/v1/b/test-platform-results-public/o?prefix=logs/${encodeURIComponent(job)}/&delimiter=/&maxResults=20`;
  const res = await fetch(gcs);
  if (!res.ok) return null;
  const data = (await res.json()) as { prefixes?: string[] };
  const ids = (data.prefixes || [])
    .map((p) => p.replace(/\/$/, '').split('/').pop() || '')
    .filter((id) => /^\d+$/.test(id))
    .sort((a, b) => (BigInt(b) > BigInt(a) ? 1 : -1));
  const id = ids[0];
  if (!id) return null;
  return `https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/${job}/${id}`;
}

describe.runIf(live)('live IBM Z job smoke', () => {
  it(
    'classifies fixed example jobs',
    async () => {
      for (const job of FIXED) {
        const parsed = parseProwUrl(job.url)!;
        const a = await analyzeExecution(parsed);
        const facets = buildJobFacets(a.meta);
        // eslint-disable-next-line no-console
        console.log(job.label, {
          result: a.result,
          facets: facets.map((f) => `${f.label}=${f.value}`),
          lease: a.leaseSlot,
          lpar: a.leaseSlot ? resolveLpar(a.leaseSlot, a.lease)?.lpar : null,
          workflow: a.meta.workflow,
          phaseStatus: a.phaseStatus,
          firstFailed: a.firstFailed,
        });
        if (job.expect.topologyKind)
          expect(a.meta.topologyKind).toBe(job.expect.topologyKind);
        if (job.expect.testType) expect(a.meta.testType).toBe(job.expect.testType);
        if (job.expect.fromVersion) expect(a.meta.fromVersion).toBe(job.expect.fromVersion);
        if (job.expect.fips != null) expect(a.meta.fips).toBe(job.expect.fips);
        if (job.expect.techPreview != null)
          expect(a.meta.techPreview).toBe(job.expect.techPreview);
        if (job.expect.workflow) expect(a.meta.workflow).toBe(job.expect.workflow);
        expect(a.meta.workflow).toBeTruthy();
        expect(a.phaseStatus.pre).toBeTruthy();
      }
    },
    300_000,
  );

  it(
    'classifies latest builds across agent / hetero / ecosystem / fips',
    async () => {
      for (const entry of HISTORY_JOBS) {
        const url = await latestUrl(entry.job);
        if (!url) {
          // eslint-disable-next-line no-console
          console.warn('skip — no history', entry.job);
          continue;
        }
        const parsed = parseProwUrl(url)!;
        const a = await analyzeExecution(parsed);
        // eslint-disable-next-line no-console
        console.log(entry.job.replace(/^periodic-ci-openshift-multiarch-main-nightly-/, ''), {
          build: a.buildId,
          result: a.result,
          topology: a.meta.topologyShort,
          suite: a.meta.suiteLabel,
          installer: a.meta.installerLabel,
          fips: a.meta.fips,
          profile: a.meta.profile,
          workflow: a.meta.workflow,
          lease: a.leaseSlot,
          lpar: a.leaseSlot ? resolveLpar(a.leaseSlot, a.lease)?.lpar : null,
          vxlan: a.leaseSlot
            ? resolveLpar(a.leaseSlot, a.lease)?.vxlanBridge
            : null,
        });
        if (entry.expect.topologyKind)
          expect(a.meta.topologyKind).toBe(entry.expect.topologyKind);
        if (entry.expect.workerArch) expect(a.meta.workerArch).toBe(entry.expect.workerArch);
        if (entry.expect.installerKind)
          expect(a.meta.installerKind).toBe(entry.expect.installerKind);
        if (entry.expect.testType) expect(a.meta.testType).toBe(entry.expect.testType);
        if (entry.expect.fips != null) expect(a.meta.fips).toBe(entry.expect.fips);
        if (entry.expect.workflow) expect(a.meta.workflow).toBe(entry.expect.workflow);
        expect(a.meta.workflow).toBeTruthy();
      }
    },
    600_000,
  );
});
