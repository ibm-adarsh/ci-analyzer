/**
 * Live smoke across IBM Z job / workflow types.
 *   npx vite-node scripts/smoke-all-workflows.mts
 */
import { analyzeExecution } from '../src/lib/analyze.ts';
import { inferWorkflowName } from '../src/data/vpnWorkflow.ts';
import { parseProwUrl } from '../src/lib/url.ts';

type Expect = {
  workflow: string;
  testStepInTest?: string;
  createBeforeTest?: string;
};

async function latestUrl(job: string): Promise<string | null> {
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

const FIXED: { label: string; url: string; expect: Expect }[] = [
  {
    label: 'vpn · z-z e2e',
    url: 'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-4.20-ocp-e2e-ovn-remote-libvirt-multi-z-z/2109449138415341568',
    expect: {
      workflow: 'openshift-e2e-libvirt-vpn',
      testStepInTest: 'openshift-e2e-libvirt-test',
    },
  },
  {
    label: 'vpn-fips · z-z',
    url: 'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-4.21-ocp-fips-ovn-remote-libvirt-multi-z-z/2109479342793822208',
    expect: {
      workflow: 'openshift-e2e-libvirt-vpn-fips',
      testStepInTest: 'openshift-e2e-libvirt-test',
    },
  },
  {
    label: 'serial · techpreview',
    url: 'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-5.1-ocp-e2e-serial-ovn-techpreview-remote-libvirt-multi-z-z/2109252830022864896',
    expect: {
      workflow: 'openshift-e2e-libvirt-vpn',
      testStepInTest: 'openshift-e2e-libvirt-test',
    },
  },
  {
    label: 'upgrade · z-z',
    url: 'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-5.1-upgrade-from-nightly-4.22-ocp-ovn-remote-libvirt-multi-z-z/2120184974974914560',
    expect: {
      workflow: 'openshift-e2e-libvirt-vpn',
      testStepInTest: 'openshift-e2e-libvirt-test',
    },
  },
  {
    label: 'single-arch s390x',
    url: 'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-5.0-ocp-e2e-ovn-remote-libvirt-s390x/2109498153131577344',
    expect: {
      workflow: 'openshift-e2e-libvirt-vpn',
      testStepInTest: 'openshift-e2e-libvirt-test',
    },
  },
  {
    label: 'agent · z-z',
    url: 'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-4.19-ocp-e2e-ovn-agent-remote-libvirt-multi-z-z/2109418868681216000',
    expect: {
      workflow: 'openshift-e2e-libvirt-vpn',
      testStepInTest: 'openshift-e2e-libvirt-test',
    },
  },
  {
    label: 'hypershift HCP conformance',
    url: 'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-hypershift-release-5.1-periodics-mce-e2e-ibmz-s390x-mgmt-ovn-conformance-virt-z-z/2118818372148793344',
    expect: {
      workflow: 'hypershift-mce-ibmz-conformance-s390xmgmt-kubevirt-oz',
      testStepInTest: 'conformance-tests',
      createBeforeTest: 'hypershift-mce-ibmz-create-hcpvirt-oz',
    },
  },
];

const LATEST: { label: string; job: string; expect: Expect }[] = [
  {
    label: 'hetero vpn · 5.0 z-xz',
    job: 'periodic-ci-openshift-multiarch-main-nightly-5.0-ocp-e2e-ovn-remote-libvirt-multi-z-xz',
    expect: {
      workflow: 'openshift-e2e-libvirt-heterogeneous-vpn',
      testStepInTest: 'openshift-e2e-libvirt-test',
    },
  },
  {
    label: 'hetero upi · 5.1 z-xz',
    job: 'periodic-ci-openshift-multiarch-main-nightly-5.1-ocp-e2e-ovn-remote-libvirt-multi-z-xz',
    expect: {
      workflow: 'openshift-e2e-libvirt-upi-heterogeneous',
      testStepInTest: 'openshift-e2e-libvirt-test',
    },
  },
  {
    label: 'hetero vpn · 5.1 z-za',
    job: 'periodic-ci-openshift-multiarch-main-nightly-5.1-ocp-e2e-ovn-remote-libvirt-multi-z-za',
    expect: {
      workflow: 'openshift-e2e-libvirt-heterogeneous-vpn',
      testStepInTest: 'openshift-e2e-libvirt-test',
    },
  },
];

const CASES: { label: string; url: string; expect: Expect }[] = [...FIXED];
for (const c of LATEST) {
  const url = await latestUrl(c.job);
  if (!url) {
    console.log(JSON.stringify({ ok: false, label: c.label, error: 'no latest build' }));
    continue;
  }
  CASES.push({ label: c.label, url, expect: c.expect });
}

let ok = 0;
const rows: Record<string, unknown>[] = [];

for (const c of CASES) {
  const parsed = parseProwUrl(c.url);
  if (!parsed) {
    rows.push({ label: c.label, ok: false, error: 'bad url' });
    continue;
  }
  try {
    const a = await analyzeExecution(parsed);
    const inferred = inferWorkflowName(a.jobName, a.meta.profile);
    const wf = a.meta.workflow || inferred;
    const testStep = c.expect.testStepInTest
      ? a.workflow.find((w) => w.name === c.expect.testStepInTest)
      : null;
    const createStep = c.expect.createBeforeTest
      ? a.workflow.find((w) => w.name === c.expect.createBeforeTest)
      : null;
    const confIdx = c.expect.testStepInTest
      ? a.workflow.findIndex((w) => w.name === c.expect.testStepInTest)
      : -1;
    const createIdx = c.expect.createBeforeTest
      ? a.workflow.findIndex((w) => w.name === c.expect.createBeforeTest)
      : -1;

    const checks = {
      workflowOk: wf === c.expect.workflow,
      testPhaseOk: !c.expect.testStepInTest || testStep?.phase === 'test',
      createPreOk: !c.expect.createBeforeTest || createStep?.phase === 'pre',
      orderOk:
        !c.expect.createBeforeTest ||
        (createIdx >= 0 && confIdx > createIdx),
      // Non-HCP jobs must not be classified as hypershift.
      notStolen:
        c.expect.workflow.startsWith('hypershift') ||
        !String(wf || '').includes('hypershift'),
    };
    const pass = Object.values(checks).every(Boolean);
    if (pass) ok += 1;
    rows.push({
      ok: pass,
      label: c.label,
      workflow: wf,
      expect: c.expect.workflow,
      phaseStatus: a.phaseStatus,
      firstFailed: a.firstFailed,
      checks,
      testStep: testStep
        ? { name: testStep.name, phase: testStep.phase, status: testStep.status }
        : null,
    });
  } catch (e) {
    rows.push({
      label: c.label,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

for (const r of rows) console.log(JSON.stringify(r));
console.log(`PASS ${ok}/${CASES.length}`);
process.exit(ok === CASES.length ? 0 : 1);
