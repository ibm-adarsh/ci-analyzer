export type LparInfo = {
  lpar: string;
  sshd: string;
  zone: string;
  slotNum?: number;
  pool?: string;
  profile?: string;
  qemuUri?: string;
  tcpPort?: number;
};

export const LPAR_MAP: Record<number, Omit<LparInfo, 'qemuUri' | 'slotNum'>> = {
  // libvirt-s390x-vpn — lnxocp01/02/06  (libvirt-s390x-<lpar>-<slot>)
  0: { lpar:'lnxocp01', sshd:'sshd-0',  zone:'OZ', profile:'libvirt-s390x-vpn',    pool:'libvirt-s390x-vpn-quota-slice',    tcpPort:16509 },
  1: { lpar:'lnxocp02', sshd:'sshd-1',  zone:'OZ', profile:'libvirt-s390x-vpn',    pool:'libvirt-s390x-vpn-quota-slice',    tcpPort:16509 },
  2: { lpar:'lnxocp06', sshd:'sshd-2',  zone:'OZ', profile:'libvirt-s390x-vpn',    pool:'libvirt-s390x-vpn-quota-slice',    tcpPort:16509 },
};

export const LPAR_MAP_OZ: Record<number, Omit<LparInfo, 'qemuUri' | 'slotNum'>> = {
  // libvirt-s390x-vpn-oz — lnxocp11-14  (libvirt-s390x-oz-<lpar>-<slot>)
  0: { lpar:'lnxocp11', sshd:'sshd-11', zone:'OZ', profile:'libvirt-s390x-vpn-oz', pool:'libvirt-s390x-vpn-oz-quota-slice', tcpPort:16509 },
  1: { lpar:'lnxocp12', sshd:'sshd-12', zone:'OZ', profile:'libvirt-s390x-vpn-oz', pool:'libvirt-s390x-vpn-oz-quota-slice', tcpPort:16509 },
  2: { lpar:'lnxocp13', sshd:'sshd-13', zone:'OZ', profile:'libvirt-s390x-vpn-oz', pool:'libvirt-s390x-vpn-oz-quota-slice', tcpPort:16509 },
  3: { lpar:'lnxocp14', sshd:'sshd-14', zone:'OZ', profile:'libvirt-s390x-vpn-oz', pool:'libvirt-s390x-vpn-oz-quota-slice', tcpPort:16509 },
};
