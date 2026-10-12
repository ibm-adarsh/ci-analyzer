import type { ArchClass, JobMeta } from '../types';
import { RELEASE_REPO, STEPS_CI } from '../data/workflow';
import type { ConfigLinks } from '../types';

export function parseJobMeta(jobName: string): JobMeta {
  const isRehearse = /^rehearse-/.test(jobName);
  const verM = jobName.match(/nightly-([\d.]+)/);
  const ocpVersion = verM ? verM[1] : null;
  const upgradeM = jobName.match(/upgrade-from-nightly-([\d.]+)/);
  const fromVersion = upgradeM ? upgradeM[1] : null;
  const testType = fromVersion
    ? 'upgrade'
    : jobName.includes('image-ecosystem')
      ? 'image-ecosystem'
      : jobName.includes('serial')
        ? 'conformance-serial'
        : jobName.includes('agent')
          ? 'agent-based'
          : 'conformance-parallel';
  const topology = /z-za/.test(jobName)
    ? 'IBM Z heterogeneous (z-za)'
    : /z-xz/.test(jobName)
      ? 'IBM Z heterogeneous (z-xz)'
      : /z-z/.test(jobName)
        ? 'IBM Z homogeneous (z-z)'
        : /p-p/.test(jobName)
          ? 'ppc64le homogeneous (p-p)'
          : /external-ibmz/.test(jobName)
            ? 'IBM Z external platform'
            : 'unknown';
  const arch = /p-p/.test(jobName) ? 'ppc64le' : 's390x';
  let profile = 'libvirt-s390x-vpn';
  if (/ppc64le|p-p/.test(jobName)) profile = 'libvirt-ppc64le-s2s';
  else if (/z-za/.test(jobName)) profile = 'libvirt-s390x-vpn-arm64';
  else if (/z-xz|heterogeneous/.test(jobName)) profile = 'libvirt-s390x-amd64';
  else if (/libvirt-s390x-vpn-arm64|remote-libvirt.*arm64|vpn-arm64/.test(jobName))
    profile = 'libvirt-s390x-vpn-arm64';

  let workflow: string | null = null;
  if (/libvirt/.test(jobName)) {
    if (/heterogeneous|z-za|z-xz/.test(jobName)) {
      workflow = 'openshift-e2e-libvirt-upi-heterogeneous';
    } else if (/fips/.test(jobName)) {
      workflow = 'openshift-e2e-libvirt-vpn-fips';
    } else if (/external-ibmz-upi/.test(jobName)) {
      workflow = 'openshift-e2e-libvirt-upi';
    } else {
      workflow = 'openshift-e2e-libvirt-vpn';
    }
  }
  let archClass: ArchClass = 'unknown';
  if (/z-za/.test(jobName)) archClass = 'multi-arch-heterogeneous';
  else if (/z-z/.test(jobName)) archClass = 'multi-arch-homogeneous';
  else if (/remote-libvirt-s390x|(?:^|-)libvirt-s390x$/.test(jobName)) archClass = 'single-arch-s390x';
  else if (/s390x/.test(jobName)) archClass = 's390x';
  else if (/p-p|ppc64le/.test(jobName)) archClass = 'ppc64le';

  return {
    isRehearse,
    ocpVersion,
    fromVersion,
    testType,
    installer: jobName.includes('agent') ? 'agent' : 'default (UPI)',
    fips: jobName.includes('fips'),
    techPreview: jobName.includes('techpreview'),
    topology,
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
  return /z-z|z-za|s390x|libvirt-s390x/.test(jobName);
}

/** Enrich profile from ci-operator build-log when labels are missing. */
export function enrichMetaFromProwLog(meta: JobMeta, prowLog: string | null): void {
  if (!prowLog || prowLog === '__REDACTED__') return;
  const m = prowLog
    .replace(/\x1b\[[0-9;]*m/g, '')
    .match(/for cluster profile\s+(\S+)/i);
  if (m?.[1]) meta.profile = m[1];
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
  if (/z-za/.test(job)) meta.archClass = 'multi-arch-heterogeneous';
  else if (/z-z/.test(job)) meta.archClass = 'multi-arch-homogeneous';
  else if (/remote-libvirt-s390x|(?:^|-)libvirt-s390x$/.test(job)) meta.archClass = 'single-arch-s390x';
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
