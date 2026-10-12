export type LparInfo = {
  lpar: string;
  sshd: string;
  zone: string;
  slotNum?: number;
  pool?: string;
  profile?: string;
  qemuUri?: string;
  tcpPort?: number;
  /** true when hostname came from step logs (leases secret), not the static map */
  observed?: boolean;
};

/**
 * Fallback LPAR index → short hostname for libvirt-s390x-vpn.
 * Authoritative mapping is ${CLUSTER_PROFILE_DIR}/leases (printed in step logs as
 * "Using libvirt connection for qemu+tcp://…"). Keep this map aligned with observed
 * jobs; prefer parseLibvirtConnectionFromSteps when available.
 *
 * Verified (2026-10):
 *   libvirt-s390x-0-* → lnxocp01
 *   libvirt-s390x-2-* → lnxocp04  (was incorrectly documented as lnxocp06)
 */
export const LPAR_MAP: Record<number, Omit<LparInfo, 'qemuUri' | 'slotNum' | 'observed'>> = {
  0: {
    lpar: 'lnxocp01',
    sshd: 'sshd-0',
    zone: 'OZ',
    profile: 'libvirt-s390x-vpn',
    pool: 'libvirt-s390x-vpn-quota-slice',
    tcpPort: 16509,
  },
  1: {
    lpar: 'lnxocp02',
    sshd: 'sshd-1',
    zone: 'OZ',
    profile: 'libvirt-s390x-vpn',
    pool: 'libvirt-s390x-vpn-quota-slice',
    tcpPort: 16509,
  },
  2: {
    lpar: 'lnxocp04',
    sshd: 'sshd-2',
    zone: 'OZ',
    profile: 'libvirt-s390x-vpn',
    pool: 'libvirt-s390x-vpn-quota-slice',
    tcpPort: 16509,
  },
};

export const LPAR_MAP_OZ: Record<number, Omit<LparInfo, 'qemuUri' | 'slotNum' | 'observed'>> = {
  0: {
    lpar: 'lnxocp11',
    sshd: 'sshd-11',
    zone: 'OZ',
    profile: 'libvirt-s390x-vpn-oz',
    pool: 'libvirt-s390x-vpn-oz-quota-slice',
    tcpPort: 16509,
  },
  1: {
    lpar: 'lnxocp12',
    sshd: 'sshd-12',
    zone: 'OZ',
    profile: 'libvirt-s390x-vpn-oz',
    pool: 'libvirt-s390x-vpn-oz-quota-slice',
    tcpPort: 16509,
  },
  2: {
    lpar: 'lnxocp13',
    sshd: 'sshd-13',
    zone: 'OZ',
    profile: 'libvirt-s390x-vpn-oz',
    pool: 'libvirt-s390x-vpn-oz-quota-slice',
    tcpPort: 16509,
  },
  3: {
    lpar: 'lnxocp14',
    sshd: 'sshd-14',
    zone: 'OZ',
    profile: 'libvirt-s390x-vpn-oz',
    pool: 'libvirt-s390x-vpn-oz-quota-slice',
    tcpPort: 16509,
  },
};
