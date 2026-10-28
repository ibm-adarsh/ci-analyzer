import {
  LEASE_BY_SLOT,
  LPAR_MAP,
  LPAR_MAP_OZ,
  leaseRecordToLpar,
  shortHostname,
  type LparInfo,
} from '../data/lpar';
import type { LeaseInfo } from './lease';

function redactQemuUri(uri: string | null | undefined): string | null {
  if (!uri) return null;
  return uri.replace(
    /^(qemu\+tcp:\/\/)([^/:]+)(.*)$/i,
    (_m, scheme: string, host: string, rest: string) =>
      `${scheme}${shortHostname(host) || host}${rest || '/system'}`,
  );
}

/**
 * Resolve Boskos lease slot → LPAR host details.
 * Observed step-log hostnames win over the static catalog, but FQDNs are
 * shortened so internal DNS domains never linger in the UI.
 */
export function resolveLpar(slot: string, lease?: LeaseInfo | null): LparInfo | null {
  if (!slot) return null;

  const fromMap = resolveFromMap(slot);

  if (lease?.hostname || lease?.qemuUri) {
    const rawHost = lease.hostname || '';
    const short = shortHostname(rawHost) || shortHostname(lease.qemuUri) || undefined;
    return {
      ...(fromMap || {
        lpar: short || 'unknown',
        sshd: '',
        zone: 'OZ',
      }),
      lpar: short || fromMap?.lpar || 'unknown',
      hostname: short || fromMap?.hostname,
      pool: lease.pool || fromMap?.pool,
      qemuUri:
        redactQemuUri(lease.qemuUri) ||
        (short ? `qemu+tcp://${short}/system` : fromMap?.qemuUri),
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

  const oz = slot.match(/^libvirt-s390x-oz-(\d+)-(\d+)$/);
  if (oz) {
    const base = LPAR_MAP_OZ[Number(oz[1])];
    if (!base) return null;
    const host = shortHostname(base.hostname) || base.lpar;
    return {
      ...base,
      hostname: host,
      slotNum: Number(oz[2]),
      qemuUri: `qemu+tcp://${host}/system`,
      observed: false,
    };
  }

  const std = slot.match(/^libvirt-s390x-(\d+)-(\d+)$/);
  if (std) {
    const base = LPAR_MAP[Number(std[1])];
    if (!base) return null;
    const host = shortHostname(base.hostname) || base.lpar;
    return {
      ...base,
      hostname: host,
      slotNum: Number(std[2]),
      qemuUri: `qemu+tcp://${host}/system`,
      observed: false,
    };
  }

  return null;
}
