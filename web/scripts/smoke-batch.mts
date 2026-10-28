/**
 * Broad live smoke: 15–20 IBM Z jobs — classification, failures, artifacts.
 *   npx vite-node scripts/smoke-batch.mts
 */
import { analyzeExecution } from '../src/lib/analyze.ts';
import { buildJobFacets } from '../src/lib/jobFacets.ts';
import { gcsApiUrl } from '../src/lib/gcs.ts';
import { resolveLpar } from '../src/lib/lparResolve.ts';
import { parseProwUrl } from '../src/lib/url.ts';

type Expect = {
  topologyKind?: string;
  testType?: string;
  fips?: boolean;
  techPreview?: boolean;
  installerKind?: string;
  workerArch?: string;
  workflow?: string;
  fromVersion?: string;
  /** When set, expect this blocking/informing split on TEST failures */
  failSplit?: { blocking: number; informing: number };
};

type Job = { label: string; url?: string; historyJob?: string; expect?: Expect };

const FIXED: Job[] = [
  {
    label: 'serial z-z',
    url: 'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-5.0-ocp-e2e-serial-ovn-remote-libvirt-multi-z-z/2107441095997657088',
    expect: { topologyKind: 'homogeneous', testType: 'conformance-serial' },
  },
  {
    label: 'upgrade z-z',
    url: 'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-5.0-upgrade-from-nightly-4.22-ocp-ovn-remote-libvirt-multi-z-z/2107456138294333440',
    expect: {
      topologyKind: 'homogeneous',
      testType: 'upgrade',
      fromVersion: '4.22',
      failSplit: { blocking: 1, informing: 0 },
    },
  },
  {
    label: 'fips+tp z-z',
    url: 'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-4.23-ocp-fips-ovn-techpreview-multi-z-z/2107396006764089344',
    expect: {
      topologyKind: 'homogeneous',
      fips: true,
      techPreview: true,
      workflow: 'openshift-e2e-libvirt-vpn-fips',
      failSplit: { blocking: 1, informing: 5 },
    },
  },
  {
    label: 'agent z-z',
    url: 'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-5.0-ocp-e2e-ovn-agent-remote-libvirt-multi-z-z/2114265916643479552',
    expect: { installerKind: 'agent', topologyKind: 'homogeneous' },
  },
  {
    label: 'hetero z-xz 5.0',
    url: 'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-5.0-ocp-e2e-ovn-remote-libvirt-multi-z-xz/2114879816971849728',
    expect: {
      topologyKind: 'heterogeneous',
      workerArch: 'amd64',
      workflow: 'openshift-e2e-libvirt-heterogeneous-vpn',
    },
  },
  {
    label: 'image-ecosystem',
    url: 'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-5.0-ocp-image-ecosystem-ovn-remote-libvirt-multi-z-z/2114250702833324032',
    expect: { testType: 'image-ecosystem', topologyKind: 'homogeneous' },
  },
  {
    label: 'hetero z-za 5.1',
    url: 'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-5.1-ocp-e2e-ovn-remote-libvirt-multi-z-za/2114955272370786304',
    expect: {
      topologyKind: 'heterogeneous',
      workerArch: 'arm64',
      workflow: 'openshift-e2e-libvirt-heterogeneous-vpn',
    },
  },
  {
    label: 'hetero z-xz 5.1',
    url: 'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-5.1-ocp-e2e-ovn-remote-libvirt-multi-z-xz/2114879819492626432',
    expect: {
      topologyKind: 'heterogeneous',
      workerArch: 'amd64',
      workflow: 'openshift-e2e-libvirt-upi-heterogeneous',
    },
  },
  {
    label: 'fips z-z 5.0',
    url: 'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-5.0-ocp-fips-ovn-remote-libvirt-multi-z-z/2104029812044599296',
    expect: { fips: true, workflow: 'openshift-e2e-libvirt-vpn-fips' },
  },
];

const HISTORY: Job[] = [
  {
    label: 'latest e2e z-z 5.0',
    historyJob:
      'periodic-ci-openshift-multiarch-main-nightly-5.0-ocp-e2e-ovn-remote-libvirt-multi-z-z',
    expect: { topologyKind: 'homogeneous', workflow: 'openshift-e2e-libvirt-vpn' },
  },
  {
    label: 'latest serial 5.1',
    historyJob:
      'periodic-ci-openshift-multiarch-main-nightly-5.1-ocp-e2e-serial-ovn-remote-libvirt-multi-z-z',
    expect: { topologyKind: 'homogeneous', testType: 'conformance-serial' },
  },
  {
    label: 'latest upgrade 5.1←5.0',
    historyJob:
      'periodic-ci-openshift-multiarch-main-nightly-5.1-upgrade-from-nightly-5.0-ocp-ovn-remote-libvirt-multi-z-z',
    expect: { topologyKind: 'homogeneous', testType: 'upgrade' },
  },
  {
    label: 'latest fips 5.1',
    historyJob:
      'periodic-ci-openshift-multiarch-main-nightly-5.1-ocp-fips-ovn-remote-libvirt-multi-z-z',
    expect: { fips: true, workflow: 'openshift-e2e-libvirt-vpn-fips' },
  },
  {
    label: 'latest agent 5.1',
    historyJob:
      'periodic-ci-openshift-multiarch-main-nightly-5.1-ocp-e2e-ovn-agent-remote-libvirt-multi-z-z',
    expect: { installerKind: 'agent' },
  },
  {
    label: 'latest e2e z-z 4.20',
    historyJob:
      'periodic-ci-openshift-multiarch-main-nightly-4.20-ocp-e2e-ovn-remote-libvirt-multi-z-z',
    expect: { topologyKind: 'homogeneous' },
  },
  {
    label: 'latest upgrade 4.22←4.21',
    historyJob:
      'periodic-ci-openshift-multiarch-main-nightly-4.22-upgrade-from-nightly-4.21-ocp-ovn-remote-libvirt-multi-z-z',
    expect: { testType: 'upgrade', fromVersion: '4.21' },
  },
  {
    label: 'latest image-eco 5.1',
    historyJob:
      'periodic-ci-openshift-multiarch-main-nightly-5.1-ocp-image-ecosystem-ovn-remote-libvirt-multi-z-z',
    expect: { testType: 'image-ecosystem' },
  },
  {
    label: 'latest techpreview 5.0',
    historyJob:
      'periodic-ci-openshift-multiarch-main-nightly-5.0-ocp-e2e-ovn-techpreview-remote-libvirt-multi-z-z',
    expect: { techPreview: true, topologyKind: 'homogeneous' },
  },
];

async function latestUrl(job: string): Promise<string | null> {
  const gcs = `https://storage.googleapis.com/storage/v1/b/test-platform-results-public/o?prefix=logs/${encodeURIComponent(job)}/&delimiter=/&maxResults=30`;
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

async function headOk(url: string): Promise<boolean> {
  try {
    const r = await fetch(gcsApiUrl(url), { method: 'GET', headers: { Range: 'bytes=0-0' } });
    return r.status === 200 || r.status === 206 || r.status === 416;
  } catch {
    return false;
  }
}

function checkExpect(a: Awaited<ReturnType<typeof analyzeExecution>>, exp: Expect): string[] {
  const bad: string[] = [];
  if (exp.topologyKind && a.meta.topologyKind !== exp.topologyKind)
    bad.push(`topo=${a.meta.topologyKind}`);
  if (exp.testType && a.meta.testType !== exp.testType) bad.push(`suite=${a.meta.testType}`);
  if (exp.fips != null && a.meta.fips !== exp.fips) bad.push(`fips=${a.meta.fips}`);
  if (exp.techPreview != null && a.meta.techPreview !== exp.techPreview)
    bad.push(`tp=${a.meta.techPreview}`);
  if (exp.installerKind && a.meta.installerKind !== exp.installerKind)
    bad.push(`installer=${a.meta.installerKind}`);
  if (exp.workerArch && a.meta.workerArch !== exp.workerArch)
    bad.push(`workers=${a.meta.workerArch}`);
  if (exp.workflow && a.meta.workflow !== exp.workflow) bad.push(`wf=${a.meta.workflow}`);
  if (exp.fromVersion && a.meta.fromVersion !== exp.fromVersion)
    bad.push(`from=${a.meta.fromVersion}`);
  if (!a.meta.workflow) bad.push('workflow-null');

  // Sensitive: no internal FQDN / private IP leaked into facets or lease display helpers
  const facets = buildJobFacets(a.meta);
  const blob = JSON.stringify({
    facets,
    lease: a.lease,
    workflow: a.meta.workflow,
    progress: a.progressSummary,
  });
  if (/phc-cicd|cis\.ibm\.net|192\.168\./i.test(blob)) bad.push('sensitive-leak');

  // TEST-phase failure sanity
  const testFailed =
    a.phaseStatus.test === 'failed' || a.firstFailed === 'openshift-e2e-libvirt-test';
  if (testFailed) {
    const fails = a.testFailures?.failures || [];
    if (!fails.length) bad.push('test-fail-no-cases');
    if (exp.failSplit) {
      const nB = fails.filter((f) => f.severity === 'blocking').length;
      const nI = fails.filter((f) => f.severity === 'informing').length;
      if (nB !== exp.failSplit.blocking || nI !== exp.failSplit.informing) {
        bad.push(`split=${nB}b/${nI}i want ${exp.failSplit.blocking}b/${exp.failSplit.informing}i`);
      }
    } else if (a.testFailures?.summary.blockingFail != null) {
      const nB = fails.filter((f) => f.severity === 'blocking').length;
      const nI = fails.filter((f) => f.severity === 'informing').length;
      const s = a.testFailures.summary;
      // When log summary is present, classifications should match counts if both known
      if (
        s.informingFail != null &&
        s.blockingFail != null &&
        fails.length === s.blockingFail + s.informingFail &&
        (nB !== s.blockingFail || nI !== s.informingFail)
      ) {
        bad.push(`summary-mismatch ${nB}b/${nI}i vs log ${s.blockingFail}b/${s.informingFail}i`);
      }
    }
  }

  // Observed steps: build-log must exist
  const observed = a.workflow.filter((w) => w.observed && w.stepBase);
  return bad;
}

async function checkArtifacts(
  a: Awaited<ReturnType<typeof analyzeExecution>>,
): Promise<string[]> {
  const bad: string[] = [];
  const observed = a.workflow.filter((w) => w.observed && w.stepBase).slice(0, 8);
  for (const w of observed) {
    const log = w.keyArtifacts.find((k) => k.label === 'build-log.txt')?.url;
    if (!log) {
      bad.push(`no-build-log-link:${w.name}`);
      continue;
    }
    if (!(await headOk(log))) bad.push(`404-build-log:${w.name}`);
    for (const art of w.keyArtifacts) {
      if (art.label === 'build-log.txt') continue;
      if (art.url.endsWith('/')) continue; // dir listing
      // Optional archives may be missing
      if (/must-gather|e2e\.log/i.test(art.label)) continue;
      if (!(await headOk(art.url))) bad.push(`404:${w.name}/${art.label}`);
    }
  }
  // Install log path when install step observed
  const install = a.workflow.find((w) => w.name === 'upi-install-libvirt' && w.observed);
  if (install?.stepBase) {
    const want = `${install.stepBase}/artifacts/.openshift_install.log`;
    const linked = install.keyArtifacts.some((k) => k.url === want);
    if (!linked) bad.push('install-log-wrong-path');
    else if (!(await headOk(want))) bad.push('install-log-404');
  }
  return bad;
}

const all = [...FIXED, ...HISTORY];
let badJobs = 0;
let checked = 0;

for (const job of all) {
  let url = job.url || null;
  if (!url && job.historyJob) url = await latestUrl(job.historyJob);
  console.log(`\n## ${job.label}`);
  if (!url) {
    console.log('  SKIP no builds');
    continue;
  }
  const parsed = parseProwUrl(url);
  if (!parsed) {
    console.log('  FAIL parse', url);
    badJobs++;
    continue;
  }
  checked++;
  try {
    const a = await analyzeExecution(parsed);
    const lpar = a.leaseSlot ? resolveLpar(a.leaseSlot, a.lease) : null;
    const fails = a.testFailures?.failures || [];
    const nB = fails.filter((f) => f.severity === 'blocking').length;
    const nI = fails.filter((f) => f.severity === 'informing').length;
    console.log(
      `  result=${a.result} wf=${a.meta.workflow} lease=${a.leaseSlot || '—'}→${lpar?.lpar || '—'}`,
    );
    console.log(
      `  phases=${JSON.stringify(a.phaseStatus)} firstFailed=${a.firstFailed || '—'} fails=${fails.length} (${nB}b/${nI}i)`,
    );
    console.log(`  progress=${a.progressSummary || '—'}`);

    const issues = [
      ...checkExpect(a, job.expect || {}),
      ...(await checkArtifacts(a)),
    ];
    // Short hostname only in resolved LPAR
    if (lpar?.hostname && lpar.hostname.includes('.')) issues.push('lpar-fqdn');
    if (lpar?.qemuUri && /\.[a-z].*\//i.test(lpar.qemuUri.replace(/^qemu\+tcp:\/\//, ''))) {
      // qemu+tcp://host/system — host should not contain dots (FQDN)
      const host = lpar.qemuUri.replace(/^qemu\+tcp:\/\//i, '').split('/')[0];
      if (host.includes('.')) issues.push('qemu-fqdn');
    }

    if (issues.length) {
      console.log('  FAIL', issues.join(', '));
      badJobs++;
    } else {
      console.log('  OK');
    }
  } catch (e) {
    console.log('  FAIL exception', String(e).slice(0, 200));
    badJobs++;
  }
}

console.log(`\nchecked=${checked} bad=${badJobs} totalListed=${all.length}`);
process.exit(badJobs ? 1 : 0);
