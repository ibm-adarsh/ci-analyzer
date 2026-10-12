import { BEST_EFFORT_STEPS, PHASE_MAP, STEP_ORDER } from '../data/workflow';
import type { Analysis, JobResult, ParsedUrl, StepResult, StepStatus } from '../types';
import { buildDiagnosis, detectPatterns, extractSnippet } from './diagnosis';
import { fetchJson, fetchText, listPrefix } from './gcs';
import { buildConfigLinks, enrichMetaFromProwjob, parseJobMeta } from './meta';

export type ProgressFn = (pct: number, label: string) => void;

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

  const toFetch = [
    ...STEP_ORDER.filter((s) => existing.has(s)),
    ...[...existing].filter((s) => !STEP_ORDER.includes(s as (typeof STEP_ORDER)[number])),
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
    }

    if (status === 'unknown' && logText && logText !== '__REDACTED__') {
      if (/\+ exit [1-9]|\blevel=error\b.*exit|step failed/i.test(logText)) status = 'failed';
      else if (/result.*SUCCESS|Finished OK|step.*complete/i.test(logText)) status = 'passed';
      else status = 'running';
    }
    if (!finJson && !logText) status = 'unknown';
    if (endTs) prevEndTs = endTs;

    const safeLog = logText && logText !== '__REDACTED__' ? logText : '';
    const logTail = safeLog
      ? safeLog.split('\n').slice(-80).join('\n')
      : logText === '__REDACTED__'
        ? '__REDACTED__'
        : null;
    const patterns = detectPatterns(safeLog);
    const failureSnippet = extractSnippet(safeLog, patterns);

    results[stepName] = {
      status,
      duration,
      finJson,
      logTail,
      logText: safeLog || null,
      patterns,
      failureSnippet,
      stepBase,
    };
  }

  return results;
}

export async function analyzeExecution(
  parsed: ParsedUrl,
  onProgress?: ProgressFn,
): Promise<Analysis> {
  const { bucket, gcsPath, jobName, buildId, raw } = parsed;
  const base = `https://storage.googleapis.com/${bucket}/${gcsPath}`;

  onProgress?.(10, 'Fetching job metadata…');
  const [started, finished, prowjob, prowLog] = await Promise.all([
    fetchJson<{ timestamp?: number }>(`${base}/started.json`),
    fetchJson<{ passed?: boolean; timestamp?: number; result?: string }>(`${base}/finished.json`),
    fetchJson<Record<string, unknown>>(`${base}/prowjob.json`),
    fetchText(`${base}/build-log.txt`),
  ]);

  onProgress?.(30, 'Discovering artifact layout…');
  const testSubdir = await discoverArtifactSubdir(bucket, gcsPath);
  const artBase = testSubdir ? `${base}/artifacts/${testSubdir}` : `${base}/artifacts`;

  onProgress?.(50, `Fetching steps (${testSubdir || 'root'})…`);
  const steps = await fetchAllSteps(artBase, bucket, gcsPath, testSubdir, started);

  onProgress?.(85, 'Analyzing failures…');
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
              : prowjobState === 'pending' || prowjobState === 'triggered'
                ? 'RUNNING'
                : finished
                  ? 'UNKNOWN'
                  : 'RUNNING';

  const counts: Record<StepStatus, number> = {
    passed: 0,
    failed: 0,
    skipped: 0,
    unknown: 0,
    running: 0,
  };
  for (const n of Object.keys(steps)) {
    const s = steps[n].status;
    counts[s] = (counts[s] || 0) + 1;
  }

  const allStepNames = Object.keys(steps);
  const orderedForFailure = [
    ...STEP_ORDER.filter((s) => allStepNames.includes(s)),
    ...allStepNames.filter((s) => !STEP_ORDER.includes(s as (typeof STEP_ORDER)[number])),
  ];
  const failedSteps = orderedForFailure.filter((s) => steps[s]?.status === 'failed');
  const firstFailed = failedSteps.find((s) => !BEST_EFFORT_STEPS.has(s)) || failedSteps[0] || null;
  const secondaryFailed = failedSteps.filter((s) => s !== firstFailed);

  const phaseStatus: Record<string, string> = {};
  for (const [ph, refs] of Object.entries(PHASE_MAP)) {
    const existing = refs.filter((r) => steps[r]);
    if (!existing.length) {
      phaseStatus[ph] = 'skipped';
      continue;
    }
    const sts = existing.map((r) => steps[r].status);
    phaseStatus[ph] = sts.some((s) => s === 'failed')
      ? 'failed'
      : sts.every((s) => s === 'passed')
        ? 'passed'
        : sts.every((s) => s === 'skipped' || s === 'unknown')
          ? 'skipped'
          : 'running';
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
    orderedForFailure,
    diagnosis,
    configLinks,
  };
}
