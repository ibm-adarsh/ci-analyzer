import { fetchJson, fetchText } from './gcs';

export interface ReleaseInfo {
  tag: string | null;
  createdAt: string | null;
  pullSpec: string | null;
  source: string;
  /** Quay / registry image used for install target when found */
  installTarget?: string | null;
}

/** Parse nightly/release tag from ci-operator root build-log.txt */
export function parseReleaseFromProwLog(prowLog: string | null): ReleaseInfo | null {
  if (!prowLog || prowLog === '__REDACTED__') return null;
  const imported = prowLog.match(
    /Imported release\s+(\S+)\s+created at\s+(.+?)\s+with\s+\d+\s+images/i,
  );
  const resolved = prowLog.match(/Resolved release\s+\S+\s+to\s+(\S+)/i);
  if (!imported && !resolved) return null;
  return {
    tag: imported?.[1] ?? null,
    createdAt: imported?.[2] ?? null,
    pullSpec: resolved?.[1] ?? null,
    source: 'ci-operator build-log.txt',
  };
}

export function parseLeaseFromProwLog(prowLog: string | null): string | null {
  if (!prowLog || prowLog === '__REDACTED__') return null;
  const m = prowLog.match(/Acquired\s+\d+\s+lease\(s\)\s+for\s+[^:]+:\s*\[([^\]]+)\]/i);
  return m?.[1]?.trim() || null;
}

/**
 * Fallback when root build-log is missing (common while job is still running):
 * read ImageStream JSON written under artifacts/release/.
 */
export async function fetchReleaseFromArtifacts(
  base: string,
): Promise<ReleaseInfo | null> {
  // Known layout: artifacts/release/artifacts/release-images-latest (ImageStream JSON)
  const candidates = [
    `${base}/artifacts/release/artifacts/release-images-latest`,
    `${base}/artifacts/release/artifacts/release-images-initial`,
  ];
  for (const url of candidates) {
    const js = await fetchJson<{
      metadata?: { name?: string; creationTimestamp?: string };
      status?: { publicDockerImageRepository?: string; tags?: { tag?: string; items?: { dockerImageReference?: string }[] }[] };
      spec?: { tags?: { name?: string; from?: { name?: string } }[] };
    }>(url);
    if (!js?.metadata?.name) continue;
    const tag = js.metadata.name;
    const testsTag = js.spec?.tags?.find((t) => t.name === 'tests')?.from?.name
      || js.status?.tags?.find((t) => t.tag === 'tests')?.items?.[0]?.dockerImageReference
      || null;
    return {
      tag,
      createdAt: js.metadata.creationTimestamp || null,
      pullSpec: testsTag,
      installTarget: js.spec?.tags?.find((t) => t.name === 'machine-os-images' || t.name === 'installer')?.from?.name || null,
      source: url.includes('release-images-latest')
        ? 'artifacts/release/artifacts/release-images-latest'
        : 'artifacts/release ImageStream',
    };
  }

  // Text pull-spec files if present
  const textCandidates = [
    `${base}/artifacts/release/artifacts/release-images-latest-pull-spec`,
    `${base}/artifacts/release/artifacts/release.txt`,
  ];
  for (const url of textCandidates) {
    const t = await fetchText(url);
    if (t && t !== '__REDACTED__' && t.length < 2000) {
      const tag = t.match(/(\d+\.\d+\.\d+-0\.nightly[^\s"]+)/)?.[1] || null;
      return { tag, createdAt: null, pullSpec: t.trim().split('\n')[0], source: url.split('/artifacts/')[1] || url };
    }
  }
  return null;
}

/** Quay / browser-friendly link for a release tag when it looks like a nightly. */
export function releaseBrowserLinks(tag: string | null): { label: string; url: string }[] {
  if (!tag) return [];
  const links = [
    {
      label: 'AMD64 nightly browser',
      url: `https://amd64.ocp.releases.ci.openshift.org/#${encodeURIComponent(tag)}`,
    },
    {
      label: 'Multi-arch / s390x releases',
      url: 'https://multi.ocp.releases.ci.openshift.org/',
    },
  ];
  // Multi nightlies often use nightly-multi in the tag
  if (/nightly-multi/.test(tag)) {
    links[0] = {
      label: 'Multi-arch release page',
      url: `https://multi.ocp.releases.ci.openshift.org/#${encodeURIComponent(tag)}`,
    };
  }
  return links;
}
