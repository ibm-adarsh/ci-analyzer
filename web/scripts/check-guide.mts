import { GUIDE_WORKFLOWS, workflowByJobHints } from '../src/data/workflowGuide';

for (const w of GUIDE_WORKFLOWS) {
  const pre = w.steps.filter((s) => s.phase === 'pre').length;
  const test = w.steps.filter((s) => s.phase === 'test').length;
  const post = w.steps.filter((s) => s.phase === 'post').length;
  console.log(
    w.id.padEnd(12),
    `| steps=${w.steps.length} pre=${pre} test=${test} post=${post} | ${w.name}`,
  );
}
const checks = [
  ['z-za', workflowByJobHints('…libvirt-multi-z-za').id === 'hetero-vpn'],
  [
    '5.0 z-xz',
    workflowByJobHints('nightly-5.0-…libvirt-multi-z-xz').id === 'hetero-vpn',
  ],
  [
    '5.1 z-xz',
    workflowByJobHints('nightly-5.1-…libvirt-multi-z-xz').id === 'hetero',
  ],
  ['fips', workflowByJobHints('ocp-fips-ovn-remote-libvirt-multi-z-z').id === 'vpn-fips'],
  ['vpn', workflowByJobHints('ocp-e2e-ovn-remote-libvirt-multi-z-z').id === 'vpn'],
];
let bad = 0;
for (const [label, ok] of checks) {
  console.log(ok ? 'OK' : 'FAIL', label);
  if (!ok) bad++;
}
process.exit(bad ? 1 : 0);
