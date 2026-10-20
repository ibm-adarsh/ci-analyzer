import { fetchJson, listPrefix } from './gcs';
import { prowHistoryUrl, prowViewUrl } from './url';

export interface JobBuildRef {
  buildId: string;
  gcsPath: string;
  /** From finished.json when fetched */
  passed?: boolean | null;
  result?: string | null;
  timestamp?: number | null;
}

/** Parent GCS prefix that contains build-id directories (…/logs/<job>/ or …/pr-logs/…/<job>/). */
export function buildsPrefixFromGcsPath(gcsPath: string): string {
  const parts = gcsPath.replace(/\/+$/, '').split('/');
  if (parts.length < 2) return gcsPath;
  return parts.slice(0, -1).join('/') + '/';
}

/** List numeric build IDs under a job prefix, newest first. */
export async function listJobBuildIds(
  bucket: string,
  buildsPrefix: string,
): Promise<string[]> {
  const prefix = buildsPrefix.endsWith('/') ? buildsPrefix : `${buildsPrefix}/`;
  const ids: string[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 10; page++) {
    const data = await listPrefix(bucket, prefix, {
      delimiter: '/',
      maxResults: 500,
      pageToken,
    });
    if (!data) break;
    for (const p of data.prefixes || []) {
      const bid = p.replace(/\/$/, '').split('/').pop() || '';
      if (/^\d+$/.test(bid)) ids.push(bid);
    }
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }
  return [...new Set(ids)].sort((a, b) => (BigInt(b) > BigInt(a) ? 1 : BigInt(b) < BigInt(a) ? -1 : 0));
}

export async function readFinished(
  bucket: string,
  gcsPath: string,
): Promise<{ passed?: boolean; result?: string; timestamp?: number } | null> {
  return fetchJson(`${`https://storage.googleapis.com/${bucket}/${gcsPath}`}/finished.json`);
}

function isFinishedSuccess(fin: {
  passed?: boolean;
  result?: string;
} | null): boolean {
  if (!fin) return false;
  return (
    fin.passed === true ||
    (typeof fin.result === 'string' && fin.result.toUpperCase() === 'SUCCESS')
  );
}

/**
 * Find the newest successful build strictly older than currentBuildId.
 * Uses GCS finished.json (browser-CORS safe). Skips missing/incomplete builds.
 * Probes older builds in parallel batches for latency.
 */
export async function findLastGreenBuild(
  bucket: string,
  buildsPrefix: string,
  currentBuildId: string,
  opts: { maxProbe?: number; concurrency?: number } = {},
): Promise<JobBuildRef | null> {
  const maxProbe = opts.maxProbe ?? 60;
  const concurrency = Math.max(1, opts.concurrency ?? 8);
  const ids = await listJobBuildIds(bucket, buildsPrefix);
  const cur = BigInt(currentBuildId);
  const older = ids.filter((id) => BigInt(id) < cur).slice(0, maxProbe);
  const base = buildsPrefix.replace(/\/+$/, '');

  for (let i = 0; i < older.length; i += concurrency) {
    const batch = older.slice(i, i + concurrency);
    const fins = await Promise.all(
      batch.map(async (buildId) => {
        const gcsPath = `${base}/${buildId}`;
        const fin = await readFinished(bucket, gcsPath);
        return { buildId, gcsPath, fin };
      }),
    );
    // Preserve newest-first order within the batch.
    for (const row of fins) {
      if (!isFinishedSuccess(row.fin)) continue;
      return {
        buildId: row.buildId,
        gcsPath: row.gcsPath,
        passed: row.fin?.passed ?? true,
        result: row.fin?.result || 'SUCCESS',
        timestamp: row.fin?.timestamp ?? null,
      };
    }
  }
  return null;
}

export function historyLinks(bucket: string, jobName: string, green: JobBuildRef | null) {
  return {
    historyUrl: prowHistoryUrl(bucket, jobName),
    greenUrl: green ? prowViewUrl(bucket, green.gcsPath) : null,
  };
}
