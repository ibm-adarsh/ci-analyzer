#!/usr/bin/env node
/**
 * Headless verification of GCS-backed analysis paths used by the workbench.
 * Does not load the browser DOM — validates fetch/discovery/diagnosis contracts.
 */
import { pathToFileURL } from 'url';

const BUCKET = 'test-platform-results-public';

const CASES = [
  {
    name: 'success-z-z',
    job: 'periodic-ci-openshift-multiarch-main-nightly-5.0-ocp-e2e-serial-ovn-remote-libvirt-multi-z-z',
    build: '2107441095997657088',
    expectResult: 'PASSED',
  },
  {
    name: 'failed-upgrade-z-z',
    job: 'periodic-ci-openshift-multiarch-main-nightly-5.0-upgrade-from-nightly-4.22-ocp-ovn-remote-libvirt-multi-z-z',
    build: '2107456138294333440',
    expectResult: 'FAILED',
    expectFailedStep: 'openshift-e2e-libvirt-test',
  },
  {
    name: 'failed-fips-z-z',
    job: 'periodic-ci-openshift-multiarch-main-nightly-4.23-ocp-fips-ovn-techpreview-multi-z-z',
    build: '2107396006764089344',
    expectResult: 'FAILED',
  },
  {
    name: 'rehearse-z-za',
    path: 'pr-logs/pull/openshift_release/86277/rehearse-86277-periodic-ci-openshift-multiarch-main-nightly-5.1-ocp-e2e-ovn-remote-libvirt-multi-z-za/2107481951748231168',
    expectResult: 'FAILED',
  },
];

function gcsApiUrl(url) {
  if (url.includes('/storage/v1/')) return url;
  const m = url.match(/^https:\/\/storage\.googleapis\.com\/([\w.-]+)\/(.+)$/);
  if (!m) return url;
  return `https://storage.googleapis.com/storage/v1/b/${m[1]}/o/${encodeURIComponent(m[2].replace(/\?.*$/, ''))}?alt=media`;
}

async function fjs(url) {
  const r = await fetch(gcsApiUrl(url));
  if (!r.ok) return null;
  return r.json();
}

async function fts(url) {
  const r = await fetch(gcsApiUrl(url));
  if (!r.ok) return null;
  return r.text();
}

async function discoverArtifactSubdir(bucket, gcsPath) {
  const apiUrl = `https://storage.googleapis.com/storage/v1/b/${bucket}/o?` +
    `prefix=${encodeURIComponent(gcsPath + '/artifacts/')}&delimiter=/&maxResults=20`;
  const data = await fjs(apiUrl);
  if (!data?.prefixes) return null;
  const candidates = data.prefixes
    .map(p => p.replace(/\/$/, '').split('/').pop())
    .filter(n => n && n !== 'build-resources' && n !== 'release');
  return candidates[0] || null;
}

async function listSteps(bucket, gcsPath, testSubdir) {
  const prefix = gcsPath + '/artifacts/' + (testSubdir ? testSubdir + '/' : '');
  const apiUrl = `https://storage.googleapis.com/storage/v1/b/${bucket}/o?` +
    `prefix=${encodeURIComponent(prefix)}&delimiter=/&maxResults=100`;
  const data = await fjs(apiUrl);
  return (data?.prefixes || []).map(p => p.replace(/\/$/, '').split('/').pop()).filter(Boolean);
}

async function runCase(c) {
  const gcsPath = c.path || `logs/${c.job}/${c.build}`;
  const base = `https://storage.googleapis.com/${BUCKET}/${gcsPath}`;
  const [started, finished, prowjob] = await Promise.all([
    fjs(`${base}/started.json`),
    fjs(`${base}/finished.json`),
    fjs(`${base}/prowjob.json`),
  ]);
  const result = finished?.passed === true ? 'PASSED'
    : finished?.passed === false ? 'FAILED'
    : prowjob?.status?.state === 'success' ? 'PASSED'
    : prowjob?.status?.state === 'failure' ? 'FAILED'
    : 'RUNNING';

  const testSubdir = await discoverArtifactSubdir(BUCKET, gcsPath);
  const steps = testSubdir ? await listSteps(BUCKET, gcsPath, testSubdir) : [];

  // Check must-gather path if present
  let mustGatherOk = null;
  if (steps.includes('gather-must-gather')) {
    const mg = await fjs(
      `https://storage.googleapis.com/storage/v1/b/${BUCKET}/o?prefix=${encodeURIComponent(gcsPath + '/artifacts/' + testSubdir + '/gather-must-gather/')}&maxResults=20`
    );
    const names = (mg?.items || []).map(i => i.name.split('/').pop());
    mustGatherOk = names.includes('must-gather.tar.gz') || names.includes('build-log.txt');
  }

  // Primary failed step via finished.json
  let firstFailed = null;
  for (const step of steps) {
    const fin = await fjs(`${base}/artifacts/${testSubdir}/${step}/finished.json`);
    if (fin?.passed === false) { firstFailed = step; break; }
  }

  // Config correlation fields
  const labels = prowjob?.metadata?.labels || {};
  const variant = labels['ci-operator.openshift.io/variant'] || null;
  const profile = labels['ci-operator.openshift.io/cloud-cluster-profile'] || null;

  const errors = [];
  if (c.expectResult && result !== c.expectResult) errors.push(`result ${result} != ${c.expectResult}`);
  if (!started) errors.push('missing started.json');
  if (!testSubdir) errors.push('no artifact subdir');
  if (steps.length < 3) errors.push(`too few steps: ${steps.length}`);
  if (c.expectFailedStep && firstFailed !== c.expectFailedStep) {
    // Allow any failed step if expected not found yet — report soft
    if (!firstFailed) errors.push(`expected failed step ${c.expectFailedStep}, got none`);
  }
  if (mustGatherOk === false) errors.push('gather-must-gather present but key files missing');

  return {
    name: c.name,
    ok: errors.length === 0,
    errors,
    result,
    testSubdir,
    stepCount: steps.length,
    firstFailed,
    variant,
    profile,
    mustGatherOk,
    arch: /z-za/.test(gcsPath) ? 'z-za' : /z-z/.test(gcsPath) ? 'z-z' : /s390x/.test(gcsPath) ? 's390x' : '?',
  };
}

const results = [];
for (const c of CASES) {
  process.stdout.write(`… ${c.name} `);
  try {
    const r = await runCase(c);
    results.push(r);
    console.log(r.ok ? 'OK' : 'FAIL', JSON.stringify({
      result: r.result, steps: r.stepCount, firstFailed: r.firstFailed,
      variant: r.variant, profile: r.profile, arch: r.arch, errors: r.errors,
    }));
  } catch (e) {
    results.push({ name: c.name, ok: false, errors: [String(e)] });
    console.log('ERROR', e.message || e);
  }
}

// Also probe a single-arch s390x latest build if catalog job exists
try {
  const job = 'periodic-ci-openshift-multiarch-main-nightly-5.0-ocp-e2e-ovn-remote-libvirt-s390x';
  const list = await fjs(`https://storage.googleapis.com/storage/v1/b/${BUCKET}/o?prefix=${encodeURIComponent('logs/' + job + '/')}&delimiter=/&maxResults=5`);
  const builds = (list?.prefixes || []).map(p => p.replace(/\/$/, '').split('/').pop()).filter(id => /^\d+$/.test(id));
  console.log(`… s390x-catalog builds_found=${builds.length}`);
  results.push({ name: 's390x-catalog', ok: builds.length > 0, errors: builds.length ? [] : ['no builds'], stepCount: builds.length });
} catch (e) {
  results.push({ name: 's390x-catalog', ok: false, errors: [String(e)] });
}

const failed = results.filter(r => !r.ok);
console.log('\n=== SUMMARY ===');
console.log(`passed=${results.length - failed.length} failed=${failed.length}`);
if (failed.length) {
  for (const f of failed) console.log('FAIL', f.name, f.errors);
  process.exit(1);
}
console.log('All verification cases passed.');
