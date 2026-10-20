import type { DebugAnalysis } from './analyze';
import { analyzeExecution } from './analyze';
import {
  buildsPrefixFromGcsPath,
  findLastGreenBuild,
  historyLinks,
  type JobBuildRef,
} from './jobHistory';
import { resolveLpar } from './lparResolve';
import { executionRoute, parseProwUrl, prowViewUrl } from './url';

export interface CompareSnapshot {
  buildId: string;
  gcsPath: string;
  raw: string;
  appPath: string;
  result: string;
  started: string | null;
  durationSec: number | null;
  profile: string | null;
  releaseTag: string | null;
  initialTag: string | null;
  leaseSlot: string | null;
  lpar: string | null;
  qemuUri: string | null;
  firstFailed: string | null;
  failedTests: string[];
  testSuiteSummary: string | null;
}

export interface CompareRow {
  key: string;
  label: string;
  current: string;
  baseline: string;
  changed: boolean;
}

export interface GreenCompareResult {
  baselineRef: JobBuildRef;
  baseline: CompareSnapshot;
  current: CompareSnapshot;
  rows: CompareRow[];
  /** Failed tests on current that were not present on baseline (baseline usually empty). */
  newFailedTests: string[];
  historyUrl: string;
  greenUrl: string;
  probesChecked: boolean;
}

function dash(v: string | null | undefined): string {
  return v && String(v).trim() ? String(v) : '—';
}

export function snapshotFromAnalysis(a: DebugAnalysis): CompareSnapshot {
  const lpar = a.leaseSlot ? resolveLpar(a.leaseSlot, a.lease) : null;
  const failedTests =
    a.testFailures?.failures
      .filter((f) => f.severity === 'blocking' || f.suite !== 'monitor')
      .map((f) => f.name.replace(/\s*\[Suite:[^\]]+\]/g, '').trim()) || [];
  // Prefer blocking; if none, keep a short non-monitor list.
  const tests =
    a.testFailures?.failures.filter((f) => f.severity === 'blocking').map((f) =>
      f.name.replace(/\s*\[Suite:[^\]]+\]/g, '').trim(),
    ) || [];
  const useTests = tests.length ? tests : failedTests.slice(0, 25);

  let testSuiteSummary: string | null = null;
  if (a.testFailures?.bySuite.length) {
    testSuiteSummary = a.testFailures.bySuite.map((g) => `${g.count} ${g.label}`).join(', ');
  }

  const durationSec =
    a.started?.timestamp && a.finished?.timestamp
      ? a.finished.timestamp - a.started.timestamp
      : null;

  return {
    buildId: a.buildId,
    gcsPath: a.gcsPath,
    raw: a.raw,
    appPath: executionRoute(a.bucket, a.gcsPath),
    result: a.result,
    started: a.started?.timestamp
      ? new Date(a.started.timestamp * 1000).toISOString()
      : null,
    durationSec,
    profile: a.meta.profile || null,
    releaseTag: a.release?.tag || null,
    initialTag: a.release?.initialTag || null,
    leaseSlot: a.leaseSlot,
    lpar: lpar?.lpar || null,
    qemuUri: a.lease?.qemuUri || lpar?.qemuUri || null,
    firstFailed: a.firstFailed,
    failedTests: useTests,
    testSuiteSummary,
  };
}

function row(key: string, label: string, current: string, baseline: string): CompareRow {
  const c = dash(current);
  const b = dash(baseline);
  return { key, label, current: c, baseline: b, changed: c !== b };
}

export function buildCompareRows(
  current: CompareSnapshot,
  baseline: CompareSnapshot,
): CompareRow[] {
  return [
    row('result', 'Result', current.result, baseline.result),
    row('releaseTag', 'Release tag', current.releaseTag || '', baseline.releaseTag || ''),
    row('initialTag', 'Upgrade from', current.initialTag || '', baseline.initialTag || ''),
    row('profile', 'Cluster profile', current.profile || '', baseline.profile || ''),
    row('leaseSlot', 'Lease slot', current.leaseSlot || '', baseline.leaseSlot || ''),
    row('lpar', 'LPAR', current.lpar || '', baseline.lpar || ''),
    row('qemuUri', 'Libvirt URI', current.qemuUri || '', baseline.qemuUri || ''),
    row('firstFailed', 'First failed step', current.firstFailed || '', baseline.firstFailed || ''),
    row(
      'testSuites',
      'Failed test suites',
      current.testSuiteSummary || '',
      baseline.testSuiteSummary || '',
    ),
    row(
      'started',
      'Started (UTC)',
      current.started || '',
      baseline.started || '',
    ),
  ];
}

/**
 * Compare the current analysis to the previous successful run of the same job.
 * Fetches and fully analyzes the green baseline (TEST junit skipped automatically on pass).
 */
export async function compareToLastGreen(
  current: DebugAnalysis,
  onProgress?: (label: string) => void,
): Promise<GreenCompareResult | null> {
  const prefix = buildsPrefixFromGcsPath(current.gcsPath);
  onProgress?.('Looking up previous successful builds…');
  const green = await findLastGreenBuild(current.bucket, prefix, current.buildId);
  if (!green) return null;

  const links = historyLinks(current.bucket, current.jobName, green);
  const greenRaw = prowViewUrl(current.bucket, green.gcsPath);
  const parsed = parseProwUrl(greenRaw);
  if (!parsed) return null;

  onProgress?.(`Analyzing last green ${green.buildId}…`);
  const baselineAnalysis = await analyzeExecution(parsed, (p, l) => {
    onProgress?.(`${p}% ${l}`);
  });

  const curSnap = snapshotFromAnalysis(current);
  const baseSnap = snapshotFromAnalysis(baselineAnalysis);
  const baselineSet = new Set(baseSnap.failedTests);
  const newFailedTests = curSnap.failedTests.filter((t) => !baselineSet.has(t));

  return {
    baselineRef: green,
    baseline: baseSnap,
    current: curSnap,
    rows: buildCompareRows(curSnap, baseSnap),
    newFailedTests,
    historyUrl: links.historyUrl,
    greenUrl: links.greenUrl || greenRaw,
    probesChecked: true,
  };
}
