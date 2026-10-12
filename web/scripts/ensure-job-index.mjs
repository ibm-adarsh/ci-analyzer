#!/usr/bin/env node
/** Ensure public/data/job-index.json exists before vite build (offline-safe seed). */
import { access, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '../public/data/job-index.json');

const SEED = {
  generatedAt: new Date().toISOString(),
  bucket: 'test-platform-results-public',
  source:
    'seed index (run npm run generate:index for a fresh GCS discovery). Verified sample executions included.',
  jobNames: [
    'periodic-ci-openshift-multiarch-main-nightly-5.0-ocp-e2e-serial-ovn-remote-libvirt-multi-z-z',
    'periodic-ci-openshift-multiarch-main-nightly-5.0-upgrade-from-nightly-4.22-ocp-ovn-remote-libvirt-multi-z-z',
    'periodic-ci-openshift-multiarch-main-nightly-4.23-ocp-fips-ovn-techpreview-multi-z-z',
    'periodic-ci-openshift-multiarch-main-nightly-5.0-ocp-e2e-ovn-remote-libvirt-s390x',
  ],
  executions: [
    {
      jobName:
        'periodic-ci-openshift-multiarch-main-nightly-5.0-ocp-e2e-serial-ovn-remote-libvirt-multi-z-z',
      buildId: '2107441095997657088',
      gcsPath:
        'logs/periodic-ci-openshift-multiarch-main-nightly-5.0-ocp-e2e-serial-ovn-remote-libvirt-multi-z-z/2107441095997657088',
      prowUrl:
        'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-5.0-ocp-e2e-serial-ovn-remote-libvirt-multi-z-z/2107441095997657088',
      result: 'PASSED',
      archClass: 'multi-arch-homogeneous',
      startedAt: null,
      finishedAt: 1791299901,
      durationSec: null,
      variant: 'nightly-5.0',
      profile: 'libvirt-s390x-vpn',
      ocpVersion: '5.0',
    },
    {
      jobName:
        'periodic-ci-openshift-multiarch-main-nightly-5.0-upgrade-from-nightly-4.22-ocp-ovn-remote-libvirt-multi-z-z',
      buildId: '2107456138294333440',
      gcsPath:
        'logs/periodic-ci-openshift-multiarch-main-nightly-5.0-upgrade-from-nightly-4.22-ocp-ovn-remote-libvirt-multi-z-z/2107456138294333440',
      prowUrl:
        'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-5.0-upgrade-from-nightly-4.22-ocp-ovn-remote-libvirt-multi-z-z/2107456138294333440',
      result: 'FAILED',
      archClass: 'multi-arch-homogeneous',
      startedAt: null,
      finishedAt: 1791300969,
      durationSec: null,
      variant: 'nightly-5.0-upgrade-from-nightly-4.22',
      profile: 'libvirt-s390x-vpn',
      ocpVersion: '5.0',
    },
    {
      jobName:
        'periodic-ci-openshift-multiarch-main-nightly-4.23-ocp-fips-ovn-techpreview-multi-z-z',
      buildId: '2107396006764089344',
      gcsPath:
        'logs/periodic-ci-openshift-multiarch-main-nightly-4.23-ocp-fips-ovn-techpreview-multi-z-z/2107396006764089344',
      prowUrl:
        'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-4.23-ocp-fips-ovn-techpreview-multi-z-z/2107396006764089344',
      result: 'FAILED',
      archClass: 'multi-arch-homogeneous',
      startedAt: null,
      finishedAt: null,
      durationSec: null,
      variant: 'nightly-4.23',
      profile: 'libvirt-s390x-vpn',
      ocpVersion: '4.23',
    },
  ],
};

try {
  await access(OUT);
  console.log('job-index.json present');
} catch {
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(SEED, null, 2));
  console.log('wrote seed job-index.json');
}
