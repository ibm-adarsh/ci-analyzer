import { fetchText, listPrefix } from './gcs';

/** High-level suite bucket for openshift-tests / monitor results. */
export type TestSuiteKind =
  | 'conformance-parallel'
  | 'conformance-serial'
  | 'upgrade'
  | 'monitor'
  | 'image-ecosystem'
  | 'other';

export interface FailedTestCase {
  name: string;
  suite: TestSuiteKind;
  /** Raw [Suite:…] tag when present */
  suiteTag: string | null;
  source: 'blocking-log' | 'junit' | 'failures-summary';
  junitFile: string | null;
  severity: 'blocking' | 'informing' | 'unknown';
}

export interface SuiteFailureGroup {
  suite: TestSuiteKind;
  label: string;
  count: number;
  tests: FailedTestCase[];
}

export interface TestFailureSummary {
  blockingFail: number | null;
  informingFail: number | null;
  pass: number | null;
  skip: number | null;
}

export interface TestFailureReport {
  stepName: string;
  stepBase: string;
  summary: TestFailureSummary;
  /** Job-level TEST_TYPE / meta hint when known */
  expectedSuite: string | null;
  bySuite: SuiteFailureGroup[];
  failures: FailedTestCase[];
  junitFiles: { name: string; url: string }[];
  notes: string[];
}

const SUITE_LABELS: Record<TestSuiteKind, string> = {
  'conformance-parallel': 'Conformance parallel',
  'conformance-serial': 'Conformance serial',
  upgrade: 'Upgrade',
  monitor: 'Monitor / invariants',
  'image-ecosystem': 'Image ecosystem',
  other: 'Other / unclassified',
};

const JUNIT_NAME_RE =
  /(?:Writing JUnit report to|Writing junits[^\n]*\n[^\n]*)\/logs\/artifacts\/junit\/([^\s]+\.xml)/gi;
const JUNIT_NAME_RE2 = /\/logs\/artifacts\/junit\/((?:junit_|e2e-monitor)[^\s/]+\.xml)/gi;

export function suiteLabel(kind: TestSuiteKind): string {
  return SUITE_LABELS[kind];
}

/** Extract [Suite:…] tag from an openshift-tests case name. */
export function extractSuiteTag(testName: string): string | null {
  const m = testName.match(/\[Suite:([^\]]+)\]/i);
  return m?.[1]?.trim() || null;
}

export function classifySuite(
  testName: string,
  junitFile: string | null,
  expectedSuite?: string | null,
): TestSuiteKind {
  const tag = (extractSuiteTag(testName) || '').toLowerCase();
  const file = (junitFile || '').toLowerCase();

  if (file.includes('monitor')) return 'monitor';
  if (file.includes('upgrade') || tag.includes('upgrade')) return 'upgrade';
  if (file.includes('image-ecosystem') || tag.includes('image-ecosystem')) return 'image-ecosystem';

  if (tag.includes('conformance/serial') || /(^|\/)serial$/i.test(tag))
    return 'conformance-serial';
  if (tag.includes('conformance/parallel') || tag.includes('/parallel'))
    return 'conformance-parallel';
  if (tag.includes('conformance')) {
    if (/serial/i.test(expectedSuite || '')) return 'conformance-serial';
    return 'conformance-parallel';
  }

  // No Suite tag — fall back to job meta / filename / common markers.
  if (file.includes('junit_upgrade')) return 'upgrade';
  if (
    file.includes('junit_e2e') ||
    /^junit_/i.test(file) ||
    /\[Conformance/i.test(testName) ||
    /\[sig-/i.test(testName)
  ) {
    if (/serial/i.test(expectedSuite || '')) return 'conformance-serial';
    if (/upgrade/i.test(expectedSuite || '')) return 'upgrade';
    if (/image-ecosystem/i.test(expectedSuite || '')) return 'image-ecosystem';
    return 'conformance-parallel';
  }

  return 'other';
}

/** Parse "Blocking test failures:" bullet list from openshift-tests build-log. */
export function parseBlockingFailuresFromLog(logText: string | null): FailedTestCase[] {
  if (!logText || logText === '__REDACTED__') return [];
  const m = logText.match(/Blocking test failures:\s*\n((?:\s*\*.*\n?)+)/i);
  if (!m) return [];
  const out: FailedTestCase[] = [];
  for (const line of m[1].split('\n')) {
    const bullet = line.match(/^\s*\*\s+(.+?)\s*$/);
    if (!bullet) continue;
    const name = bullet[1].trim();
    if (!name) continue;
    const suite = classifySuite(name, null);
    out.push({
      name,
      suite,
      suiteTag: extractSuiteTag(name),
      source: 'blocking-log',
      junitFile: null,
      severity: 'blocking',
    });
  }
  return out;
}

export function parseSuiteRunSummary(logText: string | null): TestFailureSummary {
  const empty: TestFailureSummary = {
    blockingFail: null,
    informingFail: null,
    pass: null,
    skip: null,
  };
  if (!logText || logText === '__REDACTED__') return empty;
  const m = logText.match(
    /(\d+)\s+blocking fail.*?(\d+)\s+informing fail.*?(\d+)\s+pass.*?(\d+)\s+skip/i,
  );
  if (!m) return empty;
  return {
    blockingFail: Number(m[1]),
    informingFail: Number(m[2]),
    pass: Number(m[3]),
    skip: Number(m[4]),
  };
}

/** JUnit XML filenames mentioned in the step build-log. */
export function parseJunitFilenamesFromLog(logText: string | null): string[] {
  if (!logText || logText === '__REDACTED__') return [];
  const names = new Set<string>();
  for (const re of [JUNIT_NAME_RE, JUNIT_NAME_RE2]) {
    re.lastIndex = 0;
    for (const m of logText.matchAll(re)) {
      const n = m[1]?.trim();
      if (n?.endsWith('.xml')) names.add(n.split('/').pop()!);
    }
  }
  return [...names];
}

/**
 * Upgrade / e2e wrappers that fail whenever the cluster was briefly unstable.
 * openshift-tests demotes these in test-failures-summary; raw JUnit still lists them.
 */
export function isStabilityWrapperTest(name: string): boolean {
  return /^Cluster should be stable (after installation is complete|before test is started)\b/i.test(
    name.trim(),
  );
}

/**
 * Parse openshift-tests `test-failures-summary*.json` — the post-flake authoritative
 * failure list Sippy / Prow spyglass use (often a single Monitor test on upgrades).
 */
export function parseTestFailuresSummaryJson(
  text: string,
  expectedSuite?: string | null,
): FailedTestCase[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return [];
  }
  if (!data || typeof data !== 'object') return [];
  const tests = (data as { Tests?: unknown }).Tests;
  if (!Array.isArray(tests)) return [];
  const out: FailedTestCase[] = [];
  for (const row of tests) {
    if (!row || typeof row !== 'object') continue;
    const name = (row as { Test?: { Name?: string } }).Test?.Name?.trim();
    if (!name) continue;
    const suiteName =
      (row as { Suite?: { Name?: string } }).Suite?.Name || null;
    // Prefer [Monitor:…] in the test name; Suite is often openshift-tests-upgrade.
    const junitHint = /\[Monitor:/i.test(name)
      ? 'e2e-monitor-tests'
      : suiteName?.toLowerCase().includes('upgrade')
        ? 'junit_upgrade'
        : null;
    out.push({
      name,
      suite: classifySuite(name, junitHint, expectedSuite),
      suiteTag: extractSuiteTag(name),
      source: 'failures-summary',
      junitFile: null,
      severity: 'blocking',
    });
  }
  return out;
}

/** Lightweight XML scrape for <testcase>…<failure|error> without a full DOM parser. */
export function parseFailedTestsFromJunitXml(
  xml: string,
  junitFile: string,
  expectedSuite?: string | null,
): FailedTestCase[] {
  const out: FailedTestCase[] = [];
  // Match self-closing or open testcase tags; then look ahead for failure/error before next testcase/suite end.
  const re =
    /<testcase\b([^>]*)(?:\/>|>([\s\S]*?)<\/testcase>)/gi;
  for (const m of xml.matchAll(re)) {
    const attrs = m[1] || '';
    const body = m[2] || '';
    if (!body || !/<(?:failure|error)\b/i.test(body)) continue;
    const nameM = attrs.match(/\bname="([^"]*)"/i);
    const name = nameM?.[1]?.trim();
    if (!name) continue;
    out.push({
      name,
      suite: classifySuite(name, junitFile, expectedSuite),
      suiteTag: extractSuiteTag(name),
      source: 'junit',
      junitFile,
      severity: junitFile.toLowerCase().includes('monitor') ? 'informing' : 'unknown',
    });
  }
  return out;
}

function dedupeFailures(items: FailedTestCase[]): FailedTestCase[] {
  const seen = new Set<string>();
  const out: FailedTestCase[] = [];
  for (const it of items) {
    const key = it.name;
    if (seen.has(key)) {
      // Prefer blocking-log entry; upgrade severity if we saw blocking.
      const prev = out.find((x) => x.name === key);
      if (prev && it.severity === 'blocking') prev.severity = 'blocking';
      if (prev && !prev.junitFile && it.junitFile) prev.junitFile = it.junitFile;
      if (prev && !prev.suiteTag && it.suiteTag) {
        prev.suiteTag = it.suiteTag;
        prev.suite = it.suite;
      }
      continue;
    }
    seen.add(key);
    out.push({ ...it });
  }
  return out;
}

function groupBySuite(failures: FailedTestCase[]): SuiteFailureGroup[] {
  const order: TestSuiteKind[] = [
    'conformance-parallel',
    'conformance-serial',
    'upgrade',
    'monitor',
    'image-ecosystem',
    'other',
  ];
  const map = new Map<TestSuiteKind, FailedTestCase[]>();
  for (const f of failures) {
    const list = map.get(f.suite) || [];
    list.push(f);
    map.set(f.suite, list);
  }
  return order
    .filter((s) => map.has(s))
    .map((suite) => ({
      suite,
      label: SUITE_LABELS[suite],
      count: map.get(suite)!.length,
      tests: map.get(suite)!,
    }));
}

async function listJunitXmlNames(
  bucket: string,
  gcsJunitPrefix: string,
): Promise<string[]> {
  // Prefix-filter on object name so we skip the thousands of CSI / ResourceUsage
  // sidecar files that otherwise bury junit_*.xml in lexicographic listing.
  const names: string[] = [];
  for (const tip of ['junit_', 'e2e-monitor']) {
    const data = await listPrefix(bucket, `${gcsJunitPrefix}${tip}`, {
      maxResults: 50,
    });
    for (const it of data?.items || []) {
      const base = it.name.split('/').pop() || '';
      if (base.endsWith('.xml')) names.push(base);
    }
  }
  return [...new Set(names)];
}

/** `test-failures-summary*.json` (+ `_monitor_`) written by openshift-tests. */
async function listTestFailuresSummaryNames(
  bucket: string,
  gcsJunitPrefix: string,
): Promise<string[]> {
  const data = await listPrefix(bucket, `${gcsJunitPrefix}test-failures-summary`, {
    maxResults: 30,
  });
  const names: string[] = [];
  for (const it of data?.items || []) {
    const base = it.name.split('/').pop() || '';
    if (base.endsWith('.json')) names.push(base);
  }
  return [...new Set(names)];
}

/**
 * Build a failing-test report for openshift-e2e-libvirt-test (or similar) when
 * the TEST phase failed.
 */
export async function collectTestFailures(input: {
  stepName: string;
  stepBase: string;
  bucket: string;
  gcsPathPrefix: string; // path to …/openshift-e2e-libvirt-test/
  logText: string | null;
  expectedSuite?: string | null;
}): Promise<TestFailureReport | null> {
  const notes: string[] = [];
  const summary = parseSuiteRunSummary(input.logText);
  const blocking = parseBlockingFailuresFromLog(input.logText);

  let junitNames = parseJunitFilenamesFromLog(input.logText);
  // Always merge GCS listing — catches redacted build-logs and junit_upgrade
  // files not mentioned in the truncated log tail.
  const junitPrefix = `${input.gcsPathPrefix.replace(/\/+$/, '')}/artifacts/junit/`;
  const listed = await listJunitXmlNames(input.bucket, junitPrefix);
  if (listed.length) {
    const before = new Set(junitNames);
    for (const n of listed) {
      if (!before.has(n)) junitNames.push(n);
    }
    if (!before.size) {
      notes.push('JUnit filenames discovered via GCS listing (build-log missing or redacted).');
    }
  }

  const junitFiles = junitNames.map((name) => ({
    name,
    url: `${input.stepBase.replace(/\/+$/, '')}/artifacts/junit/${name}`,
  }));

  // Authoritative post-flake list (Sippy / spyglass). Prefer over raw JUnit noise.
  const fromSummary: FailedTestCase[] = [];
  const summaryNames = await listTestFailuresSummaryNames(input.bucket, junitPrefix);
  for (const name of summaryNames) {
    const url = `${input.stepBase.replace(/\/+$/, '')}/artifacts/junit/${name}`;
    try {
      const text = await fetchText(url);
      if (!text || text === '__REDACTED__') continue;
      fromSummary.push(...parseTestFailuresSummaryJson(text, input.expectedSuite));
    } catch {
      notes.push(`Failed to parse ${name}`);
    }
  }

  const fromXml: FailedTestCase[] = [];
  // When test-failures-summary already names the real fails, skip downloading the
  // multi-MB e2e-monitor JUnit — attach the monitor filename by convention instead.
  const skipHeavyMonitorXml = fromSummary.length > 0;
  const monitorXmlName =
    junitNames.find((n) => /^e2e-monitor-tests/i.test(n)) || null;
  // Parse sequentially — large junit_e2e XMLs (2–3MB) in parallel with monitor
  // can spike memory in the browser tab.
  for (const f of junitFiles) {
    if (skipHeavyMonitorXml && /monitor/i.test(f.name)) continue;
    try {
      const xml = await fetchText(f.url);
      if (!xml || xml === '__REDACTED__') continue;
      fromXml.push(...parseFailedTestsFromJunitXml(xml, f.name, input.expectedSuite));
    } catch {
      notes.push(`Failed to parse ${f.name}`);
    }
  }

  const attachJunitMeta = (row: FailedTestCase) => {
    const hit = fromXml.find((f) => f.name === row.name);
    if (hit?.junitFile) row.junitFile = hit.junitFile;
    else if (!row.junitFile && row.suite === 'monitor' && monitorXmlName) {
      row.junitFile = monitorXmlName;
    }
    if (hit?.suiteTag && !row.suiteTag) {
      row.suiteTag = hit.suiteTag;
      row.suite = hit.suite;
    }
  };

  let failures: FailedTestCase[];

  if (fromSummary.length) {
    for (const s of fromSummary) attachJunitMeta(s);
    failures = dedupeFailures(fromSummary);
    notes.push(
      `Using test-failures-summary (${failures.length} authoritative fail(s); raw JUnit may list demoted stability / informing noise).`,
    );
  } else {
    // Prefer blocking-log names as the authoritative product failures; keep junit-only
    // cases (common on upgrade jobs / monitor) as additional failures.
    const blockingNames = new Set(blocking.map((b) => b.name));
    const junitExtras = fromXml.filter((f) => !blockingNames.has(f.name));

    for (const b of blocking) attachJunitMeta(b);

    failures = dedupeFailures([...blocking, ...junitExtras]);

    // When the log summary says N blocking fails but we only found them in junit_e2e
    // (no Blocking section — e.g. some upgrade runs), promote non-monitor junit fails.
    if (!blocking.length && summary.blockingFail && summary.blockingFail > 0) {
      const candidates = failures.filter(
        (f) => f.suite !== 'monitor' && !isStabilityWrapperTest(f.name),
      );
      const promote = candidates.length
        ? candidates
        : failures.filter((f) => f.suite !== 'monitor');
      for (const f of promote.slice(0, summary.blockingFail)) {
        f.severity = 'blocking';
      }
      notes.push(
        'No "Blocking test failures" section in log; inferred from JUnit + suite summary.',
      );
    }

    // Drop upgrade stability wrappers when a more specific failure exists.
    const concrete = failures.filter((f) => !isStabilityWrapperTest(f.name));
    if (concrete.length && concrete.length < failures.length) {
      failures = concrete;
      notes.push('Omitted "Cluster should be stable…" wrappers in favor of concrete failures.');
    }
  }

  if (!failures.length && !junitFiles.length && !summaryNames.length) {
    notes.push('No JUnit XML or blocking failure list found under the test step.');
    return null;
  }

  // Stable sort: blocking first, then by suite label, then name.
  failures = failures.sort((a, b) => {
    const sev = (s: FailedTestCase['severity']) =>
      s === 'blocking' ? 0 : s === 'unknown' ? 1 : 2;
    if (sev(a.severity) !== sev(b.severity)) return sev(a.severity) - sev(b.severity);
    if (a.suite !== b.suite) return a.suite.localeCompare(b.suite);
    return a.name.localeCompare(b.name);
  });

  return {
    stepName: input.stepName,
    stepBase: input.stepBase,
    summary,
    expectedSuite: input.expectedSuite || null,
    bySuite: groupBySuite(failures),
    failures,
    junitFiles,
    notes,
  };
}
