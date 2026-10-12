import { useMemo, useState } from 'react';
import {
  CI_LAYERS,
  CLUSTER_PROFILES,
  ENV_VARS,
  GUIDE_WORKFLOWS,
  JOB_PATTERNS,
  OCP_INSTALL_PHASES,
  VERSION_NOTES,
  workflowByJobHints,
  workflowByName,
  type GuideStep,
  type GuideWorkflow,
} from '../data/workflowGuide';

export interface WorkflowGuideViewProps {
  /** Prefill workflow from a live job analysis */
  workflowName?: string | null;
  jobName?: string | null;
  compact?: boolean;
}

type Section = 'overview' | 'flow' | 'steps' | 'profiles' | 'env' | 'versions';

export function WorkflowGuideView({
  workflowName,
  jobName,
  compact = false,
}: WorkflowGuideViewProps) {
  const initial = useMemo(
    () => workflowByJobHints(jobName || '', workflowName),
    [jobName, workflowName],
  );
  const [wfId, setWfId] = useState(initial.id);
  const [section, setSection] = useState<Section>('flow');
  const [openStep, setOpenStep] = useState<string | null>(null);

  const wf = workflowByName(wfId) || GUIDE_WORKFLOWS[0];

  return (
    <div className={`guide ${compact ? 'guide-compact' : ''}`}>
      {!compact && (
        <header className="guide-hero">
          <p className="guide-eyebrow">IBM Z · OpenShift CI</p>
          <h2>How the libvirt workflow works</h2>
          <p>
            A guided tour of the workflows, cluster profiles, and environment variables used by IBM Z
            (s390x) jobs from OCP <strong>4.13</strong> through <strong>5.x</strong> — mapped to real
            openshift-install stages so new developers can read a failing Prow job with context.
          </p>
        </header>
      )}

      {jobName && (
        <div className="guide-job-hint">
          Viewing guide in context of <code>{jobName}</code>
          {workflowName ? (
            <>
              {' '}
              · workflow <code>{workflowName}</code>
            </>
          ) : null}
        </div>
      )}

      <div className="guide-wf-picker" role="tablist" aria-label="Workflow">
        {GUIDE_WORKFLOWS.filter((w) => w.id !== 'ibmcloud' || !compact).map((w) => (
          <button
            key={w.id}
            type="button"
            role="tab"
            aria-selected={wfId === w.id}
            className={wfId === w.id ? 'active' : ''}
            onClick={() => {
              setWfId(w.id);
              setOpenStep(null);
            }}
          >
            <span className="guide-wf-name">{w.name.replace('openshift-e2e-libvirt-', '')}</span>
            <span className="guide-wf-meta">{w.since}</span>
          </button>
        ))}
      </div>

      <p className="guide-wf-summary">
        <strong>{wf.title}</strong> — {wf.summary}{' '}
        <a href={wf.stepsCi} target="_blank" rel="noreferrer">
          steps.ci ↗
        </a>{' '}
        <a href={wf.releaseYaml} target="_blank" rel="noreferrer">
          YAML ↗
        </a>
      </p>

      <nav className="guide-sections" aria-label="Guide sections">
        {(
          [
            ['overview', 'CI layers'],
            ['flow', 'Install flow'],
            ['steps', 'Step detail'],
            ['profiles', 'Environments'],
            ['env', 'Env vars'],
            ['versions', '4.13 → 5.x'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={section === id ? 'active' : ''}
            onClick={() => setSection(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      {section === 'overview' && <OverviewSection />}
      {section === 'flow' && <FlowSection wf={wf} onOpenStep={setOpenStep} setSection={setSection} />}
      {section === 'steps' && (
        <StepsSection wf={wf} openStep={openStep} setOpenStep={setOpenStep} />
      )}
      {section === 'profiles' && <ProfilesSection activeProfiles={wf.profiles} />}
      {section === 'env' && <EnvSection />}
      {section === 'versions' && <VersionsSection />}
    </div>
  );
}

function OverviewSection() {
  return (
    <section className="guide-panel">
      <h3>From Prow URL to a leaf step</h3>
      <ol className="guide-layers">
        {CI_LAYERS.map((l, i) => (
          <li key={l.name}>
            <span className="guide-layer-n">{i + 1}</span>
            <div>
              <strong>{l.name}</strong>
              <p>{l.blurb}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="guide-callout">
        <strong>Mental model:</strong> a workflow is not the install binary — it is a scripted
        PRE → TEST → POST around <em>openshift-install</em> (UPI/agent on libvirt) plus{' '}
        <em>openshift-tests</em>. When PRE fails, start at install logs; when TEST fails, start at
        junit / e2e.log; when POST fails, treat as secondary unless cleanup leaves stale virsh state.
      </div>
      <h3 style={{ marginTop: 20 }}>Job name patterns</h3>
      <div className="guide-table-wrap">
        <table className="guide-table">
          <thead>
            <tr>
              <th>Pattern</th>
              <th>Meaning</th>
              <th>Example</th>
            </tr>
          </thead>
          <tbody>
            {JOB_PATTERNS.map((p) => (
              <tr key={p.pattern}>
                <td>
                  <code>{p.pattern}</code>
                </td>
                <td>{p.meaning}</td>
                <td className="mono muted">{p.example}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function FlowSection({
  wf,
  onOpenStep,
  setSection,
}: {
  wf: GuideWorkflow;
  onOpenStep: (s: string) => void;
  setSection: (s: Section) => void;
}) {
  return (
    <section className="guide-panel">
      <h3>Mapped to OpenShift install stages</h3>
      <p className="muted" style={{ marginTop: 0 }}>
        Left: product install lifecycle. Right: CI steps in <code>{wf.name}</code>.
      </p>

      <div className="guide-pipeline" aria-hidden="true">
        {['PRE', 'TEST', 'POST'].map((ph, i) => (
          <div key={ph} className={`guide-pipe-phase ph-${ph.toLowerCase()}`}>
            <span>{ph}</span>
            {i < 2 && <i className="guide-pipe-arrow" />}
          </div>
        ))}
      </div>

      <div className="guide-flow-grid">
        {OCP_INSTALL_PHASES.map((p) => (
          <article key={p.id} className="guide-flow-card">
            <h4>{p.title}</h4>
            <p>{p.mapsTo}</p>
          </article>
        ))}
      </div>

      <h3 style={{ marginTop: 22 }}>Leaf timeline</h3>
      <ol className="guide-timeline">
        {wf.steps.map((s, idx) => (
          <li key={`${s.name}-${idx}`} className={`tl-${s.phase}`}>
            <button
              type="button"
              className="guide-tl-btn"
              onClick={() => {
                onOpenStep(s.name);
                setSection('steps');
              }}
            >
              <span className="guide-tl-phase">{s.phase}</span>
              <span className="guide-tl-name">
                {s.name}
                {s.bestEffort ? <em> · best_effort</em> : null}
              </span>
              <span className="guide-tl-ocp">{s.ocpStage}</span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

function StepsSection({
  wf,
  openStep,
  setOpenStep,
}: {
  wf: GuideWorkflow;
  openStep: string | null;
  setOpenStep: (s: string | null) => void;
}) {
  const groups: Record<'pre' | 'test' | 'post', GuideStep[]> = {
    pre: wf.steps.filter((s) => s.phase === 'pre'),
    test: wf.steps.filter((s) => s.phase === 'test'),
    post: wf.steps.filter((s) => s.phase === 'post'),
  };

  return (
    <section className="guide-panel">
      <h3>What each step does</h3>
      {(['pre', 'test', 'post'] as const).map((ph) => (
        <div key={ph} className="guide-step-group">
          <div className="guide-step-group-h">{ph.toUpperCase()}</div>
          {groups[ph].map((s) => {
            const open = openStep === s.name;
            return (
              <article
                key={s.name}
                className={`guide-step ${open ? 'open' : ''}`}
                id={`guide-step-${s.name}`}
              >
                <button
                  type="button"
                  className="guide-step-h"
                  onClick={() => setOpenStep(open ? null : s.name)}
                  aria-expanded={open}
                >
                  <code>{s.name}</code>
                  <span className="muted">{s.ocpStage}</span>
                </button>
                <p className="guide-step-sum">{s.summary}</p>
                {open && (
                  <div className="guide-step-body">
                    <p>{s.detail}</p>
                    {s.via && (
                      <p className="muted">
                        Via chain: <code>{s.via}</code>
                      </p>
                    )}
                    {s.keyArtifacts && s.keyArtifacts.length > 0 && (
                      <p>
                        <span className="muted">Key artifacts: </span>
                        {s.keyArtifacts.map((a) => (
                          <code key={a} style={{ marginRight: 6 }}>
                            {a}
                          </code>
                        ))}
                      </p>
                    )}
                    <div className="guide-step-links">
                      {s.stepsCi && (
                        <a className="btn" href={s.stepsCi} target="_blank" rel="noreferrer">
                          steps.ci ↗
                        </a>
                      )}
                      {s.releaseYaml && (
                        <a className="btn" href={s.releaseYaml} target="_blank" rel="noreferrer">
                          release YAML ↗
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      ))}
    </section>
  );
}

function ProfilesSection({ activeProfiles }: { activeProfiles: string[] }) {
  return (
    <section className="guide-panel">
      <h3>Cluster profiles & environments</h3>
      <p className="muted" style={{ marginTop: 0 }}>
        A <strong>cluster profile</strong> is the leased CI environment: credentials, lease→LPAR map,
        and network path. It is not the same thing as a workflow (workflow = steps; profile = where
        those steps run).
      </p>
      <div className="guide-profile-grid">
        {CLUSTER_PROFILES.map((p) => {
          const active = activeProfiles.includes(p.id);
          return (
            <article
              key={p.id}
              className={`guide-profile ${active ? 'active' : ''} st-${p.status}`}
            >
              <div className="guide-profile-top">
                <code>{p.title}</code>
                <span className={`guide-pill st-${p.status}`}>{p.status}</span>
              </div>
              <p>{p.summary}</p>
              <dl className="guide-dl">
                <div>
                  <dt>Usage</dt>
                  <dd>{p.usage}</dd>
                </div>
                <div>
                  <dt>Connectivity</dt>
                  <dd>{p.connectivity}</dd>
                </div>
                <div>
                  <dt>Typical jobs</dt>
                  <dd>
                    {p.typicalJobs.map((j) => (
                      <div key={j} className="mono" style={{ fontSize: 11.5 }}>
                        {j}
                      </div>
                    ))}
                  </dd>
                </div>
              </dl>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function EnvSection() {
  return (
    <section className="guide-panel">
      <h3>Environment variables</h3>
      <p className="muted" style={{ marginTop: 0 }}>
        Set in <code>ci-operator/config/openshift/multiarch/…nightly-*.yaml</code> under each test’s{' '}
        <code>env:</code>, then consumed by leaf refs.
      </p>
      <div className="guide-table-wrap">
        <table className="guide-table">
          <thead>
            <tr>
              <th>Variable</th>
              <th>Meaning</th>
              <th>Typical Z value</th>
              <th>Where</th>
            </tr>
          </thead>
          <tbody>
            {ENV_VARS.map((e) => (
              <tr key={e.name}>
                <td>
                  <code>{e.name}</code>
                </td>
                <td>{e.meaning}</td>
                <td className="mono">{e.typical}</td>
                <td className="muted">{e.where}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function VersionsSection() {
  return (
    <section className="guide-panel">
      <h3>What changed from 4.13 → 5.x</h3>
      <p className="muted" style={{ marginTop: 0 }}>
        Surveyed from <code>openshift-multiarch-main__nightly-*.yaml</code> in openshift/release
        (s390x-related tests). Counts fluctuate as jobs are added; the pattern is stable:{' '}
        <strong>openshift-e2e-libvirt-vpn</strong> + <strong>libvirt-s390x-vpn</strong> dominate.
      </p>
      <ul className="guide-version-list">
        {VERSION_NOTES.map((v) => (
          <li key={v.version}>
            <strong>{v.version}</strong>
            <span>{v.notes}</span>
          </li>
        ))}
      </ul>
      <div className="guide-callout">
        Local research clone (not committed): <code>.cache/release</code> —{' '}
        <code>git clone https://github.com/openshift/release.git .cache/release</code>
      </div>
    </section>
  );
}
