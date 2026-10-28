/**
 * Live verify every step artifact URL produced by analyzeExecution.
 *   npx vite-node scripts/probe-artifact-links.mts
 */
import { analyzeExecution } from '../src/lib/analyze.ts';
import { gcsApiUrl } from '../src/lib/gcs.ts';
import { parseProwUrl } from '../src/lib/url.ts';

const JOBS: [string, string][] = [
  [
    'serial z-z',
    'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-5.0-ocp-e2e-serial-ovn-remote-libvirt-multi-z-z/2107441095997657088',
  ],
  [
    'upgrade z-z',
    'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-5.0-upgrade-from-nightly-4.22-ocp-ovn-remote-libvirt-multi-z-z/2107456138294333440',
  ],
  [
    'fips+tp z-z',
    'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-4.23-ocp-fips-ovn-techpreview-multi-z-z/2107396006764089344',
  ],
  [
    'agent z-z',
    'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-5.0-ocp-e2e-ovn-agent-remote-libvirt-multi-z-z/2114265916643479552',
  ],
  [
    'hetero z-xz 5.0',
    'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-5.0-ocp-e2e-ovn-remote-libvirt-multi-z-xz/2114879816971849728',
  ],
  [
    'image-ecosystem',
    'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-5.0-ocp-image-ecosystem-ovn-remote-libvirt-multi-z-z/2114250702833324032',
  ],
  [
    'hetero z-za 5.1',
    'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-5.1-ocp-e2e-ovn-remote-libvirt-multi-z-za/2114955272370786304',
  ],
  [
    'hetero z-xz 5.1',
    'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-5.1-ocp-e2e-ovn-remote-libvirt-multi-z-xz/2114879819492626432',
  ],
  [
    'fips z-z 5.0',
    'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-5.0-ocp-fips-ovn-remote-libvirt-multi-z-z/2104029812044599296',
  ],
];

type Check = {
  step: string;
  label: string;
  url: string;
  ok: boolean;
  status: number | string;
  kind: 'file' | 'dir' | 'stepBase';
};

async function checkUrl(url: string, kind: 'file' | 'dir'): Promise<{ ok: boolean; status: number | string }> {
  if (kind === 'dir') {
    // Directory "links" are not real GCS objects — verify via list API.
    const m = url.match(/^https:\/\/storage\.googleapis\.com\/([\w.-]+)\/(.+?)\/?$/);
    if (!m) return { ok: false, status: 'bad-url' };
    const bucket = m[1];
    const prefix = m[2].replace(/\/+$/, '') + '/';
    const list = `https://storage.googleapis.com/storage/v1/b/${bucket}/o?prefix=${encodeURIComponent(prefix)}&maxResults=1`;
    try {
      const r = await fetch(list);
      if (!r.ok) return { ok: false, status: `list-${r.status}` };
      const data = (await r.json()) as { items?: unknown[]; prefixes?: unknown[] };
      const has = (data.items && data.items.length > 0) || (data.prefixes && data.prefixes.length > 0);
      return { ok: !!has, status: has ? 'listed' : 'empty' };
    } catch (e) {
      return { ok: false, status: String(e).slice(0, 80) };
    }
  }

  try {
    const r = await fetch(gcsApiUrl(url), { method: 'GET', headers: { Range: 'bytes=0-0' } });
    // 206 Partial / 200 OK = exists; 404 = missing
    if (r.status === 200 || r.status === 206) return { ok: true, status: r.status };
    // Some objects reject Range → still 200 on full GET
    if (r.status === 400 || r.status === 416) {
      const r2 = await fetch(gcsApiUrl(url), { method: 'HEAD' });
      return { ok: r2.ok, status: r2.status };
    }
    return { ok: false, status: r.status };
  } catch (e) {
    return { ok: false, status: String(e).slice(0, 80) };
  }
}

function isDirLabel(label: string, url: string): boolean {
  return label.endsWith('/') || url.endsWith('/');
}

let jobsBad = 0;
let totalBroken = 0;
let totalChecked = 0;

for (const [label, url] of JOBS) {
  const parsed = parseProwUrl(url);
  if (!parsed) {
    console.log(`\n## ${label} FAIL parse`);
    jobsBad++;
    continue;
  }
  console.log(`\n## ${label}`);
  const a = await analyzeExecution(parsed);
  console.log(
    `  result=${a.result} workflow=${a.meta.workflow} artBase=${a.artBase.replace(/https:\/\/storage\.googleapis\.com\/[^/]+\//, 'gs://…/')}`,
  );

  const checks: Check[] = [];
  const observed = a.workflow.filter((w) => w.observed && w.stepBase);

  for (const w of observed) {
    checks.push({
      step: w.name,
      label: 'stepBase/finished.json',
      url: `${w.stepBase}/finished.json`,
      ok: false,
      status: 0,
      kind: 'file',
    });
    for (const art of w.keyArtifacts) {
      checks.push({
        step: w.name,
        label: art.label,
        url: art.url,
        ok: false,
        status: 0,
        kind: isDirLabel(art.label, art.url) ? 'dir' : 'file',
      });
    }
  }

  // JUnit / failure report links
  if (a.testFailures) {
    for (const j of a.testFailures.junitFiles) {
      checks.push({
        step: a.testFailures.stepName,
        label: `junit:${j.name}`,
        url: j.url,
        ok: false,
        status: 0,
        kind: 'file',
      });
    }
  }

  // Diagnosis evidence URLs that point at GCS
  for (const ev of a.diagnosis.evidence) {
    if (!ev.url.includes('storage.googleapis.com')) continue;
    checks.push({
      step: 'diagnosis',
      label: ev.label,
      url: ev.url,
      ok: false,
      status: 0,
      kind: isDirLabel(ev.label, ev.url) ? 'dir' : 'file',
    });
  }

  // Dedup by URL
  const byUrl = new Map<string, Check>();
  for (const c of checks) {
    if (!byUrl.has(c.url)) byUrl.set(c.url, c);
  }
  const unique = [...byUrl.values()];

  // Parallel with modest concurrency
  const CONCURRENCY = 12;
  for (let i = 0; i < unique.length; i += CONCURRENCY) {
    const batch = unique.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (c) => {
        const res = await checkUrl(c.url, c.kind);
        c.ok = res.ok;
        c.status = res.status;
      }),
    );
  }

  const broken = unique.filter((c) => !c.ok);
  // Optional artifacts that may legitimately be missing
  const optional = (c: Check) =>
    // finished.json can be missing for aborted/running mid-step; still require build-log
    (c.label === 'stepBase/finished.json' &&
      a.workflow.find((w) => w.stepBase && c.url.startsWith(w.stepBase))?.status === 'running') ||
    // Early-fail / aborted jobs may lack gather or e2e artifacts even when the step dir exists
    (c.label.includes('must-gather.tar.gz') && c.status === 404) ||
    (c.label.includes('e2e.log') && c.status === 404);

  const realBroken = broken.filter((c) => !optional(c));
  totalChecked += unique.length;
  totalBroken += realBroken.length;

  console.log(
    `  observedSteps=${observed.length} links=${unique.length} broken=${realBroken.length} (optional-miss=${broken.length - realBroken.length})`,
  );
  if (realBroken.length) {
    jobsBad++;
    for (const c of realBroken.slice(0, 40)) {
      console.log(`  BROKEN [${c.status}] ${c.step} · ${c.label}`);
      console.log(`          ${c.url}`);
    }
    if (realBroken.length > 40) console.log(`  … +${realBroken.length - 40} more`);
  } else {
    console.log('  OK');
  }

  // Spot-check: stepBase must live under artBase
  for (const w of observed) {
    if (w.stepBase && !w.stepBase.startsWith(a.artBase + '/')) {
      console.log(`  PATH-MISMATCH ${w.name}: stepBase not under artBase`);
      console.log(`    artBase=${a.artBase}`);
      console.log(`    stepBase=${w.stepBase}`);
      jobsBad++;
    }
  }
}

console.log(`\njobsWithIssues=${jobsBad}/${JOBS.length} brokenLinks=${totalBroken} checked=${totalChecked}`);
process.exit(jobsBad || totalBroken ? 1 : 0);
