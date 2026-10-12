import { GCS_BUCKET } from '../data/workflow';
import type { ArchClass, JobIndex, JobIndexEntry, JobResult } from '../types';
import { fetchJson, listPrefix } from './gcs';
import { classifyArch, isIbmZJob, parseJobMeta } from './meta';
import { prowViewUrl } from './url';

/** Search prefixes under logs/ for IBM Z-related job names (general discovery). */
export async function discoverIbmZJobNames(
  bucket = GCS_BUCKET,
  options: { maxPages?: number } = {},
): Promise<string[]> {
  const found = new Set<string>();
  // Targeted prefix probes — avoids scanning the entire bucket
  const probes = [
    'logs/periodic-ci-openshift-multiarch-main-nightly-5.1-',
    'logs/periodic-ci-openshift-multiarch-main-nightly-5.0-',
    'logs/periodic-ci-openshift-multiarch-main-nightly-4.23-',
    'logs/periodic-ci-openshift-multiarch-main-nightly-4.22-',
    'logs/periodic-ci-openshift-multiarch-main-nightly-4.19-',
  ];

  for (const probe of probes) {
    let token: string | undefined;
    let pages = 0;
    do {
      const data = await listPrefix(bucket, probe, {
        delimiter: '/',
        maxResults: 200,
        pageToken: token,
      });
      for (const p of data?.prefixes || []) {
        const name = p.replace(/\/$/, '').split('/').pop()!;
        if (isIbmZJob(name) && /libvirt|s390x|z-z|z-za/.test(name)) found.add(name);
      }
      token = data?.nextPageToken;
      pages++;
    } while (token && pages < (options.maxPages ?? 3));
  }

  return [...found].sort();
}

export async function listRecentBuilds(
  jobName: string,
  bucket = GCS_BUCKET,
  limit = 5,
): Promise<string[]> {
  const data = await listPrefix(bucket, `logs/${jobName}/`, { delimiter: '/', maxResults: 30 });
  return (data?.prefixes || [])
    .map((p) => p.replace(/\/$/, '').split('/').pop()!)
    .filter((id) => /^\d+$/.test(id))
    .sort((a, b) => (a < b ? 1 : -1))
    .slice(0, limit);
}

function toResult(finished: { passed?: boolean } | null, prowState?: string): JobResult {
  if (finished?.passed === true) return 'PASSED';
  if (finished?.passed === false) return 'FAILED';
  if (prowState === 'success') return 'PASSED';
  if (prowState === 'failure') return 'FAILED';
  if (prowState === 'aborted') return 'ABORTED';
  if (prowState === 'pending' || prowState === 'triggered') return 'RUNNING';
  return finished ? 'UNKNOWN' : 'RUNNING';
}

export async function fetchExecutionSummary(
  jobName: string,
  buildId: string,
  bucket = GCS_BUCKET,
): Promise<JobIndexEntry | null> {
  const gcsPath = `logs/${jobName}/${buildId}`;
  const base = `https://storage.googleapis.com/${bucket}/${gcsPath}`;
  const [started, finished, prowjob] = await Promise.all([
    fetchJson<{ timestamp?: number }>(`${base}/started.json`),
    fetchJson<{ passed?: boolean; timestamp?: number }>(`${base}/finished.json`),
    fetchJson<Record<string, unknown>>(`${base}/prowjob.json`),
  ]);
  if (!started && !finished && !prowjob) return null;

  const labels =
    (prowjob?.metadata as { labels?: Record<string, string> } | undefined)?.labels || {};
  const state = (prowjob?.status as { state?: string } | undefined)?.state;
  const meta = parseJobMeta(jobName);
  const startedAt = started?.timestamp ?? null;
  const finishedAt = finished?.timestamp ?? null;

  return {
    jobName,
    buildId,
    gcsPath,
    prowUrl: prowViewUrl(bucket, gcsPath),
    result: toResult(finished, state),
    archClass: (classifyArch(jobName) || 'unknown') as ArchClass,
    startedAt,
    finishedAt,
    durationSec: startedAt && finishedAt ? Math.max(0, finishedAt - startedAt) : null,
    variant: labels['ci-operator.openshift.io/variant'] || null,
    profile: labels['ci-operator.openshift.io/cloud-cluster-profile'] || meta.profile,
    ocpVersion: meta.ocpVersion,
  };
}

/**
 * Live discovery: find IBM Z job names, then recent builds.
 * Bounded concurrency — suitable for browser / CI index generation.
 */
export async function discoverRecentExecutions(options: {
  buildsPerJob?: number;
  concurrency?: number;
  onProgress?: (msg: string) => void;
} = {}): Promise<JobIndex> {
  const buildsPerJob = options.buildsPerJob ?? 3;
  const concurrency = options.concurrency ?? 4;
  options.onProgress?.('Discovering IBM Z job names from GCS…');
  const jobNames = await discoverIbmZJobNames();
  options.onProgress?.(`Found ${jobNames.length} job names; fetching recent builds…`);

  const executions: JobIndexEntry[] = [];
  const queue = [...jobNames];

  const workers = Array.from({ length: concurrency }, async () => {
    while (queue.length) {
      const job = queue.shift()!;
      try {
        const builds = await listRecentBuilds(job, GCS_BUCKET, buildsPerJob);
        for (const buildId of builds) {
          const entry = await fetchExecutionSummary(job, buildId);
          if (entry) executions.push(entry);
        }
      } catch {
        /* skip */
      }
    }
  });
  await Promise.all(workers);

  executions.sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));

  return {
    generatedAt: new Date().toISOString(),
    bucket: GCS_BUCKET,
    source: 'gs://test-platform-results-public/logs/ (dynamic IBM Z prefix discovery)',
    executions,
    jobNames,
  };
}

export async function loadJobIndex(): Promise<JobIndex | null> {
  try {
    // Vite base-aware path
    const base = import.meta.env.BASE_URL || '/';
    const r = await fetch(`${base}data/job-index.json`, { cache: 'no-cache' });
    if (!r.ok) return null;
    return (await r.json()) as JobIndex;
  } catch {
    return null;
  }
}
