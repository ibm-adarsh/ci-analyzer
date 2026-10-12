import type { StepResult } from '../types';

export interface LeaseInfo {
  slot: string;
  /** Boskos pool, e.g. libvirt-s390x-vpn-quota-slice */
  pool: string | null;
  source: string;
  /** Hostname from step log (CLUSTER_PROFILE_DIR/leases lookup) when observed */
  hostname: string | null;
  /** Full qemu+tcp URI as printed by cleanup/install steps */
  qemuUri: string | null;
  connectionSource: string | null;
}

const LEASE_STEPS = [
  'upi-libvirt-cleanup-pre',
  'upi-libvirt-cleanup-heterogeneous-pre',
  'upi-install-libvirt',
  'upi-install-libvirt-heterogeneous',
  'upi-conf-libvirt',
  'upi-conf-libvirt-heterogeneous',
  'upi-conf-libvirt-heterogeneous-network',
  'upi-install-libvirt-network',
  'upi-install-libvirt-heterogeneous-network',
  'upi-libvirt-cleanup-post',
  'upi-libvirt-cleanup-heterogeneous-post',
];

function stepNamesToScan(
  steps: Record<string, Pick<StepResult, 'logTail' | 'logText'> | undefined>,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of [...LEASE_STEPS, ...Object.keys(steps)]) {
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

/** Parse Boskos lease from ci-operator root build-log.txt */
export function parseLeaseFromProwLog(prowLog: string | null): {
  slot: string;
  pool: string | null;
} | null {
  if (!prowLog || prowLog === '__REDACTED__') return null;
  const text = stripAnsi(prowLog);
  // INFO[...] Acquired 1 lease(s) for libvirt-s390x-vpn-quota-slice: [libvirt-s390x-0-1]
  const m = text.match(
    /Acquired\s+\d+\s+lease\([^)]*\)\s+for\s+(\S+):\s*\[(libvirt-s390x[a-z0-9-]*)\]/i,
  );
  if (m) return { pool: m[1], slot: m[2] };
  const m2 = text.match(/Acquired.*\[(libvirt-s390x[a-z0-9-]+)\]/i);
  if (m2) return { pool: null, slot: m2[1] };
  return null;
}

/** Fallback: LEASED_RESOURCE / bare slot from step build-log.txt */
export function parseLeaseFromSteps(
  steps: Record<string, Pick<StepResult, 'logTail' | 'logText'> | undefined>,
): { slot: string; source: string } | null {
  for (const name of stepNamesToScan(steps)) {
    const log = steps[name]?.logText || steps[name]?.logTail;
    if (!log || log === '__REDACTED__') continue;
    const text = stripAnsi(log);
    const env = text.match(/LEASED_RESOURCE[=:\s]+(['"]?)(libvirt-s390x[a-z0-9-]*)\1/i);
    if (env) return { slot: env[2], source: `${name}/build-log.txt` };
    const oz = text.match(/\b(libvirt-s390x-oz-\d+-\d+)\b/);
    if (oz) return { slot: oz[1], source: `${name}/build-log.txt` };
    const arm = text.match(/\b(libvirt-s390x-arm64-\d+-\d+)\b/);
    if (arm) return { slot: arm[1], source: `${name}/build-log.txt` };
    const std = text.match(/\b(libvirt-s390x-\d+-\d+)\b/);
    if (std) return { slot: std[1], source: `${name}/build-log.txt` };
  }
  return null;
}

/**
 * Authoritative host comes from the leases secret, printed by steps as:
 *   Using libvirt connection for qemu+tcp://lnxocp04.phc-cicd.cis.ibm.net/system
 */
export function parseLibvirtConnectionFromSteps(
  steps: Record<string, Pick<StepResult, 'logTail' | 'logText'> | undefined>,
): { qemuUri: string; hostname: string; source: string } | null {
  for (const name of stepNamesToScan(steps)) {
    const log = steps[name]?.logText || steps[name]?.logTail;
    if (!log || log === '__REDACTED__') continue;
    const text = stripAnsi(log);
    const m = text.match(/Using libvirt connection for (qemu\+tcp:\/\/([^\s/]+)(?:\S*)\/system)/i);
    if (m) {
      return { qemuUri: m[1], hostname: m[2], source: `${name}/build-log.txt` };
    }
  }
  return null;
}

/** e.g. "Loading information … for cluster profile libvirt-s390x-vpn" */
export function parseClusterProfileFromProwLog(prowLog: string | null): string | null {
  if (!prowLog || prowLog === '__REDACTED__') return null;
  const m = stripAnsi(prowLog).match(/for cluster profile\s+(\S+)/i);
  return m?.[1] || null;
}

export function extractLeaseInfo(
  prowLog: string | null,
  steps: Record<string, Pick<StepResult, 'logTail' | 'logText'> | undefined>,
): LeaseInfo | null {
  const fromProw = parseLeaseFromProwLog(prowLog);
  const fromSteps = fromProw ? null : parseLeaseFromSteps(steps);
  const slot = fromProw?.slot || fromSteps?.slot;
  if (!slot) return null;

  const conn = parseLibvirtConnectionFromSteps(steps);
  return {
    slot,
    pool: fromProw?.pool || null,
    source: fromProw ? 'ci-operator build-log.txt' : fromSteps!.source,
    hostname: conn?.hostname || null,
    qemuUri: conn?.qemuUri || null,
    connectionSource: conn?.source || null,
  };
}
