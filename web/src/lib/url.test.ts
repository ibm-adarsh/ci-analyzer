import { describe, expect, it } from 'vitest';
import { executionRoute, parseExecutionRoute, parseProwUrl } from './url';
import { classifyArch, isIbmZJob, parseJobMeta } from './meta';
import { buildDiagnosis } from './diagnosis';

describe('parseProwUrl', () => {
  it('parses periodic logs URLs', () => {
    const u =
      'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-5.0-ocp-e2e-serial-ovn-remote-libvirt-multi-z-z/2107441095997657088';
    const p = parseProwUrl(u);
    expect(p?.bucket).toBe('test-platform-results-public');
    expect(p?.buildId).toBe('2107441095997657088');
    expect(p?.jobName).toContain('z-z');
  });

  it('parses pr-logs rehearse URLs', () => {
    const u =
      'https://prow.ci.openshift.org/view/gs/test-platform-results-public/pr-logs/pull/openshift_release/86277/rehearse-86277-periodic-ci-openshift-multiarch-main-nightly-5.1-ocp-e2e-ovn-remote-libvirt-multi-z-za/2107481951748231168';
    const p = parseProwUrl(u);
    expect(p?.gcsPath).toContain('pr-logs/pull');
    expect(p?.jobName).toContain('z-za');
  });

  it('rejects invalid URLs', () => {
    expect(parseProwUrl('https://example.com')).toBeNull();
  });
});

describe('execution routes', () => {
  it('round-trips bucket/path', () => {
    const path =
      'logs/periodic-ci-openshift-multiarch-main-nightly-5.0-ocp-e2e-serial-ovn-remote-libvirt-multi-z-z/2107441095997657088';
    const route = executionRoute('test-platform-results-public', path);
    const parts = route.split('/execution/')[1].split('/');
    const parsed = parseExecutionRoute(parts[0], parts.slice(1).join('/'));
    expect(parsed?.buildId).toBe('2107441095997657088');
    expect(parsed?.jobName).toContain('z-z');
  });
});

describe('meta classification', () => {
  it('classifies z-z / z-za / s390x', () => {
    expect(classifyArch('…libvirt-multi-z-z')).toBe('multi-arch-homogeneous');
    expect(classifyArch('…libvirt-multi-z-za')).toBe('multi-arch-heterogeneous');
    expect(classifyArch('…remote-libvirt-s390x')).toBe('single-arch-s390x');
    expect(isIbmZJob('periodic-ci-openshift-multiarch-main-nightly-5.0-ocp-e2e-ovn-remote-libvirt-s390x')).toBe(
      true,
    );
  });

  it('only claims libvirt workflow when present', () => {
    expect(parseJobMeta('foo-libvirt-multi-z-z').workflow).toBe('openshift-e2e-libvirt-vpn');
    expect(parseJobMeta('install-analysis-all-s390x').workflow).toBeNull();
  });

  it('maps cluster profile / workflow from job name heuristics', () => {
    expect(parseJobMeta('…libvirt-multi-z-z').profile).toBe('libvirt-s390x-vpn');
    expect(parseJobMeta('…libvirt-multi-z-za').profile).toBe('libvirt-s390x-vpn-arm64');
    expect(parseJobMeta('…libvirt-multi-z-xz').profile).toBe('libvirt-s390x-amd64');
    expect(parseJobMeta('…libvirt-multi-z-zx').profile).toBe('libvirt-s390x-amd64');
    expect(parseJobMeta('…libvirt-multi-z-zx').topologyShort).toBe(
      'Heterogeneous (z-xz)',
    );
    expect(parseJobMeta('nightly-5.0-…libvirt-multi-z-xz').profile).toBe(
      'libvirt-s390x-vpn-amd64',
    );
    expect(parseJobMeta('…libvirt-multi-z-za').workflow).toBe(
      'openshift-e2e-libvirt-heterogeneous-vpn',
    );
    expect(parseJobMeta('…libvirt-multi-z-xz').workflow).toBe(
      'openshift-e2e-libvirt-upi-heterogeneous',
    );
    expect(parseJobMeta('…libvirt-multi-z-zx').workflow).toBe(
      'openshift-e2e-libvirt-upi-heterogeneous',
    );
    expect(parseJobMeta('nightly-5.0-…libvirt-multi-z-xz').workflow).toBe(
      'openshift-e2e-libvirt-heterogeneous-vpn',
    );
    expect(parseJobMeta('…e2e-agent-ibmz-sno').topologyShort).toBe(
      'Agent SNO (ibmz)',
    );
    expect(parseJobMeta('…fips…libvirt-multi-z-z').workflow).toBe(
      'openshift-e2e-libvirt-vpn-fips',
    );
    expect(parseJobMeta('…ocp-image-ecosystem…libvirt-multi-z-z').testType).toBe(
      'image-ecosystem',
    );
    const agent = parseJobMeta('…agent-remote-libvirt-multi-z-z');
    expect(agent.installerKind).toBe('agent');
    expect(agent.testType).toBe('conformance-parallel');
    expect(agent.topologyShort).toBe('Homogeneous (z-z)');
    expect(parseJobMeta('…upgrade-from-nightly-4.14-ocp-ovn-remote-libvirt-s390x').fromVersion).toBe(
      '4.14',
    );
    expect(parseJobMeta('…fips…techpreview…libvirt-multi-z-z').techPreview).toBe(true);
    expect(parseJobMeta('…fips…techpreview…libvirt-multi-z-z').fips).toBe(true);
  });
});

describe('vpn workflow pending', () => {
  it('lists openshift-e2e-libvirt-test after conf in configured order', async () => {
    const { VPN_WORKFLOW_STEPS } = await import('../data/vpnWorkflow');
    const names = VPN_WORKFLOW_STEPS.map((s) => s.name);
    const conf = names.indexOf('openshift-e2e-libvirt-conf');
    const test = names.indexOf('openshift-e2e-libvirt-test');
    expect(conf).toBeGreaterThan(-1);
    expect(test).toBeGreaterThan(conf);
    expect(names).toContain('upi-libvirt-cleanup-post');
  });
});

describe('diagnosis', () => {
  it('detects Boskos lease failure when no step dirs exist', () => {
    const d = buildDiagnosis({
      result: 'FAILED',
      firstFailed: null,
      secondaryFailed: [],
      steps: {},
      artBase: 'https://storage.example/bucket/logs/job/1/artifacts',
      raw: 'https://prow.example/view/gs/bucket/logs/job/1',
      counts: { passed: 0, failed: 0, skipped: 0, unknown: 0, running: 0 },
      prowLog:
        'Acquiring leases for test ocp-e2e-ovn-remote-libvirt-multi-z-zx: [libvirt-s390x-amd64-quota-slice]\n' +
        'error: Failed to acquire resource, current capacity: 0 free, 1 leased\n' +
        'failed to acquire lease for "libvirt-s390x-amd64-quota-slice": resources not found',
    });
    expect(d.confidence).toBe('high');
    expect(d.summary).toMatch(/lease/i);
    expect(d.hypotheses.some((h) => h.tag === 'lease')).toBe(true);
    expect(d.evidence[0]?.url).toBe(
      'https://storage.example/bucket/logs/job/1/build-log.txt',
    );
  });

  it('prefers non-best-effort primary and links evidence', () => {
    const d = buildDiagnosis({
      result: 'FAILED',
      firstFailed: 'openshift-e2e-libvirt-test',
      secondaryFailed: ['gather-must-gather'],
      steps: {
        'openshift-e2e-libvirt-test': {
          status: 'failed',
          duration: 120,
          finJson: { passed: false },
          logTail: 'Failing tests:\n[sig-foo]',
          logText: 'failed due to a MonitorTest failure\nFailing tests:\n[sig-foo]',
          patterns: [],
          failureSnippet: 'failed due to a MonitorTest failure',
          stepBase: 'https://example/openshift-e2e-libvirt-test',
        },
        'gather-must-gather': {
          status: 'failed',
          duration: 10,
          finJson: { passed: false },
          logTail: null,
          logText: null,
          patterns: [],
          failureSnippet: null,
          stepBase: 'https://example/gather-must-gather',
        },
      },
      artBase: 'https://example/artifacts/x',
      raw: 'https://prow.example/job',
      counts: { passed: 10, failed: 2, skipped: 0, unknown: 0, running: 0 },
    });
    expect(d.primaryStep).toBe('openshift-e2e-libvirt-test');
    expect(d.confidence).toBe('medium');
    expect(d.hypotheses).toHaveLength(0);
    expect(d.evidence.some((e) => e.primary)).toBe(true);
  });
});
