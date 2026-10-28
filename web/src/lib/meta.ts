import type { ArchClass, JobMeta } from '../types';
import { RELEASE_REPO, STEPS_CI } from '../data/workflow';
import { inferWorkflowName } from '../data/vpnWorkflow';
import type { ConfigLinks } from '../types';

export function parseJobMeta(jobName: string): JobMeta {
  const isRehearse = /^rehearse-/.test(jobName);
  const verM = jobName.match(/nightly-([\d.]+)/);
  const ocpVersion = verM ? verM[1] : null;
  const upgradeM = jobName.match(/upgrade-from-nightly-([\d.]+)/);
  const fromVersion = upgradeM ? upgradeM[1] : null;

  const agent = /\bagent\b/.test(jobName);
  const fips = /\bfips\b/.test(jobName);
  const techPreview = /techpreview/i.test(jobName);

  let testType = 'conformance-parallel';
  let suiteLabel = 'Conformance parallel';
  if (fromVersion) {
    testType = 'upgrade';
    suiteLabel = 'Upgrade';
  } else if (/image-ecosystem/.test(jobName)) {
    testType = 'image-ecosystem';
    suiteLabel = 'Image ecosystem';
  } else if (/serial/.test(jobName)) {
    testType = 'conformance-serial';
    suiteLabel = 'Conformance serial';
  }

  let topologyKind: JobMeta['topologyKind'] = 'unknown';
  let topology = 'unknown';
  let topologyShort = 'Unknown';
  let workerArch: string | null = null;
  let arch = /p-p|ppc64le/.test(jobName) ? 'ppc64le' : 's390x';

  if (/z-za/.test(jobName)) {
    topologyKind = 'heterogeneous';
    topology = 'IBM Z heterogeneous (z-za) — s390x CP + arm64 workers';
    topologyShort = 'Heterogeneous (z-za)';
    workerArch = 'arm64';
  } else if (/z-xz/.test(jobName)) {
    topologyKind = 'heterogeneous';
    topology = 'IBM Z heterogeneous (z-xz) — s390x CP + amd64 workers';
    topologyShort = 'Heterogeneous (z-xz)';
    workerArch = 'amd64';
  } else if (/z-z/.test(jobName)) {
    topologyKind = 'homogeneous';
    topology = 'IBM Z homogeneous (z-z)';
    topologyShort = 'Homogeneous (z-z)';
  } else if (/p-p/.test(jobName)) {
    topologyKind = 'homogeneous';
    topology = 'ppc64le homogeneous (p-p)';
    topologyShort = 'Homogeneous (p-p)';
    arch = 'ppc64le';
  } else if (/external-ibmz/.test(jobName)) {
    topologyKind = 'homogeneous';
    topology = 'IBM Z external platform';
    topologyShort = 'External (ibmz)';
  } else if (/remote-libvirt-s390x|(?:^|-)libvirt-s390x(?:-|$)/.test(jobName)) {
    topologyKind = 'single-arch';
    topology = 'IBM Z single-arch (s390x payload)';
    topologyShort = 'Single-arch s390x';
  }

  const isLibvirt = /libvirt/.test(jobName);
  let profile = isLibvirt ? 'libvirt-s390x-vpn' : '';
  if (isLibvirt) {
    if (/ppc64le|p-p/.test(jobName)) profile = 'libvirt-ppc64le-s2s';
    else if (/z-za/.test(jobName)) profile = 'libvirt-s390x-vpn-arm64';
    else if (/z-xz/.test(jobName) && /nightly-5\.0/.test(jobName))
      profile = 'libvirt-s390x-vpn-amd64';
    else if (/z-xz|heterogeneous/.test(jobName)) profile = 'libvirt-s390x-amd64';
    else if (/libvirt-s390x-vpn-arm64|remote-libvirt.*arm64|vpn-arm64/.test(jobName))
      profile = 'libvirt-s390x-vpn-arm64';
  }

  const workflow = isLibvirt ? inferWorkflowName(jobName, profile) : null;

  let archClass: ArchClass = 'unknown';
  if (/z-za|z-xz/.test(jobName)) archClass = 'multi-arch-heterogeneous';
  else if (/z-z/.test(jobName)) archClass = 'multi-arch-homogeneous';
  else if (/remote-libvirt-s390x|(?:^|-)libvirt-s390x$/.test(jobName))
    archClass = 'single-arch-s390x';
  else if (/s390x/.test(jobName)) archClass = 's390x';
  else if (/p-p|ppc64le/.test(jobName)) archClass = 'ppc64le';

  const installerKind: JobMeta['installerKind'] = agent
    ? 'agent'
    : /upi|libvirt|external-ibmz/.test(jobName)
      ? 'upi'
      : 'unknown';
  const installer = agent ? 'agent' : 'UPI';
  const installerLabel = agent ? 'Agent-based' : 'Classical UPI';

  return {
    isRehearse,
    ocpVersion,
    fromVersion,
    testType,
    suiteLabel,
    installer,
    installerKind,
    installerLabel,
    fips,
    techPreview,
    topology,
    topologyKind,
    topologyShort,
    workerArch,
    arch,
    profile,
    workflow,
    archClass,
  };
}

export function classifyArch(jobName: string): ArchClass {
  return parseJobMeta(jobName).archClass;
}

export function isIbmZJob(jobName: string): boolean {
  return /z-z|z-za|z-xz|s390x|libvirt-s390x/.test(jobName);
}

/** Enrich profile from ci-operator build-log when labels are missing. */
export function enrichMetaFromProwLog(
  meta: JobMeta,
  prowLog: string | null,
  jobName?: string,
): void {
  if (!prowLog || prowLog === '__REDACTED__') return;
  const m = prowLog
    .replace(/\x1b\[[0-9;]*m/g, '')
    .match(/for cluster profile\s+(\S+)/i);
  if (m?.[1]) {
    meta.profile = m[1];
    const signal =
      jobName ||
      [
        meta.topologyShort?.includes('z-za') ? 'z-za' : '',
        meta.topologyShort?.includes('z-xz') ? 'z-xz' : '',
        meta.fips ? 'fips' : '',
        meta.installerKind === 'agent' ? 'agent' : '',
        'libvirt',
        meta.ocpVersion ? `nightly-${meta.ocpVersion}` : '',
      ].join('-');
    meta.workflow = inferWorkflowName(signal, meta.profile);
  }
}

/** Enrich meta from prowjob.json labels — facts only (highest priority). */
export function enrichMetaFromProwjob(meta: JobMeta, prowjob: Record<string, unknown> | null): void {
  if (!prowjob) return;
  const metadata = prowjob.metadata as { labels?: Record<string, string> } | undefined;
  const labels = metadata?.labels || {};
  if (labels['ci-operator.openshift.io/cloud-cluster-profile']) {
    meta.profile = labels['ci-operator.openshift.io/cloud-cluster-profile'];
  }
  if (labels['ci-operator.openshift.io/variant']) {
    meta.variant = labels['ci-operator.openshift.io/variant'];
  }
  if (labels['job-release']) meta.jobRelease = labels['job-release'];
  if (labels['prow.k8s.io/type']) meta.prowType = labels['prow.k8s.io/type'];
  if (labels['prow.k8s.io/refs.org']) meta.refsOrg = labels['prow.k8s.io/refs.org'];
  if (labels['prow.k8s.io/refs.repo']) meta.refsRepo = labels['prow.k8s.io/refs.repo'];
  if (labels['prow.k8s.io/refs.base_ref']) meta.refsBranch = labels['prow.k8s.io/refs.base_ref'];

  const spec = prowjob.spec as {
    job?: string;
    refs?: { org?: string; repo?: string; base_ref?: string };
    extra_refs?: { org?: string; repo?: string; base_ref?: string }[];
  } | undefined;
  const refs = spec?.extra_refs?.[0] || spec?.refs;
  if (refs?.org) meta.refsOrg = meta.refsOrg || refs.org;
  if (refs?.repo) meta.refsRepo = meta.refsRepo || refs.repo;
  if (refs?.base_ref) meta.refsBranch = meta.refsBranch || refs.base_ref;

  const job = spec?.job || '';
  if (/z-za|z-xz/.test(job)) meta.archClass = 'multi-arch-heterogeneous';
  else if (/z-z/.test(job)) meta.archClass = 'multi-arch-homogeneous';
  else if (/remote-libvirt-s390x|(?:^|-)libvirt-s390x$/.test(job))
    meta.archClass = 'single-arch-s390x';

  // Recompute workflow once profile is authoritative.
  if (job || meta.profile) {
    meta.workflow = inferWorkflowName(job || `libvirt-${meta.profile}`, meta.profile);
  }
}

export function buildConfigLinks(jobName: string, meta: JobMeta): ConfigLinks {
  const org = meta.refsOrg || 'openshift';
  const repo = meta.refsRepo || 'multiarch';
  const branch = meta.refsBranch || 'main';
  const variant = meta.variant || null;
  const links: ConfigLinks['links'] = [];

  links.push({
    label: 'Prow deck · *z-z',
    url: 'https://prow.ci.openshift.org/?job=*z-z',
    group: 'discovery',
  });
  links.push({
    label: 'Prow deck · *s390x',
    url: 'https://prow.ci.openshift.org/?job=*s390x',
    group: 'discovery',
  });
  links.push({
    label: 'openshift/release',
    url: RELEASE_REPO,
    group: 'config',
  });

  if (meta.workflow) {
    links.push({
      label: `Workflow: ${meta.workflow}`,
      url: `${STEPS_CI}/workflow/${meta.workflow}`,
      group: 'config',
    });
  } else {
    links.push({
      label: 'Workflow unresolved — step registry',
      url: STEPS_CI + '/',
      group: 'config',
      unresolved: true,
    });
  }

  links.push({
    label: 'Step registry (GitHub)',
    url: `${RELEASE_REPO}/tree/master/ci-operator/step-registry`,
    group: 'config',
  });

  if (variant) {
    const cfgFile = `${org}-${repo}-${branch}__${variant}.yaml`;
    links.push({
      label: `ci-operator config (${variant})`,
      url: `${RELEASE_REPO}/blob/master/ci-operator/config/${org}/${repo}/${cfgFile}`,
      group: 'config',
    });
    links.push({
      label: 'ci-operator jobs (periodics)',
      url: `${RELEASE_REPO}/blob/master/ci-operator/jobs/${org}/${repo}/${org}-${repo}-${branch}-periodics.yaml`,
      group: 'config',
    });
  } else {
    links.push({
      label: 'ci-operator config (unresolved)',
      url: `${RELEASE_REPO}/tree/master/ci-operator/config/${org}/${repo}`,
      group: 'config',
      unresolved: true,
    });
  }

  const cleanJob = jobName.replace(/^rehearse-\d+-/, '');
  links.push({
    label: 'Prow job history',
    url: `https://prow.ci.openshift.org/job-history/gs/test-platform-results-public/logs/${encodeURIComponent(cleanJob)}`,
    group: 'execution',
  });

  return {
    org,
    repo,
    branch,
    variant,
    workflow: meta.workflow,
    profile: meta.profile,
    archClass: meta.archClass,
    prowType: meta.prowType || null,
    links,
  };
}
