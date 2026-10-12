import type { ArtifactEntry } from '../types';

/** Convert a direct GCS URL to the CORS-safe JSON API ?alt=media form. */
export function gcsApiUrl(url: string): string {
  if (url.includes('/storage/v1/')) return url;
  const m = url.match(/^https:\/\/storage\.googleapis\.com\/([\w.-]+)\/(.+)$/);
  if (!m) return url;
  const cleanPath = m[2].replace(/\?.*$/, '');
  return `https://storage.googleapis.com/storage/v1/b/${m[1]}/o/${encodeURIComponent(cleanPath)}?alt=media`;
}

export async function fetchJson<T = unknown>(url: string): Promise<T | null> {
  try {
    const r = await fetch(gcsApiUrl(url));
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

export async function fetchText(url: string): Promise<string | null> {
  try {
    const r = await fetch(gcsApiUrl(url));
    if (!r.ok) return null;
    const t = await r.text();
    if (t && t.length < 400 && /potentially sensitive information.*removed/i.test(t)) {
      return '__REDACTED__';
    }
    return t;
  } catch {
    return null;
  }
}

export interface GcsListResult {
  prefixes?: string[];
  items?: { name: string; size?: string; updated?: string; contentType?: string }[];
  nextPageToken?: string;
}

export async function listPrefix(
  bucket: string,
  prefix: string,
  opts: { delimiter?: string; maxResults?: number; pageToken?: string } = {},
): Promise<GcsListResult | null> {
  const params = new URLSearchParams({
    prefix,
    maxResults: String(opts.maxResults ?? 200),
  });
  if (opts.delimiter !== undefined) params.set('delimiter', opts.delimiter);
  if (opts.pageToken) params.set('pageToken', opts.pageToken);
  const url = `https://storage.googleapis.com/storage/v1/b/${bucket}/o?${params}`;
  return fetchJson<GcsListResult>(url);
}

export function toArtifactEntries(
  data: GcsListResult | null,
  prefix: string,
): ArtifactEntry[] {
  if (!data) return [];
  const dirs = (data.prefixes || []).map((p) => ({
    name: p.replace(/\/$/, '').split('/').pop()! + '/',
    fullPath: p,
    isDir: true as const,
  }));
  const files = (data.items || [])
    .filter((it) => it.name !== prefix)
    .map((it) => {
      const name = it.name.startsWith(prefix) ? it.name.slice(prefix.length) : it.name.split('/').pop()!;
      return {
        name,
        fullPath: it.name,
        isDir: false as const,
        size: Number(it.size || 0),
        updated: it.updated || null,
        contentType: it.contentType,
      };
    })
    .filter((it) => it.name && !it.name.includes('/'));
  return [...dirs, ...files];
}

export function gcsDirectUrl(bucket: string, objectPath: string): string {
  return `https://storage.googleapis.com/${bucket}/${objectPath}`;
}

export function gcswebUrl(bucket: string, objectPath: string): string {
  return `https://gcsweb-ci.apps.ci.l2s4.p1.openshiftapps.com/gcs/${bucket}/${objectPath}`;
}

export function fmtBytes(n?: number): string {
  if (n == null || Number.isNaN(n)) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function fmtDur(seconds: number | null | undefined): string {
  if (seconds == null || Number.isNaN(seconds)) return '—';
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${r}s`;
  return `${r}s`;
}
