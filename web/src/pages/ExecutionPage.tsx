import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { analyzeExecution } from '../lib/analyze';
import {
  fetchText,
  fmtBytes,
  fmtDur,
  gcsDirectUrl,
  gcswebUrl,
  listPrefix,
  toArtifactEntries,
} from '../lib/gcs';
import { parseExecutionRoute } from '../lib/url';
import type { Analysis, ArtifactEntry } from '../types';
import { StatusBadge } from '../components/StatusBadge';
import { PHASE_MAP, PHASE_META, STEP_ORDER } from '../data/workflow';
import { STEP_INFO } from '../data/stepInfo';

type Tab = 'overview' | 'investigate' | 'steps' | 'artifacts' | 'config' | 'prowlog';

export function ExecutionPage() {
  const { bucketEnc = '', pathEnc = '' } = useParams();
  const parsed = useMemo(() => parseExecutionRoute(bucketEnc, pathEnc), [bucketEnc, pathEnc]);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pct, setPct] = useState(0);
  const [label, setLabel] = useState('Starting…');
  const [tab, setTab] = useState<Tab>('overview');
  const [openStep, setOpenStep] = useState<string | null>(null);

  useEffect(() => {
    if (!parsed) {
      setError('Invalid execution path.');
      return;
    }
    let cancelled = false;
    setError(null);
    setAnalysis(null);
    void analyzeExecution(parsed, (p, l) => {
      if (!cancelled) {
        setPct(p);
        setLabel(l);
      }
    })
      .then((a) => {
        if (!cancelled) {
          setAnalysis(a);
          if (a.result === 'FAILED' && a.firstFailed) setTab('investigate');
        }
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
        Invalid URL. <Link to="/">Back to discovery</Link>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-banner">
        {error}
        <div style={{ marginTop: 8 }}>
          <Link to="/">Back to discovery</Link>
        </div>
      </div>
    );
  }

  if (!analysis) {
    return (
      <section className="panel">
        <h2>Analyzing execution…</h2>
        <p className="muted">{label}</p>
        <div className="progress">
          <i style={{ width: `${pct}%` }} />
        </div>
        <p className="mono muted">{parsed.jobName}</p>
        <p className="mono muted">{parsed.buildId}</p>
      </section>
    );
  }

  const a = analysis;
  const heroCls = a.result === 'PASSED' ? 'pass' : a.result === 'FAILED' ? 'fail' : 'run';
  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'investigate', label: 'Investigate' },
    { id: 'steps', label: 'Steps & Logs' },
    { id: 'artifacts', label: 'Artifacts' },
    { id: 'config', label: 'Config' },
    { id: 'prowlog', label: 'CI Operator Log' },
  ];

  return (
    <>
      <div style={{ marginBottom: 10 }}>
        <Link to="/" className="muted">
          ← Discovery
        </Link>
      </div>

      <div className={`hero ${heroCls}`}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div className="muted" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em' }}>
              EXECUTION
            </div>
            <h2>{a.jobName}</h2>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <StatusBadge status={a.result} />
              <span className="badge unk">{a.meta.archClass}</span>
              {a.meta.ocpVersion && <span className="badge unk">OCP {a.meta.ocpVersion}</span>}
              <span className="muted mono">{a.buildId}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <a className="btn btn-primary" href={a.raw} target="_blank" rel="noreferrer">
              Open Prow ↗
            </a>
            <button type="button" className="btn" onClick={() => setTab('investigate')}>
              Investigate
            </button>
            <button type="button" className="btn" onClick={() => setTab('artifacts')}>
              Artifacts
            </button>
          </div>
        </div>
      </div>

      <div className="tabs">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab a={a} onOpenStep={(s) => { setOpenStep(s); setTab('steps'); }} />}
      {tab === 'investigate' && <InvestigateTab a={a} onTab={setTab} />}
      {tab === 'steps' && <StepsTab a={a} openStep={openStep} setOpenStep={setOpenStep} />}
      {tab === 'artifacts' && <ArtifactsTab a={a} />}
      {tab === 'config' && <ConfigTab a={a} />}
      {tab === 'prowlog' && <ProwLogTab a={a} />}
    </>
  );
}

function OverviewTab({ a, onOpenStep }: { a: Analysis; onOpenStep: (s: string) => void }) {
  const start = a.started?.timestamp
    ? new Date(a.started.timestamp * 1000).toUTCString()
    : '—';
  const dur =
    a.started?.timestamp && a.finished?.timestamp
      ? fmtDur(a.finished.timestamp - a.started.timestamp)
      : '—';

  return (
    <div className="grid-2">
      <section className="panel">
        <h2>Summary</h2>
        <div className="stat-row">
          <div className="stat">
            <b>{Object.values(a.counts).reduce((x, y) => x + y, 0)}</b>
            <span>Steps</span>
          </div>
          <div className="stat">
            <b style={{ color: 'var(--green)' }}>{a.counts.passed}</b>
            <span>Passed</span>
          </div>
          <div className="stat">
            <b style={{ color: 'var(--red)' }}>{a.counts.failed}</b>
            <span>Failed</span>
          </div>
        </div>
        <div className="kv">
          <span className="k">Started</span>
          <span className="v">{start}</span>
          <span className="k">Duration</span>
          <span className="v">{dur}</span>
          <span className="k">Topology</span>
          <span className="v">{a.meta.topology}</span>
          <span className="k">Profile</span>
          <span className="v mono">{a.meta.profile}</span>
          <span className="k">Test subdir</span>
          <span className="v mono">{a.testSubdir || '—'}</span>
          <span className="k">Workflow</span>
          <span className="v mono">{a.meta.workflow || 'unresolved'}</span>
        </div>
        {a.firstFailed && (
          <p style={{ marginTop: 12 }}>
            Primary failure signal:{' '}
            <button type="button" className="btn" onClick={() => onOpenStep(a.firstFailed!)}>
              {a.firstFailed}
            </button>
          </p>
        )}
      </section>
      <section className="panel">
        <h2>Execution steps</h2>
        <p className="muted">Observed step directories (not configured intent).</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {a.orderedForFailure.map((ref) => {
            const st = a.steps[ref]?.status || 'unknown';
            return (
              <button
                key={ref}
                type="button"
                className="chip"
                style={{
                  borderColor:
                    st === 'failed' ? 'var(--red)' : st === 'passed' ? 'var(--green)' : undefined,
                }}
                onClick={() => onOpenStep(ref)}
                title={st}
              >
                {st === 'failed' ? '✗' : st === 'passed' ? '✓' : '·'} {ref}
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function InvestigateTab({ a, onTab }: { a: Analysis; onTab: (t: Tab) => void }) {
  const d = a.diagnosis;
  return (
    <div>
      <div className={`hero ${a.result === 'FAILED' ? 'fail' : a.result === 'PASSED' ? 'pass' : 'run'}`}>
        <div className="muted" style={{ fontSize: 11, fontWeight: 700 }}>
          FAILURE INVESTIGATION · confidence: {d.confidence}
        </div>
        <h2>{d.primaryStep || a.result}</h2>
        <p style={{ margin: '6px 0 0', color: 'var(--text2)' }}>{d.summary}</p>
        {d.secondarySteps.length > 0 && (
          <p className="muted" style={{ marginTop: 8 }}>
            Also failed (often downstream / best-effort):{' '}
            {d.secondarySteps.map((s) => (
              <code key={s} style={{ marginRight: 6 }}>
                {s}
              </code>
            ))}
          </p>
        )}
      </div>
      <div className="grid-2">
        <section className="panel">
          <h2>Confirmed facts</h2>
          {d.facts.map((f) => (
            <div key={f} style={{ marginBottom: 6, fontSize: 13 }}>
              • {f}
            </div>
          ))}
        </section>
        <section className="panel">
          <h2>Pattern hypotheses</h2>
          <p className="muted">Matched log patterns — not proven root cause.</p>
          {d.hypotheses.map((h) => (
            <div key={h.tag + h.text.slice(0, 20)} className="hyp">
              <div className="tag">{h.tag}</div>
              <div dangerouslySetInnerHTML={{ __html: h.text }} />
            </div>
          ))}
        </section>
        <section className="panel">
          <h2>Evidence</h2>
          {d.evidence.map((e) => (
            <div
              key={e.url}
              style={{
                display: 'flex',
                gap: 8,
                flexWrap: 'wrap',
                alignItems: 'center',
                padding: '7px 0',
                borderBottom: '1px solid var(--border)',
                fontSize: 12.5,
              }}
            >
              <strong>{e.label}</strong>
              <span className="muted">{e.desc}</span>
              {e.primary && <span className="badge fail">primary</span>}
              <a href={e.url} target="_blank" rel="noreferrer">
                open ↗
              </a>
            </div>
          ))}
        </section>
        <section className="panel">
          <h2>What to inspect next</h2>
          <ol style={{ margin: 0, paddingLeft: 18 }}>
            {d.nextSteps.map((n, i) => (
              <li key={i} style={{ marginBottom: 8 }}>
                {n.href ? (
                  <a href={n.href} target="_blank" rel="noreferrer">
                    {n.label}
                  </a>
                ) : n.tab ? (
                  <button type="button" className="btn" onClick={() => onTab(n.tab as Tab)}>
                    {n.label}
                  </button>
                ) : (
                  n.label
                )}
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}

function StepsTab({
  a,
  openStep,
  setOpenStep,
}: {
  a: Analysis;
  openStep: string | null;
  setOpenStep: (s: string | null) => void;
}) {
  return (
    <div>
      {(['pre', 'test', 'post'] as const).map((ph) => {
        const refs = PHASE_MAP[ph]
          .filter((r) => a.steps[r])
          .sort((x, y) => STEP_ORDER.indexOf(x as never) - STEP_ORDER.indexOf(y as never));
        const extras =
          ph === 'post'
            ? a.orderedForFailure.filter(
                (r) => !Object.values(PHASE_MAP).flat().includes(r) && a.steps[r],
              )
            : [];
        const all = [...refs, ...extras];
        if (!all.length) return null;
        return (
          <section key={ph} className="panel" style={{ marginBottom: 12 }}>
            <h2>
              {PHASE_META[ph].label}{' '}
              <StatusBadge status={a.phaseStatus[ph] || 'unknown'} />
            </h2>
            {all.map((ref) => {
              const s = a.steps[ref];
              const open = openStep === ref;
              const info = STEP_INFO[ref];
              return (
                <div key={ref} className={`step-row ${s.status}`}>
                  <div
                    className="step-hdr"
                    onClick={() => setOpenStep(open ? null : ref)}
                    onKeyDown={() => undefined}
                    role="button"
                    tabIndex={0}
                  >
                    <StatusBadge status={s.status} />
                    <span className="name">{ref}</span>
                    <span className="muted">{fmtDur(s.duration)}</span>
                    <a
                      href={`${s.stepBase}/build-log.txt`}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                    >
                      log ↗
                    </a>
                  </div>
                  {open && (
                    <div className="step-body">
                      {info?.desc && <p className="muted">{info.desc}</p>}
                      {s.status === 'failed' && s.failureSnippet && (
                        <pre className="log-box">{s.failureSnippet}</pre>
                      )}
                      {s.patterns.map((p) => (
                        <div key={p.category} className="hyp">
                          <div className="tag">{p.category}</div>
                          <div dangerouslySetInnerHTML={{ __html: p.hint }} />
                        </div>
                      ))}
                      {s.logTail && s.logTail !== '__REDACTED__' && (
                        <>
                          <p className="muted">Last 80 log lines</p>
                          <pre className="log-box">{s.logTail}</pre>
                        </>
                      )}
                      {s.logTail === '__REDACTED__' && (
                        <div className="error-banner">Log redacted by Prow (sensitive content).</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}

function ArtifactsTab({ a }: { a: Analysis }) {
  const rootPrefix = `${a.gcsPath}/artifacts/${a.testSubdir ? `${a.testSubdir}/` : ''}`;
  const [prefix, setPrefix] = useState(rootPrefix);
  const [entries, setEntries] = useState<ArtifactEntry[]>([]);
  const [filter, setFilter] = useState('');
  const [preview, setPreview] = useState<{ label: string; text: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    void listPrefix(a.bucket, prefix, { delimiter: '/', maxResults: 250 }).then((data) => {
      if (cancelled) return;
      setEntries(toArtifactEntries(data, prefix));
      setLoading(false);
      if (!data) setErr('Could not list artifacts (network or empty).');
    });
    return () => {
      cancelled = true;
    };
  }, [a.bucket, prefix]);

  const filtered = entries.filter((e) => !filter || e.name.toLowerCase().includes(filter.toLowerCase()));
  const relevant = (name: string) =>
    !!a.firstFailed && (name.startsWith(a.firstFailed) || name.includes(a.firstFailed));

  const rel = prefix.startsWith(rootPrefix) ? prefix.slice(rootPrefix.length) : prefix;
  const parts = rel.split('/').filter(Boolean);

  const previewFile = async (fullPath: string, name: string) => {
    const url = gcsDirectUrl(a.bucket, fullPath);
    const text = await fetchText(url);
    if (!text) {
      setPreview({ label: name, text: '(unavailable or inaccessible)' });
      return;
    }
    if (text === '__REDACTED__') {
      setPreview({ label: name, text: '(redacted by Prow)' });
      return;
    }
    const max = 180_000;
    setPreview({
      label: name,
      text: text.length > max ? `${text.slice(0, max)}\n\n… [truncated preview]` : text,
    });
  };

  return (
    <section className="panel">
      <h2>Artifact explorer</h2>
      <p className="muted">
        Live GCS listing under the execution artifact root. Links resolve to real objects — missing
        files are reported, never substituted.
      </p>
      <div className="crumb">
        <button type="button" onClick={() => setPrefix(rootPrefix)}>
          artifacts/{a.testSubdir || ''}
        </button>
        {parts.map((p, i) => {
          const next = rootPrefix + parts.slice(0, i + 1).join('/') + '/';
          return (
            <span key={next}>
              <span>/</span>{' '}
              <button type="button" onClick={() => setPrefix(next)}>
                {p}
              </button>
            </span>
          );
        })}
      </div>
      <div className="search-row">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by name…"
        />
      </div>
      {a.firstFailed && (
        <p className="muted">
          Primary failure step: <code>{a.firstFailed}</code>
        </p>
      )}
      {err && <div className="error-banner">{err}</div>}
      {loading && <div className="empty">Listing…</div>}
      {!loading && (
        <table className="art-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Size</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => (
              <tr key={e.fullPath}>
                <td className="mono">
                  {e.isDir ? (
                    <button type="button" className="btn" onClick={() => setPrefix(e.fullPath)}>
                      {e.name}
                    </button>
                  ) : (
                    e.name
                  )}
                </td>
                <td>
                  <span className={`badge ${relevant(e.name) ? 'fail' : 'unk'}`}>
                    {relevant(e.name) ? 'relevant · ' : ''}
                    {e.isDir ? 'dir' : e.name.split('.').pop()}
                  </span>
                </td>
                <td className="muted">{e.isDir ? '—' : fmtBytes(e.size)}</td>
                <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {e.isDir ? (
                    <button type="button" className="btn" onClick={() => setPrefix(e.fullPath)}>
                      Open
                    </button>
                  ) : (
                    <>
                      <a href={gcsDirectUrl(a.bucket, e.fullPath)} target="_blank" rel="noreferrer">
                        GCS ↗
                      </a>
                      <a href={gcswebUrl(a.bucket, e.fullPath)} target="_blank" rel="noreferrer">
                        browse ↗
                      </a>
                      {/\.(txt|log|json|xml|html|ya?ml)$/i.test(e.name) && (
                        <button
                          type="button"
                          className="btn"
                          onClick={() => void previewFile(e.fullPath, e.name)}
                        >
                          Preview
                        </button>
                      )}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {preview && (
        <div style={{ marginTop: 12 }}>
          <div className="muted">{preview.label}</div>
          <pre className="log-box" style={{ maxHeight: 360 }}>
            {preview.text}
          </pre>
        </div>
      )}
    </section>
  );
}

function ConfigTab({ a }: { a: Analysis }) {
  const c = a.configLinks;
  const groups = {
    discovery: c.links.filter((l) => l.group === 'discovery'),
    config: c.links.filter((l) => l.group === 'config'),
    execution: c.links.filter((l) => l.group === 'execution'),
  };
  return (
    <div className="grid-2">
      <section className="panel">
        <h2>Execution identity</h2>
        <div className="kv">
          <span className="k">Job</span>
          <span className="v mono">{a.jobName}</span>
          <span className="k">Build</span>
          <span className="v mono">{a.buildId}</span>
          <span className="k">Arch</span>
          <span className="v">{c.archClass}</span>
          <span className="k">Prow type</span>
          <span className="v">{c.prowType || '—'}</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
          {groups.execution.map((l) => (
            <a key={l.url} className="btn" href={l.url} target="_blank" rel="noreferrer">
              {l.label} ↗
            </a>
          ))}
        </div>
      </section>
      <section className="panel">
        <h2>Configured workflow (intent)</h2>
        <div className="kv">
          <span className="k">Workflow</span>
          <span className="v mono">{c.workflow || 'unresolved'}</span>
          <span className="k">Profile</span>
          <span className="v mono">{c.profile}</span>
          <span className="k">Variant</span>
          <span className="v mono">{c.variant || 'unresolved'}</span>
          <span className="k">Refs</span>
          <span className="v mono">
            {[c.org, c.repo, c.branch].filter(Boolean).join('/') || '—'}
          </span>
        </div>
        {!c.variant && (
          <div className="hyp">
            <div className="tag">Unresolved</div>
            Variant label missing from prowjob.json — config file path could not be fully resolved.
          </div>
        )}
        <p className="muted">
          Configured steps describe intended workflow. Observed execution may skip optional steps.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
          {groups.config.map((l) => (
            <a key={l.url} className="btn" href={l.url} target="_blank" rel="noreferrer">
              {l.label}
              {l.unresolved ? ' · unresolved' : ''} ↗
            </a>
          ))}
        </div>
      </section>
      <section className="panel">
        <h2>Observed vs configured</h2>
        <div className="kv">
          <span className="k">Observed steps</span>
          <span className="v">{a.orderedForFailure.length}</span>
          <span className="k">Failed</span>
          <span className="v">{(a.secondaryFailed.length || 0) + (a.firstFailed ? 1 : 0)}</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
          {groups.discovery.map((l) => (
            <a key={l.url} className="btn" href={l.url} target="_blank" rel="noreferrer">
              {l.label} ↗
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}

function ProwLogTab({ a }: { a: Analysis }) {
  const [q, setQ] = useState('');
  const lines = useMemo(() => (a.prowLog && a.prowLog !== '__REDACTED__' ? a.prowLog.split('\n') : []), [a.prowLog]);
  const filtered = useMemo(() => {
    if (!q.trim()) return lines;
    try {
      const re = new RegExp(q.trim(), 'i');
      return lines.filter((l) => re.test(l));
    } catch {
      return lines;
    }
  }, [lines, q]);

  if (!a.prowLog) return <div className="empty">Root build-log.txt unavailable.</div>;
  if (a.prowLog === '__REDACTED__') {
    return <div className="error-banner">Root build-log.txt was redacted by Prow.</div>;
  }

  return (
    <section className="panel">
      <h2>CI Operator Log</h2>
      <div className="search-row">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter (regex)…" />
        <span className="muted">
          {filtered.length} / {lines.length} lines
        </span>
      </div>
      <pre className="log-box" style={{ maxHeight: 520 }}>
        {filtered.join('\n')}
      </pre>
    </section>
  );
}
