import { LPAR_MAP, LPAR_MAP_OZ, type LparInfo } from '../data/lpar';

/** Resolve Boskos lease slot → LPAR host details for vpn / vpn-oz pools. */
export function resolveLpar(slot: string): LparInfo | null {
  // libvirt-s390x-oz-<lpar>-<slot>  or  libvirt-s390x-<lpar>-<slot>
  const oz = slot.match(/^libvirt-s390x-oz-(\d+)-(\d+)$/);
  if (oz) {
    const lparIdx = Number(oz[1]);
    const slotNum = Number(oz[2]);
    const base = LPAR_MAP_OZ[lparIdx];
    if (!base) return null;
    return {
      ...base,
      slotNum,
      qemuUri: `qemu+tcp://${base.lpar}:${base.tcpPort || 16509}/system`,
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
      qemuUri: `qemu+tcp://${base.lpar}:${base.tcpPort || 16509}/system`,
    };
  }
  return null;
}
