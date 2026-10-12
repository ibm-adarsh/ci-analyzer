import type { ParsedUrl } from '../types';
import { GCS_BUCKET, PROW_DECK } from '../data/workflow';

const URL_RE = /gs\/([\w.-]+)\/((?:logs|pr-logs\/pull\/[^/]+\/\d+)\/([^/]+)\/(\d+))/;

export function parseProwUrl(raw: string): ParsedUrl | null {
  const url = (raw || '').trim();
  const m = url.match(URL_RE);
  if (!m) return null;
  return { bucket: m[1], gcsPath: m[2], jobName: m[3], buildId: m[4], raw: url };
}

export function prowViewUrl(bucket: string, gcsPath: string): string {
  return `${PROW_DECK}/view/gs/${bucket}/${gcsPath}`;
}

export function prowHistoryUrl(bucket: string, jobName: string): string {
  const clean = jobName.replace(/^rehearse-\d+-/, '');
  return `${PROW_DECK}/job-history/gs/${bucket}/logs/${encodeURIComponent(clean)}`;
}

export function executionRoute(bucket: string, gcsPath: string): string {
  return `/execution/${encodeURIComponent(bucket)}/${encodeURIComponent(gcsPath)}`;
}

export function parseExecutionRoute(bucketEnc: string, pathEnc: string): ParsedUrl | null {
  try {
    const bucket = decodeURIComponent(bucketEnc);
    const gcsPath = decodeURIComponent(pathEnc);
    const parts = gcsPath.split('/');
    const buildId = parts[parts.length - 1];
    const jobName = parts[parts.length - 2];
    if (!bucket || !jobName || !/^\d+$/.test(buildId)) return null;
    return {
      bucket,
      gcsPath,
      jobName,
      buildId,
      raw: prowViewUrl(bucket, gcsPath),
    };
  } catch {
    return null;
  }
}

export function defaultBucket(): string {
  return GCS_BUCKET;
}
