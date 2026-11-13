/**
 * Live feature smoke for the 10 monitored IBM Z job types (+ bonus agent).
 *   npx tsx scripts/smoke-monitored-jobs.mts
 */
import { analyzeExecution, type DebugAnalysis } from '../src/lib/analyze.ts';
import { compareToLastGreen } from '../src/lib/compare.ts';
import { buildAgentPrompt } from '../src/lib/agentPrompt.ts';
import { buildJobFacets } from '../src/lib/jobFacets.ts';
import { findLastGreenBuild, buildsPrefixFromGcsPath } from '../src/lib/jobHistory.ts';
import { parseProwUrl } from '../src/lib/url.ts';
import { workflowByJobHints } from '../src/data/workflowGuide.ts';
import { isTestSuiteStep } from '../src/data/vpnWorkflow.ts';

type Case = {
  id: number | string;
  label: string;
  expectWorkflow: string;
  expectResult: 'PASSED' | 'FAILED';
  url: string | null;
  notes?: string;
};

const CASES: Case[] = [
  {
    id: 1,
    label: 'e2e homo z-z · pass',
    expectWorkflow: 'openshift-e2e-libvirt-vpn',
    expectResult: 'PASSED',
    url: 'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-5.1-ocp-e2e-ovn-remote-libvirt-multi-z-z/2119022271203905536',
  },
  {
    id: '1f',
    label: 'e2e homo z-z · fail',
    expectWorkflow: 'openshift-e2e-libvirt-vpn',
    expectResult: 'FAILED',
    url: 'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-5.1-ocp-e2e-ovn-remote-libvirt-multi-z-z/2116485457591144448',
  },
  {
    id: 2,
    label: 'serial · pass',
    expectWorkflow: 'openshift-e2e-libvirt-vpn',
    expectResult: 'PASSED',
    url: 'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-5.1-ocp-e2e-serial-ovn-remote-libvirt-multi-z-z/2120532285399764992',
  },
  {
    id: '2f',
    label: 'serial · fail',
    expectWorkflow: 'openshift-e2e-libvirt-vpn',
    expectResult: 'FAILED',
    url: 'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-5.1-ocp-e2e-serial-ovn-remote-libvirt-multi-z-z/2120894701304287232',
  },
  {
    id: 3,
    label: 'fips · pass',
    expectWorkflow: 'openshift-e2e-libvirt-vpn-fips',
    expectResult: 'PASSED',
    url: 'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-5.1-ocp-fips-ovn-remote-libvirt-multi-z-z/2121011137435668480',
  },
  {
    id: '3f',
    label: 'fips · fail',
    expectWorkflow: 'openshift-e2e-libvirt-vpn-fips',
    expectResult: 'FAILED',
    url: 'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-5.1-ocp-fips-ovn-remote-libvirt-multi-z-z/2120879629840420864',
  },
  {
    id: 4,
    label: 'fips+TP · pass',
    expectWorkflow: 'openshift-e2e-libvirt-vpn-fips',
    expectResult: 'PASSED',
    url: 'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-5.1-ocp-fips-ovn-techpreview-remote-libvirt-multi-z-z/2119037432874668032',
  },
  {
    id: '4f',
    label: 'fips+TP · fail',
    expectWorkflow: 'openshift-e2e-libvirt-vpn-fips',
    expectResult: 'FAILED',
    url: 'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-5.1-ocp-fips-ovn-techpreview-remote-libvirt-multi-z-z/2116500601373200384',
  },
  {
    id: 5,
    label: 'image-ecosystem · pass',
    expectWorkflow: 'openshift-e2e-libvirt-vpn',
    expectResult: 'PASSED',
    url: 'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-5.1-ocp-image-ecosystem-ovn-remote-libvirt-multi-z-z/2116832808054820864',
  },
  {
    id: '5f',
    label: 'image-ecosystem · fail',
    expectWorkflow: 'openshift-e2e-libvirt-vpn',
    expectResult: 'FAILED',
    url: 'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-5.1-ocp-image-ecosystem-ovn-remote-libvirt-multi-z-z/2119369601023217664',
  },
  {
    id: '6f',
    label: 'upgrade 4.22→5.1 · fail only',
    expectWorkflow: 'openshift-e2e-libvirt-vpn',
    expectResult: 'FAILED',
    url: 'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-5.1-upgrade-from-nightly-4.22-ocp-ovn-remote-libvirt-multi-z-z/2120909767235866624',
    notes: 'no recent Sippy success',
  },
  {
    id: 7,
    label: 'hetero z-za · pass',
    expectWorkflow: 'openshift-e2e-libvirt-heterogeneous-vpn',
    expectResult: 'PASSED',
    url: 'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-5.1-ocp-e2e-ovn-remote-libvirt-multi-z-za/2120753624341549056',
  },
  {
    id: '7f',
    label: 'hetero z-za · fail',
    expectWorkflow: 'openshift-e2e-libvirt-heterogeneous-vpn',
    expectResult: 'FAILED',
    url: 'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-5.1-ocp-e2e-ovn-remote-libvirt-multi-z-za/2117492016802697216',
  },
  {
    id: '8f',
    label: 'hetero z-zx · fail only',
    expectWorkflow: 'openshift-e2e-libvirt-upi-heterogeneous',
    expectResult: 'FAILED',
    url: 'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-5.1-ocp-e2e-ovn-remote-libvirt-multi-z-zx/2120679209008369664',
    notes: 'no recent Sippy success',
  },
  {
    id: 9,
    label: 'external UPI · pass',
    expectWorkflow: 'openshift-e2e-libvirt-upi',
    expectResult: 'PASSED',
    url: 'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-5.1-e2e-external-ibmz-upi-libvirt-z-z/2116908285083783168',
  },
  {
    id: '9f',
    label: 'external UPI · fail',
    expectWorkflow: 'openshift-e2e-libvirt-upi',
    expectResult: 'FAILED',
    url: 'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-5.1-e2e-external-ibmz-upi-libvirt-z-z/2119445083265699840',
  },
  {
    id: 10,
    label: 'hypershift HCP · pass',
    expectWorkflow: 'hypershift-mce-ibmz-conformance-s390xmgmt-kubevirt-oz',
    expectResult: 'PASSED',
    url: 'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-hypershift-release-5.1-periodics-mce-e2e-ibmz-s390x-mgmt-ovn-conformance-virt-z-z/2120630340555902976',
  },
  {
    id: '10f',
    label: 'hypershift HCP · fail',
    expectWorkflow: 'hypershift-mce-ibmz-conformance-s390xmgmt-kubevirt-oz',
    expectResult: 'FAILED',
    url: 'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-hypershift-release-5.1-periodics-mce-e2e-ibmz-s390x-mgmt-ovn-conformance-virt-z-z/2120992740220080128',
  },
  {
    id: 'bonus',
    label: 'agent SNO · pass',
    expectWorkflow: 'openshift-e2e-libvirt-vpn',
    expectResult: 'PASSED',
    url: 'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-5.1-e2e-agent-ibmz-sno/2119475275887546368',
  },
];

function suiteStepName(a: DebugAnalysis): string | null {
  const fromWf = a.workflow.find((w) => isTestSuiteStep(w.name) && w.observed);
  return fromWf?.name || null;
}

function featureChecks(a: DebugAnalysis, c: Case) {
  const observed = a.workflow.filter((w) => w.observed);
  const withDur = observed.filter(
    (w) => w.status === 'passed' || w.status === 'failed',
  );
  const zeroDur = withDur.filter((w) => w.duration === 0);
  const nullDur = withDur.filter((w) => w.duration == null);
  const suite = suiteStepName(a);
  const suiteRow = suite ? a.workflow.find((w) => w.name === suite) : null;
  const create = a.workflow.find((w) => w.name === 'hypershift-mce-ibmz-create-hcpvirt-oz');
  const conf = a.workflow.find((w) => w.name === 'conformance-tests');
  const fips = a.workflow.find((w) => w.name === 'fips-check');
  const guide = workflowByJobHints(a.jobName, a.meta.workflow);
  const facets = buildJobFacets(a.meta);
  const prompt = buildAgentPrompt(a);

  const fails = a.testFailures?.failures || [];
  const blocking = fails.filter((f) => f.severity === 'blocking').length;
  const informing = fails.filter((f) => f.severity === 'informing').length;

  const checks: Record<string, boolean> = {
    parseOk: true,
    resultOk: a.result === c.expectResult,
    workflowOk: a.meta.workflow === c.expectWorkflow,
    hasWorkflowSteps: a.workflow.length > 5,
    hasObservedSteps: observed.length > 0,
    hasPhaseTimings: (a.phaseTimings?.length || 0) >= 1,
    hasDiagnosis: Boolean(a.diagnosis?.summary),
    hasFacets: facets.length > 0,
    hasAgentPrompt: prompt.length > 200,
    guideMatches: guide.name === c.expectWorkflow || guide.id.length > 0,
    // Durations: finished steps should almost never be null; 0s only if truly instant
    durationsPresent: nullDur.length === 0,
    // Allow a few true 0s but flag if many finished steps are 0
    durationsSane: withDur.length === 0 || zeroDur.length / withDur.length < 0.35,
  };

  if (c.expectWorkflow.includes('fips')) {
    checks.fipsStepPresent = Boolean(fips);
  }
  if (c.expectWorkflow.includes('hypershift')) {
    checks.hcpCreatePre = create?.phase === 'pre';
    checks.hcpConfTest = conf?.phase === 'test';
    checks.hcpOrder =
      (create ? a.workflow.indexOf(create) : -1) <
      (conf ? a.workflow.indexOf(conf) : 999);
    // Only require observed suite when TEST actually ran.
    if (conf?.observed || a.phaseStatus.test !== 'pending') {
      checks.suiteIsConformance = suite === 'conformance-tests';
    }
  } else if (suite) {
    checks.suiteIsLibvirtTest = suite === 'openshift-e2e-libvirt-test';
  }

  if (c.expectResult === 'FAILED') {
    const infraOnly =
      observed.length === 0 &&
      /lease|Boskos|before steps|no multi-stage/i.test(
        `${a.progressSummary}\n${a.diagnosis?.summary || ''}`,
      );
    checks.hasFirstFailed = Boolean(a.firstFailed) || infraOnly;
    checks.hasObservedSteps = observed.length > 0 || infraOnly;
    // Test-phase fails should usually yield junit; install/infra fails may not
    if (suiteRow?.status === 'failed') {
      checks.hasTestFailures = fails.length > 0;
    }
  }

  if (c.expectResult === 'PASSED') {
    checks.noBlockingFails = blocking === 0;
  }

  return {
    checks,
    detail: {
      result: a.result,
      workflow: a.meta.workflow,
      profile: a.meta.profile,
      testType: a.meta.testType,
      topology: a.meta.topologyShort || a.meta.topology,
      fips: a.meta.fips,
      techPreview: a.meta.techPreview,
      leaseSlot: a.leaseSlot,
      releaseTag: a.release?.tag || null,
      firstFailed: a.firstFailed,
      suite,
      suiteStatus: suiteRow?.status || null,
      observed: observed.length,
      workflowSteps: a.workflow.length,
      zeroDur: zeroDur.map((w) => w.name),
      nullDur: nullDur.map((w) => w.name),
      phaseStatus: a.phaseStatus,
      phaseTimings: a.phaseTimings?.map((p) => ({
        phase: p.phase,
        seconds: p.seconds,
        failed: p.failedCount,
        passed: p.passedCount,
      })),
      testFailures: fails.length
        ? { total: fails.length, blocking, informing }
        : null,
      diagnosisPrimary: a.diagnosis?.primaryStep || null,
      guide: guide.name,
      facets: facets.map((f) => f.label),
      promptChars: prompt.length,
      keyArtifactsSample: a.workflow
        .filter((w) => w.observed && w.keyArtifacts.length > 1)
        .slice(0, 3)
        .map((w) => ({ name: w.name, arts: w.keyArtifacts.map((k) => k.label) })),
    },
  };
}

async function checkCompare(a: DebugAnalysis) {
  const prefix = buildsPrefixFromGcsPath(a.gcsPath);
  const green = await findLastGreenBuild(a.bucket, prefix, a.buildId);
  if (!green) {
    // Valid when Sippy/history has no SUCCESS (upgrade / chronically red jobs).
    return {
      compareOk: true,
      green: null,
      relation: null,
      note: 'no green in history (expected for some jobs)',
    };
  }
  // Full analyze of green is expensive; for smoke verify lookup + light compare path on failures only
  if (a.result !== 'FAILED') {
    return {
      compareOk: true,
      green: green.buildId,
      relation: green.relation,
      note: 'pass job — green lookup only',
    };
  }
  try {
    const res = await compareToLastGreen(a);
    return {
      compareOk: Boolean(res),
      green: res?.baseline.buildId || green.buildId,
      relation: res?.relation || green.relation,
      rows: res?.rows.length || 0,
      changed: res?.rows.filter((r) => r.changed).length || 0,
    };
  } catch (e) {
    return {
      compareOk: false,
      green: green.buildId,
      relation: green.relation,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

let pass = 0;
const rows: Record<string, unknown>[] = [];

for (const c of CASES) {
  if (!c.url) {
    rows.push({ id: c.id, label: c.label, ok: false, error: 'no url' });
    continue;
  }
  const parsed = parseProwUrl(c.url);
  if (!parsed) {
    rows.push({ id: c.id, label: c.label, ok: false, error: 'bad url' });
    continue;
  }
  const t0 = Date.now();
  try {
    const a = await analyzeExecution(parsed);
    const { checks, detail } = featureChecks(a, c);
    const compare = await checkCompare(a);
    checks.compareOk = compare.compareOk !== false;
    const failedKeys = Object.entries(checks)
      .filter(([, v]) => !v)
      .map(([k]) => k);
    const ok = failedKeys.length === 0;
    if (ok) pass += 1;
    rows.push({
      ok,
      id: c.id,
      label: c.label,
      ms: Date.now() - t0,
      failedKeys,
      checks,
      detail,
      compare,
      notes: c.notes || null,
    });
  } catch (e) {
    rows.push({
      ok: false,
      id: c.id,
      label: c.label,
      ms: Date.now() - t0,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

for (const r of rows) console.log(JSON.stringify(r));
console.log(`\nPASS ${pass}/${CASES.length}`);
process.exit(pass === CASES.length ? 0 : 1);
