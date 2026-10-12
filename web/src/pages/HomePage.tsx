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

const EXAMPLES = [
  {
    label: 'Failed upgrade z-z',
    url: 'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-5.0-upgrade-from-nightly-4.22-ocp-ovn-remote-libvirt-multi-z-z/2107456138294333440',
  },
  {
    label: 'Passed e2e-serial z-z',
    url: 'https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-5.0-ocp-e2e-serial-ovn-remote-libvirt-multi-z-z/2107441095997657088',
  },
  {
    label: 'Failed fips z-z',
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
      setErr(
        'Paste a prow.ci.openshift.org job URL, e.g. …/view/gs/test-platform-results-public/logs/<job>/<buildId>',
      );
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
    <div style={{ maxWidth: 820, margin: '0 auto' }}>
      <section className="panel" style={{ padding: '28px 24px' }}>
        <h2 style={{ fontSize: 22, marginBottom: 6 }}>Debug an IBM Z CI job</h2>
        <p className="muted" style={{ marginTop: 0, lineHeight: 1.6 }}>
          Paste a Prow job link. The workbench loads the configured{' '}
          <code>openshift-e2e-libvirt-vpn</code> workflow (vpn / vpn-oz profiles), shows which steps
          passed, failed, or are still pending, and jumps you to logs, artifacts, release build, and
          env — so you do not have to dig through GCS by hand.
        </p>

        <label className="muted" style={{ display: 'block', marginTop: 18, marginBottom: 6 }}>
          Prow job URL
        </label>
        <div className="search-row">
          <input
            autoFocus
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && go(url)}
            placeholder="https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/…/BUILD_ID"
            spellCheck={false}
            style={{ fontSize: 14, padding: '12px 14px' }}
          />
          <button type="button" className="btn btn-primary" onClick={() => go(url)}>
            Debug
          </button>
        </div>
        {err && <div className="error-banner">{err}</div>}

        <div style={{ marginTop: 16 }}>
          <div className="muted" style={{ marginBottom: 8 }}>
            Try an example
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {EXAMPLES.map((ex) => (
              <button key={ex.label} type="button" className="chip" onClick={() => go(ex.url)}>
                {ex.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {recent.length > 0 && (
        <section className="panel" style={{ marginTop: 14 }}>
          <h2>Recent (this browser)</h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {recent.map((r) => (
              <li key={r.url} style={{ marginBottom: 8 }}>
                <button
                  type="button"
                  className="btn"
                  style={{ width: '100%', textAlign: 'left' }}
                  onClick={() => go(r.url)}
                >
                  <span className="mono" style={{ fontSize: 12 }}>
                    {r.jobName.replace(/^periodic-ci-openshift-multiarch-main-nightly-/, '…/')}
                  </span>
                  <span className="muted" style={{ marginLeft: 8, fontSize: 11 }}>
                    {r.buildId.slice(-10)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="muted" style={{ marginTop: 16, fontSize: 12, lineHeight: 1.55 }}>
        Focused on <strong>libvirt-s390x-vpn</strong> (and related Z profiles) with{' '}
        <code>openshift-e2e-libvirt-vpn</code> from{' '}
        <a
          href="https://github.com/openshift/release/blob/master/ci-operator/step-registry/openshift/e2e/libvirt/vpn/openshift-e2e-libvirt-vpn-workflow.yaml"
          target="_blank"
          rel="noreferrer"
        >
          openshift/release
        </a>
        . New to Z CI? Read the{' '}
        <Link to="/guide">workflow guide</Link> (steps, install mapping, environments, 4.13→5.x).
      </p>
    </div>
  );
}
