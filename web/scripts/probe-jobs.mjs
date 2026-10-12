/**
 * Spot-check analyzeExecution fields for a handful of job URLs.
 *   npx vite-node scripts/probe-jobs.mjs
 */
import { analyzeExecution } from '../src/lib/analyze.ts';
import { parseProwUrl } from '../src/lib/url.ts';

const urls = [
  'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-5.0-ocp-fips-ovn-techpreview-remote-libvirt-multi-z-z/2108845308434714624',
  'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-4.22-ocp-e2e-ovn-agent-remote-libvirt-multi-z-z/2109147170773929984',
  'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-4.15-upgrade-from-nightly-4.14-ocp-ovn-remote-libvirt-s390x/2108407432328777728',
  'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-5.1-e2e-external-ibmz-agent-libvirt/2109267881773502464',
  'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-4.18-ocp-e2e-ovn-remote-libvirt-s390x/2108528254271885312',
  'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-4.21-ocp-fips-ovn-remote-libvirt-multi-z-z/2109479342793822208',
];

for (const url of urls) {
  const p = parseProwUrl(url);
  const a = await analyzeExecution(p);
  const fips = a.workflow.find((w) => w.name === 'fips-check');
  const agent = a.workflow.find((w) => w.name === 'upi-conf-libvirt-agent');
  console.log(
    JSON.stringify({
      job: a.jobName.replace(/.*nightly-/, ''),
      result: a.result,
      profile: a.meta.profile,
      workflowMeta: a.meta.workflow,
      installer: a.meta.installer,
      fipsMeta: a.meta.fips,
      testType: a.meta.testType,
      from: a.meta.fromVersion,
      release: a.release?.tag,
      initial: a.release?.initialTag,
      releaseSrc: a.release?.source,
      lease: a.leaseSlot,
      leaseSrc: a.lease?.source,
      qemu: a.lease?.qemuUri,
      firstFailed: a.firstFailed,
      fipsStep: fips ? `${fips.status}/obs=${fips.observed}` : 'absent',
      agentStep: agent ? `${agent.status}/obs=${agent.observed}` : 'absent',
      testSubdir: a.testSubdir,
      failed: a.workflow.filter((w) => w.status === 'failed').map((w) => w.name),
    }),
  );
}
