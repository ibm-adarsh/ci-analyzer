import { BEST_EFFORT_STEPS } from '../data/workflow';
import { HETERO_ALIASES, VPN_WORKFLOW_STEPS, workflowForJob } from '../data/vpnWorkflow';
import type { Analysis, JobResult, ParsedUrl, StepResult, StepStatus } from '../types';
import { buildDiagnosis, extractSnippet } from './diagnosis';
import { fetchJson, fetchText, listPrefix } from './gcs';
import { buildConfigLinks, enrichMetaFromProwjob, parseJobMeta } from './meta';
import {
  fetchReleaseFromArtifacts,
  parseLeaseFromProwLog,
  parseReleaseFromProwLog,
  type ReleaseInfo,
} from './release';

export type ProgressFn = (pct: number, label: string) => void;

export type WorkflowStepStatus = StepStatus | 'pending' | 'current';

export interface WorkflowStepView {
  name: string;
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

async function discoverArtifactSubdir(bucket: string, gcsPath: string): Promise<string | null> {
  const data = await listPrefix(bucket, `${gcsPath}/artifacts/`, { delimiter: '/', maxResults: 20 });
  if (!data?.prefixes) return null;
  const candidates = data.prefixes
    .map((p) => p.replace(/\/$/, '').split('/').pop()!)
    .filter((n) => n && n !== 'build-resources' && n !== 'release');
  return candidates[0] || null;
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
  const existing = new Set(
    (dirData?.prefixes || []).map((p) => p.replace(/\/$/, '').split('/').pop()!).filter(Boolean),
  );

  const configured = VPN_WORKFLOW_STEPS.map((s) => s.name);
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
    const failureSnippet = status === 'failed' ? extractSnippet(safeLog) : null;

    results[stepName] = {
      status,
      duration,
      finJson,
      logTail,
      logText: safeLog || null,
      patterns: [],
      failureSnippet,
      stepBase,
    };
  }

  return results;
}

function keyArtifactsFor(step: string, artBase: string): { label: string; url: string }[] {
  const out: { label: string; url: string }[] = [
    { label: 'build-log.txt', url: `${artBase}/${step}/build-log.txt` },
  ];
  if (step.includes('upi-install-libvirt') && !step.includes('network')) {
    out.push({ label: '.openshift_install.log', url: `${artBase}/${step}/.openshift_install.log` });
  }
  if (step === 'openshift-e2e-libvirt-test') {
    out.push({ label: 'artifacts/junit/', url: `${artBase}/${step}/artifacts/junit/` });
    out.push({ label: 'e2e.log', url: `${artBase}/${step}/e2e.log` });
  }
  if (step === 'gather-must-gather') {
    out.push({
      label: 'must-gather.tar.gz',
      url: `${artBase}/${step}/must-gather.tar.gz`,
    });
  }
  return out;
}

function buildWorkflowView(
  jobName: string,
  profile: string | null | undefined,
  steps: Record<string, StepResult>,
  artBase: string,
  jobRunning: boolean,
): { workflow: WorkflowStepView[]; currentStep: string | null } {
  const defs = workflowForJob(jobName, profile);
  // Map hetero observed names onto workflow
  const byName: Record<string, StepResult> = { ...steps };
  for (const [hetero, canon] of Object.entries(HETERO_ALIASES)) {
    if (steps[hetero] && !steps[canon]) byName[canon] = steps[hetero];
  }

  const workflow: WorkflowStepView[] = defs.map((d) => {
    const obs = byName[d.name];
    if (!obs) {
      return {
        name: d.name,
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
    return {
      name: d.name,
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
      keyArtifacts: keyArtifactsFor(d.name, artBase),
    };
  });

  // Extra observed steps not in VPN workflow
  for (const name of Object.keys(steps)) {
    if (workflow.some((w) => w.name === name)) continue;
    if (HETERO_ALIASES[name]) continue;
    const obs = steps[name];
    workflow.push({
      name,
      phase: 'pre',
      status: obs.status,
      observed: true,
      duration: obs.duration,
      patterns: obs.patterns,
      failureSnippet: obs.failureSnippet,
      logTail: obs.logTail,
      stepBase: obs.stepBase,
      keyArtifacts: keyArtifactsFor(name, artBase),
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
  status: string;
}

export interface DebugAnalysis extends Analysis {
  workflow: WorkflowStepView[];
  currentStep: string | null;
  release: ReleaseInfo | null;
  leaseSlot: string | null;
  progressSummary: string;
  phaseTimings: PhaseTiming[];
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
    for (const w of group) {
      if (w.duration != null && w.duration >= 0) {
        seconds += w.duration;
        timedSteps += 1;
      }
    }
    return {
      phase: ph,
      label: labels[ph],
      seconds,
      timedSteps,
      stepCount: group.length,
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
  const testSubdir = await discoverArtifactSubdir(bucket, gcsPath);
  const artBase = testSubdir ? `${base}/artifacts/${testSubdir}` : `${base}/artifacts`;

  onProgress?.(45, 'Reading step logs…');
  const steps = await fetchAllSteps(artBase, bucket, gcsPath, testSubdir, started);

  onProgress?.(70, 'Resolving release / lease…');
  let release = parseReleaseFromProwLog(prowLog);
  if (!release?.tag) {
    release = (await fetchReleaseFromArtifacts(base)) || release;
  }
  const leaseSlot = parseLeaseFromProwLog(prowLog);

  onProgress?.(85, 'Building debug view…');
  const meta = parseJobMeta(jobName);
  enrichMetaFromProwjob(meta, prowjob);

  const prowjobState = (prowjob?.status as { state?: string } | undefined)?.state;
  const result: JobResult =
    finished?.passed === true
      ? 'PASSED'
      : finished?.passed === false
        ? 'FAILED'
        : prowjobState === 'success'
          ? 'PASSED'
          : prowjobState === 'failure'
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

  const configuredNames = VPN_WORKFLOW_STEPS.map((s) => s.name);
  const orderedForFailure = [
    ...configuredNames.filter((s) => steps[s]?.status === 'failed'),
    ...Object.keys(steps).filter((s) => steps[s]?.status === 'failed' && !configuredNames.includes(s)),
  ];
  // Prefer first failed in workflow order
  const failedInOrder = configuredNames.filter((s) => steps[s]?.status === 'failed');
  const firstFailed =
    failedInOrder.find((s) => !BEST_EFFORT_STEPS.has(s)) || failedInOrder[0] || orderedForFailure[0] || null;
  const secondaryFailed = Object.keys(steps).filter(
    (s) => steps[s]?.status === 'failed' && s !== firstFailed,
  );

  const phaseStatus: Record<string, string> = {};
  const { workflow, currentStep } = buildWorkflowView(
    jobName,
    meta.profile,
    steps,
    artBase,
    result === 'RUNNING',
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
    progressSummary = `Failed at ${firstFailed}.`;
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
    progressSummary,
    phaseTimings,
  };
}
