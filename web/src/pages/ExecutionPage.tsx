import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { analyzeExecution, type DebugAnalysis, type WorkflowStepView } from '../lib/analyze';
import { buildAgentPrompt, type PromptMode } from '../lib/agentPrompt';
import { fmtDur } from '../lib/gcs';
import { releaseBrowserLinks } from '../lib/release';
import { parseExecutionRoute } from '../lib/url';
import { WORKFLOW_SOURCE } from '../data/vpnWorkflow';
import { StatusBadge } from '../components/StatusBadge';
import { resolveLpar } from '../lib/lparResolve';

type PageTab = 'debug' | 'prompt';

export function ExecutionPage() {
  const { bucketEnc = '', pathEnc = '' } = useParams();
  const parsed = useMemo(() => parseExecutionRoute(bucketEnc, pathEnc), [bucketEnc, pathEnc]);
  const [a, setA] = useState<DebugAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pct, setPct] = useState(0);
  const [label, setLabel] = useState('Starting…');
  const [open, setOpen] = useState<string | null>(null);
  const [tab, setTab] = useState<PageTab>('debug');

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
      <section className="panel">
        <h2>Loading job debug data…</h2>
        <p className="muted">{label}</p>
        <div className="progress">
          <i style={{ width: `${pct}%` }} />
        </div>
        <p className="mono muted" style={{ fontSize: 12 }}>
          {parsed.jobName}
        </p>
      </section>
    );
  }

  const heroCls = a.result === 'PASSED' ? 'pass' : a.result === 'FAILED' ? 'fail' : 'run';
  const start = a.started?.timestamp
    ? new Date(a.started.timestamp * 1000).toUTCString()
    : '—';
  const dur =
    a.started?.timestamp && a.finished?.timestamp
      ? fmtDur(a.finished.timestamp - a.started.timestamp)
      : a.result === 'RUNNING' && a.started?.timestamp
        ? `${fmtDur(Math.floor(Date.now() / 1000) - a.started.timestamp)} (so far)`
        : '—';
  const lpar = a.leaseSlot ? resolveLpar(a.leaseSlot) : null;
  const releaseLinks = releaseBrowserLinks(a.release?.tag || null);
  const pending = a.workflow.filter((w) => w.status === 'pending' || w.status === 'current').length;
  const failed = a.workflow.filter((w) => w.status === 'failed').length;
  const passed = a.workflow.filter((w) => w.status === 'passed').length;

  return (
    <>
      <div style={{ marginBottom: 10 }}>
        <Link to="/" className="muted">
          ← Paste another job URL
        </Link>
      </div>

      {/* Status + what's happening */}
      <div className={`hero ${heroCls}`}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <div className="muted" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em' }}>
              JOB DEBUG
            </div>
            <h2 style={{ fontSize: 15, wordBreak: 'break-all' }}>{a.jobName}</h2>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 6 }}>
              <StatusBadge status={a.result} />
              <span className="mono muted" style={{ fontSize: 11 }}>
                {a.buildId}
              </span>
            </div>
            <p style={{ margin: '10px 0 0', color: 'var(--text2)', fontSize: 13.5, lineHeight: 1.55 }}>
              {a.progressSummary}
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <a className="btn btn-primary" href={a.raw} target="_blank" rel="noreferrer">
              Open in Prow ↗
            </a>
            {a.firstFailed && tab === 'debug' && (
              <button type="button" className="btn" onClick={() => setOpen(a.firstFailed)}>
                Jump to failed step
              </button>
            )}
            {a.currentStep && a.result === 'RUNNING' && tab === 'debug' && (
              <button type="button" className="btn" onClick={() => setOpen(a.currentStep)}>
                Jump to current step
              </button>
            )}
            <button type="button" className="btn" onClick={() => setTab('prompt')}>
              Copy AI prompt
            </button>
          </div>
        </div>
      </div>

      <nav className="tabs" aria-label="Job views">
        <button
          type="button"
          className={tab === 'debug' ? 'tab active' : 'tab'}
          onClick={() => setTab('debug')}
        >
          Debug view
        </button>
        <button
          type="button"
          className={tab === 'prompt' ? 'tab active' : 'tab'}
          onClick={() => setTab('prompt')}
        >
          AI agent prompt
        </button>
      </nav>

      {tab === 'prompt' ? (
        <AgentPromptPanel a={a} />
      ) : (
        <>
          <section className="panel" style={{ marginBottom: 12 }}>
            <h2>Execution context</h2>
            <div className="stat-row">
              <div className="stat">
                <b>{passed}</b>
                <span>Passed</span>
              </div>
              <div className="stat">
                <b style={{ color: 'var(--red)' }}>{failed}</b>
                <span>Failed</span>
              </div>
              <div className="stat">
                <b style={{ color: 'var(--accent)' }}>{pending}</b>
                <span>Pending / current</span>
              </div>
              <div className="stat">
                <b style={{ fontSize: 14 }}>{dur}</b>
                <span>Duration</span>
              </div>
            </div>
            <div className="kv" style={{ marginTop: 8 }}>
              <span className="k">Started</span>
              <span className="v">{start}</span>
              <span className="k">Cluster profile</span>
              <span className="v mono">{a.meta.profile}</span>
              <span className="k">Workflow</span>
              <span className="v">
                <code>{a.meta.workflow || WORKFLOW_SOURCE.name}</code>{' '}
                <a href={WORKFLOW_SOURCE.yaml} target="_blank" rel="noreferrer">
                  source ↗
                </a>{' '}
                <a href={WORKFLOW_SOURCE.stepsCi} target="_blank" rel="noreferrer">
                  steps.ci ↗
                </a>
              </span>
              <span className="k">Topology</span>
              <span className="v">{a.meta.topology}</span>
              <span className="k">OCP / BRANCH</span>
              <span className="v mono">
                {a.meta.ocpVersion || '—'}
                {a.meta.fromVersion ? ` (upgrade from ${a.meta.fromVersion})` : ''}
              </span>
              <span className="k">Test type</span>
              <span className="v">
                {a.meta.testType}
                {a.meta.fips ? ' · FIPS' : ''}
                {a.meta.techPreview ? ' · TechPreview' : ''}
              </span>
              <span className="k">Test subdir</span>
              <span className="v mono">{a.testSubdir || '—'}</span>
              <span className="k">Lease</span>
              <span className="v mono">
                {a.leaseSlot || '— (root build-log not available yet)'}
                {lpar ? ` → ${lpar.lpar} · ${lpar.qemuUri}` : ''}
              </span>
              <span className="k">Release build</span>
              <span className="v">
                {a.release?.tag ? (
                  <>
                    <code>{a.release.tag}</code>
                    {a.release.createdAt && (
                      <span className="muted"> · created {a.release.createdAt}</span>
                    )}
                    <span className="muted"> · from {a.release.source}</span>
                    <div style={{ marginTop: 4, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {releaseLinks.map((l) => (
                        <a key={l.url} className="btn" href={l.url} target="_blank" rel="noreferrer">
                          {l.label} ↗
                        </a>
                      ))}
                    </div>
                  </>
                ) : (
                  <span className="muted">
                    Not found yet (common while job is early / root log missing)
                  </span>
                )}
              </span>
              {a.release?.pullSpec && (
                <>
                  <span className="k">Tests image</span>
                  <span className="v mono" style={{ fontSize: 11 }}>
                    {a.release.pullSpec}
                  </span>
                </>
              )}
              {a.release?.installTarget && (
                <>
                  <span className="k">Install image</span>
                  <span className="v mono" style={{ fontSize: 11 }}>
                    {a.release.installTarget}
                  </span>
                </>
              )}
              <span className="k">ci-operator config</span>
              <span className="v">
                {a.configLinks.variant ? (
                  <a
                    href={a.configLinks.links.find((l) => l.label.includes('ci-operator config'))?.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {a.configLinks.org}/{a.configLinks.repo} __{a.configLinks.variant}.yaml ↗
                  </a>
                ) : (
                  <span className="muted">variant unresolved</span>
                )}
              </span>
            </div>
          </section>

          {a.result === 'FAILED' && a.firstFailed && <FailureBlock a={a} onOpen={setOpen} />}

          <section className="panel">
            <h2>
              Workflow steps{' '}
              <span className="muted" style={{ fontWeight: 500 }}>
                (configured {WORKFLOW_SOURCE.name} · pending = no artifact dir yet)
              </span>
            </h2>
            {(['pre', 'test', 'post'] as const).map((ph) => {
              const group = a.workflow.filter((w) => w.phase === ph);
              if (!group.length) return null;
              return (
                <div key={ph} style={{ marginBottom: 16 }}>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: '0.06em',
                      color: 'var(--muted)',
                      marginBottom: 8,
                    }}
                  >
                    {ph.toUpperCase()} · {a.phaseStatus[ph]}
                  </div>
                  {group.map((w) => (
                    <StepCard
                      key={w.name}
                      w={w}
                      open={open === w.name}
                      onToggle={() => setOpen(open === w.name ? null : w.name)}
                    />
                  ))}
                </div>
              );
            })}
          </section>

          <EnvPanel a={a} />
        </>
      )}
    </>
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
      // Fallback for restricted clipboard
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
        Copy this into Cursor, ChatGPT, Claude, or any agent. It includes the Prow job link, failed
        steps with artifact URLs, workflow status, release/context, and log excerpts so the agent can
        keep investigating on its own.
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
        {mode === 'focused'
          ? 'Focused mode: shorter excerpts around failures / current step.'
          : 'Full mode: longer log excerpts plus diagnosis facts.'}{' '}
        ~{prompt.length.toLocaleString()} characters.
      </p>
    </section>
  );
}

function FailureBlock({ a, onOpen }: { a: DebugAnalysis; onOpen: (s: string) => void }) {
  const d = a.diagnosis;
  const step = a.workflow.find((w) => w.name === a.firstFailed);
  return (
    <section className="panel" style={{ marginBottom: 12, borderLeft: '4px solid var(--red)' }}>
      <h2>Failure focus</h2>
      <p>
        Primary signal: <code>{a.firstFailed}</code>
        {step?.bestEffort ? ' (best-effort / often secondary)' : ''}
      </p>
      {step?.failureSnippet && <pre className="log-box">{step.failureSnippet}</pre>}
      {d.hypotheses.slice(0, 3).map((h) => (
        <div key={h.tag} className="hyp">
          <div className="tag">{h.tag} — hypothesis, not proven root cause</div>
          <div dangerouslySetInnerHTML={{ __html: h.text }} />
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
        <button type="button" className="btn btn-primary" onClick={() => onOpen(a.firstFailed!)}>
          Open step logs
        </button>
        {d.evidence.slice(0, 4).map((e) => (
          <a key={e.url} className="btn" href={e.url} target="_blank" rel="noreferrer">
            {e.label} ↗
          </a>
        ))}
      </div>
    </section>
  );
}

function StepCard({
  w,
  open,
  onToggle,
}: {
  w: WorkflowStepView;
  open: boolean;
  onToggle: () => void;
}) {
  const border =
    w.status === 'failed'
      ? 'var(--red)'
      : w.status === 'current' || w.status === 'running'
        ? 'var(--accent)'
        : w.status === 'passed'
          ? 'var(--green)'
          : 'var(--border)';
  return (
    <div
      className="step-row"
      style={{ borderColor: border, opacity: w.status === 'pending' ? 0.72 : 1 }}
    >
      <div className="step-hdr" onClick={onToggle} role="button" tabIndex={0} onKeyDown={() => undefined}>
        <StatusBadge status={w.status === 'current' ? 'RUNNING' : w.status} />
        <span className="name">
          {w.name}
          {w.bestEffort ? <span className="muted"> · best_effort</span> : null}
          {w.status === 'current' ? <span style={{ color: 'var(--accent)' }}> · CURRENT</span> : null}
        </span>
        <span className="muted">{w.observed ? fmtDur(w.duration) : 'not started'}</span>
        {w.stepBase && (
          <a
            href={`${w.stepBase}/build-log.txt`}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
          >
            log ↗
          </a>
        )}
      </div>
      {open && (
        <div className="step-body">
          {!w.observed && (
            <p className="muted">
              No artifact directory yet. For a RUNNING job this usually means the step has not started
              (or ci-operator has not written it). The workflow still expects it.
            </p>
          )}
          {w.patterns.map((p) => (
            <div key={p.category} className="hyp">
              <div className="tag">{p.category}</div>
              <div dangerouslySetInnerHTML={{ __html: p.hint }} />
            </div>
          ))}
          {w.failureSnippet && (
            <>
              <div className="muted">Failure excerpt</div>
              <pre className="log-box">{w.failureSnippet}</pre>
            </>
          )}
          {w.logTail && w.logTail !== '__REDACTED__' && (
            <>
              <div className="muted">Last ~100 lines of build-log.txt</div>
              <pre className="log-box">{w.logTail}</pre>
            </>
          )}
          {w.logTail === '__REDACTED__' && (
            <div className="error-banner">Log redacted by Prow.</div>
          )}
          {w.keyArtifacts.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              {w.keyArtifacts.map((art) => (
                <a key={art.url} className="btn" href={art.url} target="_blank" rel="noreferrer">
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

function EnvPanel({ a }: { a: DebugAnalysis }) {
  // Static VPN defaults that matter for IBM Z, plus live-parsed hints from meta
  const rows: { k: string; v: string; note?: string }[] = [
    { k: 'ARCH', v: 's390x', note: 'from job / profile' },
    { k: 'CLUSTER_PROFILE', v: a.meta.profile },
    { k: 'ETCD_DISK_SPEED', v: 'slow', note: 'vpn workflow default · etcd-on-ramfs' },
    { k: 'USE_EXTERNAL_DNS', v: 'true', note: 'typical for libvirt-s390x-vpn jobs' },
    { k: 'TEST_TYPE', v: a.meta.testType },
    { k: 'BRANCH / OCP', v: a.meta.ocpVersion || '—' },
    { k: 'FIPS_ENABLED', v: a.meta.fips ? 'true' : 'false' },
    { k: 'FEATURE_SET', v: a.meta.techPreview ? 'TechPreviewNoUpgrade' : 'default' },
    { k: 'INSTALLER_TYPE', v: a.meta.installer },
  ];
  if (a.meta.fromVersion) {
    rows.push({ k: 'UPGRADE_FROM', v: a.meta.fromVersion });
  }

  return (
    <section className="panel" style={{ marginTop: 12 }}>
      <h2>Environment (vpn profile context)</h2>
      <p className="muted">
        Values below mix job-name/prowjob facts with documented defaults for{' '}
        <code>libvirt-s390x-vpn</code> / vpn-oz style jobs in openshift/release. Live exports from step
        logs are preferred when present in a future enhancement.
      </p>
      <div className="kv">
        {rows.map((r) => (
          <div key={r.k} style={{ display: 'contents' }}>
            <span className="k">{r.k}</span>
            <span className="v">
              <code>{r.v}</code>
              {r.note ? <span className="muted"> · {r.note}</span> : null}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
