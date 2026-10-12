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

type ImageStreamJson = {
  metadata?: { name?: string; creationTimestamp?: string };
  status?: {
    publicDockerImageRepository?: string;
    tags?: { tag?: string; items?: { dockerImageReference?: string }[] }[];
  };
  spec?: { tags?: { name?: string; from?: { name?: string } }[] };
};

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

function imageStreamSummary(js: ImageStreamJson, source: string): ReleaseInfo {
  const tag = js.metadata?.name || null;
  const testsTag =
    js.spec?.tags?.find((t) => t.name === 'tests')?.from?.name ||
    js.status?.tags?.find((t) => t.tag === 'tests')?.items?.[0]?.dockerImageReference ||
    null;
  return {
    tag,
    createdAt: js.metadata?.creationTimestamp || null,
    pullSpec: testsTag,
    installTarget:
      js.spec?.tags?.find((t) => t.name === 'machine-os-images' || t.name === 'installer')?.from
        ?.name || null,
    source,
  };
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
    // Upgrade-from payloads: release:initial, or arch-scoped *-initial
    // (older s390x upgrade jobs use release:s390x-initial). Never treat
    // release:s390x-latest as the upgrade-from tag.
    const initialImported =
      imported.find((m) => m[3] === 'initial') ||
      imported.find((m) => m[3] === 's390x-initial') ||
      imported.find((m) => m[3] === 'multi-initial');
    if (initialImported) initialTag = initialImported[1];

    const latest =
      imported.find((m) => m[3] === 'latest') ||
      imported.find((m) => m[3] === 's390x-latest') ||
      imported[imported.length - 1];
    tag = latest[1];
    createdAt = latest[2]?.trim() || null;
  } else if (importing) {
    tag = importing[1];
    createdAt = importing[2]?.replace(/\s+with\s+\d+\s+images.*$/i, '').trim() || null;
  }

  // Do not infer initialTag from "Resolved release initial" alone — ci-operator
  // resolves those streams on non-upgrade jobs too. Only Imported … to tag
  // release:initial / s390x-initial / multi-initial means an upgrade-from payload.

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

async function readImageStream(url: string): Promise<ReleaseInfo | null> {
  const js = await fetchJson<ImageStreamJson>(url);
  if (!js?.metadata?.name) return null;
  const short = url.includes('release-images-')
    ? `artifacts/release/artifacts/${url.split('/').pop()}`
    : 'artifacts/release ImageStream';
  return imageStreamSummary(js, short);
}

/**
 * Fallback when root build-log is missing/redacted:
 * read ImageStream JSON written under artifacts/release/.
 * Also recovers upgrade-from tags from release-images-*-initial.
 */
export async function fetchReleaseFromArtifacts(
  base: string,
): Promise<ReleaseInfo | null> {
  const art = `${base}/artifacts/release/artifacts`;
  const latestUrls = [
    `${art}/release-images-latest`,
    `${art}/release-images-s390x-latest`,
    `${art}/release-images-multi-latest`,
  ];
  const initialUrls = [
    `${art}/release-images-initial`,
    `${art}/release-images-s390x-initial`,
    `${art}/release-images-multi-initial`,
  ];

  let latest: ReleaseInfo | null = null;
  for (const url of latestUrls) {
    latest = await readImageStream(url);
    if (latest?.tag) break;
  }

  let initialTag: string | null = null;
  for (const url of initialUrls) {
    const init = await readImageStream(url);
    if (init?.tag) {
      initialTag = init.tag;
      break;
    }
  }

  if (latest?.tag) {
    return {
      ...latest,
      initialTag,
      source: initialTag ? `${latest.source} (+ initial ImageStream)` : latest.source,
    };
  }

  // Only an initial stream (unusual) — still surface it as the build tag.
  if (initialTag) {
    for (const url of initialUrls) {
      const init = await readImageStream(url);
      if (init?.tag) {
        return { ...init, initialTag: null, source: init.source };
      }
    }
  }

  const textCandidates = [
    `${art}/release-images-latest-pull-spec`,
    `${art}/release.txt`,
  ];
  for (const url of textCandidates) {
    const t = await fetchText(url);
    if (t && t !== '__REDACTED__' && t.length < 2000) {
      const tag = t.match(/(\d+\.\d+\.\d+-0\.nightly[^\s"]+)/)?.[1] || null;
      return {
        tag,
        createdAt: null,
        pullSpec: t.trim().split('\n')[0],
        initialTag,
        source: url.split('/artifacts/')[1] || url,
      };
    }
  }
  return null;
}

/** Merge log-parsed release with artifact ImageStreams (fills gaps either way). */
export function mergeReleaseInfo(
  fromLog: ReleaseInfo | null,
  fromArts: ReleaseInfo | null,
): ReleaseInfo | null {
  if (!fromLog && !fromArts) return null;
  if (!fromLog) return fromArts;
  if (!fromArts) return fromLog;
  return {
    tag: fromLog.tag || fromArts.tag,
    createdAt: fromLog.createdAt || fromArts.createdAt,
    pullSpec: fromLog.pullSpec || fromArts.pullSpec,
    installTarget: fromLog.installTarget || fromArts.installTarget,
    initialTag: fromLog.initialTag || fromArts.initialTag || null,
    source:
      fromLog.tag && fromArts.initialTag && !fromLog.initialTag
        ? `${fromLog.source} + ${fromArts.source}`
        : fromLog.tag
          ? fromLog.source
          : fromArts.source,
  };
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
