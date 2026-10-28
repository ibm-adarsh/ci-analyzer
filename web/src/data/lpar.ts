export type LparInfo = {
  lpar: string;
  /** Short hostname only (no internal DNS domain). */
  hostname?: string;
  sshd: string;
  zone: string;
  slotNum?: number;
  pool?: string;
  profile?: string;
  qemuUri?: string;
  /** Heterogeneous additional hypervisor short name when applicable */
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
  /** Short hostname — never store internal FQDNs in-repo */
  hostname: string;
  pool: string;
  profile: string;
  zone: 'YZ' | 'OZ';
  notes?: string;
  /** Heterogeneous secondary hypervisor (short name) */
  hostnameAdditional?: string;
  vxlanBridge?: string;
  workerArch?: 'amd64' | 'arm64';
};

/**
 * Authoritative LPAR ↔ lease index for IBM Z libvirt CI.
 * Prefer step-log qemu URI when present; this map is the offline fallback.
 * Hostnames are short labels only (no private IPs, subnets, or internal DNS domains).
 *
 * YZ (vpn): lnxocp01/02/04 · OZ (vpn-oz): lnxocp11–14 · hetero carve-outs on lnxocp11.
 */
export const LEASE_CATALOG: LeaseRecord[] = [
  // ── lnxocp01 · libvirt-s390x-0-* · YZ vpn ──
  ...([0, 1, 2, 3] as const).map((n) => ({
    slot: `libvirt-s390x-0-${n}`,
    lpar: 'lnxocp01',
    hostname: 'lnxocp01',
    pool: 'libvirt-s390x-vpn-quota-slice',
    profile: 'libvirt-s390x-vpn',
    zone: 'YZ' as const,
  })),

  // ── lnxocp02 · libvirt-s390x-1-* ──
  ...([0, 1, 2, 3] as const).map((n) => ({
    slot: `libvirt-s390x-1-${n}`,
    lpar: 'lnxocp02',
    hostname: 'lnxocp02',
    pool: 'libvirt-s390x-vpn-quota-slice',
    profile: 'libvirt-s390x-vpn',
    zone: 'YZ' as const,
  })),

  // ── lnxocp04 · libvirt-s390x-2-* ──
  ...([0, 1, 2, 3] as const).map((n) => ({
    slot: `libvirt-s390x-2-${n}`,
    lpar: 'lnxocp04',
    hostname: 'lnxocp04',
    pool: 'libvirt-s390x-vpn-quota-slice',
    profile: 'libvirt-s390x-vpn',
    zone: 'YZ' as const,
  })),

  // ── lnxocp11 · OZ · oz-0-0 + hetero carve-outs ──
  {
    slot: 'libvirt-s390x-oz-0-0',
    lpar: 'lnxocp11',
    hostname: 'lnxocp11',
    pool: 'libvirt-s390x-vpn-oz-quota-slice',
    profile: 'libvirt-s390x-vpn-oz',
    zone: 'OZ',
  },
  {
    slot: 'libvirt-s390x-vpn-amd64-0-0',
    lpar: 'lnxocp11',
    hostname: 'lnxocp11',
    hostnameAdditional: 'xkvmocp08',
    pool: 'libvirt-s390x-vpn-amd64-quota-slice',
    profile: 'libvirt-s390x-vpn-amd64',
    zone: 'OZ',
    vxlanBridge: 'ocp1-amd',
    workerArch: 'amd64',
    notes: 'vpn-amd64 · VXLAN ocp1-amd · amd64 workers',
  },
  {
    slot: 'libvirt-s390x-arm64-0-0',
    lpar: 'lnxocp11',
    hostname: 'lnxocp11',
    hostnameAdditional: 'akvmocp03',
    pool: 'libvirt-s390x-vpn-arm64-quota-slice',
    profile: 'libvirt-s390x-vpn-arm64',
    zone: 'OZ',
    vxlanBridge: 'ocp2-arm',
    workerArch: 'arm64',
    notes: 'arm64 · VXLAN ocp2-arm · arm64 workers',
  },
  {
    slot: 'libvirt-s390x-vpn-amd64-0-1',
    lpar: 'lnxocp11',
    hostname: 'lnxocp11',
    hostnameAdditional: 'xkvmocp08',
    pool: 'libvirt-s390x-vpn-amd64-quota-slice',
    profile: 'libvirt-s390x-vpn-amd64',
    zone: 'OZ',
    vxlanBridge: 'ocp3-amd',
    workerArch: 'amd64',
    notes: 'vpn-amd64 · VXLAN ocp3-amd · amd64 workers',
  },

  // ── lnxocp12 · oz-1-* ──
  ...([0, 1, 2, 3] as const).map((n) => ({
    slot: `libvirt-s390x-oz-1-${n}`,
    lpar: 'lnxocp12',
    hostname: 'lnxocp12',
    pool: 'libvirt-s390x-vpn-oz-quota-slice',
    profile: 'libvirt-s390x-vpn-oz',
    zone: 'OZ' as const,
  })),

  // ── lnxocp13 · oz-2-* ──
  ...([0, 1, 2, 3] as const).map((n) => ({
    slot: `libvirt-s390x-oz-2-${n}`,
    lpar: 'lnxocp13',
    hostname: 'lnxocp13',
    pool: 'libvirt-s390x-vpn-oz-quota-slice',
    profile: 'libvirt-s390x-vpn-oz',
    zone: 'OZ' as const,
  })),

  // ── lnxocp14 · oz-3-* ──
  ...([0, 1, 2, 3] as const).map((n) => ({
    slot: `libvirt-s390x-oz-3-${n}`,
    lpar: 'lnxocp14',
    hostname: 'lnxocp14',
    pool: 'libvirt-s390x-vpn-oz-quota-slice',
    profile: 'libvirt-s390x-vpn-oz',
    zone: 'OZ' as const,
  })),
];

export const LEASE_BY_SLOT: Record<string, LeaseRecord> = Object.fromEntries(
  LEASE_CATALOG.map((r) => [r.slot, r]),
);

/** @deprecated Prefer LEASE_BY_SLOT — kept for older call sites */
export const LPAR_MAP: Record<number, Omit<LparInfo, 'qemuUri' | 'slotNum' | 'observed'>> = {
  0: {
    lpar: 'lnxocp01',
    hostname: 'lnxocp01',
    sshd: 'sshd-0',
    zone: 'YZ',
    profile: 'libvirt-s390x-vpn',
    pool: 'libvirt-s390x-vpn-quota-slice',
  },
  1: {
    lpar: 'lnxocp02',
    hostname: 'lnxocp02',
    sshd: 'sshd-1',
    zone: 'YZ',
    profile: 'libvirt-s390x-vpn',
    pool: 'libvirt-s390x-vpn-quota-slice',
  },
  2: {
    lpar: 'lnxocp04',
    hostname: 'lnxocp04',
    sshd: 'sshd-2',
    zone: 'YZ',
    profile: 'libvirt-s390x-vpn',
    pool: 'libvirt-s390x-vpn-quota-slice',
  },
};

/** @deprecated Prefer LEASE_BY_SLOT */
export const LPAR_MAP_OZ: Record<number, Omit<LparInfo, 'qemuUri' | 'slotNum' | 'observed'>> = {
  0: {
    lpar: 'lnxocp11',
    hostname: 'lnxocp11',
    sshd: 'sshd-11',
    zone: 'OZ',
    profile: 'libvirt-s390x-vpn-oz',
    pool: 'libvirt-s390x-vpn-oz-quota-slice',
  },
  1: {
    lpar: 'lnxocp12',
    hostname: 'lnxocp12',
    sshd: 'sshd-12',
    zone: 'OZ',
    profile: 'libvirt-s390x-vpn-oz',
    pool: 'libvirt-s390x-vpn-oz-quota-slice',
  },
  2: {
    lpar: 'lnxocp13',
    hostname: 'lnxocp13',
    sshd: 'sshd-13',
    zone: 'OZ',
    profile: 'libvirt-s390x-vpn-oz',
    pool: 'libvirt-s390x-vpn-oz-quota-slice',
  },
  3: {
    lpar: 'lnxocp14',
    hostname: 'lnxocp14',
    sshd: 'sshd-14',
    zone: 'OZ',
    profile: 'libvirt-s390x-vpn-oz',
    pool: 'libvirt-s390x-vpn-oz-quota-slice',
  },
};

/** Strip internal DNS suffixes — keep the short host label only. */
export function shortHostname(host: string | null | undefined): string | null {
  if (!host) return null;
  const bare = host.trim().replace(/^qemu\+tcp:\/\//i, '').split('/')[0]?.split(':')[0];
  if (!bare) return null;
  return bare.split('.')[0] || bare;
}

export function leaseRecordToLpar(rec: LeaseRecord, slotNum?: number): LparInfo {
  const host = shortHostname(rec.hostname) || rec.lpar;
  return {
    lpar: rec.lpar,
    hostname: host,
    sshd: '',
    zone: rec.zone,
    slotNum,
    pool: rec.pool,
    profile: rec.profile,
    qemuUri: `qemu+tcp://${host}/system`,
    hostnameAdditional: shortHostname(rec.hostnameAdditional) || undefined,
    vxlanBridge: rec.vxlanBridge,
    notes: rec.notes,
    observed: false,
  };
}
