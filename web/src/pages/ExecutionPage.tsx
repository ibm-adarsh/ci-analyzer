import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { analyzeExecution, type DebugAnalysis, type WorkflowStepView } from '../lib/analyze';
import { buildAgentPrompt } from '../lib/agentPrompt';
import {
  compareToLastGreen,
  type GreenCompareResult,
} from '../lib/compare';
import { fmtDur } from '../lib/gcs';
import { releaseBrowserLinks } from '../lib/release';
import { parseExecutionRoute } from '../lib/url';
import {
  HETERO_ALIASES,
  HETERO_VPN_WORKFLOW_STEPS,
  UPI_HETERO_WORKFLOW_STEPS,
  VPN_WORKFLOW_STEPS,
  WORKFLOW_DOCS,
  WORKFLOW_SOURCE,
  type WorkflowPhase,
} from '../data/vpnWorkflow';
import { STEPS_CI } from '../data/workflow';
import { StatusBadge } from '../components/StatusBadge';
import { WorkflowGuideView } from '../components/WorkflowGuideView';
import { resolveLpar } from '../lib/lparResolve';
import { buildJobFacets } from '../lib/jobFacets';
import type { FailedTestCase, TestFailureReport } from '../lib/junit';

/** Map observed GCS / hetero step name onto the workflow leaf used for UI ids. */
function workflowStepKey(name: string | null | undefined): string | null {
  if (!name) return null;
  return HETERO_ALIASES[name] || name;
}

const PHASE_BLURB: Record<
  WorkflowPhase,
  { title: string; blurb: string }
> = {
  pre: {
    title: 'PRE phase failed',
    blurb:
      'Failure happened before tests — usually lease cleanup, cluster config, or OCP installation.',
  },
  test: {
    title: 'TEST phase failed',
    blurb: 'The cluster came up, but one or more product test cases failed.',
  },
  post: {
    title: 'POST phase failed',
    blurb: 'Failure during gather / must-gather / cleanup after the test run.',
  },
};

function phaseForStepName(name: string | null | undefined): WorkflowPhase | null {
  if (!name) return null;
  const canon = HETERO_ALIASES[name] || name;
  const all = [
    ...VPN_WORKFLOW_STEPS,
    ...HETERO_VPN_WORKFLOW_STEPS,
    ...UPI_HETERO_WORKFLOW_STEPS,
  ];
  const def = all.find((s) => s.name === canon || s.name === name);
  if (def) return def.phase;
  if (/gather|cleanup-post|deprovision|kdump-gather/i.test(name)) return 'post';
  if (/test|e2e/i.test(name)) return 'test';
  if (/install|conf|cleanup-pre|fips|deprovision/i.test(name)) return 'pre';
  return null;
}

/**
 * Failed tests to show in the debug panel.
 * Include both blocking and informing when we classified them (matches Prow
 * "Results for openshift/conformance/…" — e.g. 1 blocking + 5 informing).
 * Otherwise prefer blocking / non-monitor rows over raw monitor noise.
 */
function productFailedTests(report: TestFailureReport): FailedTestCase[] {
  const classified = report.failures.filter(
    (f) => f.severity === 'blocking' || f.severity === 'informing',
  );
  if (classified.length) {
    return [...classified].sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === 'blocking' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }
  const blocking = report.failures.filter((f) => f.severity === 'blocking');
  if (blocking.length) return blocking;
  return report.failures.filter(
    (f) => f.suite !== 'monitor' && f.severity !== 'informing',
  );
}

function cleanTestName(name: string): string {
  return name.replace(/\s*\[Suite:[^\]]+\]/g, '').trim();
}

function workflowDocs(name: string | null) {
  const n = name || WORKFLOW_SOURCE.name;
  const docs = WORKFLOW_DOCS[n];
  return {
    name: n,
    stepsCi: docs?.stepsCi || `${STEPS_CI}/workflow/${n}`,
    yaml: docs?.yaml || WORKFLOW_SOURCE.yaml,
  };
}

type PageTab = 'debug' | 'prompt' | 'guide';

function shortJob(name: string): string {
  return name
    .replace(/^periodic-ci-openshift-multiarch-main-nightly-/, '')
    .replace(/^periodic-ci-openshift-multiarch-master-nightly-/, '');
}

export function ExecutionPage() {
  const { bucketEnc = '', pathEnc = '' } = useParams();
  const parsed = useMemo(() => parseExecutionRoute(bucketEnc, pathEnc), [bucketEnc, pathEnc]);
  const [a, setA] = useState<DebugAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pct, setPct] = useState(0);
  const [label, setLabel] = useState('Starting…');
  const [open, setOpen] = useState<string | null>(null);
  const [tab, setTab] = useState<PageTab>('debug');
  const [showTech, setShowTech] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareBusy, setCompareBusy] = useState(false);
  const [compareLabel, setCompareLabel] = useState('');
  const [compareErr, setCompareErr] = useState<string | null>(null);
  const [compare, setCompare] = useState<GreenCompareResult | null>(null);
  const stepEls = useRef(new Map<string, HTMLElement>());

  const registerStepEl = (name: string, el: HTMLElement | null) => {
    if (el) stepEls.current.set(name, el);
    else stepEls.current.delete(name);
  };

  const jumpToStep = (name: string | null) => {
    if (!name) return;
    const key = workflowStepKey(name) || name;
    setTab('debug');
    setOpen(key);
    // Wait for expand + tab paint, then scroll into view.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = stepEls.current.get(key) || stepEls.current.get(name);
        if (!el) return;
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.remove('dbg-step-flash');
        // reflow so re-click retriggers the highlight
        void el.offsetWidth;
        el.classList.add('dbg-step-flash');
        window.setTimeout(() => el.classList.remove('dbg-step-flash'), 1400);
      });
    });
  };

  useEffect(() => {
    if (!parsed) {
      setError('Invalid execution path.');
      return;
    }
    let cancelled = false;
    setError(null);
    setA(null);
    setCompare(null);
    setCompareErr(null);
    setCompareOpen(false);
    setCompareBusy(false);
    void analyzeExecution(parsed, (p, l) => {
      if (!cancelled) {
        setPct(p);
        setLabel(l);
      }
    })
      .then((res) => {
        if (cancelled) return;
        setA(res);
        setOpen(workflowStepKey(res.firstFailed) || res.currentStep || null);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [parsed]);

  if (!parsed) {
    return (
      <div className="error-banner">
        Invalid URL. <Link to="/">Back</Link>
      </div>
    );
  }
  if (error) {
    return (
      <div className="error-banner">
        {error}
        <div style={{ marginTop: 8 }}>
          <Link to="/">Paste another URL</Link>
        </div>
      </div>
    );
  }
  if (!a) {
    return (
      <section className="dbg-load">
        <p className="dbg-kicker">Loading</p>
        <h2>Fetching job evidence…</h2>
        <p className="muted">{label}</p>
        <div className="progress">
          <i style={{ width: `${pct}%` }} />
        </div>
        <p className="mono muted" style={{ fontSize: 12 }}>
          {shortJob(parsed.jobName)}
        </p>
      </section>
    );
  }

  const tone = a.result === 'PASSED' ? 'pass' : a.result === 'FAILED' ? 'fail' : 'run';
  const start = a.started?.timestamp
    ? new Date(a.started.timestamp * 1000).toUTCString()
    : '—';
  const dur =
    a.started?.timestamp && a.finished?.timestamp
      ? fmtDur(a.finished.timestamp - a.started.timestamp)
      : a.result === 'RUNNING' && a.started?.timestamp
        ? `${fmtDur(Math.floor(Date.now() / 1000) - a.started.timestamp)} so far`
        : '—';
  const lpar = a.leaseSlot ? resolveLpar(a.leaseSlot, a.lease) : null;
  const releaseLinks = releaseBrowserLinks(a.release?.tag || null);
  const pending = a.workflow.filter((w) => w.status === 'pending' || w.status === 'current').length;
  const failed = a.workflow.filter((w) => w.status === 'failed').length;
  const passed = a.workflow.filter((w) => w.status === 'passed').length;
  const wfName = a.meta.workflow || WORKFLOW_SOURCE.name;
  const wfDocs = workflowDocs(wfName);
  const configUrl = a.configLinks.links.find((l) => l.label.includes('ci-operator config'))?.url;

  const runCompare = () => {
    setCompareOpen(true);
    setTab('debug');
    if (compareBusy) return;
    setCompareBusy(true);
    setCompareErr(null);
    setCompareLabel('Looking up previous successful builds…');
    void compareToLastGreen(a, setCompareLabel)
      .then((res) => {
        setCompare(res);
        if (!res) setCompareErr('No earlier successful run found for this job (within recent history).');
      })
      .catch((e) => {
        setCompare(null);
        setCompareErr(e instanceof Error ? e.message : String(e));
      })
      .finally(() => setCompareBusy(false));
  };

  const facets = buildJobFacets(a.meta);

  return (
    <div className="dbg">
      <div className="dbg-back">
        <Link to="/">← Paste another job URL</Link>
      </div>

      <header className={`dbg-hero tone-${tone}`}>
        <div className="dbg-hero-main">
          <div className="dbg-hero-top">
            <StatusBadge status={a.result} />
            <span className="dbg-build mono">{a.buildId}</span>
            <span className="dbg-total mono">{dur}</span>
          </div>
          <h1 title={a.jobName}>{shortJob(a.jobName)}</h1>
          <p className="dbg-summary">{a.progressSummary}</p>
          <div className="dbg-facets" aria-label="Job characteristics">
            {facets.map((f) => (
              <div key={f.id} className={`dbg-facet tone-${f.tone || 'default'}`}>
                <span>{f.label}</span>
                <strong title={f.value}>{f.value}</strong>
              </div>
            ))}
          </div>
          {lpar ? (
            <div className="dbg-lease-strip" aria-label="Lease and LPAR">
              <span className="dbg-lease-k">Lease</span>
              <code>{a.leaseSlot}</code>
              <span className="dbg-lease-arrow" aria-hidden>
                →
              </span>
              <strong>{lpar.lpar}</strong>
              {lpar.hostnameAdditional ? (
                <>
                  <span className="muted">+</span>
                  <strong title="Additional hypervisor">
                    {lpar.hostnameAdditional.split('.')[0]}
                  </strong>
                </>
              ) : null}
              {lpar.vxlanBridge ? (
                <em className="dbg-lease-note">VXLAN {lpar.vxlanBridge}</em>
              ) : null}
              {!lpar.observed ? <em className="muted">inferred</em> : null}
            </div>
          ) : null}
        </div>
        <div className="dbg-hero-actions">
          <a className="btn btn-primary" href={a.raw} target="_blank" rel="noreferrer">
            Open in Prow
          </a>
          {a.firstFailed && (
            <button type="button" className="btn" onClick={() => jumpToStep(a.firstFailed)}>
              Jump to failure
            </button>
          )}
          {a.currentStep && a.result === 'RUNNING' && (
            <button type="button" className="btn" onClick={() => jumpToStep(a.currentStep)}>
              Jump to current
            </button>
          )}
          <button
            type="button"
            className="btn"
            onClick={runCompare}
            disabled={compareBusy}
            title="Diff release, lease/LPAR, failed step, and tests vs previous SUCCESS"
          >
            {compareBusy ? 'Comparing…' : 'Compare to last green'}
          </button>
          <button type="button" className="btn" onClick={() => setTab('prompt')}>
            AI prompt
          </button>
        </div>
      </header>

      <nav className="tabs" aria-label="Job views">
        <button
          type="button"
          className={tab === 'debug' ? 'tab active' : 'tab'}
          onClick={() => setTab('debug')}
        >
          Debug
        </button>
        <button
          type="button"
          className={tab === 'prompt' ? 'tab active' : 'tab'}
          onClick={() => setTab('prompt')}
        >
          AI prompt
        </button>
        <button
          type="button"
          className={tab === 'guide' ? 'tab active' : 'tab'}
          onClick={() => setTab('guide')}
        >
          Workflow guide
        </button>
      </nav>

      {tab === 'prompt' ? (
        <AgentPromptPanel a={a} />
      ) : tab === 'guide' ? (
        <section className="panel">
          <WorkflowGuideView
            key={`${a.jobName}:${wfName}`}
            compact
            workflowName={wfName}
            jobName={a.jobName}
          />
        </section>
      ) : (
        <>
          <FailureFocusBanner a={a} onJump={jumpToStep} />

          {a.testFailures ? <TestFailuresPanel report={a.testFailures} /> : null}

          {compareOpen ? (
            <ComparePanel
              busy={compareBusy}
              label={compareLabel}
              error={compareErr}
              result={compare}
              onClose={() => setCompareOpen(false)}
              onRetry={runCompare}
            />
          ) : null}

          <section className="dbg-score" aria-label="Phase duration and step counts">
            <PhaseTimeline timings={a.phaseTimings} />
            <div className="dbg-counts" aria-label="Workflow step totals">
              <div className="dbg-count">
                <b>{passed}</b>
                <span>Passed</span>
              </div>
              <div className="dbg-count fail">
                <b>{failed}</b>
                <span>Failed</span>
              </div>
              <div className="dbg-count run">
                <b>{pending}</b>
                <span>Pending</span>
              </div>
            </div>
          </section>

          <section className="dbg-steps-panel">
            <div className="dbg-section-head">
              <h2>Workflow steps</h2>
              <div className="dbg-section-links">
                <a href={wfDocs.stepsCi} target="_blank" rel="noreferrer">
                  {wfDocs.name}
                </a>
                <a href={wfDocs.yaml} target="_blank" rel="noreferrer">
                  YAML
                </a>
              </div>
            </div>
            {(['pre', 'test', 'post'] as const).map((ph) => {
              const group = a.workflow.filter((w) => w.phase === ph);
              if (!group.length) return null;
              const timing = a.phaseTimings.find((t) => t.phase === ph);
              const phaseFailed = a.phaseStatus[ph] === 'failed';
              return (
                <div
                  key={ph}
                  className={`dbg-phase-block ph-${ph}${phaseFailed ? ' is-failed' : ''}`}
                >
                  <div className="dbg-phase-h">
                    <span className="dbg-phase-name">{ph.toUpperCase()}</span>
                    <span className={`dbg-phase-status st-${a.phaseStatus[ph]}`}>
                      {a.phaseStatus[ph]}
                    </span>
                    <span className="dbg-phase-dur mono">
                      {timing && timing.timedSteps > 0 ? fmtDur(timing.seconds) : '—'}
                    </span>
                  </div>
                  <div className="dbg-step-list">
                    {group.map((w) => (
                      <StepCard
                        key={w.name}
                        w={w}
                        open={open === w.name}
                        onToggle={() => setOpen(open === w.name ? null : w.name)}
                        registerEl={registerStepEl}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </section>

          <JobDetailsPanel
            a={a}
            start={start}
            lpar={lpar}
            wfName={wfName}
            releaseLinks={releaseLinks}
            configUrl={configUrl || null}
            open={showTech}
            onToggle={() => setShowTech((v) => !v)}
          />
        </>
      )}
    </div>
  );
}

function FailureFocusBanner({
  a,
  onJump,
}: {
  a: DebugAnalysis;
  onJump: (name: string | null) => void;
}) {
  if (a.result === 'PASSED') {
    return (
      <section className="dbg-focus tone-pass" aria-label="Job passed">
        <p className="dbg-focus-label">Result</p>
        <h2>All phases passed</h2>
        <p>PRE → TEST → POST completed successfully.</p>
      </section>
    );
  }

  if (a.result === 'RUNNING') {
    const cur = a.currentStep;
    const ph = phaseForStepName(cur);
    return (
      <section className="dbg-focus tone-run" aria-label="Job in progress">
        <p className="dbg-focus-label">In progress</p>
        <h2>
          {ph ? `${ph.toUpperCase()} phase` : 'Job'} running
          {cur ? (
            <>
              {' '}
              · <code>{cur}</code>
            </>
          ) : null}
        </h2>
        <p>{a.progressSummary}</p>
        {cur ? (
          <div className="dbg-focus-actions">
            <button type="button" className="btn btn-primary" onClick={() => onJump(cur)}>
              Jump to current step
            </button>
          </div>
        ) : null}
      </section>
    );
  }

  const failedPhases = (['pre', 'test', 'post'] as const).filter(
    (ph) => a.phaseStatus[ph] === 'failed',
  );
  const primaryPhase =
    phaseForStepName(a.firstFailed) ||
    failedPhases[0] ||
    null;

  if (!primaryPhase && !failedPhases.length) {
    return (
      <section className="dbg-focus tone-fail" aria-label="Job failed">
        <p className="dbg-focus-label">Failure</p>
        <h2>Job failed</h2>
        <p>{a.progressSummary || 'No failed step directory was found under artifacts.'}</p>
      </section>
    );
  }

  const copy = primaryPhase ? PHASE_BLURB[primaryPhase] : null;
  const failedInPhase = a.workflow.filter(
    (w) =>
      w.status === 'failed' &&
      (!primaryPhase || w.phase === primaryPhase) &&
      !w.bestEffort,
  );
  const secondaryPhases = failedPhases.filter((p) => p !== primaryPhase);

  return (
    <section className="dbg-focus tone-fail" aria-label="Failure focus">
      <p className="dbg-focus-label">Where it failed</p>
      <h2>{copy?.title || 'Job failed'}</h2>
      <p>{copy?.blurb}</p>
      {a.firstFailed ? (
        <p className="dbg-focus-step">
          Failed step: <code>{a.firstFailed}</code>
        </p>
      ) : null}
      {failedInPhase.length > 1 ? (
        <ul className="dbg-focus-steps">
          {failedInPhase.map((w) => (
            <li key={w.name}>
              <button type="button" className="dbg-focus-step-link" onClick={() => onJump(w.name)}>
                {w.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {secondaryPhases.length > 0 ? (
        <p className="dbg-focus-secondary muted">
          Also failed later: {secondaryPhases.map((p) => p.toUpperCase()).join(', ')}
        </p>
      ) : null}
      {a.firstFailed ? (
        <div className="dbg-focus-actions">
          <button type="button" className="btn btn-primary" onClick={() => onJump(a.firstFailed)}>
            Jump to failed step
          </button>
        </div>
      ) : null}
    </section>
  );
}

function TestFailuresPanel({ report }: { report: TestFailureReport }) {
  const failed = productFailedTests(report);
  if (!failed.length) return null;

  const nBlock = failed.filter((f) => f.severity === 'blocking').length;
  const nInfo = failed.filter((f) => f.severity === 'informing').length;

  const linked = new Set(
    failed.map((f) => f.junitFile).filter((n): n is string => Boolean(n)),
  );
  const junitLinks = report.junitFiles.filter((f) =>
    linked.size ? linked.has(f.name) : !/monitor/i.test(f.name),
  );

  return (
    <section className="dbg-tests" aria-label="Failed test cases">
      <div className="dbg-section-head">
        <h2>
          Failed test cases
          <span className="dbg-tests-total">{failed.length}</span>
        </h2>
      </div>
      <p className="dbg-tests-lead">
        From <code>{report.stepName}</code>
        {report.expectedSuite ? (
          <>
            {' '}
            · <code>{report.expectedSuite}</code>
          </>
        ) : null}
        {nBlock || nInfo ? (
          <>
            {' '}
            · <strong>{nBlock}</strong> blocking
            {' · '}
            <strong>{nInfo}</strong> informing
          </>
        ) : null}
      </p>
      <ul className="dbg-tests-list">
        {failed.map((t) => (
          <li key={t.name}>
            <span
              className={`dbg-tests-sev-tag sev-${t.severity === 'informing' ? 'informing' : t.severity === 'blocking' ? 'blocking' : 'unknown'}`}
            >
              {t.severity === 'informing'
                ? 'informing'
                : t.severity === 'blocking'
                  ? 'blocking'
                  : t.suiteTag || t.suite}
            </span>
            <code>{cleanTestName(t.name)}</code>
          </li>
        ))}
      </ul>
      {junitLinks.length > 0 ? (
        <div className="dbg-tests-links">
          {junitLinks.map((f) => (
            <a key={f.url} className="btn" href={f.url} target="_blank" rel="noreferrer">
              {f.name} ↗
            </a>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function ComparePanel({
  busy,
  label,
  error,
  result,
  onClose,
  onRetry,
}: {
  busy: boolean;
  label: string;
  error: string | null;
  result: GreenCompareResult | null;
  onClose: () => void;
  onRetry: () => void;
}) {
  const changed = result?.rows.filter((r) => r.changed) || [];
  return (
    <section className="dbg-compare" aria-label="Compare to last green">
      <div className="dbg-section-head">
        <h2>Compare to last green</h2>
        <div className="dbg-section-links">
          {!busy && (
            <button type="button" className="btn" onClick={onRetry}>
              Refresh
            </button>
          )}
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>

      {busy && (
        <p className="muted">
          {label || 'Analyzing previous success…'}
        </p>
      )}

      {!busy && error && !result && (
        <p className="dbg-compare-empty">{error}</p>
      )}

      {!busy && result && (
        <>
          <p className="dbg-compare-lead">
            Baseline{' '}
            <Link to={result.baseline.appPath} className="mono">
              {result.baseline.buildId}
            </Link>
            <span className="muted"> · </span>
            <a href={result.greenUrl} target="_blank" rel="noreferrer">
              Prow
            </a>
            <span className="muted"> · </span>
            <a href={result.historyUrl} target="_blank" rel="noreferrer">
              Job history
            </a>
            {result.baseline.started ? (
              <span className="muted">
                {' '}
                · green started {new Date(result.baseline.started).toUTCString()}
              </span>
            ) : null}
            {changed.length > 0 ? (
              <span className="dbg-compare-delta">
                {' '}
                · {changed.length} field{changed.length === 1 ? '' : 's'} changed
              </span>
            ) : (
              <span className="muted"> · release / lease / step match green</span>
            )}
          </p>

          <div className="dbg-compare-table-wrap">
            <table className="dbg-compare-table">
              <thead>
                <tr>
                  <th>Field</th>
                  <th>This run</th>
                  <th>Last green</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((r) => (
                  <tr key={r.key} className={r.changed ? 'changed' : undefined}>
                    <th scope="row">{r.label}</th>
                    <td>
                      <code>{r.current}</code>
                    </td>
                    <td>
                      <code>{r.baseline}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {result.newFailedTests.length > 0 && (
            <div className="dbg-compare-tests">
              <h3>
                New failed tests vs green
                <span className="dbg-tests-total">{result.newFailedTests.length}</span>
              </h3>
              <ul className="dbg-tests-list dbg-tests-list-plain">
                {result.newFailedTests.slice(0, 40).map((t) => (
                  <li key={t}>
                    <code>{cleanTestName(t)}</code>
                  </li>
                ))}
              </ul>
              {result.newFailedTests.length > 40 ? (
                <p className="muted">…and {result.newFailedTests.length - 40} more</p>
              ) : null}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function JobDetailsPanel({
  a,
  start,
  lpar,
  wfName,
  releaseLinks,
  configUrl,
  open,
  onToggle,
}: {
  a: DebugAnalysis;
  start: string;
  lpar: ReturnType<typeof resolveLpar>;
  wfName: string;
  releaseLinks: { label: string; url: string }[];
  configUrl: string | null;
  open: boolean;
  onToggle: () => void;
}) {
  const docs = workflowDocs(a.meta.workflow || wfName);
  const qemuRaw = a.lease?.qemuUri || lpar?.qemuUri || null;
  const qemu = qemuRaw
    ? qemuRaw.replace(
        /^(qemu\+tcp:\/\/)([^/:]+)/i,
        (_m, scheme: string, host: string) => `${scheme}${host.split('.')[0]}`,
      )
    : null;
  const cfgLabel = a.configLinks.variant
    ? `${a.configLinks.org}-${a.configLinks.repo}-${a.configLinks.branch}__${a.configLinks.variant}.yaml`
    : null;

  return (
    <section className="dbg-tech">
      <button
        type="button"
        className="dbg-tech-toggle"
        onClick={onToggle}
        aria-expanded={open}
      >
        <span>Job details</span>
        <span className="muted">
          {open ? 'Hide' : 'Lease, LPAR, release, config'}
        </span>
        <span aria-hidden>{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="dbg-tech-body">
          <div className="dbg-fact-grid">
            <article className="dbg-fact">
              <h3>Environment</h3>
              <dl>
                <div>
                  <dt>Cluster profile</dt>
                  <dd>
                    <code>{a.meta.profile || '—'}</code>
                  </dd>
                </div>
                <div>
                  <dt>Topology</dt>
                  <dd>
                    {a.meta.topologyShort || a.meta.topology}
                    {a.meta.workerArch ? (
                      <div className="dbg-fact-meta">Workers: {a.meta.workerArch}</div>
                    ) : null}
                  </dd>
                </div>
                <div>
                  <dt>Installer / suite</dt>
                  <dd>
                    {a.meta.installerLabel || a.meta.installer}
                    {' · '}
                    {a.meta.suiteLabel || a.meta.testType}
                    {a.meta.fips ? ' · FIPS' : ''}
                    {a.meta.techPreview ? ' · TechPreview' : ''}
                  </dd>
                </div>
                <div>
                  <dt>Lease → LPAR</dt>
                  <dd>
                    {a.leaseSlot ? (
                      <div className="dbg-lease-path">
                        <code>{a.leaseSlot}</code>
                        <span className="dbg-lease-arrow" aria-hidden>
                          →
                        </span>
                        <strong>{lpar?.lpar || '?'}</strong>
                        {lpar && !lpar.observed ? (
                          <em className="muted">inferred</em>
                        ) : null}
                      </div>
                    ) : (
                      <span className="muted">Not in build-log / step logs yet</span>
                    )}
                    {a.lease?.pool || lpar?.pool ? (
                      <div className="dbg-fact-meta mono">{a.lease?.pool || lpar?.pool}</div>
                    ) : null}
                    {lpar?.hostnameAdditional ? (
                      <div className="dbg-fact-meta">
                        Additional HV: <code>{lpar.hostnameAdditional.split('.')[0]}</code>
                      </div>
                    ) : null}
                    {lpar?.vxlanBridge ? (
                      <div className="dbg-fact-meta">VXLAN {lpar.vxlanBridge}</div>
                    ) : null}
                  </dd>
                </div>
                <div>
                  <dt>Libvirt URI</dt>
                  <dd>
                    {qemu ? (
                      <>
                        <code className="dbg-break">{qemu}</code>
                        <div className="dbg-fact-meta">
                          {a.lease?.connectionSource
                            ? `from ${a.lease.connectionSource}`
                            : lpar && !lpar.observed
                              ? 'inferred from lease catalog'
                              : null}
                        </div>
                      </>
                    ) : (
                      <span className="muted">Not observed in step logs yet</span>
                    )}
                  </dd>
                </div>
              </dl>
            </article>

            <article className="dbg-fact">
              <h3>Release</h3>
              <dl>
                <div>
                  <dt>{a.release?.initialTag ? 'Target (latest)' : 'Build tag'}</dt>
                  <dd>
                    {a.release?.tag ? (
                      <>
                        <code>{a.release.tag}</code>
                        {a.release.createdAt ? (
                          <div className="dbg-fact-meta">{a.release.createdAt}</div>
                        ) : null}
                      </>
                    ) : (
                      <span className="muted">Not resolved yet</span>
                    )}
                  </dd>
                </div>
                {a.release?.initialTag ? (
                  <div>
                    <dt>Upgrade from</dt>
                    <dd>
                      <code>{a.release.initialTag}</code>
                    </dd>
                  </div>
                ) : null}
                {a.release?.pullSpec ? (
                  <div>
                    <dt>Pullspec</dt>
                    <dd>
                      <code className="dbg-break">{a.release.pullSpec}</code>
                    </dd>
                  </div>
                ) : null}
                {a.release?.installTarget ? (
                  <div>
                    <dt>Install image</dt>
                    <dd>
                      <code className="dbg-break">{a.release.installTarget}</code>
                    </dd>
                  </div>
                ) : null}
              </dl>
              {releaseLinks.length > 0 && (
                <div className="dbg-fact-links">
                  {releaseLinks.map((l) => (
                    <a key={l.url} href={l.url} target="_blank" rel="noreferrer">
                      {l.label} ↗
                    </a>
                  ))}
                </div>
              )}
            </article>

            <article className="dbg-fact">
              <h3>Config</h3>
              <dl>
                <div>
                  <dt>Started</dt>
                  <dd>{start}</dd>
                </div>
                <div>
                  <dt>Workflow</dt>
                  <dd>
                    <code>{docs.name}</code>
                    <div className="dbg-fact-links">
                      <a href={docs.stepsCi} target="_blank" rel="noreferrer">
                        steps.ci ↗
                      </a>
                      <a href={docs.yaml} target="_blank" rel="noreferrer">
                        YAML ↗
                      </a>
                    </div>
                  </dd>
                </div>
                <div>
                  <dt>Artifact subdir</dt>
                  <dd>
                    <code>{a.testSubdir || '—'}</code>
                  </dd>
                </div>
                <div>
                  <dt>ci-operator config</dt>
                  <dd>
                    {configUrl && cfgLabel ? (
                      <a href={configUrl} target="_blank" rel="noreferrer">
                        {cfgLabel} ↗
                      </a>
                    ) : (
                      <span className="muted">unresolved</span>
                    )}
                  </dd>
                </div>
              </dl>
            </article>
          </div>
        </div>
      )}
    </section>
  );
}

function AgentPromptPanel({ a }: { a: DebugAnalysis }) {
  const [copied, setCopied] = useState(false);
  const passed = a.result === 'PASSED';
  const prompt = useMemo(() => (passed ? '' : buildAgentPrompt(a)), [a, passed]);

  if (passed) {
    const short = shortJob(a.jobName);
    return (
      <section className="panel dbg-prompt-pass" aria-label="Job passed">
        <p className="dbg-prompt-pass-kicker">All green</p>
        <h2>Nothing for the agent this time</h2>
        <p className="dbg-prompt-pass-body">
          Congrats — <strong>{short}</strong> finished successfully. No failure analysis prompt is
          needed. Open a failed run when you want a ready-to-paste IBM BOB brief.
        </p>
        <p className="muted dbg-prompt-pass-meta">
          Build <span className="mono">{a.buildId}</span>
          {a.progressSummary ? ` · ${a.progressSummary}` : null}
        </p>
        <div className="dbg-prompt-pass-actions">
          <a className="btn" href={a.raw} target="_blank" rel="noreferrer">
            View in Prow
          </a>
          <Link className="btn" to="/">
            Paste another URL
          </Link>
        </div>
      </section>
    );
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = prompt;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <section className="panel">
      <h2>AI agent prompt</h2>
      <p className="muted">
        Copy into IBM BOB or any agent. Job context, workflow status, failed-step artifact URLs,
        phase timings, and the last 80 lines of each failed step log.
      </p>
      <div className="prompt-toolbar">
        <button type="button" className="btn btn-primary" onClick={() => void copy()}>
          {copied ? 'Copied ✓' : 'Copy prompt'}
        </button>
      </div>
      <pre className="prompt-box" tabIndex={0}>
        {prompt}
      </pre>
      <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
        ~{prompt.length.toLocaleString()} characters.
      </p>
    </section>
  );
}

function formatPhaseStepSummary(t: DebugAnalysis['phaseTimings'][number]): string {
  const parts: string[] = [];
  if (t.failedCount) parts.push(`${t.failedCount} step${t.failedCount === 1 ? '' : 's'} failed`);
  if (t.passedCount) parts.push(`${t.passedCount} step${t.passedCount === 1 ? '' : 's'} passed`);
  if (t.pendingCount) parts.push(`${t.pendingCount} step${t.pendingCount === 1 ? '' : 's'} pending`);
  if (!parts.length) {
    if (t.status === 'skipped') return 'skipped';
    return `${t.stepCount} steps`;
  }
  return parts.join(' · ');
}

function PhaseTimeline({ timings }: { timings: DebugAnalysis['phaseTimings'] }) {
  const total = timings.reduce((s, t) => s + t.seconds, 0);
  const hasAny = timings.some((t) => t.timedSteps > 0);
  if (!hasAny) {
    return (
      <div className="phase-tl empty">
        <span className="muted">Phase timing appears after step finished.json timestamps exist.</span>
      </div>
    );
  }
  return (
    <div className="phase-tl" aria-label="Phase duration timeline">
      <div className="phase-tl-head">
        <span>Phase duration</span>
        <span className="mono">{fmtDur(total)}</span>
      </div>
      <div className="phase-tl-bar">
        {timings.map((t) => (
          <div
            key={t.phase}
            className={`phase-tl-seg ph-${t.phase} st-${t.status}`}
            style={{ flexGrow: Math.max(t.seconds, t.timedSteps ? 1 : 0), flexBasis: 0 }}
            title={`${t.label}: ${fmtDur(t.seconds)}`}
          >
            {total > 0 && t.seconds / total >= 0.12 ? <span>{t.label}</span> : null}
          </div>
        ))}
      </div>
      <div className="phase-tl-legend">
        {timings.map((t) => (
          <div key={t.phase} className={`phase-tl-item ph-${t.phase}`}>
            <strong>{t.label}</strong>
            <span className="mono">{fmtDur(t.seconds)}</span>
            <em>{formatPhaseStepSummary(t)}</em>
          </div>
        ))}
      </div>
    </div>
  );
}

function stepArtifactLinks(w: WorkflowStepView): { label: string; url: string; primary?: boolean }[] {
  const logUrl = w.stepBase ? `${w.stepBase}/build-log.txt` : null;
  const seen = new Set<string>();
  const out: { label: string; url: string; primary?: boolean }[] = [];
  if (logUrl) {
    seen.add(logUrl);
    out.push({ label: 'build-log.txt', url: logUrl, primary: true });
  }
  for (const art of w.keyArtifacts) {
    if (seen.has(art.url)) continue;
    seen.add(art.url);
    out.push(art);
  }
  return out;
}

function StepCard({
  w,
  open,
  onToggle,
  registerEl,
}: {
  w: WorkflowStepView;
  open: boolean;
  onToggle: () => void;
  registerEl: (name: string, el: HTMLElement | null) => void;
}) {
  const arts = stepArtifactLinks(w);
  const hasLog =
    !!w.logTail && w.logTail !== '__REDACTED__' && w.logTail.trim().length > 0;

  return (
    <div
      id={`step-${w.name}`}
      ref={(el) => registerEl(w.name, el)}
      className={`dbg-step st-${w.status}${open ? ' open' : ''}${w.observed ? '' : ' pending-row'}`}
    >
      <button type="button" className="dbg-step-h" onClick={onToggle} aria-expanded={open}>
        <StatusBadge status={w.status === 'current' ? 'RUNNING' : w.status} />
        <span className="dbg-step-name">
          {w.name}
          {w.observedName ? <em title="GCS artifact directory">{w.observedName}</em> : null}
          {w.bestEffort ? <em>best_effort</em> : null}
        </span>
        <span className="dbg-step-dur mono">
          {w.observed ? fmtDur(w.duration) : '—'}
        </span>
        <span className="dbg-step-chev" aria-hidden>
          {open ? '−' : '+'}
        </span>
      </button>
      {open && (
        <div className="dbg-step-body">
          {!w.observed ? (
            <p className="muted">No artifact directory yet (not started, or not flushed).</p>
          ) : null}
          {w.logTail === '__REDACTED__' && (
            <div className="error-banner">Log redacted by Prow.</div>
          )}
          {hasLog && (
            <>
              <p className="muted dbg-log-label">Last ~100 lines of build-log.txt</p>
              <pre className="dbg-log">{w.logTail}</pre>
            </>
          )}
          {w.observed && !hasLog && w.logTail !== '__REDACTED__' && (
            <p className="muted">No build-log content available for this step yet.</p>
          )}
          {arts.length > 0 && (
            <div className="dbg-step-links">
              {arts.map((art) => (
                <a
                  key={art.url}
                  className={art.primary ? 'btn btn-primary' : 'btn'}
                  href={art.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {art.label} ↗
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
