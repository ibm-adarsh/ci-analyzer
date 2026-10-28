export type LparInfo = {
  lpar: string;
  /** Full hostname when known, e.g. lnxocp01.phc-cicd.cis.ibm.net */
  hostname?: string;
  sshd: string;
  zone: string;
  slotNum?: number;
  pool?: string;
  profile?: string;
  qemuUri?: string;
  tcpPort?: number;
  /** Heterogeneous additional hypervisor (x86 / arm) when applicable */
  hostnameAdditional?: string;
  vxlanBridge?: string;
  notes?: string;
  /** true when hostname came from step logs (leases secret), not the static map */
  observed?: boolean;
};

export type LeaseRecord = {
  /** Boskos lease name, e.g. libvirt-s390x-0-1 */
  slot: string;
  lpar: string;
  hostname: string;
  pool: string;
  profile: string;
  zone: 'YZ' | 'OZ';
  tcpPort?: number;
  notes?: string;
  /** Heterogeneous secondary hypervisor */
  hostnameAdditional?: string;
  vxlanBridge?: string;
  workerArch?: 'amd64' | 'arm64';
};

const DOMAIN = 'phc-cicd.cis.ibm.net';

function host(lpar: string): string {
  return `${lpar}.${DOMAIN}`;
}

/**
 * Authoritative LPAR ↔ lease index for IBM Z libvirt (phc-cicd.cis.ibm.net).
 * Prefer step-log qemu URI when present; this map is the offline fallback.
 *
 * YZ (vpn): lnxocp01/02/04 · OZ (vpn-oz): lnxocp11–14 · hetero carve-outs on lnxocp11.
 * No private IPs / subnet numbers — only hostnames and lease slots.
 */
export const LEASE_CATALOG: LeaseRecord[] = [
  // ── lnxocp01 · libvirt-s390x-0-* · YZ vpn ──
  ...([0, 1, 2, 3] as const).map((n) => ({
    slot: `libvirt-s390x-0-${n}`,
    lpar: 'lnxocp01',
    hostname: host('lnxocp01'),
    pool: 'libvirt-s390x-vpn-quota-slice',
    profile: 'libvirt-s390x-vpn',
    zone: 'YZ' as const,
    tcpPort: 16509,
  })),

  // ── lnxocp02 · libvirt-s390x-1-* ──
  ...([0, 1, 2, 3] as const).map((n) => ({
    slot: `libvirt-s390x-1-${n}`,
    lpar: 'lnxocp02',
    hostname: host('lnxocp02'),
    pool: 'libvirt-s390x-vpn-quota-slice',
    profile: 'libvirt-s390x-vpn',
    zone: 'YZ' as const,
    tcpPort: 16509,
  })),

  // ── lnxocp04 · libvirt-s390x-2-* ──
  ...([0, 1, 2, 3] as const).map((n) => ({
    slot: `libvirt-s390x-2-${n}`,
    lpar: 'lnxocp04',
    hostname: host('lnxocp04'),
    pool: 'libvirt-s390x-vpn-quota-slice',
    profile: 'libvirt-s390x-vpn',
    zone: 'YZ' as const,
    tcpPort: 16509,
  })),

  // ── lnxocp11 · OZ · oz-0-0 + hetero carve-outs ──
  {
    slot: 'libvirt-s390x-oz-0-0',
    lpar: 'lnxocp11',
    hostname: host('lnxocp11'),
    pool: 'libvirt-s390x-vpn-oz-quota-slice',
    profile: 'libvirt-s390x-vpn-oz',
    zone: 'OZ',
    tcpPort: 16509,
  },
  {
    slot: 'libvirt-s390x-vpn-amd64-0-0',
    lpar: 'lnxocp11',
    hostname: host('lnxocp11'),
    hostnameAdditional: host('xkvmocp08'),
    pool: 'libvirt-s390x-vpn-amd64-quota-slice',
    profile: 'libvirt-s390x-vpn-amd64',
    zone: 'OZ',
    tcpPort: 16509,
    vxlanBridge: 'ocp1-amd',
    workerArch: 'amd64',
    notes: 'vpn-amd64 · VXLAN ocp1-amd · workers on xkvmocp08',
  },
  {
    slot: 'libvirt-s390x-arm64-0-0',
    lpar: 'lnxocp11',
    hostname: host('lnxocp11'),
    hostnameAdditional: host('akvmocp03'),
    pool: 'libvirt-s390x-vpn-arm64-quota-slice',
    profile: 'libvirt-s390x-vpn-arm64',
    zone: 'OZ',
    tcpPort: 16509,
    vxlanBridge: 'ocp2-arm',
    workerArch: 'arm64',
    notes: 'arm64 · VXLAN ocp2-arm · workers on akvmocp03',
  },
  {
    slot: 'libvirt-s390x-vpn-amd64-0-1',
    lpar: 'lnxocp11',
    hostname: host('lnxocp11'),
    hostnameAdditional: host('xkvmocp08'),
    pool: 'libvirt-s390x-vpn-amd64-quota-slice',
    profile: 'libvirt-s390x-vpn-amd64',
    zone: 'OZ',
    tcpPort: 16509,
    vxlanBridge: 'ocp3-amd',
    workerArch: 'amd64',
    notes: 'vpn-amd64 · VXLAN ocp3-amd · workers on xkvmocp08',
  },

  // ── lnxocp12 · oz-1-* ──
  ...([0, 1, 2, 3] as const).map((n) => ({
    slot: `libvirt-s390x-oz-1-${n}`,
    lpar: 'lnxocp12',
    hostname: host('lnxocp12'),
    pool: 'libvirt-s390x-vpn-oz-quota-slice',
    profile: 'libvirt-s390x-vpn-oz',
    zone: 'OZ' as const,
    tcpPort: 16509,
  })),

  // ── lnxocp13 · oz-2-* ──
  ...([0, 1, 2, 3] as const).map((n) => ({
    slot: `libvirt-s390x-oz-2-${n}`,
    lpar: 'lnxocp13',
    hostname: host('lnxocp13'),
    pool: 'libvirt-s390x-vpn-oz-quota-slice',
    profile: 'libvirt-s390x-vpn-oz',
    zone: 'OZ' as const,
    tcpPort: 16509,
  })),

  // ── lnxocp14 · oz-3-* (also used by vpn-hcp pool in boskos) ──
  ...([0, 1, 2, 3] as const).map((n) => ({
    slot: `libvirt-s390x-oz-3-${n}`,
    lpar: 'lnxocp14',
    hostname: host('lnxocp14'),
    pool: 'libvirt-s390x-vpn-oz-quota-slice',
    profile: 'libvirt-s390x-vpn-oz',
    zone: 'OZ' as const,
    tcpPort: 16509,
  })),
];

export const LEASE_BY_SLOT: Record<string, LeaseRecord> = Object.fromEntries(
  LEASE_CATALOG.map((r) => [r.slot, r]),
);

/** @deprecated Prefer LEASE_BY_SLOT — kept for older call sites */
export const LPAR_MAP: Record<number, Omit<LparInfo, 'qemuUri' | 'slotNum' | 'observed'>> = {
  0: {
    lpar: 'lnxocp01',
    hostname: host('lnxocp01'),
    sshd: 'sshd-0',
    zone: 'YZ',
    profile: 'libvirt-s390x-vpn',
    pool: 'libvirt-s390x-vpn-quota-slice',
    tcpPort: 16509,
  },
  1: {
    lpar: 'lnxocp02',
    hostname: host('lnxocp02'),
    sshd: 'sshd-1',
    zone: 'YZ',
    profile: 'libvirt-s390x-vpn',
    pool: 'libvirt-s390x-vpn-quota-slice',
    tcpPort: 16509,
  },
  2: {
    lpar: 'lnxocp04',
    hostname: host('lnxocp04'),
    sshd: 'sshd-2',
    zone: 'YZ',
    profile: 'libvirt-s390x-vpn',
    pool: 'libvirt-s390x-vpn-quota-slice',
    tcpPort: 16509,
  },
};

/** @deprecated Prefer LEASE_BY_SLOT */
export const LPAR_MAP_OZ: Record<number, Omit<LparInfo, 'qemuUri' | 'slotNum' | 'observed'>> = {
  0: {
    lpar: 'lnxocp11',
    hostname: host('lnxocp11'),
    sshd: 'sshd-11',
    zone: 'OZ',
    profile: 'libvirt-s390x-vpn-oz',
    pool: 'libvirt-s390x-vpn-oz-quota-slice',
    tcpPort: 16509,
  },
  1: {
    lpar: 'lnxocp12',
    hostname: host('lnxocp12'),
    sshd: 'sshd-12',
    zone: 'OZ',
    profile: 'libvirt-s390x-vpn-oz',
    pool: 'libvirt-s390x-vpn-oz-quota-slice',
    tcpPort: 16509,
  },
  2: {
    lpar: 'lnxocp13',
    hostname: host('lnxocp13'),
    sshd: 'sshd-13',
    zone: 'OZ',
    profile: 'libvirt-s390x-vpn-oz',
    pool: 'libvirt-s390x-vpn-oz-quota-slice',
    tcpPort: 16509,
  },
  3: {
    lpar: 'lnxocp14',
    hostname: host('lnxocp14'),
    sshd: 'sshd-14',
    zone: 'OZ',
    profile: 'libvirt-s390x-vpn-oz',
    pool: 'libvirt-s390x-vpn-oz-quota-slice',
    tcpPort: 16509,
  },
};

export function leaseRecordToLpar(rec: LeaseRecord, slotNum?: number): LparInfo {
  return {
    lpar: rec.lpar,
    hostname: rec.hostname,
    sshd: '',
    zone: rec.zone,
    slotNum,
    pool: rec.pool,
    profile: rec.profile,
    tcpPort: rec.tcpPort || 16509,
    qemuUri: `qemu+tcp://${rec.hostname}/system`,
    hostnameAdditional: rec.hostnameAdditional,
    vxlanBridge: rec.vxlanBridge,
    notes: rec.notes,
    observed: false,
  };
}
