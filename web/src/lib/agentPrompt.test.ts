import { describe, expect, it } from 'vitest';
import type { DebugAnalysis } from './analyze';
import { buildAgentPrompt } from './agentPrompt';

function sample(partial?: Partial<DebugAnalysis>): DebugAnalysis {
  const base: DebugAnalysis = {
    raw: 'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-master-nightly-4.20-ocp-e2e-ovn-remote-libvirt-s390x/1980000000000000000',
    jobName:
      'periodic-ci-openshift-multiarch-master-nightly-4.20-ocp-e2e-ovn-remote-libvirt-s390x',
    buildId: '1980000000000000000',
    bucket: 'test-platform-results-public',
    gcsPath:
      'logs/periodic-ci-openshift-multiarch-master-nightly-4.20-ocp-e2e-ovn-remote-libvirt-s390x/1980000000000000000',
    base: 'https://storage.googleapis.com/test-platform-results-public/logs/job/1',
    artBase: 'https://storage.googleapis.com/test-platform-results-public/logs/job/1/artifacts/e2e',
    testSubdir: 'e2e',
    started: { timestamp: 1700000000 },
    finished: { passed: false, timestamp: 1700003600, result: 'FAILURE' },
    prowjob: null,
    prowLog: null,
    steps: {},
    meta: {
      isRehearse: false,
      ocpVersion: '4.20',
      fromVersion: null,
      testType: 'e2e',
      installer: 'upi-libvirt',
      fips: false,
      techPreview: false,
      topology: 'HA',
      arch: 's390x',
      profile: 'libvirt-s390x-vpn',
      workflow: 'openshift-e2e-libvirt-vpn',
      archClass: 'single-arch-s390x',
    },
    result: 'FAILED',
    counts: { passed: 1, failed: 1, running: 0, unknown: 0, skipped: 0 },
    firstFailed: 'upi-install-libvirt',
    secondaryFailed: [],
    phaseStatus: { pre: 'failed', test: 'pending', post: 'pending' },
    orderedForFailure: ['upi-install-libvirt'],
    diagnosis: {
      summary: 'Install failed',
      facts: ['First failing step: upi-install-libvirt'],
      hypotheses: [{ tag: 'install', text: 'Installer exited non-zero' }],
      nextSteps: [],
      evidence: [],
      primaryStep: 'upi-install-libvirt',
      secondarySteps: [],
      confidence: 'medium',
    },
    configLinks: {
      org: 'openshift',
      repo: 'multiarch',
      branch: 'master',
      variant: 'nightly-4.20',
      workflow: 'openshift-e2e-libvirt-vpn',
      profile: 'libvirt-s390x-vpn',
      archClass: 'single-arch-s390x',
      prowType: 'periodic',
      links: [
        {
          label: 'ci-operator config',
          url: 'https://github.com/openshift/release/blob/master/ci-operator/config/openshift/multiarch/x.yaml',
          group: 'config',
        },
      ],
    },
    workflow: [
      {
        name: 'upi-install-libvirt',
        phase: 'pre',
        status: 'failed',
        observed: true,
        duration: 600,
        patterns: [{ category: 'bootstrap', hint: 'bootstrap failed' }],
        failureSnippet: 'level=error msg="Bootstrap failed"',
        logTail: 'line1\nline2\nBootstrap failed\n',
        stepBase:
          'https://storage.googleapis.com/test-platform-results-public/logs/job/1/artifacts/e2e/upi-install-libvirt',
        keyArtifacts: [
          {
            label: '.openshift_install.log',
            url: 'https://storage.googleapis.com/test-platform-results-public/logs/job/1/artifacts/e2e/upi-install-libvirt/.openshift_install.log',
          },
        ],
      },
      {
        name: 'openshift-e2e-libvirt-test',
        phase: 'test',
        status: 'pending',
        observed: false,
        duration: null,
        patterns: [],
        failureSnippet: null,
        logTail: null,
        stepBase: null,
        keyArtifacts: [],
      },
    ],
    currentStep: null,
    release: {
      tag: '4.20.0-0.nightly-multi-2025-01-01-120000',
      createdAt: '2025-01-01T12:00:00Z',
      source: 'prow-log',
      pullSpec: 'registry.ci.openshift.org/ocp/4.20:tests',
      installTarget: null,
    },
    leaseSlot: 'libvirt-s390x-vpn-1',
    progressSummary: 'Failed at upi-install-libvirt',
    phaseTimings: [
      { phase: 'pre', label: 'PRE', seconds: 600, timedSteps: 1, stepCount: 11, status: 'failed' },
      { phase: 'test', label: 'TEST', seconds: 0, timedSteps: 0, stepCount: 2, status: 'pending' },
      { phase: 'post', label: 'POST', seconds: 0, timedSteps: 0, stepCount: 5, status: 'pending' },
    ],
  };
  return { ...base, ...partial };
}

describe('buildAgentPrompt', () => {
  it('includes job link, failed step artifacts, and agent instructions', () => {
    const prompt = buildAgentPrompt(sample(), 'focused');
    expect(prompt).toContain('Please analyse this IBM Z');
    expect(prompt).toContain('prow.ci.openshift.org');
    expect(prompt).toContain('upi-install-libvirt');
    expect(prompt).toContain('build-log.txt');
    expect(prompt).toContain('.openshift_install.log');
    expect(prompt).toContain('libvirt-s390x-vpn');
    expect(prompt).toContain('What I need from you');
    expect(prompt).toContain('Bootstrap failed');
  });

  it('full mode includes diagnosis facts', () => {
    const prompt = buildAgentPrompt(sample(), 'full');
    expect(prompt).toContain('Diagnosis facts');
    expect(prompt).toContain('First failing step: upi-install-libvirt');
  });
});
