import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { analyzeExecution, type DebugAnalysis, type WorkflowStepView } from '../lib/analyze';
import { buildAgentPrompt, type PromptMode } from '../lib/agentPrompt';
import { fmtDur } from '../lib/gcs';
import { releaseBrowserLinks } from '../lib/release';
import { parseExecutionRoute } from '../lib/url';
import { WORKFLOW_SOURCE } from '../data/vpnWorkflow';
import { StatusBadge } from '../components/StatusBadge';
import { WorkflowGuideView } from '../components/WorkflowGuideView';
import { resolveLpar } from '../lib/lparResolve';

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
  const stepEls = useRef(new Map<string, HTMLElement>());

  const registerStepEl = (name: string, el: HTMLElement | null) => {
    if (el) stepEls.current.set(name, el);
    else stepEls.current.delete(name);
  };

  const jumpToStep = (name: string | null) => {
    if (!name) return;
    setTab('debug');
    setOpen(name);
    // Wait for expand + tab paint, then scroll into view.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = stepEls.current.get(name);
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
    void analyzeExecution(parsed, (p, l) => {
      if (!cancelled) {
        setPct(p);
        setLabel(l);
      }
    })
      .then((res) => {
        if (cancelled) return;
        setA(res);
        setOpen(res.firstFailed || res.currentStep || null);
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
  const configUrl = a.configLinks.links.find((l) => l.label.includes('ci-operator config'))?.url;

  const chips: { label: string; value: string }[] = [
    { label: 'OCP', value: a.meta.ocpVersion || '—' },
    { label: 'Profile', value: a.meta.profile || '—' },
    { label: 'Topology', value: a.meta.topology || '—' },
    {
      label: 'Test',
      value: [a.meta.testType, a.meta.fips ? 'FIPS' : null, a.meta.techPreview ? 'TechPreview' : null]
        .filter(Boolean)
        .join(' · '),
    },
  ];

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
          <div className="dbg-chips">
            {chips.map((c) => (
              <div key={c.label} className="dbg-chip">
                <span>{c.label}</span>
                <strong>{c.value}</strong>
              </div>
            ))}
          </div>
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
          <section className="dbg-score" aria-label="Step counts and phase time">
            <div className="dbg-counts">
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
            <PhaseTimeline timings={a.phaseTimings} />
          </section>

          <section className="dbg-steps-panel">
            <div className="dbg-section-head">
              <h2>Workflow steps</h2>
              <div className="dbg-section-links">
                <a href={WORKFLOW_SOURCE.stepsCi} target="_blank" rel="noreferrer">
                  {wfName}
                </a>
                <a href={WORKFLOW_SOURCE.yaml} target="_blank" rel="noreferrer">
                  YAML
                </a>
              </div>
            </div>
            {(['pre', 'test', 'post'] as const).map((ph) => {
              const group = a.workflow.filter((w) => w.phase === ph);
              if (!group.length) return null;
              const timing = a.phaseTimings.find((t) => t.phase === ph);
              return (
                <div key={ph} className={`dbg-phase-block ph-${ph}`}>
                  <div className="dbg-phase-h">
                    <span className="dbg-phase-name">{ph.toUpperCase()}</span>
                    <span className="dbg-phase-status">{a.phaseStatus[ph]}</span>
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

          <section className="dbg-tech">
            <button
              type="button"
              className="dbg-tech-toggle"
              onClick={() => setShowTech((v) => !v)}
              aria-expanded={showTech}
            >
              <span>Job details</span>
              <span className="muted">{showTech ? 'Hide' : 'Show lease, release, config…'}</span>
              <span aria-hidden>{showTech ? '−' : '+'}</span>
            </button>
            {showTech && (
              <div className="dbg-tech-body">
                <Detail label="Started" value={start} />
                <Detail
                  label="Workflow"
                  value={
                    <>
                      <code>{wfName}</code>{' '}
                      <a href={WORKFLOW_SOURCE.stepsCi} target="_blank" rel="noreferrer">
                        steps.ci
                      </a>{' '}
                      <a href={WORKFLOW_SOURCE.yaml} target="_blank" rel="noreferrer">
                        YAML
                      </a>
                    </>
                  }
                />
                <Detail label="Artifact subdir" value={<code>{a.testSubdir || '—'}</code>} />
                <Detail label="Cluster profile" value={<code>{a.meta.profile || '—'}</code>} />
                <Detail
                  label="Lease / LPAR"
                  value={
                    a.leaseSlot ? (
                      <>
                        <code>{a.leaseSlot}</code>
                        {lpar ? (
                          <span className="muted">
                            {' '}
                            → {lpar.lpar}
                            {lpar.observed ? '' : ' (inferred)'}
                          </span>
                        ) : null}
                        {a.lease?.pool ? (
                          <div className="muted mono" style={{ marginTop: 4 }}>
                            pool {a.lease.pool}
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <span className="muted">Not in root build-log / step logs yet</span>
                    )
                  }
                />
                {(lpar?.qemuUri || a.lease?.qemuUri) && (
                  <Detail
                    label="Libvirt URI"
                    value={
                      <>
                        <code className="dbg-break">{a.lease?.qemuUri || lpar?.qemuUri}</code>
                        {a.lease?.connectionSource ? (
                          <div className="muted" style={{ marginTop: 4 }}>
                            from {a.lease.connectionSource}
                          </div>
                        ) : lpar && !lpar.observed ? (
                          <div className="muted" style={{ marginTop: 4 }}>
                            inferred from lease index (leases secret not in artifacts)
                          </div>
                        ) : null}
                      </>
                    }
                  />
                )}
                <Detail
                  label="Release"
                  value={
                    a.release?.tag ? (
                      <>
                        <code>{a.release.tag}</code>
                        {a.release.createdAt ? (
                          <span className="muted"> · {a.release.createdAt}</span>
                        ) : null}
                        {a.release.initialTag ? (
                          <div className="muted mono" style={{ marginTop: 4 }}>
                            upgrade from <code>{a.release.initialTag}</code>
                          </div>
                        ) : null}
                        <div className="dbg-inline-links">
                          {releaseLinks.map((l) => (
                            <a key={l.url} href={l.url} target="_blank" rel="noreferrer">
                              {l.label}
                            </a>
                          ))}
                        </div>
                      </>
                    ) : (
                      <span className="muted">Not resolved yet</span>
                    )
                  }
                />
                {a.release?.pullSpec && (
                  <Detail
                    label="Release pullspec"
                    value={<code className="dbg-break">{a.release.pullSpec}</code>}
                  />
                )}
                {a.release?.installTarget && (
                  <Detail
                    label="Install image"
                    value={<code className="dbg-break">{a.release.installTarget}</code>}
                  />
                )}
                <Detail
                  label="ci-operator config"
                  value={
                    configUrl ? (
                      <a href={configUrl} target="_blank" rel="noreferrer">
                        {a.configLinks.org}/{a.configLinks.repo} __{a.configLinks.variant}.yaml
                      </a>
                    ) : (
                      <span className="muted">unresolved</span>
                    )
                  }
                />
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="dbg-detail">
      <span>{label}</span>
      <div>{value}</div>
    </div>
  );
}

function AgentPromptPanel({ a }: { a: DebugAnalysis }) {
  const [mode, setMode] = useState<PromptMode>('focused');
  const [copied, setCopied] = useState(false);
  const prompt = useMemo(() => buildAgentPrompt(a, mode), [a, mode]);

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
        Copy into Cursor or any agent. Plain-text brief with job context, failed-step artifact URLs,
        phase timings, and the last 80 lines of each failed step log.
      </p>
      <div className="prompt-toolbar">
        <div className="seg">
          <button
            type="button"
            className={mode === 'focused' ? 'active' : ''}
            onClick={() => setMode('focused')}
          >
            Focused
          </button>
          <button
            type="button"
            className={mode === 'full' ? 'active' : ''}
            onClick={() => setMode('full')}
          >
            Full context
          </button>
        </div>
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
  if (t.failedCount) parts.push(`${t.failedCount} failed`);
  if (t.passedCount) parts.push(`${t.passedCount} passed`);
  if (t.pendingCount) parts.push(`${t.pendingCount} pending`);
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
