/**
 * Educational content for IBM Z CI workflows, derived from openshift/release
 * (ci-operator/config/openshift/multiarch + step-registry/openshift/e2e/libvirt).
 * Refresh by re-reading .cache/release (gitignored local clone).
 */

export type GuidePhase = 'pre' | 'test' | 'post';

export interface GuideStep {
  name: string;
  phase: GuidePhase;
  /** Maps to openshift-install / cluster lifecycle stage */
  ocpStage: string;
  summary: string;
  detail: string;
  bestEffort?: boolean;
  via?: string;
  stepsCi?: string;
  releaseYaml?: string;
  keyArtifacts?: string[];
}

export interface GuideWorkflow {
  id: string;
  name: string;
  title: string;
  summary: string;
  since: string;
  profiles: string[];
  stepsCi: string;
  releaseYaml: string;
  steps: GuideStep[];
}

export interface ClusterProfileInfo {
  id: string;
  title: string;
  summary: string;
  usage: string;
  connectivity: string;
  typicalJobs: string[];
  status: 'primary' | 'legacy' | 'specialized';
}

export interface EnvVarInfo {
  name: string;
  meaning: string;
  typical: string;
  where: string;
}

export interface JobPatternInfo {
  pattern: string;
  meaning: string;
  example: string;
}

const STEPS_CI = 'https://steps.ci.openshift.org';
const RELEASE = 'https://github.com/openshift/release/blob/master';

function refUrl(path: string): string {
  return `${RELEASE}/ci-operator/step-registry/${path}`;
}

function stepCi(kind: 'ref' | 'chain' | 'workflow', name: string): string {
  return `${STEPS_CI}/${kind}/${name}`;
}

/** Leaf steps shared by openshift-e2e-libvirt-vpn (+ fips adds fips-check). */
const VPN_LEAF_STEPS: GuideStep[] = [
  {
    name: 'upi-libvirt-cleanup-pre',
    phase: 'pre',
    ocpStage: 'Pre-flight · reclaim prior lease resources',
    summary: 'Destroy leftover VMs, networks, and volumes for this Boskos lease before a new install.',
    detail:
      'Looks up the libvirt daemon from the leased slot (via cluster-profile lease map) and cleans resources whose names embed the lease. Prevents “storage volume already exists” from a previous failed cleanup-post.',
    stepsCi: stepCi('ref', 'upi-libvirt-cleanup-pre'),
    releaseYaml: refUrl('upi/libvirt/cleanup/pre/upi-libvirt-cleanup-pre-ref.yaml'),
    keyArtifacts: ['build-log.txt'],
  },
  {
    name: 'ipi-install-rbac',
    phase: 'pre',
    ocpStage: 'CI privileges on build farm',
    summary: 'Grant the CI service account ClusterRoleBindings needed to run install steps.',
    detail:
      'Build-farm RBAC only — not part of the customer OpenShift install path. Rarely fails unless build-farm kubeconfig/policy changed.',
    via: 'upi-conf-libvirt',
    stepsCi: stepCi('ref', 'ipi-install-rbac'),
    releaseYaml: refUrl('ipi/install/rbac/ipi-install-rbac-ref.yaml'),
  },
  {
    name: 'upi-conf-libvirt-network',
    phase: 'pre',
    ocpStage: 'Install prep · network manifest',
    summary: 'Write network.xml for the libvirt virtual network into $SHARED_DIR.',
    detail:
      'Mirrors the “define cluster network / DNS” part of UPI. USE_EXTERNAL_DNS=true (typical for VPN Z jobs) points the cluster at LPAR/external DNS instead of in-cluster CoreDNS only. INSTALLER_TYPE=agent changes layout for agent-based install.',
    via: 'upi-conf-libvirt',
    stepsCi: stepCi('ref', 'upi-conf-libvirt-network'),
    releaseYaml: refUrl('upi/conf/libvirt/network/upi-conf-libvirt-network-ref.yaml'),
    keyArtifacts: ['build-log.txt'],
  },
  {
    name: 'upi-conf-libvirt-agent',
    phase: 'pre',
    ocpStage: 'Install prep · agent-config.yaml',
    summary: 'Generate agent-config.yaml (rendezvous IP, host MACs) for agent-based installs.',
    detail:
      'Active when INSTALLER_TYPE=agent (e.g. ocp-e2e-ovn-agent-remote-libvirt-multi-z-z). Skipped/no-op path for classic UPI create-cluster flows.',
    via: 'upi-conf-libvirt',
    stepsCi: stepCi('ref', 'upi-conf-libvirt-agent'),
    releaseYaml: refUrl('upi/conf/libvirt/agent/upi-conf-libvirt-agent-ref.yaml'),
  },
  {
    name: 'upi-conf-libvirt',
    phase: 'pre',
    ocpStage: 'Install prep · install-config.yaml',
    summary: 'Generate install-config.yaml (platform none/external, FIPS, feature set, node counts).',
    detail:
      'Equivalent to authoring install-config before `openshift-install create cluster`. Sets ARCH, CONTROL_COUNT/COMPUTE_COUNT, FIPS_ENABLED, FEATURE_SET (TechPreviewNoUpgrade), PLATFORM_TYPE/NAME for external-platform jobs, NODE_TUNING, USE_EXTERNAL_DNS.',
    via: 'upi-conf-libvirt',
    stepsCi: stepCi('ref', 'upi-conf-libvirt'),
    releaseYaml: refUrl('upi/conf/libvirt/upi-conf-libvirt-ref.yaml'),
    keyArtifacts: ['build-log.txt'],
  },
  {
    name: 'ipi-conf-debug-kdump-configure-logs',
    phase: 'pre',
    ocpStage: 'Install prep · MachineConfig (kdump)',
    summary: 'Emit MachineConfig so nodes collect kernel crash dumps (kdump).',
    detail:
      'Uses arch-aware kexec args. Oversized CRASH_KERNEL_MEMORY defaults exist for ppc64le compatibility; informational for s390x.',
    via: 'upi-conf-libvirt',
    stepsCi: stepCi('ref', 'ipi-conf-debug-kdump-configure-logs'),
    releaseYaml: refUrl(
      'ipi/conf/debug/kdump-configure-logs/ipi-conf-debug-kdump-configure-logs-ref.yaml',
    ),
  },
  {
    name: 'ipi-debug-missing-static-pod-controller-degraded',
    phase: 'pre',
    ocpStage: 'Install prep · kubelet watchdog (optional)',
    summary: 'Optional static-pod restart watchdog; often a no-op for Z VPN jobs.',
    detail:
      'Safety net for static pod controller degraded conditions. Usually non-blocking.',
    stepsCi: stepCi('ref', 'ipi-debug-missing-static-pod-controller-degraded'),
  },
  {
    name: 'ipi-conf-etcd-on-ramfs',
    phase: 'pre',
    ocpStage: 'Install prep · etcd on ramfs MachineConfig',
    summary: 'Put etcd on ramfs when disk is classified slow (IBM Z default).',
    detail:
      'Paired with ETCD_DISK_SPEED=slow in multiarch job env. Avoids etcd leader elections caused by high disk latency on Z LPAR storage. Do not use ramfs for upgrade paths that reboot masters (ramfs is lost).',
    stepsCi: stepCi('ref', 'ipi-conf-etcd-on-ramfs'),
    releaseYaml: refUrl('ipi/conf/etcd/on-ramfs/ipi-conf-etcd-on-ramfs-ref.yaml'),
  },
  {
    name: 'upi-install-libvirt-network',
    phase: 'pre',
    ocpStage: 'Infrastructure · create libvirt network',
    summary: 'Create the libvirt network on the remote Z hypervisor via virsh.',
    detail:
      'Connects over qemu+tcp through the VPN/bastion using the leased hostname. Consumes $SHARED_DIR/network.xml from the conf step.',
    via: 'upi-install-libvirt',
    stepsCi: stepCi('ref', 'upi-install-libvirt-network'),
    releaseYaml: refUrl('upi/install/libvirt/network/upi-install-libvirt-network-ref.yaml'),
  },
  {
    name: 'rhcos-conf-osstream',
    phase: 'pre',
    ocpStage: 'Infrastructure · RHCOS image stream',
    summary: 'Resolve RHCOS OS image stream for the target OCP BRANCH/ARCH.',
    detail:
      'Ensures the installer has a valid RHCOS image for s390x on that nightly. Failures usually mean image-stream / release payload gaps.',
    via: 'upi-install-libvirt',
    stepsCi: stepCi('ref', 'rhcos-conf-osstream'),
  },
  {
    name: 'upi-install-libvirt',
    phase: 'pre',
    ocpStage: 'openshift-install · bootstrap → install-complete',
    summary: 'Create VMs, run openshift-install, wait for bootstrap-complete and install-complete.',
    detail:
      'The core of UPI on libvirt: virt-install/virsh define+start, then openshift-install create cluster (or agent path). Maps to the documented install phases: create manifests/ignition (earlier), bootstrap, approve CSRs, wait for cluster operators. Primary evidence: .openshift_install.log.',
    via: 'upi-install-libvirt',
    stepsCi: stepCi('ref', 'upi-install-libvirt'),
    releaseYaml: refUrl('upi/install/libvirt/upi-install-libvirt-ref.yaml'),
    keyArtifacts: ['build-log.txt', '.openshift_install.log'],
  },
  {
    name: 'openshift-e2e-libvirt-conf',
    phase: 'test',
    ocpStage: 'Post-install · cluster ready for tests',
    summary: 'Validate kubeconfig / provider settings and inject test include/exclude lists.',
    detail:
      'Confirms the cluster is reachable after install and prepares openshift-tests (TEST_TYPE, ARCH, BRANCH). Failure here usually means install looked green but API/network is unhealthy.',
    via: 'openshift-e2e-libvirt-test',
    stepsCi: stepCi('ref', 'openshift-e2e-libvirt-conf'),
    releaseYaml: refUrl('openshift/e2e/libvirt/conf/openshift-e2e-libvirt-conf-ref.yaml'),
  },
  {
    name: 'openshift-e2e-libvirt-test',
    phase: 'test',
    ocpStage: 'Conformance / upgrade / serial suites',
    summary: 'Run openshift-tests (conformance-parallel, serial, upgrade, image-ecosystem, …).',
    detail:
      'Product validation after a successful install. TEST_TYPE selects suite behaviour. JUnit + e2e.log are the source of truth for which tests failed.',
    via: 'openshift-e2e-libvirt-test',
    stepsCi: stepCi('ref', 'openshift-e2e-libvirt-test'),
    releaseYaml: refUrl('openshift/e2e/libvirt/test/openshift-e2e-libvirt-test-ref.yaml'),
    keyArtifacts: ['build-log.txt', 'junit*.xml', 'e2e.log'],
  },
  {
    name: 'ipi-conf-debug-kdump-gather-logs',
    phase: 'post',
    ocpStage: 'Debug · kernel crash dumps',
    summary: 'Collect kdump archives from nodes if present.',
    detail: 'best_effort. Presence of crash dumps indicates a kernel panic during the run.',
    bestEffort: true,
    stepsCi: stepCi('ref', 'ipi-conf-debug-kdump-gather-logs'),
  },
  {
    name: 'gather-must-gather',
    phase: 'post',
    ocpStage: 'Debug · oc adm must-gather',
    summary: 'Standard must-gather tarball for operators, events, and cluster state.',
    detail:
      'best_effort / optional_on_success. If this fails, the cluster may be too broken for oc — escalate with gather-extra instead.',
    bestEffort: true,
    via: 'gather',
    stepsCi: stepCi('ref', 'gather-must-gather'),
    keyArtifacts: ['must-gather.tar.gz', 'camgi.html'],
  },
  {
    name: 'gather-extra',
    phase: 'post',
    ocpStage: 'Debug · CI-specific cluster dump',
    summary: 'Extra CI artifacts when must-gather is incomplete or the cluster is unhealthy.',
    detail: 'best_effort. Often the best first stop after a failed install/test.',
    bestEffort: true,
    via: 'gather',
    stepsCi: stepCi('ref', 'gather-extra'),
  },
  {
    name: 'gather-audit-logs',
    phase: 'post',
    ocpStage: 'Debug · API audit logs',
    summary: 'Collect kube-/openshift-apiserver audit logs from masters.',
    detail: 'best_effort. Useful for auth and API-server investigations.',
    bestEffort: true,
    via: 'gather',
    stepsCi: stepCi('ref', 'gather-audit-logs'),
  },
  {
    name: 'upi-libvirt-cleanup-post',
    phase: 'post',
    ocpStage: 'Deprovision · destroy libvirt resources',
    summary: 'Destroy VMs/networks/volumes for the lease so the next job can reuse the slot.',
    detail:
      'If this fails, Boskos may still release the lease but virsh state remains — the next job then fails in cleanup-pre/install with stale volumes.',
    stepsCi: stepCi('ref', 'upi-libvirt-cleanup-post'),
    releaseYaml: refUrl('upi/libvirt/cleanup/post/upi-libvirt-cleanup-post-ref.yaml'),
  },
];

const FIPS_STEP: GuideStep = {
  name: 'fips-check',
  phase: 'pre',
  ocpStage: 'Post-install check · FIPS mode',
  summary: 'Validate that the cluster nodes are running in FIPS mode.',
  detail:
    'Inserted after upi-install-libvirt in openshift-e2e-libvirt-vpn-fips. Jobs set FIPS_ENABLED=true in install-config generation.',
  stepsCi: stepCi('ref', 'fips-check'),
};

function withFips(steps: GuideStep[]): GuideStep[] {
  const idx = steps.findIndex((s) => s.name === 'upi-install-libvirt');
  if (idx < 0) return [...steps, FIPS_STEP];
  const out = [...steps];
  out.splice(idx + 1, 0, FIPS_STEP);
  return out;
}

export const GUIDE_WORKFLOWS: GuideWorkflow[] = [
  {
    id: 'vpn',
    name: 'openshift-e2e-libvirt-vpn',
    title: 'Libvirt VPN (primary IBM Z path)',
    summary:
      'UPI-style libvirt install over the IBM Z VPN/bastion path. Dominant workflow for s390x jobs from OCP 4.13 through 5.x in openshift/multiarch nightlies.',
    since: '4.13+',
    profiles: ['libvirt-s390x-vpn'],
    stepsCi: stepCi('workflow', 'openshift-e2e-libvirt-vpn'),
    releaseYaml: `${RELEASE}/ci-operator/step-registry/openshift/e2e/libvirt/vpn/openshift-e2e-libvirt-vpn-workflow.yaml`,
    steps: VPN_LEAF_STEPS,
  },
  {
    id: 'vpn-fips',
    name: 'openshift-e2e-libvirt-vpn-fips',
    title: 'Libvirt VPN + FIPS',
    summary:
      'Same as VPN workflow, plus fips-check after install. Used by ocp-fips-ovn-* and TechPreview FIPS periodics.',
    since: '4.13+',
    profiles: ['libvirt-s390x-vpn'],
    stepsCi: stepCi('workflow', 'openshift-e2e-libvirt-vpn-fips'),
    releaseYaml: `${RELEASE}/ci-operator/step-registry/openshift/e2e/libvirt/vpn/fips/openshift-e2e-libvirt-vpn-fips-workflow.yaml`,
    steps: withFips(VPN_LEAF_STEPS),
  },
  {
    id: 'upi',
    name: 'openshift-e2e-libvirt-upi',
    title: 'Libvirt UPI (non-VPN / classic)',
    summary:
      'Same leaf steps as VPN for PRE/TEST/POST, historically used with bastion DNS searches. On 5.1 also used for e2e-external-ibmz-upi-libvirt (platform external).',
    since: 'legacy · revived on 5.x external',
    profiles: ['libvirt-s390x-vpn', 'libvirt-ppc64le-s2s'],
    stepsCi: stepCi('workflow', 'openshift-e2e-libvirt-upi'),
    releaseYaml: `${RELEASE}/ci-operator/step-registry/openshift/e2e/libvirt/upi/openshift-e2e-libvirt-upi-workflow.yaml`,
    steps: VPN_LEAF_STEPS,
  },
  {
    id: 'hetero',
    name: 'openshift-e2e-libvirt-upi-heterogeneous',
    title: 'Heterogeneous libvirt (z-xz)',
    summary:
      'Multi-arch compute path (s390x control plane + additional amd64 workers). Uses heterogeneous pre/install/post chains and profile libvirt-s390x-amd64.',
    since: '4.15+',
    profiles: ['libvirt-s390x-amd64'],
    stepsCi: stepCi('workflow', 'openshift-e2e-libvirt-upi-heterogeneous'),
    releaseYaml: `${RELEASE}/ci-operator/step-registry/openshift/e2e/libvirt/upi/heterogeneous/openshift-e2e-libvirt-upi-heterogeneous-workflow.yaml`,
    steps: [
      {
        name: 'upi-libvirt-conf / heterogeneous-pre',
        phase: 'pre',
        ocpStage: 'Install prep + homogeneous install chain',
        summary: 'Configure and install the primary (s390x) cluster via heterogeneous-pre chain.',
        detail:
          'Chain upi-libvirt-heterogeneous-pre expands to conf, etcd-on-ramfs, and upi-libvirt-install for the base cluster.',
        via: 'upi-libvirt-heterogeneous-pre',
        stepsCi: stepCi('chain', 'upi-libvirt-heterogeneous-pre'),
      },
      {
        name: 'upi-libvirt-install-heterogeneous',
        phase: 'pre',
        ocpStage: 'Add multi-arch compute workers',
        summary: 'Attach additional-architecture workers (amd64) to the s390x control plane.',
        detail:
          'ADDITIONAL_WORKER_ARCHITECTURE drives the mixed-arch topology behind job names like multi-z-xz.',
        stepsCi: stepCi('ref', 'upi-libvirt-install-heterogeneous'),
        keyArtifacts: ['build-log.txt', '.openshift_install.log'],
      },
      {
        name: 'openshift-e2e-libvirt-conf → test',
        phase: 'test',
        ocpStage: 'Conformance on mixed-arch cluster',
        summary: 'Same openshift-e2e-libvirt-test chain as homogeneous jobs.',
        detail: 'Validates the heterogeneous cluster with conformance-parallel (typical).',
        via: 'openshift-e2e-libvirt-test',
      },
      {
        name: 'upi-libvirt-heterogeneous-post',
        phase: 'post',
        ocpStage: 'Gather + deprovision',
        summary: 'Gather artifacts and tear down heterogeneous libvirt resources.',
        detail: 'Post chain specific to mixed-arch leases/volumes.',
        via: 'upi-libvirt-heterogeneous-post',
      },
    ],
  },
  {
    id: 'ibmcloud',
    name: 'openshift-e2e-ibmcloud-heterogeneous',
    title: 'IBM Cloud multi-arch (s390x)',
    summary:
      'Not libvirt-on-LPAR: IBM Cloud bare-metal / VPC style multi-arch jobs using profile ibmcloud-multi-s390x. Listed for completeness alongside libvirt Z CI.',
    since: '4.14+',
    profiles: ['ibmcloud-multi-s390x'],
    stepsCi: stepCi('workflow', 'openshift-e2e-ibmcloud-heterogeneous'),
    releaseYaml: `${RELEASE}/ci-operator/step-registry/openshift/e2e/ibmcloud/heterogeneous/openshift-e2e-ibmcloud-heterogeneous-workflow.yaml`,
    steps: [
      {
        name: '(ibmcloud workflow steps)',
        phase: 'pre',
        ocpStage: 'Cloud provision (not libvirt VPN)',
        summary: 'Provision via IBM Cloud steps — different artifact tree than libvirt-vpn.',
        detail:
          'Use this debugger’s libvirt-focused views only for libvirt-* profiles. For ibmcloud jobs, start from Prow artifacts and the ibmcloud workflow docs on steps.ci.',
      },
    ],
  },
];

export const CLUSTER_PROFILES: ClusterProfileInfo[] = [
  {
    id: 'libvirt-s390x-vpn',
    title: 'libvirt-s390x-vpn',
    summary: 'Primary IBM Z CI profile for remote libvirt over VPN (intranet capability).',
    usage:
      'Boskos leases map to physical LPAR slots. Jobs set ARCH=s390x, USE_EXTERNAL_DNS=true, ETCD_DISK_SPEED=slow. Secrets live under cluster-secrets-libvirt-s390x-vpn (lease→hostname map).',
    connectivity:
      'Prow pod → VPN/intranet → bastion DNS (bastion-z) → qemu+tcp libvirt on Z LPAR.',
    typicalJobs: [
      'ocp-e2e-ovn-remote-libvirt-s390x',
      'ocp-e2e-ovn-remote-libvirt-multi-z-z',
      'ocp-e2e-serial-ovn-remote-libvirt-multi-z-z',
      'ocp-fips-ovn-remote-libvirt-multi-z-z',
      'ocp-e2e-ovn-agent-remote-libvirt-multi-z-z',
    ],
    status: 'primary',
  },
  {
    id: 'libvirt-s390x-amd64',
    title: 'libvirt-s390x-amd64',
    summary: 'Heterogeneous topology: s390x + amd64 workers (z-xz jobs).',
    usage:
      'Used with openshift-e2e-libvirt-upi-heterogeneous. Often enables USE_RAMFS=true and sshd-bastion capability.',
    connectivity: 'Libvirt across arches; bastion/sshd for cross-arch access.',
    typicalJobs: ['ocp-e2e-ovn-remote-libvirt-multi-z-xz'],
    status: 'specialized',
  },
  {
    id: 'ibmcloud-multi-s390x',
    title: 'ibmcloud-multi-s390x',
    summary: 'IBM Cloud multi-arch profile (not LPAR libvirt).',
    usage: 'Pairs with openshift-e2e-ibmcloud-heterogeneous for cloud-provisioned s390x coverage.',
    connectivity: 'IBM Cloud APIs / VPC — no libvirt-s390x-vpn lease.',
    typicalJobs: ['ibmcloud heterogeneous periodics in multiarch nightlies'],
    status: 'specialized',
  },
  {
    id: 'libvirt-s390x-2',
    title: 'libvirt-s390x-2 (legacy)',
    summary: 'Older Z libvirt profile seen on 4.8–4.11 nightlies.',
    usage:
      'Superseded by libvirt-s390x-vpn for modern (4.13+) Z remote libvirt. Mentions of “vpn-oz” in tribal knowledge refer to the VPN-era environment that replaced this.',
    connectivity: 'Legacy bastion/libvirt path.',
    typicalJobs: ['pre-4.13 periodics only'],
    status: 'legacy',
  },
];

export const ENV_VARS: EnvVarInfo[] = [
  {
    name: 'ARCH',
    meaning: 'Target CPU architecture for install and tests.',
    typical: 's390x',
    where: 'Job env in multiarch config',
  },
  {
    name: 'BRANCH',
    meaning: 'OCP version stream the job targets (matches nightly config).',
    typical: '4.13 … 4.23, 5.0, 5.1',
    where: 'Job env',
  },
  {
    name: 'CLUSTER_PROFILE / cluster_profile',
    meaning: 'Which leased CI environment + secrets the job uses.',
    typical: 'libvirt-s390x-vpn',
    where: 'Job steps.cluster_profile',
  },
  {
    name: 'LEASED_RESOURCE',
    meaning: 'Boskos slot for this run; embeds into libvirt resource names.',
    typical: 'libvirt-s390x-<pool>-<slot>',
    where: 'Injected at runtime; parse from root build-log',
  },
  {
    name: 'ETCD_DISK_SPEED',
    meaning: 'Disk speed class; slow triggers etcd-on-ramfs for Z.',
    typical: 'slow',
    where: 'Job env + ipi-conf-etcd-on-ramfs',
  },
  {
    name: 'USE_EXTERNAL_DNS',
    meaning: 'Use external/LPAR DNS instead of only in-cluster DNS.',
    typical: 'true on VPN Z jobs',
    where: 'upi-conf-libvirt* + install network',
  },
  {
    name: 'USE_RAMFS',
    meaning: 'Force etcd ramfs (heterogeneous jobs often set true).',
    typical: 'true on z-xz',
    where: 'Job env',
  },
  {
    name: 'TEST_TYPE',
    meaning: 'Which openshift-tests mode to run.',
    typical: 'conformance-parallel | conformance-serial | upgrade | image-ecosystem | suite',
    where: 'openshift-e2e-libvirt-test',
  },
  {
    name: 'FIPS_ENABLED',
    meaning: 'Enable FIPS in install-config; pairs with vpn-fips workflow.',
    typical: 'true on fips jobs',
    where: 'upi-conf-libvirt',
  },
  {
    name: 'FEATURE_SET',
    meaning: 'OpenShift feature set (tech preview lanes).',
    typical: 'TechPreviewNoUpgrade',
    where: 'upi-conf-libvirt / job env',
  },
  {
    name: 'INSTALLER_TYPE',
    meaning: 'Classic UPI vs agent-based installer path.',
    typical: 'agent for *-agent-remote-* jobs; unset otherwise',
    where: 'upi-conf-libvirt-network/agent',
  },
  {
    name: 'PLATFORM_TYPE / PLATFORM_NAME',
    meaning: 'platform:external style installs (IBM Z external platform CI).',
    typical: 'external / ibmz on 5.x e2e-external-ibmz-*',
    where: 'upi-conf-libvirt',
  },
  {
    name: 'NODE_TUNING',
    meaning: 'Apply node tuning bits in install-config generation.',
    typical: 'true on many e2e periodics',
    where: 'Job env',
  },
  {
    name: 'VOLUME_CAPACITY',
    meaning: 'Libvirt disk size for VMs.',
    typical: '120G (agent / external jobs)',
    where: 'upi-install-libvirt',
  },
  {
    name: 'DISABLE_LOAD_BALANCER_MONITOR',
    meaning: 'Skip LB monitor checks (common for platform:external).',
    typical: 'true on e2e-external-ibmz-*',
    where: 'openshift-e2e-libvirt-test',
  },
  {
    name: 'EXTENSION_BINARY_OVERRIDE_EXCLUDE_TAGS',
    meaning: 'Exclude flaky/unsupported extension tags from openshift-tests.',
    typical: 'vsphere-csi-driver-operator on 5.x',
    where: 'Job env (5.x nightlies)',
  },
  {
    name: 'OPENSHIFT_INSTALL_TARGET',
    meaning: 'Which release image payload to install (dependency).',
    typical: 'release:s390x-latest or release:latest',
    where: 'Job dependencies',
  },
];

export const JOB_PATTERNS: JobPatternInfo[] = [
  {
    pattern: 'multi-z-z',
    meaning: 'Homogeneous s390x (control + compute on Z).',
    example: 'ocp-e2e-ovn-remote-libvirt-multi-z-z',
  },
  {
    pattern: 'multi-z-xz',
    meaning: 'Heterogeneous: Z control plane + x86 workers.',
    example: 'ocp-e2e-ovn-remote-libvirt-multi-z-xz',
  },
  {
    pattern: 'remote-libvirt-s390x',
    meaning: 'Single-arch s390x remote libvirt (often release:s390x-latest).',
    example: 'ocp-e2e-ovn-remote-libvirt-s390x',
  },
  {
    pattern: 'agent-remote',
    meaning: 'Agent-based installer (INSTALLER_TYPE=agent).',
    example: 'ocp-e2e-ovn-agent-remote-libvirt-multi-z-z',
  },
  {
    pattern: 'fips',
    meaning: 'FIPS install + vpn-fips workflow.',
    example: 'ocp-fips-ovn-remote-libvirt-multi-z-z',
  },
  {
    pattern: 'techpreview',
    meaning: 'FEATURE_SET=TechPreviewNoUpgrade.',
    example: 'ocp-e2e-serial-ovn-techpreview-remote-libvirt-multi-z-z',
  },
  {
    pattern: 'e2e-external-ibmz',
    meaning: 'platform:external IBM Z CI (5.x).',
    example: 'e2e-external-ibmz-agent-libvirt',
  },
  {
    pattern: 'upgrade-from-nightly',
    meaning: 'Upgrade lane between OCP versions on Z libvirt.',
    example: '…-5.0-upgrade-from-nightly-4.22-…-multi-z-z',
  },
];

/** Version → workflow usage notes from multiarch nightlies (4.13–5.1). */
export const VERSION_NOTES: { version: string; notes: string }[] = [
  {
    version: '4.13–4.14',
    notes: 'VPN workflow established as the Z remote path; FIPS variant present; ibmcloud-multi-s390x appears.',
  },
  {
    version: '4.15–4.16',
    notes: 'Heterogeneous z-xz (libvirt-s390x-amd64 + upi-heterogeneous) added alongside vpn.',
  },
  {
    version: '4.17–4.22',
    notes: 'VPN remains dominant (~6 e2e variants/version): parallel, serial, agent, image-ecosystem, fips, upgrades.',
  },
  {
    version: '4.23–5.0',
    notes: 'More FIPS/TechPreview coverage; vpn still primary for multi-z-z.',
  },
  {
    version: '5.1',
    notes:
      'Richest Z matrix: vpn + vpn-fips + external-platform agent/UPI jobs + heterogeneous z-xz; EXTENSION_BINARY_OVERRIDE_EXCLUDE_TAGS common.',
  },
];

export const OCP_INSTALL_PHASES: { id: string; title: string; mapsTo: string }[] = [
  {
    id: 'prep',
    title: '1 · Generate config',
    mapsTo: 'upi-conf-libvirt* → install-config, network.xml, agent-config, MachineConfigs',
  },
  {
    id: 'infra',
    title: '2 · Platform infra',
    mapsTo: 'upi-install-libvirt-network + rhcos-conf-osstream → libvirt net + RHCOS',
  },
  {
    id: 'bootstrap',
    title: '3 · Bootstrap & install',
    mapsTo: 'upi-install-libvirt → create cluster, bootstrap-complete, install-complete',
  },
  {
    id: 'validate',
    title: '4 · Validate',
    mapsTo: 'openshift-e2e-libvirt-conf + test (+ fips-check)',
  },
  {
    id: 'gather',
    title: '5 · Gather & teardown',
    mapsTo: 'gather* + upi-libvirt-cleanup-post',
  },
];

export const CI_LAYERS: { name: string; blurb: string }[] = [
  {
    name: 'Prow job',
    blurb: 'Periodic/presubmit entry from ci-operator/jobs — what you paste into this debugger.',
  },
  {
    name: 'ci-operator config',
    blurb: 'openshift-multiarch-main__nightly-<ver>.yaml — test name, cluster_profile, env, workflow.',
  },
  {
    name: 'Workflow',
    blurb: 'PRE / TEST / POST orchestration in step-registry (e.g. openshift-e2e-libvirt-vpn).',
  },
  {
    name: 'Chains → refs',
    blurb: 'Reusable step groups expand to leaf refs that write GCS artifacts you debug.',
  },
  {
    name: 'Cluster profile',
    blurb: 'Leased environment secrets (LPAR map, credentials) — libvirt-s390x-vpn for most Z jobs.',
  },
];

export function workflowByName(name: string | null | undefined): GuideWorkflow {
  const hit = GUIDE_WORKFLOWS.find((w) => w.name === name || w.id === name);
  return hit || GUIDE_WORKFLOWS[0];
}

export function workflowByJobHints(jobName: string, workflow?: string | null): GuideWorkflow {
  if (workflow) return workflowByName(workflow);
  if (/fips/i.test(jobName)) return workflowByName('vpn-fips');
  if (/z-xz|heterogeneous/i.test(jobName)) return workflowByName('hetero');
  if (/ibmcloud/i.test(jobName)) return workflowByName('ibmcloud');
  if (/external-ibmz-upi|libvirt-upi/i.test(jobName) && !/vpn/i.test(jobName)) {
    return workflowByName('upi');
  }
  return workflowByName('vpn');
}
