import { useEffect, useMemo, useState } from 'react';
import {
  CLUSTER_PROFILES,
  DEBUG_PLAYBOOK,
  ENV_VARS,
  GUIDE_WORKFLOWS,
  JOB_PATTERNS,
  workflowByJobHints,
  workflowByName,
  type GuidePhase,
  type GuideStep,
  type GuideWorkflow,
} from '../data/workflowGuide';

export interface WorkflowGuideViewProps {
  workflowName?: string | null;
  jobName?: string | null;
  compact?: boolean;
}

const PHASE_META: Record<
  GuidePhase,
  { label: string; title: string; blurb: string }
> = {
  pre: {
    label: 'PRE',
    title: 'Build the cluster',
    blurb: 'Lease → config → install. Cleanup, install-config, guests, openshift-install.',
  },
  test: {
    label: 'TEST',
    title: 'Validate',
    blurb: 'Confirm the API is healthy, then run openshift-tests.',
  },
  post: {
    label: 'POST',
    title: 'Gather & teardown',
    blurb: 'Collect must-gather (best-effort), then wipe libvirt for the next lease.',
  },
};

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
  const [openStep, setOpenStep] = useState<string | null>(null);
  const [refOpen, setRefOpen] = useState<'playbook' | 'decode' | 'env' | null>(
    compact ? null : null,
  );

  useEffect(() => {
    setWfId(initial.id);
    setOpenStep(null);
  }, [initial.id]);

  useEffect(() => {
    setOpenStep(null);
  }, [wfId]);

  const wf = workflowByName(wfId) || GUIDE_WORKFLOWS[0];
  const profiles = CLUSTER_PROFILES.filter((p) => wf.profiles.includes(p.id));
  const phases: GuidePhase[] = ['pre', 'test', 'post'];
  const counts = {
    pre: wf.steps.filter((s) => s.phase === 'pre').length,
    test: wf.steps.filter((s) => s.phase === 'test').length,
    post: wf.steps.filter((s) => s.phase === 'post').length,
  };

  return (
    <div className={`guide ${compact ? 'guide-compact' : ''}`}>
      {!compact && (
        <header className="guide-hero">
          <p className="guide-kicker">IBM Z · Workflow guide</p>
          <h1>Pick a workflow. Learn its steps.</h1>
          <p className="guide-lead">
            One workflow at a time — PRE → TEST → POST, profiles, and where to look when it fails.
          </p>
        </header>
      )}

      {jobName ? (
        <p className="guide-context">
          Showing guide for <code>{shortJob(jobName)}</code>
          {workflowName ? (
            <>
              {' '}
              · <code>{workflowName}</code>
            </>
          ) : null}
        </p>
      ) : null}

      <section className="guide-picker" aria-label="Select workflow">
        <label htmlFor="guide-wf">
          <span>Workflow</span>
          <select
            id="guide-wf"
            value={wf.id}
            onChange={(e) => setWfId(e.target.value)}
          >
            {GUIDE_WORKFLOWS.map((w) => (
              <option key={w.id} value={w.id}>
                {selectLabel(w)}
              </option>
            ))}
          </select>
        </label>
        <div className="guide-picker-meta">
          <span className="guide-badge">Since {wf.since}</span>
          <span className="guide-badge muted">{wf.steps.length} steps</span>
          <a href={wf.stepsCi} target="_blank" rel="noreferrer">
            steps.ci ↗
          </a>
          <a href={wf.releaseYaml} target="_blank" rel="noreferrer">
            YAML ↗
          </a>
        </div>
      </section>

      <section className="guide-overview" aria-label="Workflow overview">
        <h2>{wf.title}</h2>
        <p>{wf.summary}</p>
        <div className="guide-phase-summary" aria-label="Phase step counts">
          {phases.map((ph) => (
            <div key={ph} className={`guide-phase-pill ph-${ph}`}>
              <strong>{PHASE_META[ph].label}</strong>
              <span>
                {counts[ph]} step{counts[ph] === 1 ? '' : 's'}
              </span>
            </div>
          ))}
        </div>
      </section>

      <div className="guide-layout">
        <div className="guide-main">
          {phases.map((ph) => {
            const steps = wf.steps.filter((s) => s.phase === ph);
            if (!steps.length) return null;
            const meta = PHASE_META[ph];
            return (
              <section key={ph} className={`guide-phase ph-${ph}`} aria-label={`${meta.label} phase`}>
                <header className="guide-phase-h">
                  <span className="guide-phase-label">{meta.label}</span>
                  <div>
                    <h3>{meta.title}</h3>
                    <p>{meta.blurb}</p>
                  </div>
                  <em className="guide-phase-count">{steps.length}</em>
                </header>
                <ol className="guide-steps">
                  {steps.map((s, i) => (
                    <StepRow
                      key={`${wf.id}-${s.name}-${i}`}
                      index={i + 1}
                      step={s}
                      open={openStep === `${ph}:${s.name}`}
                      onToggle={() =>
                        setOpenStep(
                          openStep === `${ph}:${s.name}` ? null : `${ph}:${s.name}`,
                        )
                      }
                    />
                  ))}
                </ol>
              </section>
            );
          })}
        </div>

        <aside className="guide-side" aria-label="Workflow context">
          <section className="guide-side-card">
            <h3>Cluster profiles</h3>
            <p className="guide-side-lead">Leased lab + secrets used with this workflow.</p>
            {profiles.length === 0 ? (
              <p className="muted">No mapped profiles.</p>
            ) : (
              <ul className="guide-profile-list">
                {profiles.map((p) => (
                  <li key={p.id}>
                    <code>{p.id}</code>
                    <span>{p.summary}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="guide-side-card">
            <h3>When to use</h3>
            <ul className="guide-when">
              {whenToUse(wf).map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </section>

          {!compact && (
            <section className="guide-side-card guide-ref">
              <h3>Quick reference</h3>
              <div className="guide-ref-btns">
                {(
                  [
                    ['playbook', 'Debug playbook'],
                    ['decode', 'Job name decoder'],
                    ['env', 'Env knobs'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={refOpen === id ? 'on' : ''}
                    onClick={() => setRefOpen(refOpen === id ? null : id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {refOpen === 'playbook' && (
                <ol className="guide-ref-list">
                  {DEBUG_PLAYBOOK.map((item) => (
                    <li key={item.title}>
                      <strong>{item.title}</strong>
                      <span>{item.detail}</span>
                    </li>
                  ))}
                </ol>
              )}
              {refOpen === 'decode' && (
                <ul className="guide-ref-list">
                  {JOB_PATTERNS.map((p) => (
                    <li key={p.pattern}>
                      <code>{p.pattern}</code>
                      <span>
                        {p.meaning}
                        <em> e.g. {p.example}</em>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {refOpen === 'env' && (
                <ul className="guide-ref-list">
                  {ENV_VARS.slice(0, 10).map((e) => (
                    <li key={e.name}>
                      <code>{e.name}</code>
                      <span>
                        {e.meaning} <em>usually {e.typical}</em>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

function selectLabel(w: GuideWorkflow): string {
  const short: Record<string, string> = {
    vpn: 'VPN · homogeneous z-z',
    'vpn-fips': 'VPN + FIPS',
    upi: 'UPI · classical / external',
    'hetero-vpn': 'Hetero VPN · z-xz (5.0) / z-za',
    hetero: 'Hetero UPI · classical z-xz',
  };
  return short[w.id] || w.title;
}

function whenToUse(wf: GuideWorkflow): string[] {
  switch (wf.id) {
    case 'vpn':
      return [
        'Most multi-z-z nightlies (parallel, serial, agent, image-ecosystem, upgrades)',
        'Profile libvirt-s390x-vpn on YZ LPARs',
      ];
    case 'vpn-fips':
      return [
        'ocp-fips-ovn-* and FIPS + TechPreview periodics',
        'Same VPN install path, plus fips-check after install',
      ];
    case 'hetero-vpn':
      return [
        '5.0 multi-z-xz (libvirt-s390x-vpn-amd64) and multi-z-za (vpn-arm64)',
        'Needs VXLAN additional-bridge on the hetero lease',
      ];
    case 'hetero':
      return [
        'Classical z-xz on 4.22 / 4.23 / 5.1 (libvirt-s390x-amd64)',
        'sshd-bastion path — different leaf names than VPN hetero',
      ];
    case 'upi':
      return [
        'External IBM Z UPI jobs and non-VPN / classic libvirt UPI',
        'Same leaf shape as VPN for most PRE/TEST/POST steps',
      ];
    default:
      return [wf.summary];
  }
}

function shortJob(jobName: string): string {
  return jobName
    .replace(/^periodic-ci-openshift-multiarch-main-nightly-/, '')
    .replace(/^periodic-ci-openshift-multiarch-master-nightly-/, '');
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function StepRow({
  index,
  step,
  open,
  onToggle,
}: {
  index: number;
  step: GuideStep;
  open: boolean;
  onToggle: () => void;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <li className={`guide-step${open ? ' open' : ''}`}>
      <button type="button" className="guide-step-h" onClick={onToggle} aria-expanded={open}>
        <span className="guide-step-n">{String(index).padStart(2, '0')}</span>
        <span className="guide-step-body">
          <strong>{step.summary}</strong>
          <code>{step.name}</code>
        </span>
        {step.bestEffort ? <em className="guide-step-opt">optional</em> : null}
        <span className="guide-step-chev" aria-hidden>
          {open ? '−' : '+'}
        </span>
      </button>
      {open && (
        <div className="guide-step-detail">
          <p className="guide-step-stage">{step.ocpStage}</p>
          {step.detail ? <p>{step.detail}</p> : null}
          {step.whenFails ? (
            <div className="guide-step-fail">
              <strong>When this fails</strong>
              <p>{step.whenFails}</p>
            </div>
          ) : null}
          {step.keyArtifacts?.length ? (
            <p className="guide-step-arts">
              Evidence:{' '}
              {step.keyArtifacts.map((a) => (
                <code key={a}>{a}</code>
              ))}
            </p>
          ) : null}
          <div className="guide-step-links">
            <button
              type="button"
              className="btn"
              onClick={() => {
                void copyText(step.name).then((ok) => {
                  if (!ok) return;
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1200);
                });
              }}
            >
              {copied ? 'Copied' : 'Copy name'}
            </button>
            {step.stepsCi ? (
              <a className="btn btn-primary" href={step.stepsCi} target="_blank" rel="noreferrer">
                steps.ci ↗
              </a>
            ) : null}
            {step.releaseYaml ? (
              <a className="btn" href={step.releaseYaml} target="_blank" rel="noreferrer">
                YAML ↗
              </a>
            ) : null}
          </div>
        </div>
      )}
    </li>
  );
}
