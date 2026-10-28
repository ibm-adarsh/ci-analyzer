import { analyzeExecution } from '../src/lib/analyze';
import { buildJobFacets } from '../src/lib/jobFacets';
import { resolveLpar } from '../src/lib/lparResolve';
import { parseProwUrl } from '../src/lib/url';

const jobs: [string, string][] = [
  [
    'serial z-z',
    'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-5.0-ocp-e2e-serial-ovn-remote-libvirt-multi-z-z/2107441095997657088',
  ],
  [
    'upgrade z-z',
    'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-5.0-upgrade-from-nightly-4.22-ocp-ovn-remote-libvirt-multi-z-z/2107456138294333440',
  ],
  [
    'fips+tp z-z',
    'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-4.23-ocp-fips-ovn-techpreview-multi-z-z/2107396006764089344',
  ],
  [
    'agent z-z',
    'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-5.0-ocp-e2e-ovn-agent-remote-libvirt-multi-z-z/2114265916643479552',
  ],
  [
    'hetero z-xz 5.0',
    'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-5.0-ocp-e2e-ovn-remote-libvirt-multi-z-xz/2114879816971849728',
  ],
  [
    'image-ecosystem',
    'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-5.0-ocp-image-ecosystem-ovn-remote-libvirt-multi-z-z/2114250702833324032',
  ],
  [
    'hetero z-za 5.1',
    'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-5.1-ocp-e2e-ovn-remote-libvirt-multi-z-za/2114955272370786304',
  ],
  [
    'hetero z-xz 5.1',
    'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-5.1-ocp-e2e-ovn-remote-libvirt-multi-z-xz/2114879819492626432',
  ],
  [
    'fips z-z 5.0',
    'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-5.0-ocp-fips-ovn-remote-libvirt-multi-z-z/2104029812044599296',
  ],
];

let bad = 0;
for (const [label, url] of jobs) {
  const p = parseProwUrl(url);
  if (!p) {
    console.log('\n##', label, 'FAIL parse');
    bad++;
    continue;
  }
  const a = await analyzeExecution(p);
  const lpar = a.leaseSlot ? resolveLpar(a.leaseSlot, a.lease) : null;
  const facets = buildJobFacets(a.meta)
    .map((f) => `${f.label}=${f.value}`)
    .join(' | ');
  console.log('\n##', label);
  console.log('  result:', a.result, '| workflow:', a.meta.workflow);
  console.log('  facets:', facets);
  console.log(
    '  lease:',
    a.leaseSlot,
    '→',
    lpar?.lpar,
    lpar?.vxlanBridge || '',
    lpar?.hostnameAdditional?.split('.')[0] || '',
  );
  console.log('  phases:', JSON.stringify(a.phaseStatus), 'firstFailed:', a.firstFailed);

  const checks: string[] = [];
  if (/z-z/.test(p.jobName) && !/z-za|z-xz/.test(p.jobName) && a.meta.topologyKind !== 'homogeneous')
    checks.push('topo');
  if (/z-za|z-xz/.test(p.jobName) && a.meta.topologyKind !== 'heterogeneous')
    checks.push('topo-hetero');
  if (/fips/.test(p.jobName) && !a.meta.fips) checks.push('fips');
  if (/techpreview/.test(p.jobName) && !a.meta.techPreview) checks.push('tp');
  if (/\bagent\b/.test(p.jobName) && a.meta.installerKind !== 'agent') checks.push('agent');
  if (/serial/.test(p.jobName) && a.meta.testType !== 'conformance-serial') checks.push('serial');
  if (/image-ecosystem/.test(p.jobName) && a.meta.testType !== 'image-ecosystem')
    checks.push('ecosystem');
  if (/upgrade-from/.test(p.jobName) && a.meta.testType !== 'upgrade') checks.push('upgrade');
  if (/z-xz/.test(p.jobName) && /nightly-5\.0/.test(p.jobName)) {
    if (a.meta.workflow !== 'openshift-e2e-libvirt-heterogeneous-vpn')
      checks.push(`wf-5.0-xz got ${a.meta.workflow}`);
  }
  if (/z-xz/.test(p.jobName) && /nightly-5\.1/.test(p.jobName)) {
    if (a.meta.workflow !== 'openshift-e2e-libvirt-upi-heterogeneous')
      checks.push(`wf-5.1-xz got ${a.meta.workflow}`);
  }
  if (/z-za/.test(p.jobName) && a.meta.workflow !== 'openshift-e2e-libvirt-heterogeneous-vpn')
    checks.push(`wf-za got ${a.meta.workflow}`);
  if (!a.meta.workflow) checks.push('workflow');

  if (checks.length) {
    console.log('  FAIL', checks.join(','));
    bad++;
  } else {
    console.log('  OK');
  }
}
console.log('\nbad=', bad, '/', jobs.length);
process.exit(bad ? 1 : 0);
