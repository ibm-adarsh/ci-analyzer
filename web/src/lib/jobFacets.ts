import type { JobMeta } from '../types';

export type FacetTone = 'default' | 'accent' | 'warn' | 'ok' | 'muted';

/** Compact pill shown in the job hero — one fact per chip. */
export interface JobFacet {
  id: string;
  label: string;
  value: string;
  tone?: FacetTone;
}

/**
 * Derive a clean, scannable facet list from JobMeta.
 * Order: topology → suite → installer → hardening → arch → profile.
 */
export function buildJobFacets(meta: JobMeta): JobFacet[] {
  const facets: JobFacet[] = [];

  if (meta.ocpVersion) {
    facets.push({
      id: 'ocp',
      label: 'OCP',
      value: meta.fromVersion ? `${meta.ocpVersion} ← ${meta.fromVersion}` : meta.ocpVersion,
      tone: 'accent',
    });
  }

  facets.push({
    id: 'topology',
    label: 'Topology',
    value: meta.topologyShort || meta.topology || '—',
    tone:
      meta.topologyKind === 'heterogeneous'
        ? 'warn'
        : meta.topologyKind === 'homogeneous'
          ? 'ok'
          : 'default',
  });

  if (meta.workerArch) {
    facets.push({
      id: 'workers',
      label: 'Workers',
      value: meta.workerArch,
      tone: 'warn',
    });
  }

  facets.push({
    id: 'suite',
    label: 'Suite',
    value: meta.suiteLabel || meta.testType,
  });

  facets.push({
    id: 'installer',
    label: 'Installer',
    value: meta.installerLabel || meta.installer,
    tone: meta.installerKind === 'agent' ? 'accent' : 'default',
  });

  if (meta.fips) {
    facets.push({ id: 'fips', label: 'Hardening', value: 'FIPS', tone: 'warn' });
  }
  if (meta.techPreview) {
    facets.push({
      id: 'tp',
      label: 'Feature set',
      value: 'TechPreview',
      tone: 'warn',
    });
  }

  if (meta.arch && meta.arch !== 'unknown') {
    facets.push({
      id: 'arch',
      label: 'Control plane',
      value: meta.arch,
      tone: 'muted',
    });
  }

  if (meta.profile) {
    facets.push({
      id: 'profile',
      label: 'Profile',
      value: meta.profile,
      tone: 'muted',
    });
  }

  if (meta.workflow) {
    facets.push({
      id: 'workflow',
      label: 'Workflow',
      // Full steps.ci name — short "vpn" looked wrong next to Profile libvirt-*-vpn.
      value: meta.workflow,
      tone: 'muted',
    });
  }

  return facets;
}
