/**
 * Live check: failed TEST-phase jobs → failing test case / suite report.
 *   npx vite-node scripts/probe-test-failures.mjs
 */
import { analyzeExecution } from '../src/lib/analyze.ts';
import { parseProwUrl } from '../src/lib/url.ts';

const URLS = [
  // e2e parallel
  'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-4.20-ocp-e2e-ovn-remote-libvirt-multi-z-z/2109449138415341568',
  // fips
  'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-4.21-ocp-fips-ovn-remote-libvirt-multi-z-z/2109479342793822208',
  // serial
  'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-5.1-ocp-e2e-serial-ovn-techpreview-remote-libvirt-multi-z-z/2109252830022864896',
  // upgrade
  'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-4.22-upgrade-from-nightly-4.21-ocp-ovn-remote-libvirt-multi-z-z/2109554940971061248',
  // another fips
  'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-4.22-ocp-fips-ovn-remote-libvirt-multi-z-z/2109524599002632192',
  // s390x e2e fail
  'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-5.0-ocp-e2e-ovn-remote-libvirt-s390x/2109498153131577344',
  // agent fail (test phase)
  'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-4.19-ocp-e2e-ovn-agent-remote-libvirt-multi-z-z/2109418868681216000',
];

let ok = 0;
for (const url of URLS) {
  const p = parseProwUrl(url);
  const a = await analyzeExecution(p);
  const tf = a.testFailures;
  const short = a.jobName.replace(/^periodic-ci-openshift-multiarch-main-nightly-/, '');
  const testFailed = a.phaseStatus.test === 'failed' || a.firstFailed === 'openshift-e2e-libvirt-test';
  const pass =
    !testFailed ||
    (tf &&
      tf.failures.length > 0 &&
      tf.bySuite.length > 0);
  if (pass) ok += 1;
  console.log(
    JSON.stringify({
      ok: !!pass,
      job: short,
      result: a.result,
      firstFailed: a.firstFailed,
      testPhase: a.phaseStatus.test,
      summary: tf?.summary || null,
      bySuite: tf?.bySuite.map((g) => `${g.suite}:${g.count}`) || [],
      blocking: tf?.failures.filter((f) => f.severity === 'blocking').map((f) => f.name.slice(0, 90)) || [],
      junit: tf?.junitFiles.map((j) => j.name) || [],
      progress: a.progressSummary,
    }),
  );
}
console.log(`PASS ${ok}/${URLS.length}`);
process.exit(ok === URLS.length ? 0 : 1);
