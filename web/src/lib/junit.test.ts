import { describe, expect, it } from 'vitest';
import {
  classifySuite,
  extractSuiteTag,
  isStabilityWrapperTest,
  parseBlockingFailuresFromLog,
  parseFailedTestsFromJunitXml,
  parseJunitFilenamesFromLog,
  parseSuiteRunSummary,
  parseTestFailuresSummaryJson,
} from './junit';

const SAMPLE_LOG = `
Writing JUnit report to /logs/artifacts/junit/e2e-monitor-tests__20261012-014841.xml
Blocking test failures:

	* [sig-node] Lifecycle Sleep Hook when create a pod with lifecycle hook using sleep action ignore terminated container [Suite:openshift/conformance/parallel] [Suite:k8s]

Writing JUnit report to /logs/artifacts/junit/junit_e2e__20261012-014841.xml
Suite run returned error: 1 blocking fail, 0 informing fail, 1267 pass, 1886 skip (1h25m19s)
error: error running a test suite: 1 blocking fail, 0 informing fail, 1267 pass, 1886 skip (1h25m19s)
`;

describe('junit suite classification', () => {
  it('reads Suite tags and junit filenames', () => {
    expect(
      classifySuite(
        '[sig-node] foo [Suite:openshift/conformance/parallel]',
        'junit_e2e__x.xml',
      ),
    ).toBe('conformance-parallel');
    expect(
      classifySuite('[sig-api] bar [Suite:openshift/conformance/serial]', null),
    ).toBe('conformance-serial');
    expect(classifySuite('invariant alert', 'e2e-monitor-tests__x.xml')).toBe('monitor');
    expect(classifySuite('upgrade worker', 'junit_upgrade__x.xml')).toBe('upgrade');
    expect(extractSuiteTag('[x] [Suite:openshift/conformance/parallel]')).toBe(
      'openshift/conformance/parallel',
    );
  });

  it('parses blocking failures and suite summary from build-log', () => {
    const blocking = parseBlockingFailuresFromLog(SAMPLE_LOG);
    expect(blocking).toHaveLength(1);
    expect(blocking[0].suite).toBe('conformance-parallel');
    expect(blocking[0].severity).toBe('blocking');
    expect(parseSuiteRunSummary(SAMPLE_LOG)).toEqual({
      blockingFail: 1,
      informingFail: 0,
      pass: 1267,
      skip: 1886,
    });
    expect(parseJunitFilenamesFromLog(SAMPLE_LOG).sort()).toEqual([
      'e2e-monitor-tests__20261012-014841.xml',
      'junit_e2e__20261012-014841.xml',
    ]);
  });

  it('parses failed testcases from junit xml', () => {
    const xml = `<?xml version="1.0"?>
<testsuite name="openshift-tests" tests="3" failures="2" skipped="0">
  <testcase name="ok case" time="1"></testcase>
  <testcase name="[sig-node] fail A [Suite:openshift/conformance/parallel]" time="2">
    <failure message="boom">stack</failure>
  </testcase>
  <testcase name="monitor flake" time="0">
    <failure message="inv">x</failure>
  </testcase>
</testsuite>`;
    const fails = parseFailedTestsFromJunitXml(xml, 'junit_e2e__t.xml');
    expect(fails).toHaveLength(2);
    expect(fails[0].suite).toBe('conformance-parallel');
    expect(fails[1].name).toBe('monitor flake');
  });

  it('recognizes upgrade stability wrapper test names', () => {
    expect(
      isStabilityWrapperTest('Cluster should be stable after installation is complete'),
    ).toBe(true);
    expect(
      isStabilityWrapperTest('Cluster should be stable before test is started'),
    ).toBe(true);
    expect(
      isStabilityWrapperTest(
        '[Monitor:audit-log-analyzer][sig-api-machinery] API LBs follow /readyz',
      ),
    ).toBe(false);
  });

  it('parses test-failures-summary JSON as authoritative blocking failures', () => {
    const json = JSON.stringify({
      Tests: [
        {
          Test: {
            Name: '[Monitor:audit-log-analyzer][sig-api-machinery][Feature:APIServer] API LBs follow /readyz of kube-apiserver and stop sending requests before server shutdowns for external clients',
          },
          Suite: { Name: 'openshift-tests-upgrade' },
          Status: 12,
        },
      ],
      TestCount: 2186,
    });
    const fails = parseTestFailuresSummaryJson(json, 'upgrade');
    expect(fails).toHaveLength(1);
    expect(fails[0].severity).toBe('blocking');
    expect(fails[0].source).toBe('failures-summary');
    expect(fails[0].suite).toBe('monitor');
    expect(fails[0].name).toContain('API LBs follow /readyz');
    expect(parseTestFailuresSummaryJson('{"Tests":[]}')).toEqual([]);
    expect(parseTestFailuresSummaryJson('not-json')).toEqual([]);
  });
});
