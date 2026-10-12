#!/usr/bin/env node
/**
 * Build-time / scheduled job index generator.
 * Discovers IBM Z-related job names under public GCS and recent builds.
 * Writes public/data/job-index.json for the static workbench.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '../public/data/job-index.json');
const BUCKET = 'test-platform-results-public';

async function listPrefix(prefix, { delimiter = '/', maxResults = 200, pageToken } = {}) {
  const params = new URLSearchParams({ prefix, maxResults: String(maxResults) });
  if (delimiter !== undefined) params.set('delimiter', delimiter);
  if (pageToken) params.set('pageToken', pageToken);
  const url = `https://storage.googleapis.com/storage/v1/b/${BUCKET}/o?${params}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`GCS list ${r.status} for ${prefix}`);
  return r.json();
}

async function fetchJson(objectPath) {
  const enc = encodeURIComponent(objectPath);
  const url = `https://storage.googleapis.com/storage/v1/b/${BUCKET}/o/${enc}?alt=media`;
  const r = await fetch(url);
  if (!r.ok) return null;
  return r.json();
}

function isIbmZ(name) {
  return /z-z|z-za|s390x|libvirt-s390x/.test(name) && /libvirt|s390x/.test(name);
}

function archClass(jobName) {
  if (/z-za/.test(jobName)) return 'multi-arch-heterogeneous';
  if (/z-z/.test(jobName)) return 'multi-arch-homogeneous';
  if (/remote-libvirt-s390x|(?:^|-)libvirt-s390x$/.test(jobName)) return 'single-arch-s390x';
  if (/s390x/.test(jobName)) return 's390x';
  return 'unknown';
}

async function discoverJobNames() {
  const probes = [
    'logs/periodic-ci-openshift-multiarch-main-nightly-5.1-',
    'logs/periodic-ci-openshift-multiarch-main-nightly-5.0-',
    'logs/periodic-ci-openshift-multiarch-main-nightly-4.23-',
    'logs/periodic-ci-openshift-multiarch-main-nightly-4.22-',
    'logs/periodic-ci-openshift-multiarch-main-nightly-4.19-',
  ];
  const found = new Set();
  for (const probe of probes) {
    let token;
    let pages = 0;
    do {
      const data = await listPrefix(probe, { pageToken: token });
      for (const p of data.prefixes || []) {
        const name = p.replace(/\/$/, '').split('/').pop();
        if (name && isIbmZ(name)) found.add(name);
      }
      token = data.nextPageToken;
      pages++;
    } while (token && pages < 4);
  }
  return [...found].sort();
}

async function recentBuilds(job, limit = 3) {
  const data = await listPrefix(`logs/${job}/`, { maxResults: 40 });
  return (data.prefixes || [])
    .map((p) => p.replace(/\/$/, '').split('/').pop())
    .filter((id) => /^\d+$/.test(id))
    .sort((a, b) => (a < b ? 1 : -1))
    .slice(0, limit);
}

async function summarize(job, buildId) {
  const gcsPath = `logs/${job}/${buildId}`;
  const [started, finished, prowjob] = await Promise.all([
    fetchJson(`${gcsPath}/started.json`),
    fetchJson(`${gcsPath}/finished.json`),
    fetchJson(`${gcsPath}/prowjob.json`),
  ]);
  if (!started && !finished && !prowjob) return null;
  const labels = prowjob?.metadata?.labels || {};
  const state = prowjob?.status?.state;
  let result = 'RUNNING';
  if (finished?.passed === true || state === 'success') result = 'PASSED';
  else if (finished?.passed === false || state === 'failure') result = 'FAILED';
  else if (state === 'aborted') result = 'ABORTED';
  const startedAt = started?.timestamp ?? null;
  const finishedAt = finished?.timestamp ?? null;
  const verM = job.match(/nightly-([\d.]+)/);
  return {
    jobName: job,
    buildId,
    gcsPath,
    prowUrl: `https://prow.ci.openshift.org/view/gs/${BUCKET}/${gcsPath}`,
    result,
    archClass: archClass(job),
    startedAt,
    finishedAt,
    durationSec: startedAt && finishedAt ? Math.max(0, finishedAt - startedAt) : null,
    variant: labels['ci-operator.openshift.io/variant'] || null,
    profile: labels['ci-operator.openshift.io/cloud-cluster-profile'] || null,
    ocpVersion: verM ? verM[1] : null,
  };
}

async function main() {
  console.log('Discovering IBM Z job names…');
  const jobNames = await discoverJobNames();
  console.log(`Found ${jobNames.length} jobs`);
  const executions = [];
  const queue = [...jobNames];
  const workers = Array.from({ length: 5 }, async () => {
    while (queue.length) {
      const job = queue.shift();
      process.stdout.write(`  ${job}\n`);
      try {
        const builds = await recentBuilds(job, 3);
        for (const id of builds) {
          const entry = await summarize(job, id);
          if (entry) executions.push(entry);
        }
      } catch (e) {
        console.warn('skip', job, e.message);
      }
    }
  });
  await Promise.all(workers);
  executions.sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
  const index = {
    generatedAt: new Date().toISOString(),
    bucket: BUCKET,
    source: 'gs://test-platform-results-public/logs/ (dynamic IBM Z prefix discovery)',
    executions,
    jobNames,
  };
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(index, null, 2));
  console.log(`Wrote ${OUT} (${executions.length} executions)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
