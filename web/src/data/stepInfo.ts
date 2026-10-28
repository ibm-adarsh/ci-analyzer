import type { StepInfo } from '../types';

export const STEP_INFO: Record<string, StepInfo> = {
  'upi-libvirt-cleanup-pre': {
    desc: 'Pre-cleanup: release stale libvirt VMs/networks/volumes from prior job run using the Boskos LEASED_RESOURCE slot.',
    hints: [
      { t:'Check <strong>LEASED_RESOURCE</strong> env — format <code>libvirt-s390x-X-Y</code> (e.g. <code>libvirt-s390x-1-2</code>). Physical IBM Z LPAR slot from Boskos.', cls:'warn' },
      { t:'VPN/bastion failure → LPAR unreachable. Bastion hostname resolves via VPN — check bastion pod is running and VPN tunnel is up.', cls:'info' },
      { t:'Reads <code>${CLUSTER_PROFILE_DIR}/leases</code> (secret: <code>cluster-secrets-libvirt-s390x-vpn</code>) to map lease → LPAR hostname.', cls:'info' },
    ],
    keyFiles: ['upi-libvirt-cleanup-pre/build-log.txt'],
  },
  'upi-libvirt-cleanup-heterogeneous-pre': {
    desc: 'Pre-cleanup for heterogeneous (z-za/mixed-arch) job variant.',
    hints: [
      { t:'Stale <strong>"storage volume already exists"</strong> error → previous cleanup-post failed. Manual virsh cleanup needed on LPAR.', cls:'warn' },
      { t:'Same VPN/bastion dependency as the standard pre-cleanup step.', cls:'info' },
    ],
    keyFiles: ['upi-libvirt-cleanup-heterogeneous-pre/build-log.txt'],
  },
  'ipi-install-rbac': {
    desc: 'Creates ClusterRoleBindings for the CI service account on the build farm.',
    hints: [{ t:'Rare failure. If failing: build farm KUBECONFIG issue or RBAC policy change.', cls:'info' }],
    keyFiles: ['ipi-install-rbac/build-log.txt'],
  },
  'upi-conf-libvirt-network': {
    desc: 'Generates network.xml for libvirt virtual network. INSTALLER_TYPE=agent uses agent-based layout.',
    hints: [
      { t:'<strong>INSTALLER_TYPE=agent</strong> → agent-based network config. Default is UPI-style.', cls:'info' },
      { t:'<strong>USE_EXTERNAL_DNS=true</strong> → cluster uses external DNS on the LPAR (not in-cluster CoreDNS).', cls:'info' },
      { t:'Output written to <code>$SHARED_DIR/network.xml</code> — consumed by upi-install-libvirt-network.', cls:'info' },
    ],
    keyFiles: ['upi-conf-libvirt-network/build-log.txt'],
  },
  'upi-conf-libvirt-agent': {
    desc: 'Generates agent-config.yaml with rendezvousIP and host MAC addresses for agent-based install.',
    hints: [
      { t:'Only used when INSTALLER_TYPE=agent (e.g. <code>ocp-e2e-ovn-agent-remote-libvirt-multi-z-z</code> jobs).', cls:'info' },
      { t:'Failure = rendezvousIP or host MAC config wrong. Check <code>$SHARED_DIR/agent-config.yaml</code>.', cls:'warn' },
    ],
    keyFiles: ['upi-conf-libvirt-agent/build-log.txt'],
  },
  'upi-conf-libvirt': {
    desc: 'Generates install-config.yaml with platform:none/external, NODE_TUNING, FIPS, FEATURE_SET settings.',
    hints: [
      { t:'Creates <code>$SHARED_DIR/install-config.yaml</code>. Verify ARCH=s390x, COMPUTE_COUNT=2, CONTROL_COUNT=3, NODE_TUNING=true.', cls:'info' },
      { t:'FIPS_ENABLED=true for fips variants — enables FIPS kernel mode on all nodes.', cls:'info' },
    ],
    keyFiles: ['upi-conf-libvirt/build-log.txt'],
  },
  'upi-conf-libvirt-heterogeneous': {
    desc: 'Configuration for heterogeneous (mixed-arch) libvirt deployment.',
    hints: [
      { t:'Cluster name >21 chars is truncated by openshift-install. This is a cosmetic warning, not a failure cause.', cls:'info' },
    ],
    keyFiles: ['upi-conf-libvirt-heterogeneous/build-log.txt'],
  },
  'ipi-conf-debug-kdump-configure-logs': {
    desc: 'Configures kdump kernel crash dump MachineConfig. Uses s390x-specific kexec args.',
    hints: [{ t:'kdump CRASH_KERNEL_MEMORY oversized for ppc64le compatibility. Non-critical for s390x.', cls:'info' }],
    keyFiles: ['ipi-conf-debug-kdump-configure-logs/build-log.txt'],
  },
  'ipi-debug-missing-static-pod-controller-degraded': {
    desc: 'Installs kubelet watchdog for static pod restarts. STATIC_POD_CHECK_WORKAROUND=false by default (no-op).',
    hints: [{ t:'Usually a no-op. Failure here is non-blocking for the overall install.', cls:'info' }],
    keyFiles: ['ipi-debug-missing-static-pod-controller-degraded/build-log.txt'],
  },
  'ipi-conf-etcd-on-ramfs': {
    desc: 'Configures etcd to run on ramfs. Required for ETCD_DISK_SPEED=slow on IBM Z.',
    hints: [
      { t:'IBM Z disk I/O classified "slow" → etcd on ramfs prevents leader elections from write latency.', cls:'warn' },
      { t:'Writes a MachineConfig YAML to $SHARED_DIR. Failure = MC generation error.', cls:'info' },
    ],
    keyFiles: ['ipi-conf-etcd-on-ramfs/build-log.txt'],
  },
  'upi-install-libvirt-network': {
    desc: 'Creates libvirt virtual network on remote IBM Z LPAR hypervisor via virsh.',
    hints: [
      { t:'Connects to <code>qemu+tcp://${HOSTNAME}/system</code>. HOSTNAME from <code>${CLUSTER_PROFILE_DIR}/leases</code>.', cls:'info' },
      { t:'Uses <code>mock-nss.sh virsh</code> for bastion DNS resolution. POOL_NAME=multiarch-ci-pool.', cls:'info' },
    ],
    keyFiles: ['upi-install-libvirt-network/build-log.txt'],
  },
  'upi-install-libvirt-heterogeneous-network': {
    desc: 'Creates libvirt network for heterogeneous topology variant (primary + additional hypervisor).',
    hints: [
      { t:'Requires <code>vxlan."additional-bridge"</code> in the lease secret for the additional arch host.', cls:'warn' },
      { t:'Error <code>Couldn\'t find \'vxlan."additional-bridge"\'</code> → Boskos lease config incomplete for this slot (often libvirt-s390x-arm64-*).', cls:'warn' },
      { t:'Same virsh connection pattern as the homogeneous network step; check LEASED_RESOURCE and bastion VPN.', cls:'info' },
    ],
    keyFiles: ['upi-install-libvirt-heterogeneous-network/build-log.txt'],
  },
  'rhcos-conf-osstream': {
    desc: 'Configures RHCOS OS image stream for target OCP version.',
    hints: [{ t:'Failure = RHCOS image unavailable for this branch/arch. Check image stream availability.', cls:'warn' }],
    keyFiles: ['rhcos-conf-osstream/build-log.txt'],
  },
  'upi-install-libvirt': {
    desc: '⚑ KEY STEP: Creates VMs on LPAR, runs openshift-install, waits for bootstrap-complete + install-complete.',
    hints: [
      { t:'<strong>Most critical log: <code>upi-install-libvirt/artifacts/.openshift_install.log</code></strong> — full openshift-install output with bootstrap events and cert issuance.', cls:'warn' },
      { t:'<strong>Stale volume error</strong> ("exists already") → pre-cleanup did not destroy prior VMs. Will recur until manual virsh cleanup.', cls:'warn' },
      { t:'s390x fallback: if virt-install not available → <code>virsh define</code> + <code>virsh start</code> + <code>virsh vol-resize</code>.', cls:'info' },
      { t:'Bootstrap timeout = 30 min. Install timeout = 60 min. VOLUME_CAPACITY=120G. DOMAIN_MEMORY=24567 MiB.', cls:'info' },
      { t:'After success: kubeconfig → <code>$SHARED_DIR/kubeconfig</code>, password → <code>$SHARED_DIR/kubeadmin-password</code>.', cls:'info' },
    ],
    keyFiles: ['upi-install-libvirt/build-log.txt','upi-install-libvirt/artifacts/.openshift_install.log'],
  },
  'upi-install-libvirt-heterogeneous': {
    desc: '⚑ KEY STEP: Same as upi-install-libvirt for heterogeneous (z-za) jobs.',
    hints: [
      { t:'<strong>Stale volume</strong> "exists already" → prior cleanup-post failed. See pre-cleanup log.', cls:'warn' },
      { t:'Cluster name truncation warning (>21 chars) is cosmetic — not a failure cause.', cls:'info' },
    ],
    keyFiles: ['upi-install-libvirt-heterogeneous/build-log.txt'],
  },
  'openshift-e2e-libvirt-conf': {
    desc: 'Validates cluster health, sets TEST_PROVIDER, configures kubeconfig before tests.',
    hints: [
      { t:'Failure = cluster unreachable after install. Check kube-apiserver responsiveness.', cls:'warn' },
    ],
    keyFiles: ['openshift-e2e-libvirt-conf/build-log.txt'],
  },
  'openshift-e2e-libvirt-test': {
    desc: 'Runs openshift-tests suite. TEST_TYPE: conformance-parallel | conformance-serial | upgrade.',
    hints: [
      { t:'Find failures: search "Failing tests:" at bottom of build-log.txt, or download junit XML.', cls:'warn' },
      { t:'<strong>Upgrade jobs</strong>: look for <code>run-upgrade all</code> and "Cluster upgrade complete". MonitorTest failures after upgrade = post-upgrade stability issue.', cls:'info' },
      { t:'<strong>MonitorTest / 503</strong>: "failed due to a MonitorTest failure" + "503 Service Unavailable" → CI infra flake (AWS network liveness). Cross-check with other jobs same day.', cls:'info' },
      { t:'Test timeout = 3h 30m. Mass failure threshold = 10 tests. DISABLE_LOAD_BALANCER_MONITOR for platform:external.', cls:'info' },
    ],
    keyFiles: ['openshift-e2e-libvirt-test/build-log.txt','openshift-e2e-libvirt-test/e2e.log'],
  },
  'ipi-conf-debug-kdump-gather-logs': {
    desc: 'Collects kdump crash dump files from nodes (best_effort — failure does not fail the job).',
    hints: [{ t:'If kdump archives present → kernel panic occurred on a node. Escalate to kernel team.', cls:'warn' }],
    keyFiles: ['ipi-conf-debug-kdump-gather-logs/build-log.txt'],
  },
  'gather-must-gather': {
    desc: 'Runs oc adm must-gather (best_effort, optional_on_success).',
    hints: [
      { t:'If must-gather <strong>FAILED</strong>: cluster too unhealthy for oc adm must-gather → severe cluster issue.', cls:'warn' },
      { t:'Download <code>must-gather.tar.gz</code> for full cluster state: operator logs, events, resource dumps.', cls:'info' },
    ],
    keyFiles: ['gather-must-gather/build-log.txt','gather-must-gather/must-gather.tar.gz','gather-must-gather/camgi.html','gather-must-gather/event-filter.html'],
  },
  'gather-extra': {
    desc: 'Collects CI-specific artifacts: node status, ClusterOperator health, pod logs (best_effort).',
    hints: [{ t:'Even on job failure, gather-extra contains the best cluster health summary. Start here after must-gather.', cls:'info' }],
    keyFiles: ['gather-extra/build-log.txt'],
  },
  'gather-audit-logs': {
    desc: 'Collects kube-apiserver and openshift-apiserver audit logs from each master node (best_effort).',
    hints: [{ t:'Useful for auth failures and API server issues. 15-min timeout.', cls:'info' }],
    keyFiles: ['gather-audit-logs/build-log.txt'],
  },
  'upi-libvirt-cleanup-post': {
    desc: 'Post-cleanup: destroys all VMs/networks/storage for this boskos lease slot.',
    hints: [
      { t:'<strong>Failure leaves stale virsh resources.</strong> Boskos lease IS released, but next job will fail at pre-cleanup with "storage volume already exists".', cls:'warn' },
      { t:'If recurring for same lease slot → manual cleanup on IBM Z LPAR required.', cls:'warn' },
    ],
    keyFiles: ['upi-libvirt-cleanup-post/build-log.txt'],
  },
  'upi-libvirt-cleanup-heterogeneous-post': {
    desc: 'Post-cleanup for heterogeneous variant.',
    hints: [{ t:'Same as upi-libvirt-cleanup-post. Stale volumes cascade to next rehearse run.', cls:'warn' }],
    keyFiles: ['upi-libvirt-cleanup-heterogeneous-post/build-log.txt'],
  },
};
