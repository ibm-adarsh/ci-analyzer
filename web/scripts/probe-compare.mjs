/**
 * Live check: compareToLastGreen against ≥10 failed (or mixed) Prow jobs.
 *   npx vite-node scripts/probe-compare.mjs
 */
import { analyzeExecution } from '../src/lib/analyze.ts';
import { compareToLastGreen } from '../src/lib/compare.ts';
import { parseProwUrl } from '../src/lib/url.ts';

const URLS = [
  // e2e parallel z-z
  'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-4.20-ocp-e2e-ovn-remote-libvirt-multi-z-z/2109449138415341568',
  // fips
  'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-4.21-ocp-fips-ovn-remote-libvirt-multi-z-z/2109479342793822208',
  // serial techpreview
  'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-5.1-ocp-e2e-serial-ovn-techpreview-remote-libvirt-multi-z-z/2109252830022864896',
  // upgrade
  'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-4.22-upgrade-from-nightly-4.21-ocp-ovn-remote-libvirt-multi-z-z/2109554940971061248',
  // another fips
  'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-4.22-ocp-fips-ovn-remote-libvirt-multi-z-z/2109524599002632192',
  // s390x e2e
  'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-5.0-ocp-e2e-ovn-remote-libvirt-s390x/2109498153131577344',
  // agent
  'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-4.19-ocp-e2e-ovn-agent-remote-libvirt-multi-z-z/2109418868681216000',
  // older s390x
  'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-4.18-ocp-e2e-ovn-remote-libvirt-s390x/2108528254271885312',
  // fips techpreview
  'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-5.0-ocp-fips-ovn-techpreview-remote-libvirt-multi-z-z/2108845308434714624',
  // agent 4.22
  'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-4.22-ocp-e2e-ovn-agent-remote-libvirt-multi-z-z/2109147170773929984',
  // upgrade older stream
  'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-4.15-upgrade-from-nightly-4.14-ocp-ovn-remote-libvirt-s390x/2108407432328777728',
  // external agent
  'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-5.1-e2e-external-ibmz-agent-libvirt/2109267881773502464',
];

let ok = 0;
let foundGreen = 0;
const rows = [];

for (const url of URLS) {
  const p = parseProwUrl(url);
  const short = p.jobName.replace(/^periodic-ci-openshift-multiarch-main-nightly-/, '');
  try {
    const a = await analyzeExecution(p);
    const cmp = await compareToLastGreen(a);
    const changedKeys = cmp?.rows.filter((r) => r.changed).map((r) => r.key) || [];
    // Success = compare completed (green found, or none in recent history).
    const pass = cmp == null || cmp.baselineRef.buildId !== a.buildId;
    if (pass) ok += 1;
    if (cmp) foundGreen += 1;
    const row = {
      ok: pass,
      job: short,
      current: a.buildId,
      result: a.result,
      green: cmp?.baselineRef.buildId || null,
      greenResult: cmp?.baseline.result || null,
      changed: changedKeys,
      releaseDelta: changedKeys.includes('releaseTag'),
      leaseDelta: changedKeys.includes('leaseSlot') || changedKeys.includes('lpar'),
      stepDelta: changedKeys.includes('firstFailed'),
      newTests: cmp?.newFailedTests.length ?? 0,
      firstFailed: a.firstFailed,
    };
    rows.push(row);
    console.log(JSON.stringify(row));
  } catch (e) {
    const row = { ok: false, job: short, error: e instanceof Error ? e.message : String(e) };
    rows.push(row);
    console.log(JSON.stringify(row));
  }
}

console.log(`PASS ${ok}/${URLS.length} (compare completed)`);
console.log(`found last green: ${foundGreen}/${URLS.length}`);
const withDelta = rows.filter((r) => r.green && (r.changed || []).length > 0).length;
console.log(`with field deltas: ${withDelta}`);
process.exit(ok === URLS.length && foundGreen >= 10 ? 0 : 1);
