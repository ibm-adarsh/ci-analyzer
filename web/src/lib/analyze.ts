import { BEST_EFFORT_STEPS } from '../data/workflow';
import { LEASE_BY_SLOT } from '../data/lpar';
import {
  HETERO_ALIASES,
  HETERO_VPN_WORKFLOW_STEPS,
  UPI_HETERO_WORKFLOW_STEPS,
  VPN_WORKFLOW_STEPS,
  inferWorkflowName,
  stepsForWorkflow,
  workflowForJob,
} from '../data/vpnWorkflow';
import type { Analysis, JobResult, ParsedUrl, StepResult, StepStatus } from '../types';
import { buildDiagnosis } from './diagnosis';
import { fetchJson, fetchText, listPrefix } from './gcs';
import { extractLeaseInfo, type LeaseInfo } from './lease';
import {
  buildConfigLinks,
  enrichMetaFromProwjob,
  enrichMetaFromProwLog,
  parseJobMeta,
} from './meta';
import { collectTestFailures, type TestFailureReport } from './junit';
import {
  fetchReleaseFromArtifacts,
  mergeReleaseInfo,
  parseReleaseFromProwLog,
  type ReleaseInfo,
} from './release';

export type ProgressFn = (pct: number, label: string) => void;

export type WorkflowStepStatus = StepStatus | 'pending' | 'current';

export interface WorkflowStepView {
  name: string;
  /** GCS artifact directory when it differs from workflow name (hetero aliases). */
  observedName?: string | null;
  phase: 'pre' | 'test' | 'post';
  status: WorkflowStepStatus;
  bestEffort?: boolean;
  via?: string;
  observed: boolean;
  duration: number | null;
  patterns: { category: string; hint: string }[];
  failureSnippet: string | null;
  logTail: string | null;
  stepBase: string | null;
  keyArtifacts: { label: string; url: string }[];
}

const NON_TEST_ARTIFACT_DIRS = new Set(['build-resources', 'release', 'job_labels']);

/** Pick the ci-operator test artifact directory (not build-resources / release / job_labels). */
async function discoverArtifactSubdir(
  bucket: string,
  gcsPath: string,
  jobName: string,
): Promise<string | null> {
  const data = await listPrefix(bucket, `${gcsPath}/artifacts/`, { delimiter: '/', maxResults: 40 });
  if (!data?.prefixes) return null;
  const candidates = data.prefixes
    .map((p) => p.replace(/\/$/, '').split('/').pop()!)
    .filter((n) => n && !NON_TEST_ARTIFACT_DIRS.has(n));
  if (!candidates.length) return null;
  // Prefer directory whose name is embedded in the Prow job name (e.g. ocp-fips-…-z-z).
  const named = candidates.find((c) => jobName.includes(c));
  if (named) return named;
  // Prefer the longest name (test dirs are usually more specific than misc folders).
  return [...candidates].sort((a, b) => b.length - a.length)[0] || null;
}

async function fetchAllSteps(
  artBase: string,
  bucket: string,
  gcsPath: string,
  testSubdir: string | null,
  started: { timestamp?: number } | null,
): Promise<Record<string, StepResult>> {
  const prefix = `${gcsPath}/artifacts/${testSubdir ? `${testSubdir}/` : ''}`;
  const dirData = await listPrefix(bucket, prefix, { delimiter: '/', maxResults: 100 });
  // Never treat build-resources / release / job_labels as multi-stage steps
  // (early-fail jobs often only have those under artifacts/).
  const existing = new Set(
    (dirData?.prefixes || [])
      .map((p) => p.replace(/\/$/, '').split('/').pop()!)
      .filter((n) => n && !NON_TEST_ARTIFACT_DIRS.has(n)),
  );

  const configured = [
    ...new Set(
      [
        ...VPN_WORKFLOW_STEPS,
        ...HETERO_VPN_WORKFLOW_STEPS,
        ...UPI_HETERO_WORKFLOW_STEPS,
      ].map((s) => s.name),
    ),
  ];
  const toFetch = [
    ...configured.filter((s) => existing.has(s)),
    ...[...existing].filter((s) => !configured.includes(s)),
  ];

  const rawData: Record<
    string,
    { finJson: StepResult['finJson']; logText: string | null; stepBase: string }
  > = {};

  await Promise.all(
    toFetch.map(async (stepName) => {
      const stepBase = `${artBase}/${stepName}`;
      const [finJson, logText] = await Promise.all([
        fetchJson<StepResult['finJson']>(`${stepBase}/finished.json`),
        fetchText(`${stepBase}/build-log.txt`),
      ]);
      rawData[stepName] = { finJson, logText, stepBase };
    }),
  );

  let prevEndTs = started?.timestamp ?? null;
  const results: Record<string, StepResult> = {};

  for (const stepName of toFetch) {
    const { finJson, logText, stepBase } = rawData[stepName];
    let status: StepStatus = 'unknown';
    let duration: number | null = null;
    let endTs: number | null = null;

    if (finJson) {
      if (finJson.passed === true) status = 'passed';
      else if (finJson.passed === false) status = 'failed';
      endTs = finJson.timestamp ?? null;
      if (endTs && prevEndTs) duration = Math.max(0, endTs - prevEndTs);
    } else if (logText && logText !== '__REDACTED__') {
      // Directory exists, finished.json missing → step is currently executing
      if (/\+ exit [1-9]|\blevel=error\b.*exit|step failed/i.test(logText)) status = 'failed';
      else status = 'running';
    } else if (logText === '__REDACTED__') {
      status = 'unknown';
    }

    if (endTs) prevEndTs = endTs;

    const safeLog = logText && logText !== '__REDACTED__' ? logText : '';
    const logTail = safeLog
      ? safeLog.split('\n').slice(-100).join('\n')
      : logText === '__REDACTED__'
        ? '__REDACTED__'
        : null;
    results[stepName] = {
      status,
      duration,
      finJson,
      logTail,
      logText: safeLog || null,
      patterns: [],
      failureSnippet: null,
      stepBase,
    };
  }

  return results;
}

/** Key GCS artifact links for a step — paths match what ci-operator actually uploads. */
export function keyArtifactsFor(
  step: string,
  stepBase: string,
): { label: string; url: string }[] {
  const out: { label: string; url: string }[] = [
    { label: 'build-log.txt', url: `${stepBase}/build-log.txt` },
  ];
  // Primary UPI install only (hetero worker-add step usually has no installer log).
  // File lives under the step's artifacts/ dir, not the step root.
  if (step === 'upi-install-libvirt') {
    out.push({
      label: 'artifacts/.openshift_install.log',
      url: `${stepBase}/artifacts/.openshift_install.log`,
    });
  }
  if (step === 'openshift-e2e-libvirt-test') {
    out.push({ label: 'artifacts/junit/', url: `${stepBase}/artifacts/junit/` });
    out.push({ label: 'artifacts/e2e.log', url: `${stepBase}/artifacts/e2e.log` });
  }
  if (step === 'gather-must-gather') {
    out.push({
      label: 'artifacts/must-gather.tar.gz',
      url: `${stepBase}/artifacts/must-gather.tar.gz`,
    });
  }
  return out;
}

/** Observed GCS dir for a workflow leaf (hetero aliases map onto VPN names). */
function observedDirFor(canon: string, steps: Record<string, StepResult>): string | null {
  if (steps[canon]) return canon;
  for (const [hetero, c] of Object.entries(HETERO_ALIASES)) {
    if (c === canon && steps[hetero]) return hetero;
  }
  return null;
}

function buildWorkflowView(
  jobName: string,
  profile: string | null | undefined,
  steps: Record<string, StepResult>,
  jobRunning: boolean,
  workflowName?: string | null,
): { workflow: WorkflowStepView[]; currentStep: string | null } {
  const defs = workflowName
    ? stepsForWorkflow(workflowName)
    : workflowForJob(jobName, profile);
  // Map hetero observed names onto workflow
  const byName: Record<string, StepResult> = { ...steps };
  for (const [hetero, canon] of Object.entries(HETERO_ALIASES)) {
    if (steps[hetero] && !steps[canon]) byName[canon] = steps[hetero];
  }

  const workflow: WorkflowStepView[] = defs.map((d) => {
    const obs = byName[d.name];
    const observedName = observedDirFor(d.name, steps);
    if (!obs) {
      return {
        name: d.name,
        observedName: null,
        phase: d.phase,
        status: 'pending' as const,
        bestEffort: d.bestEffort,
        via: d.via,
        observed: false,
        duration: null,
        patterns: [],
        failureSnippet: null,
        logTail: null,
        stepBase: null,
        keyArtifacts: [],
      };
    }
    const dir = observedName || d.name;
    return {
      name: d.name,
      observedName: observedName && observedName !== d.name ? observedName : null,
      phase: d.phase,
      status: obs.status,
      bestEffort: d.bestEffort || BEST_EFFORT_STEPS.has(d.name),
      via: d.via,
      observed: true,
      duration: obs.duration,
      patterns: obs.patterns,
      failureSnippet: obs.failureSnippet,
      logTail: obs.logTail,
      stepBase: obs.stepBase,
      keyArtifacts: keyArtifactsFor(dir, obs.stepBase),
    };
  });

  // Extra observed steps not in VPN workflow
  for (const name of Object.keys(steps)) {
    if (workflow.some((w) => w.name === name)) continue;
    if (HETERO_ALIASES[name]) continue;
    const obs = steps[name];
    workflow.push({
      name,
      observedName: null,
      phase: 'pre',
      status: obs.status,
      observed: true,
      duration: obs.duration,
      patterns: obs.patterns,
      failureSnippet: obs.failureSnippet,
      logTail: obs.logTail,
      stepBase: obs.stepBase,
      keyArtifacts: keyArtifactsFor(name, obs.stepBase),
    });
  }

  // Infer current step for running jobs
  let currentStep: string | null = null;
  const runningObs = workflow.find((w) => w.status === 'running');
  if (runningObs) {
    currentStep = runningObs.name;
    runningObs.status = 'current';
  } else if (jobRunning) {
    const firstPending = workflow.find((w) => w.status === 'pending' && !w.bestEffort)
      || workflow.find((w) => w.status === 'pending');
    if (firstPending) {
      currentStep = firstPending.name;
      firstPending.status = 'current';
    }
  }

  return { workflow, currentStep };
}

export interface PhaseTiming {
  phase: 'pre' | 'test' | 'post';
  label: string;
  seconds: number;
  timedSteps: number;
  stepCount: number;
  passedCount: number;
  failedCount: number;
  pendingCount: number;
  status: string;
}

export interface DebugAnalysis extends Analysis {
  workflow: WorkflowStepView[];
  currentStep: string | null;
  release: ReleaseInfo | null;
  /** Boskos lease slot string (convenience; same as lease?.slot) */
  leaseSlot: string | null;
  lease: LeaseInfo | null;
  progressSummary: string;
  phaseTimings: PhaseTiming[];
  /** Failing openshift-tests cases when TEST phase failed */
  testFailures: TestFailureReport | null;
}

function computePhaseTimings(
  workflow: WorkflowStepView[],
  phaseStatus: Record<string, string>,
): PhaseTiming[] {
  const labels = { pre: 'PRE', test: 'TEST', post: 'POST' } as const;
  return (['pre', 'test', 'post'] as const).map((ph) => {
    const group = workflow.filter((w) => w.phase === ph);
    let seconds = 0;
    let timedSteps = 0;
    let passedCount = 0;
    let failedCount = 0;
    let pendingCount = 0;
    for (const w of group) {
      if (w.duration != null && w.duration >= 0) {
        seconds += w.duration;
        timedSteps += 1;
      }
      if (w.status === 'passed') passedCount += 1;
      else if (w.status === 'failed') failedCount += 1;
      else if (w.status === 'pending' || w.status === 'current' || w.status === 'running')
        pendingCount += 1;
    }
    return {
      phase: ph,
      label: labels[ph],
      seconds,
      timedSteps,
      stepCount: group.length,
      passedCount,
      failedCount,
      pendingCount,
      status: phaseStatus[ph] || 'unknown',
    };
  });
}

export async function analyzeExecution(
  parsed: ParsedUrl,
  onProgress?: ProgressFn,
): Promise<DebugAnalysis> {
  const { bucket, gcsPath, jobName, buildId, raw } = parsed;
  const base = `https://storage.googleapis.com/${bucket}/${gcsPath}`;

  onProgress?.(8, 'Fetching job metadata…');
  const [started, finished, prowjob, prowLog] = await Promise.all([
    fetchJson<{ timestamp?: number }>(`${base}/started.json`),
    fetchJson<{ passed?: boolean; timestamp?: number; result?: string }>(`${base}/finished.json`),
    fetchJson<Record<string, unknown>>(`${base}/prowjob.json`),
    fetchText(`${base}/build-log.txt`),
  ]);

  onProgress?.(25, 'Discovering artifacts…');
  const testSubdir = await discoverArtifactSubdir(bucket, gcsPath, jobName);
  const artBase = testSubdir ? `${base}/artifacts/${testSubdir}` : `${base}/artifacts`;

  onProgress?.(45, 'Reading step logs…');
  const steps = await fetchAllSteps(artBase, bucket, gcsPath, testSubdir, started);

  onProgress?.(70, 'Resolving release / lease…');
  const releaseFromLog = parseReleaseFromProwLog(prowLog);
  // Always consult artifacts: recovers tags when build-log is redacted, and
  // fills upgrade-from (release-images-*-initial) when the log omitted it.
  const releaseFromArts = await fetchReleaseFromArtifacts(base);
  let release = mergeReleaseInfo(releaseFromLog, releaseFromArts);
  // ImageStream *-initial can exist on non-upgrades; only keep it for upgrade jobs
  // or when the ci-operator log explicitly imported release:*initial*.
  if (
    release?.initialTag &&
    !releaseFromLog?.initialTag &&
    !/upgrade-from-nightly/i.test(jobName)
  ) {
    release = { ...release, initialTag: null };
  }
  const lease = extractLeaseInfo(prowLog, steps);
  const leaseSlot = lease?.slot || null;
  const leaseRec = leaseSlot ? LEASE_BY_SLOT[leaseSlot] : undefined;

  onProgress?.(85, 'Building debug view…');
  const meta = parseJobMeta(jobName);
  enrichMetaFromProwLog(meta, prowLog, jobName);
  enrichMetaFromProwjob(meta, prowjob);
  // Lease catalog fills profile/pool when prowjob labels are missing (e.g. OZ / hetero).
  if (leaseRec?.profile && !meta.profile) meta.profile = leaseRec.profile;
  if (leaseRec?.profile && /vpn-amd64|vpn-arm64|vpn-oz|amd64/.test(leaseRec.profile)) {
    // Prefer authoritative lease profile for hetero / OZ carve-outs.
    if (
      !meta.profile ||
      meta.profile === 'libvirt-s390x-vpn' ||
      meta.profile.endsWith('-vpn')
    ) {
      if (
        leaseRec.profile !== meta.profile &&
        (leaseRec.workerArch || leaseRec.profile.includes('oz'))
      ) {
        meta.profile = leaseRec.profile;
        meta.workflow = inferWorkflowName(jobName, meta.profile);
      }
    }
  }
  if (leaseRec?.workerArch && !meta.workerArch) {
    meta.workerArch = leaseRec.workerArch;
    meta.topologyKind = 'heterogeneous';
    meta.topologyShort =
      leaseRec.workerArch === 'arm64'
        ? 'Heterogeneous (z-za)'
        : 'Heterogeneous (z-xz)';
  }

  const prowjobState = (prowjob?.status as { state?: string } | undefined)?.state;
  const result: JobResult =
    finished?.passed === true
      ? 'PASSED'
      : finished?.passed === false
        ? 'FAILED'
        : prowjobState === 'success'
          ? 'PASSED'
          : prowjobState === 'failure' || prowjobState === 'error'
            ? 'FAILED'
            : prowjobState === 'aborted'
              ? 'ABORTED'
              : prowjobState === 'pending' || prowjobState === 'triggered' || !finished
                ? 'RUNNING'
                : 'UNKNOWN';

  const counts = { passed: 0, failed: 0, skipped: 0, unknown: 0, running: 0 };
  for (const n of Object.keys(steps)) {
    const s = steps[n].status;
    counts[s] = (counts[s] || 0) + 1;
  }

  const configuredDefs = stepsForWorkflow(meta.workflow);
  const configuredNames = configuredDefs.map((s) => s.name);
  // Prefer first failed in workflow order; use observed GCS dir names (hetero aliases).
  const failedInOrder = configuredNames
    .map((canon) => {
      const dir = observedDirFor(canon, steps) || (steps[canon] ? canon : null);
      if (!dir || steps[dir]?.status !== 'failed') return null;
      return dir;
    })
    .filter((s): s is string => !!s);
  const extrasFailed = Object.keys(steps).filter(
    (s) =>
      steps[s]?.status === 'failed' &&
      !failedInOrder.includes(s) &&
      !configuredNames.includes(s) &&
      !HETERO_ALIASES[s],
  );
  const firstFailed =
    failedInOrder.find((s) => !BEST_EFFORT_STEPS.has(s) && !BEST_EFFORT_STEPS.has(HETERO_ALIASES[s] || '')) ||
    failedInOrder[0] ||
    extrasFailed[0] ||
    null;
  const secondaryFailed = Object.keys(steps).filter(
    (s) => steps[s]?.status === 'failed' && s !== firstFailed,
  );

  const phaseStatus: Record<string, string> = {};
  const { workflow, currentStep } = buildWorkflowView(
    jobName,
    meta.profile,
    steps,
    result === 'RUNNING',
    meta.workflow,
  );

  for (const ph of ['pre', 'test', 'post'] as const) {
    const group = workflow.filter((w) => w.phase === ph);
    if (!group.length) {
      phaseStatus[ph] = 'skipped';
      continue;
    }
    if (group.some((w) => w.status === 'failed')) phaseStatus[ph] = 'failed';
    else if (group.some((w) => w.status === 'current' || w.status === 'running')) phaseStatus[ph] = 'running';
    else if (group.every((w) => w.status === 'passed' || (w.bestEffort && w.status === 'pending')))
      phaseStatus[ph] = group.every((w) => w.status === 'passed') ? 'passed' : 'running';
    else if (group.every((w) => w.status === 'pending')) phaseStatus[ph] = 'pending';
    else phaseStatus[ph] = 'running';
  }

  const diagnosis = buildDiagnosis({
    result,
    firstFailed,
    secondaryFailed,
    steps,
    artBase,
    raw,
    counts,
  });
  const configLinks = buildConfigLinks(jobName, meta);

  onProgress?.(92, 'Parsing failed test cases…');
  let testFailures: TestFailureReport | null = null;
  const testStepName = 'openshift-e2e-libvirt-test';
  const testStep = steps[testStepName];
  const testPhaseFailed =
    phaseStatus.test === 'failed' || testStep?.status === 'failed';
  if (testPhaseFailed && testStep) {
    const gcsStepPrefix = `${gcsPath}/artifacts/${testSubdir ? `${testSubdir}/` : ''}${testStepName}`;
    testFailures = await collectTestFailures({
      stepName: testStepName,
      stepBase: testStep.stepBase,
      bucket,
      gcsPathPrefix: gcsStepPrefix,
      logText: testStep.logText || testStep.logTail,
      expectedSuite: meta.testType,
    });
    if (testFailures?.failures.length) {
      const product = testFailures.failures.filter(
        (f) =>
          f.severity === 'blocking' ||
          (f.severity !== 'informing' && f.suite !== 'monitor'),
      );
      const productOrAll = product.length ? product : testFailures.failures;
      const productSuites = new Set(productOrAll.map((f) => f.suite));
      const bySuite = testFailures.bySuite.filter((g) => productSuites.has(g.suite));
      const suites = bySuite.map((g) => `${g.count} ${g.label}`).join(', ');
      diagnosis.facts.push(
        `Failed test cases: ${productOrAll.length}${suites ? ` (${suites})` : ''}`,
      );
      for (const g of bySuite.slice(0, 4)) {
        const cases = g.tests.filter(
          (t) => t.severity === 'blocking' || t.severity !== 'informing',
        );
        if (!cases.length) continue;
        diagnosis.hypotheses.push({
          tag: g.suite,
          text: `${g.label}: ${cases
            .slice(0, 3)
            .map((t) => t.name.replace(/\s*\[Suite:[^\]]+\]/g, '').trim())
            .join(' · ')}${cases.length > 3 ? ` (+${cases.length - 3} more)` : ''}`,
        });
      }
      const linkedNames = new Set(
        productOrAll.map((f) => f.junitFile).filter((n): n is string => Boolean(n)),
      );
      const junit =
        testFailures.junitFiles.find((f) => linkedNames.has(f.name)) ||
        testFailures.junitFiles.find((f) => !/monitor/i.test(f.name));
      if (junit) {
        diagnosis.evidence.push({
          label: junit.name,
          url: junit.url,
          kind: 'junit',
          primary: true,
          desc: 'JUnit XML with failed test cases',
        });
      }
    }
  }

  let progressSummary = '';
  if (result === 'RUNNING') {
    if (currentStep) {
      const w = workflow.find((x) => x.name === currentStep);
      progressSummary = w?.observed && w.status === 'current' && steps[currentStep]?.status === 'running'
        ? `In progress: ${currentStep} (step directory present, finished.json not written yet)`
        : `In progress: waiting for / starting ${currentStep} (${w?.phase?.toUpperCase()} phase). ${counts.passed} step(s) completed; later workflow steps have no artifact directory yet.`;
    } else {
      progressSummary = 'Job is running but the current step could not be inferred.';
    }
  } else if (result === 'FAILED' && firstFailed) {
    const productFails =
      testFailures?.failures.filter(
        (f) =>
          f.severity === 'blocking' ||
          (f.severity !== 'informing' && f.suite !== 'monitor'),
      ) || [];
    if (productFails.length) {
      const topSuite = productFails[0]?.suite;
      const topLabel = topSuite
        ? testFailures?.bySuite.find((g) => g.suite === topSuite)?.label
        : null;
      progressSummary = `Failed at ${firstFailed} — ${productFails.length} failed test case(s)${
        topLabel ? ` (${topLabel})` : ''
      }.`;
    } else {
      progressSummary = `Failed at ${firstFailed}.`;
    }
  } else if (result === 'PASSED') {
    progressSummary = 'All observed steps passed; job finished successfully.';
  }

  const phaseTimings = computePhaseTimings(workflow, phaseStatus);

  onProgress?.(100, 'Done');

  return {
    raw,
    jobName,
    buildId,
    bucket,
    gcsPath,
    base,
    artBase,
    testSubdir,
    started,
    finished,
    prowjob,
    prowLog,
    steps,
    meta,
    result,
    counts,
    firstFailed,
    secondaryFailed,
    phaseStatus,
    orderedForFailure: configuredNames.filter((n) => steps[n]).concat(
      Object.keys(steps).filter((n) => !configuredNames.includes(n)),
    ),
    diagnosis,
    configLinks,
    workflow,
    currentStep,
    release,
    leaseSlot,
    lease,
    progressSummary,
    phaseTimings,
    testFailures,
  };
}
