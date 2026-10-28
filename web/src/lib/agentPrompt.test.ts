import { describe, expect, it } from 'vitest';
import type { DebugAnalysis } from './analyze';
import {
  buildAgentPrompt,
  buildGoogleAiModeQuery,
  buildGoogleAskBrief,
  GOOGLE_AI_MODE_MAX_CHARS,
  GOOGLE_ASK_MAX_CHARS,
  googleAiModeAskUrl,
} from './agentPrompt';

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
      hypotheses: [],
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
          url: 'https://github.com/openshift/release/blob/main/ci-operator/config/openshift/multiarch/x.yaml',
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
        patterns: [],
        failureSnippet: null,
        logTail: Array.from({ length: 90 }, (_, i) => `line-${i + 1}`).join('\n') + '\nbootstrap failed to complete',
        stepBase:
          'https://storage.googleapis.com/test-platform-results-public/logs/job/1/artifacts/e2e/upi-install-libvirt',
        keyArtifacts: [
          {
            label: 'artifacts/.openshift_install.log',
            url: 'https://storage.googleapis.com/test-platform-results-public/logs/job/1/artifacts/e2e/upi-install-libvirt/artifacts/.openshift_install.log',
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
    leaseSlot: 'libvirt-s390x-0-1',
    lease: {
      slot: 'libvirt-s390x-0-1',
      pool: 'libvirt-s390x-vpn-quota-slice',
      source: 'ci-operator build-log.txt',
      hostname: 'lnxocp01',
      qemuUri: 'qemu+tcp://lnxocp01/system',
      connectionSource: 'upi-libvirt-cleanup-pre/build-log.txt',
    },
    progressSummary: 'Failed at upi-install-libvirt',
    testFailures: null,
    phaseTimings: [
      {
        phase: 'pre',
        label: 'PRE',
        seconds: 600,
        timedSteps: 1,
        stepCount: 11,
        passedCount: 10,
        failedCount: 1,
        pendingCount: 0,
        status: 'failed',
      },
      {
        phase: 'test',
        label: 'TEST',
        seconds: 0,
        timedSteps: 0,
        stepCount: 2,
        passedCount: 0,
        failedCount: 0,
        pendingCount: 2,
        status: 'pending',
      },
      {
        phase: 'post',
        label: 'POST',
        seconds: 0,
        timedSteps: 0,
        stepCount: 5,
        passedCount: 0,
        failedCount: 0,
        pendingCount: 5,
        status: 'pending',
      },
    ],
  };
  return { ...base, ...partial };
}

describe('buildAgentPrompt', () => {
  it('is plain text with full context for IBM BOB', () => {
    const prompt = buildAgentPrompt(sample());
    expect(prompt).toContain('Please analyse this IBM Z');
    expect(prompt).toContain('prow.ci.openshift.org');
    expect(prompt).toContain('upi-install-libvirt');
    expect(prompt).toContain('build-log.txt:');
    expect(prompt).toContain('.openshift_install.log:');
    expect(prompt).toContain('Last 80 lines of build-log.txt:');
    expect(prompt).toContain('bootstrap failed to complete');
    expect(prompt).not.toContain('line-1\n'); // truncated head of 90-line log
    expect(prompt).toContain('line-12\n'); // within last 80 of 91 lines
    expect(prompt).toContain('Workflow status');
    expect(prompt).toContain('Diagnosis facts');
    expect(prompt).toContain('First failing step: upi-install-libvirt');
    expect(prompt).toContain('IBM BOB');
    expect(prompt).not.toMatch(/^#/m);
    expect(prompt).not.toContain('##');
    expect(prompt).not.toContain('**');
    expect(prompt).toContain('What I need from you');
    expect(prompt).toContain('qemu+tcp://lnxocp01/system');
  });
});

describe('buildGoogleAskBrief', () => {
  it('stays compact for clipboard / Gemini paste', () => {
    const brief = buildGoogleAskBrief(sample());
    expect(brief.length).toBeLessThanOrEqual(GOOGLE_ASK_MAX_CHARS);
    expect(brief).toContain('Concise root-cause');
    expect(brief).toContain('upi-install-libvirt');
    expect(brief).toContain('prow.ci.openshift.org');
  });
});

describe('buildGoogleAiModeQuery', () => {
  it('fits AI Mode and encodes into a udm=50 URL', () => {
    const q = buildGoogleAiModeQuery(sample());
    expect(q.length).toBeLessThanOrEqual(GOOGLE_AI_MODE_MAX_CHARS);
    expect(q).toContain('IBM Z OpenShift CI failure');
    expect(q).toContain('upi-install-libvirt');
    expect(q).not.toMatch(/\n/);
    const url = googleAiModeAskUrl(q);
    expect(url.startsWith('https://www.google.com/search?udm=50&hl=en&q=')).toBe(true);
    expect(url).toContain(encodeURIComponent('upi-install-libvirt'));
    expect(url).not.toContain('aistudio.google.com');
  });
});
