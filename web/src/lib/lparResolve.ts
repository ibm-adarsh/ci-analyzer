import {
  LEASE_BY_SLOT,
  LPAR_MAP,
  LPAR_MAP_OZ,
  leaseRecordToLpar,
  type LparInfo,
} from '../data/lpar';
import type { LeaseInfo } from './lease';

function shortHost(hostname: string): string {
  return hostname.split('.')[0] || hostname;
}

/**
 * Resolve Boskos lease slot → LPAR host details.
 * When LeaseInfo includes an observed qemu URI/hostname from step logs, that wins
 * over the static catalog (the leases secret is authoritative).
 */
export function resolveLpar(slot: string, lease?: LeaseInfo | null): LparInfo | null {
  if (!slot) return null;

  const fromMap = resolveFromMap(slot);

  if (lease?.hostname || lease?.qemuUri) {
    const host = lease.hostname || '';
    const short = host ? shortHost(host) : undefined;
    return {
      ...(fromMap || {
        lpar: short || host || 'unknown',
        sshd: '',
        zone: 'OZ',
        tcpPort: 16509,
      }),
      lpar: short || fromMap?.lpar || host || 'unknown',
      hostname: host || fromMap?.hostname,
      pool: lease.pool || fromMap?.pool,
      qemuUri: lease.qemuUri || (host ? `qemu+tcp://${host}/system` : fromMap?.qemuUri),
      observed: true,
    };
  }

  return fromMap;
}

function resolveFromMap(slot: string): LparInfo | null {
  const rec = LEASE_BY_SLOT[slot];
  if (rec) {
    const slotNumM = slot.match(/-(\d+)$/);
    return leaseRecordToLpar(rec, slotNumM ? Number(slotNumM[1]) : undefined);
  }

  // Legacy fallbacks for patterns not in the catalog
  const oz = slot.match(/^libvirt-s390x-oz-(\d+)-(\d+)$/);
  if (oz) {
    const base = LPAR_MAP_OZ[Number(oz[1])];
    if (!base) return null;
    return {
      ...base,
      slotNum: Number(oz[2]),
      qemuUri: `qemu+tcp://${base.hostname || base.lpar}/system`,
      observed: false,
    };
  }

  const std = slot.match(/^libvirt-s390x-(\d+)-(\d+)$/);
  if (std) {
    const base = LPAR_MAP[Number(std[1])];
    if (!base) return null;
    return {
      ...base,
      slotNum: Number(std[2]),
      qemuUri: `qemu+tcp://${base.hostname || base.lpar}/system`,
      observed: false,
    };
  }

  return null;
}
