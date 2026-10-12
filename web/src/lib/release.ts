import { fetchJson, fetchText } from './gcs';

export interface ReleaseInfo {
  tag: string | null;
  createdAt: string | null;
  pullSpec: string | null;
  source: string;
  /** Quay / registry image used for install target when found */
  installTarget?: string | null;
  /** release:initial tag on upgrade jobs */
  initialTag?: string | null;
}

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

/**
 * Parse nightly/release tag from ci-operator root build-log.txt.
 * Upgrade jobs import two payloads (initial + latest); prefer release:latest.
 * Pullspec prefers multi-latest / latest / s390x-latest over the first Resolved line
 * (which is often an unrelated arch stream).
 */
export function parseReleaseFromProwLog(prowLog: string | null): ReleaseInfo | null {
  if (!prowLog || prowLog === '__REDACTED__') return null;
  const text = stripAnsi(prowLog);

  const imported = [
    ...text.matchAll(
      /Imported release\s+(\S+)\s+created at\s+(.+?)\s+with\s+\d+\s+images(?:\s+to tag release:(\S+))?/gi,
    ),
  ];
  const importing = text.match(
    /Importing release\s+(\S+)\s+created at\s+(.+?)(?:\s+with\s+\d+\s+images|\s+to tag|\s*$)/im,
  );

  let tag: string | null = null;
  let createdAt: string | null = null;
  let initialTag: string | null = null;

  if (imported.length) {
    for (const m of imported) {
      if (m[3] === 'initial') initialTag = m[1];
    }
    const latest =
      imported.find((m) => m[3] === 'latest') || imported[imported.length - 1];
    tag = latest[1];
    createdAt = latest[2]?.trim() || null;
    if (!initialTag) {
      const other = imported.find((m) => m[1] !== tag);
      if (other) initialTag = other[1];
    }
  } else if (importing) {
    tag = importing[1];
    createdAt = importing[2]?.replace(/\s+with\s+\d+\s+images.*$/i, '').trim() || null;
  }

  let pullSpec: string | null = null;
  for (const name of ['multi-latest', 'latest', 's390x-latest']) {
    const m = text.match(new RegExp(`Resolved release\\s+${name}\\s+to\\s+(\\S+)`, 'i'));
    if (m) {
      pullSpec = m[1];
      break;
    }
  }

  if (!tag && !pullSpec) return null;
  return {
    tag,
    createdAt,
    pullSpec,
    initialTag,
    source: 'ci-operator build-log.txt',
  };
}

/** @deprecated use extractLeaseInfo from ./lease — kept for call-site clarity */
export function parseLeaseFromProwLog(prowLog: string | null): string | null {
  if (!prowLog || prowLog === '__REDACTED__') return null;
  const text = stripAnsi(prowLog);
  const m = text.match(
    /Acquired\s+\d+\s+lease\([^)]*\)\s+for\s+\S+:\s*\[(libvirt-s390x[a-z0-9-]*)\]/i,
  );
  return m?.[1]?.trim() || null;
}

/**
 * Fallback when root build-log is missing (common while job is still running):
 * read ImageStream JSON written under artifacts/release/.
 */
export async function fetchReleaseFromArtifacts(
  base: string,
): Promise<ReleaseInfo | null> {
  const candidates = [
    `${base}/artifacts/release/artifacts/release-images-latest`,
    `${base}/artifacts/release/artifacts/release-images-initial`,
  ];
  for (const url of candidates) {
    const js = await fetchJson<{
      metadata?: { name?: string; creationTimestamp?: string };
      status?: {
        publicDockerImageRepository?: string;
        tags?: { tag?: string; items?: { dockerImageReference?: string }[] }[];
      };
      spec?: { tags?: { name?: string; from?: { name?: string } }[] };
    }>(url);
    if (!js?.metadata?.name) continue;
    const tag = js.metadata.name;
    const testsTag =
      js.spec?.tags?.find((t) => t.name === 'tests')?.from?.name ||
      js.status?.tags?.find((t) => t.tag === 'tests')?.items?.[0]?.dockerImageReference ||
      null;
    return {
      tag,
      createdAt: js.metadata.creationTimestamp || null,
      pullSpec: testsTag,
      installTarget:
        js.spec?.tags?.find((t) => t.name === 'machine-os-images' || t.name === 'installer')?.from
          ?.name || null,
      source: url.includes('release-images-latest')
        ? 'artifacts/release/artifacts/release-images-latest'
        : 'artifacts/release ImageStream',
    };
  }

  const textCandidates = [
    `${base}/artifacts/release/artifacts/release-images-latest-pull-spec`,
    `${base}/artifacts/release/artifacts/release.txt`,
  ];
  for (const url of textCandidates) {
    const t = await fetchText(url);
    if (t && t !== '__REDACTED__' && t.length < 2000) {
      const tag = t.match(/(\d+\.\d+\.\d+-0\.nightly[^\s"]+)/)?.[1] || null;
      return {
        tag,
        createdAt: null,
        pullSpec: t.trim().split('\n')[0],
        source: url.split('/artifacts/')[1] || url,
      };
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
  if (/nightly-multi/.test(tag)) {
    links[0] = {
      label: 'Multi-arch release page',
      url: `https://multi.ocp.releases.ci.openshift.org/#${encodeURIComponent(tag)}`,
    };
  }
  return links;
}
