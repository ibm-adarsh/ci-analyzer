import { LPAR_MAP, LPAR_MAP_OZ, type LparInfo } from '../data/lpar';
import type { LeaseInfo } from './lease';

function shortHost(hostname: string): string {
  return hostname.split('.')[0] || hostname;
}

/**
 * Resolve Boskos lease slot → LPAR host details.
 * When LeaseInfo includes an observed qemu URI/hostname from step logs, that wins
 * over the static index map (the leases secret is authoritative).
 */
export function resolveLpar(slot: string, lease?: LeaseInfo | null): LparInfo | null {
  if (!slot) return null;

  if (lease?.hostname || lease?.qemuUri) {
    const host = lease.hostname || '';
    const short = host ? shortHost(host) : undefined;
    const fromMap = resolveFromMap(slot);
    return {
      lpar: short || fromMap?.lpar || host || 'unknown',
      sshd: fromMap?.sshd || '',
      zone: fromMap?.zone || 'OZ',
      slotNum: fromMap?.slotNum,
      pool: lease.pool || fromMap?.pool,
      profile: fromMap?.profile,
      tcpPort: fromMap?.tcpPort || 16509,
      qemuUri: lease.qemuUri || (host ? `qemu+tcp://${host}/system` : undefined),
      observed: true,
    };
  }

  return resolveFromMap(slot);
}

function resolveFromMap(slot: string): LparInfo | null {
  const oz = slot.match(/^libvirt-s390x-oz-(\d+)-(\d+)$/);
  if (oz) {
    const lparIdx = Number(oz[1]);
    const slotNum = Number(oz[2]);
    const base = LPAR_MAP_OZ[lparIdx];
    if (!base) return null;
    return {
      ...base,
      slotNum,
      // Steps use hostname without :port; keep short form for inferred fallback.
      qemuUri: `qemu+tcp://${base.lpar}/system`,
      observed: false,
    };
  }

  const m = slot.match(/^libvirt-s390x-(\d+)-(\d+)$/);
  if (m) {
    const lparIdx = Number(m[1]);
    const slotNum = Number(m[2]);
    const base = LPAR_MAP[lparIdx];
    if (!base) return null;
    return {
      ...base,
      slotNum,
      qemuUri: `qemu+tcp://${base.lpar}/system`,
      observed: false,
    };
  }

  // e.g. libvirt-s390x-arm64-0-0 — no static host map; wait for step-log URI
  return null;
}
