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

export type GreenRelation = 'previous' | 'later';

export interface GreenBuildHit extends JobBuildRef {
  /** previous = older than current; later = only newer greens existed (fallback). */
  relation: GreenRelation;
}

async function firstGreenInOrder(
  bucket: string,
  base: string,
  orderedIds: string[],
  concurrency: number,
): Promise<JobBuildRef | null> {
  for (let i = 0; i < orderedIds.length; i += concurrency) {
    const batch = orderedIds.slice(i, i + concurrency);
    const fins = await Promise.all(
      batch.map(async (buildId) => {
        const gcsPath = `${base}/${buildId}`;
        const fin = await readFinished(bucket, gcsPath);
        return { buildId, gcsPath, fin };
      }),
    );
    // Preserve caller order within the batch (newest-first for older; oldest-first for later).
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

/**
 * Find a successful build to compare against.
 * 1) Prefer the newest SUCCESS strictly older than current (classic "last green").
 * 2) If none, fall back to the oldest SUCCESS newer than current — useful when
 *    viewing an older failure while later runs already went green again.
 * Uses GCS finished.json (browser-CORS safe).
 */
export async function findLastGreenBuild(
  bucket: string,
  buildsPrefix: string,
  currentBuildId: string,
  opts: { maxProbe?: number; concurrency?: number } = {},
): Promise<GreenBuildHit | null> {
  const maxProbe = opts.maxProbe ?? 60;
  const concurrency = Math.max(1, opts.concurrency ?? 8);
  const ids = await listJobBuildIds(bucket, buildsPrefix);
  const cur = BigInt(currentBuildId);
  const base = buildsPrefix.replace(/\/+$/, '');

  const older = ids.filter((id) => BigInt(id) < cur).slice(0, maxProbe);
  const prev = await firstGreenInOrder(bucket, base, older, concurrency);
  if (prev) return { ...prev, relation: 'previous' };

  // Newest-first ids → later successes sorted oldest-first (closest after current).
  const later = ids
    .filter((id) => BigInt(id) > cur)
    .slice(0, maxProbe)
    .reverse();
  const next = await firstGreenInOrder(bucket, base, later, concurrency);
  if (next) return { ...next, relation: 'later' };

  return null;
}

export function historyLinks(bucket: string, jobName: string, green: JobBuildRef | null) {
  return {
    historyUrl: prowHistoryUrl(bucket, jobName),
    greenUrl: green ? prowViewUrl(bucket, green.gcsPath) : null,
  };
}
