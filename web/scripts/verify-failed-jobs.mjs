/**
 * Live verification: run analyzeExecution against failed *z-z jobs and
 * cross-check lease / profile / release / failure against GCS logs.
 */
import { analyzeExecution } from '../src/lib/analyze.ts';
import { parseProwUrl } from '../src/lib/url.ts';
import { resolveLpar } from '../src/lib/lparResolve.ts';

const JOBS = [
  'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-4.22-ocp-fips-ovn-remote-libvirt-multi-z-z/2109572795045253120',
  'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-5.0-ocp-fips-ovn-remote-libvirt-multi-z-z/2109569127919128576',
  'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-4.23-upgrade-from-nightly-4.22-ocp-ovn-remote-libvirt-multi-z-z/2109554946016808960',
  'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-4.22-upgrade-from-nightly-4.21-ocp-ovn-remote-libvirt-multi-z-z/2109554940971061248',
  'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-4.23-ocp-fips-ovn-remote-libvirt-multi-z-z/2109524604123877376',
  'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-4.21-upgrade-from-nightly-4.20-ocp-ovn-remote-libvirt-multi-z-z/2109509544647331840',
];

function stripAnsi(t) {
  return t.replace(/\x1b\[[0-9;]*m/g, '');
}

async function fetchText(url) {
  const r = await fetch(url);
  if (!r.ok) return null;
  return r.text();
}

async function expectFromGcs(parsed) {
  const base = `https://storage.googleapis.com/${parsed.bucket}/${parsed.gcsPath}`;
  const prowLog = stripAnsi((await fetchText(`${base}/build-log.txt`)) || '');
  const prowjob = JSON.parse((await fetchText(`${base}/prowjob.json`)) || '{}');
  const finished = JSON.parse((await fetchText(`${base}/finished.json`)) || '{}');

  const leaseM = prowLog.match(
    /Acquired\s+\d+\s+lease\([^)]*\)\s+for\s+(\S+):\s*\[(libvirt-s390x[a-z0-9-]*)\]/i,
  );
  const profileM = prowLog.match(/for cluster profile\s+(\S+)/i);
  const labelProfile =
    prowjob?.metadata?.labels?.['ci-operator.openshift.io/cloud-cluster-profile'];
  const imported = [
    ...prowLog.matchAll(
      /Imported release\s+(\S+)\s+created at\s+(.+?)\s+with\s+\d+\s+images(?:\s+to tag release:(\S+))?/gi,
    ),
  ];
  const latest = imported.find((m) => m[3] === 'latest') || imported[imported.length - 1];
  const initial = imported.find((m) => m[3] === 'initial');

  // discover test subdir + qemu URI
  const listUrl = `https://storage.googleapis.com/storage/v1/b/${parsed.bucket}/o?prefix=${encodeURIComponent(parsed.gcsPath + '/artifacts/')}&delimiter=/`;
  const list = await (await fetch(listUrl)).json();
  const ignore = new Set(['build-resources', 'release', 'job_labels']);
  const cands = (list.prefixes || [])
    .map((p) => p.replace(/\/$/, '').split('/').pop())
    .filter((n) => n && !ignore.has(n));
  const sub =
    cands.find((c) => parsed.jobName.includes(c)) ||
    [...cands].sort((a, b) => b.length - a.length)[0] ||
    null;

  let qemu = null;
  let failedSteps = [];
  if (sub) {
    const stepsUrl = `https://storage.googleapis.com/storage/v1/b/${parsed.bucket}/o?prefix=${encodeURIComponent(`${parsed.gcsPath}/artifacts/${sub}/`)}&delimiter=/`;
    const stepsList = await (await fetch(stepsUrl)).json();
    const stepNames = (stepsList.prefixes || []).map((p) => p.replace(/\/$/, '').split('/').pop());
    for (const s of stepNames) {
      const fin = await fetchText(`${base}/artifacts/${sub}/${s}/finished.json`);
      if (!fin) continue;
      try {
        const j = JSON.parse(fin);
        if (j.passed === false) failedSteps.push(s);
      } catch {
        /* ignore */
      }
    }
    for (const s of [
      'upi-libvirt-cleanup-pre',
      'upi-install-libvirt-network',
      'upi-libvirt-cleanup-post',
      'upi-install-libvirt',
    ]) {
      const log = await fetchText(`${base}/artifacts/${sub}/${s}/build-log.txt`);
      if (!log) continue;
      const m = stripAnsi(log).match(/Using libvirt connection for (qemu\+tcp:\/\/\S+)/i);
      if (m) {
        qemu = m[1];
        break;
      }
    }
  }

  return {
    finishedPassed: finished.passed,
    leaseSlot: leaseM?.[2] || null,
    leasePool: leaseM?.[1] || null,
    profile: labelProfile || profileM?.[1] || null,
    releaseTag: latest?.[1] || null,
    initialTag: initial?.[1] || null,
    qemu,
    failedSteps,
    testSubdir: sub,
  };
}

function short(name) {
  return name
    .replace(/^periodic-ci-openshift-multiarch-main-nightly-/, '')
    .replace(/^rehearse-\d+-periodic-ci-openshift-multiarch-main-nightly-/, 'rehearse/');
}

const results = [];

for (const url of JOBS) {
  const parsed = parseProwUrl(url);
  if (!parsed) {
    results.push({ url, ok: false, errors: ['URL parse failed'] });
    continue;
  }
  process.stderr.write(`\n=== ${short(parsed.jobName)} / ${parsed.buildId} ===\n`);
  const [analysis, expected] = await Promise.all([
    analyzeExecution(parsed, (p, l) => process.stderr.write(`  ${p}% ${l}\n`)),
    expectFromGcs(parsed),
  ]);

  const errors = [];
  const checks = [];

  function check(label, actual, want, soft = false) {
    const pass = actual === want || (want == null && (actual == null || actual === ''));
    checks.push({ label, actual, want, pass, soft });
    if (!pass && !soft) errors.push(`${label}: got ${JSON.stringify(actual)} want ${JSON.stringify(want)}`);
  }

  check('result FAILED', analysis.result, expected.finishedPassed === false ? 'FAILED' : analysis.result);
  check('lease slot', analysis.leaseSlot, expected.leaseSlot);
  check('lease pool', analysis.lease?.pool ?? null, expected.leasePool);
  check('cluster profile', analysis.meta.profile, expected.profile);
  check('release tag', analysis.release?.tag ?? null, expected.releaseTag);
  if (expected.initialTag) {
    check('upgrade initial tag', analysis.release?.initialTag ?? null, expected.initialTag);
  }
  check('test subdir', analysis.testSubdir, expected.testSubdir);
  check('qemu URI', analysis.lease?.qemuUri ?? null, expected.qemu, true);

  if (expected.qemu && analysis.lease?.qemuUri) {
    const lpar = resolveLpar(analysis.leaseSlot, analysis.lease);
    const host = expected.qemu.match(/qemu\+tcp:\/\/([^/]+)/)?.[1];
    const shortHost = host?.split('.')[0];
    if (lpar?.lpar !== shortHost) {
      errors.push(`LPAR short host: got ${lpar?.lpar} want ${shortHost}`);
    } else {
      checks.push({ label: 'LPAR short host', actual: lpar.lpar, want: shortHost, pass: true });
    }
  }

  // primary failure should be one of the failed steps (prefer non-best-effort)
  if (expected.failedSteps.length) {
    if (!analysis.firstFailed) {
      errors.push(`firstFailed missing; GCS failed steps=${expected.failedSteps.join(',')}`);
    } else if (!expected.failedSteps.includes(analysis.firstFailed)) {
      // analyzer may pick configured-order first; still must be a real failure
      errors.push(
        `firstFailed ${analysis.firstFailed} not in GCS failed list [${expected.failedSteps.join(', ')}]`,
      );
    } else {
      checks.push({
        label: 'firstFailed in GCS failed steps',
        actual: analysis.firstFailed,
        want: expected.failedSteps.join('|'),
        pass: true,
      });
    }
  }

  // phase failed counts should match workflow
  const testPhase = analysis.phaseTimings.find((t) => t.phase === 'test');
  const testFailed = analysis.workflow.filter((w) => w.phase === 'test' && w.status === 'failed').length;
  if (testPhase && testPhase.failedCount !== testFailed) {
    errors.push(`TEST phase failedCount ${testPhase.failedCount} != workflow ${testFailed}`);
  }

  const ok = errors.length === 0;
  results.push({
    job: short(parsed.jobName),
    buildId: parsed.buildId,
    url,
    ok,
    errors,
    checks,
    summary: {
      result: analysis.result,
      profile: analysis.meta.profile,
      lease: analysis.leaseSlot,
      qemu: analysis.lease?.qemuUri,
      release: analysis.release?.tag,
      initial: analysis.release?.initialTag,
      firstFailed: analysis.firstFailed,
      failedCounts: {
        workflow: analysis.workflow.filter((w) => w.status === 'failed').length,
        gcs: expected.failedSteps.length,
      },
      phaseTest: testPhase
        ? `${testPhase.failedCount} failed · ${testPhase.passedCount} passed`
        : null,
    },
  });

  process.stderr.write(ok ? '  PASS\n' : `  FAIL\n${errors.map((e) => '   - ' + e).join('\n')}\n`);
}

const passed = results.filter((r) => r.ok).length;
console.log(JSON.stringify({ passed, total: results.length, results }, null, 2));
process.exit(passed === results.length ? 0 : 1);
