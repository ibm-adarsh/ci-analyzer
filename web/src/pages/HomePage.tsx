import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { discoverRecentExecutions, loadJobIndex } from '../lib/discovery';
import { fmtDur } from '../lib/gcs';
import { parseProwUrl, executionRoute } from '../lib/url';
import type { ArchClass, JobIndex, JobIndexEntry, JobResult } from '../types';
import { StatusBadge } from '../components/StatusBadge';

type Filter = 'all' | JobResult | ArchClass;

function shortJob(name: string): string {
  return name.replace(/^periodic-ci-openshift-multiarch-main-nightly-/, '…/');
}

function timeLabel(ts: number | null): string {
  if (!ts) return '—';
  return new Date(ts * 1000).toUTCString().replace(/:\d\d GMT$/, ' GMT');
}

export function HomePage() {
  const navigate = useNavigate();
  const [index, setIndex] = useState<JobIndex | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [urlInput, setUrlInput] = useState('');
  const [urlErr, setUrlErr] = useState<string | null>(null);

  const bootstrap = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const cached = await loadJobIndex();
      if (cached?.executions?.length) {
        setIndex(cached);
        setLoading(false);
        return;
      }
      // Fallback: live discovery (may take a minute)
      const live = await discoverRecentExecutions({ buildsPerJob: 2, concurrency: 3 });
      setIndex(live);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const refreshLive = async () => {
    setRefreshing(true);
    setError(null);
    try {
      const live = await discoverRecentExecutions({ buildsPerJob: 3, concurrency: 4 });
      setIndex(live);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRefreshing(false);
    }
  };

  const rows = useMemo(() => {
    let list = index?.executions || [];
    if (filter === 'PASSED' || filter === 'FAILED' || filter === 'RUNNING' || filter === 'ABORTED') {
      list = list.filter((r) => r.result === filter);
    } else if (
      filter === 'multi-arch-homogeneous' ||
      filter === 'multi-arch-heterogeneous' ||
      filter === 'single-arch-s390x'
    ) {
      list = list.filter((r) => r.archClass === filter);
    }
    const qq = q.trim().toLowerCase();
    if (qq) {
      list = list.filter(
        (r) =>
          r.jobName.toLowerCase().includes(qq) ||
          r.buildId.includes(qq) ||
          (r.variant || '').toLowerCase().includes(qq),
      );
    }
    return list;
  }, [index, filter, q]);

  const openEntry = (e: JobIndexEntry) => {
    navigate(executionRoute('test-platform-results-public', e.gcsPath));
  };

  const analyzeUrl = () => {
    const parsed = parseProwUrl(urlInput);
    if (!parsed) {
      setUrlErr('Paste a valid prow.ci.openshift.org view/gs/… job URL.');
      return;
    }
    setUrlErr(null);
    navigate(executionRoute(parsed.bucket, parsed.gcsPath));
  };

  const chips: { id: Filter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'FAILED', label: 'Failed' },
    { id: 'PASSED', label: 'Passed' },
    { id: 'multi-arch-homogeneous', label: 'z-z multi-arch' },
    { id: 'multi-arch-heterogeneous', label: 'z-za' },
    { id: 'single-arch-s390x', label: 's390x single-arch' },
  ];

  return (
    <>
      <section className="panel" style={{ marginBottom: 14 }}>
        <h2>Open an execution</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Paste a Prow job URL, or pick a recent IBM Z execution discovered from public GCS.
          Configured workflows come from{' '}
          <a href="https://github.com/openshift/release" target="_blank" rel="noreferrer">
            openshift/release
          </a>
          ; results come from Prow / GCS — never invented.
        </p>
        <div className="search-row">
          <input
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && analyzeUrl()}
            placeholder="https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/…/BUILD_ID"
            spellCheck={false}
          />
          <button type="button" className="btn btn-primary" onClick={analyzeUrl}>
            Analyze
          </button>
        </div>
        {urlErr && <div className="error-banner">{urlErr}</div>}
      </section>

      <section className="panel">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0 }}>Job discovery</h2>
          <span className="muted">
            {index
              ? `${index.executions.length} executions · ${index.jobNames.length} jobs · ${new Date(index.generatedAt).toLocaleString()}`
              : 'Loading…'}
          </span>
          <button
            type="button"
            className="btn"
            style={{ marginLeft: 'auto' }}
            disabled={refreshing}
            onClick={() => void refreshLive()}
          >
            {refreshing ? 'Refreshing…' : 'Refresh from GCS'}
          </button>
        </div>
        <p className="muted">
          Source: {index?.source || 'gs://test-platform-results-public'}. Discovery matches IBM Z
          naming conventions (libvirt, z-z, z-za, s390x) — not a hardcoded shortlist alone.
        </p>

        <div className="filters">
          {chips.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`chip ${filter === c.id ? 'active' : ''}`}
              onClick={() => setFilter(c.id)}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="search-row">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter by job name, build id, or variant…"
          />
        </div>

        {error && <div className="error-banner">{error}</div>}
        {loading && <div className="empty">Discovering recent IBM Z executions…</div>}
        {!loading && !rows.length && <div className="empty">No executions match this filter.</div>}

        {!loading && rows.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table className="job-table">
              <thead>
                <tr>
                  <th>Result</th>
                  <th>Job</th>
                  <th>Arch</th>
                  <th>Build</th>
                  <th>Started</th>
                  <th>Duration</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.jobName}-${r.buildId}`} onClick={() => openEntry(r)}>
                    <td>
                      <StatusBadge status={r.result} />
                    </td>
                    <td>
                      <div className="job-name" title={r.jobName}>
                        {shortJob(r.jobName)}
                      </div>
                    </td>
                    <td>
                      <span className="badge unk">
                        {r.archClass === 'multi-arch-homogeneous'
                          ? 'z-z'
                          : r.archClass === 'multi-arch-heterogeneous'
                            ? 'z-za'
                            : r.archClass === 'single-arch-s390x'
                              ? 's390x'
                              : r.archClass}
                      </span>
                    </td>
                    <td className="mono">{r.buildId.slice(-10)}</td>
                    <td className="muted">{timeLabel(r.startedAt)}</td>
                    <td>{fmtDur(r.durationSec)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
