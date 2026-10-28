import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { executionRoute, parseProwUrl } from '../lib/url';

const RECENT_KEY = 'ibmz_debug_recent';

interface RecentItem {
  url: string;
  jobName: string;
  buildId: string;
  at: number;
}

function loadRecent(): RecentItem[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') as RecentItem[];
  } catch {
    return [];
  }
}

function shortJob(name: string): string {
  return name
    .replace(/^periodic-ci-openshift-multiarch-main-nightly-/, '')
    .replace(/^periodic-ci-openshift-multiarch-master-nightly-/, '');
}

const EXAMPLES = [
  {
    label: 'Failed upgrade',
    hint: '5.0 ← 4.22 · z-z',
    tone: 'fail' as const,
    url: 'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-5.0-upgrade-from-nightly-4.22-ocp-ovn-remote-libvirt-multi-z-z/2107456138294333440',
  },
  {
    label: 'Passed serial',
    hint: '5.0 · e2e-serial',
    tone: 'pass' as const,
    url: 'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-5.0-ocp-e2e-serial-ovn-remote-libvirt-multi-z-z/2107441095997657088',
  },
  {
    label: 'Failed FIPS',
    hint: '4.23 · techpreview',
    tone: 'fail' as const,
    url: 'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-4.23-ocp-fips-ovn-techpreview-multi-z-z/2107396006764089344',
  },
];

export function HomePage() {
  const navigate = useNavigate();
  const [url, setUrl] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentItem[]>([]);

  useEffect(() => {
    setRecent(loadRecent());
  }, []);

  const go = (raw: string) => {
    const parsed = parseProwUrl(raw);
    if (!parsed) {
      setErr('Paste a prow.ci.openshift.org job URL (…/view/gs/…/logs/<job>/<buildId>).');
      return;
    }
    setErr(null);
    const item: RecentItem = {
      url: parsed.raw,
      jobName: parsed.jobName,
      buildId: parsed.buildId,
      at: Date.now(),
    };
    const next = [item, ...loadRecent().filter((r) => r.url !== item.url)].slice(0, 8);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    navigate(executionRoute(parsed.bucket, parsed.gcsPath));
  };

  return (
    <div className="home">
      <section className="home-hero">
        <div className="home-hero-glow" aria-hidden />
        <p className="home-kicker">IBM Z · OpenShift CI</p>
        <h1>
          <span className="home-hero-line">Paste a Prow CI Job link.</span>
          <span className="home-hero-line home-hero-accent">Get the debug path.</span>
        </h1>
        <p className="home-lead">
          Turn one job URL into failed tests, phase timing, logs, and release context for IBM&nbsp;Z
          libvirt—without digging through GCS.
        </p>

        <ul className="home-caps" aria-label="What you get">
          <li>Failed tests</li>
          <li>PRE → TEST → POST</li>
          <li>Step logs</li>
          <li>Release · lease</li>
        </ul>

        <div className="home-paste">
          <label htmlFor="prow-url">Prow CI Job URL</label>
          <div className="home-paste-well">
            <div className="home-paste-row">
              <input
                id="prow-url"
                autoFocus
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && go(url)}
                placeholder="https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/…"
                spellCheck={false}
              />
              <button type="button" className="btn btn-primary home-go" onClick={() => go(url)}>
                Debug
              </button>
            </div>
          </div>
          {err && <div className="error-banner">{err}</div>}
        </div>

        <div className="home-examples">
          <span className="home-examples-label">Try a sample</span>
          <div className="home-examples-row">
            {EXAMPLES.map((ex) => (
              <button
                key={ex.label}
                type="button"
                className={`home-ex tone-${ex.tone}`}
                onClick={() => go(ex.url)}
              >
                <span className="home-ex-dot" aria-hidden />
                <span className="home-ex-text">
                  <strong>{ex.label}</strong>
                  <em>{ex.hint}</em>
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {recent.length > 0 && (
        <section className="home-recent" aria-label="Recent jobs">
          <div className="home-recent-h">
            <h2>Recent</h2>
            <span>This browser only</span>
          </div>
          <ul>
            {recent.map((r) => (
              <li key={r.url}>
                <button type="button" onClick={() => go(r.url)}>
                  <span className="home-recent-name">{shortJob(r.jobName)}</span>
                  <span className="home-recent-id mono">{r.buildId.slice(-8)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="home-foot">
        <Link to="/guide">How the workflow works</Link>
        <span aria-hidden>·</span>
        <a
          href="https://steps.ci.openshift.org/workflow/openshift-e2e-libvirt-vpn"
          target="_blank"
          rel="noreferrer"
        >
          openshift-e2e-libvirt-vpn
        </a>
      </footer>
    </div>
  );
}
