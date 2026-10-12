import { useEffect, useMemo, useState } from 'react';
import {
  CLUSTER_PROFILES,
  ENV_VARS,
  GUIDE_WORKFLOWS,
  JOB_PATTERNS,
  VERSION_NOTES,
  workflowByJobHints,
  workflowByName,
  type GuideStep,
  type GuideWorkflow,
} from '../data/workflowGuide';

export interface WorkflowGuideViewProps {
  workflowName?: string | null;
  jobName?: string | null;
  compact?: boolean;
}

type Phase = 'pre' | 'test' | 'post';

const PHASES: {
  id: Phase;
  n: string;
  title: string;
  plain: string;
  install: string;
  verb: string;
}[] = [
  {
    id: 'pre',
    n: '01',
    title: 'Build',
    plain: 'Lease an LPAR, write install-config, create guests, finish openshift-install.',
    install: 'install-config → bootstrap → install-complete',
    verb: 'PRE',
  },
  {
    id: 'test',
    n: '02',
    title: 'Validate',
    plain: 'Prove the API is healthy, then run openshift-tests.',
    install: 'post-install · conformance / serial / upgrade',
    verb: 'TEST',
  },
  {
    id: 'post',
    n: '03',
    title: 'Gather',
    plain: 'Collect must-gather (best-effort), then wipe libvirt for the next lease.',
    install: 'debug artifacts → deprovision',
    verb: 'POST',
  },
];

const PRIMARY_WF = ['vpn', 'vpn-fips', 'hetero'];

export function WorkflowGuideView({
  workflowName,
  jobName,
  compact = false,
}: WorkflowGuideViewProps) {
  const initial = useMemo(
    () => workflowByJobHints(jobName || '', workflowName),
    [jobName, workflowName],
  );
  const [wfId, setWfId] = useState(PRIMARY_WF.includes(initial.id) ? initial.id : 'vpn');
  const [showMoreWf, setShowMoreWf] = useState(false);
  const [phase, setPhase] = useState<Phase>('pre');
  const [openStep, setOpenStep] = useState<string | null>(null);
  const [showAllEnv, setShowAllEnv] = useState(false);

  const wf = workflowByName(wfId) || GUIDE_WORKFLOWS[0];
  const phaseSteps = wf.steps.filter((s) => s.phase === phase);
  const phaseMeta = PHASES.find((p) => p.id === phase)!;

  useEffect(() => {
    setOpenStep(null);
  }, [wfId, phase]);

  return (
    <div className={`wg ${compact ? 'wg-compact' : ''}`}>
      {!compact && (
        <header className="wg-hero">
          <div className="wg-hero-copy">
            <p className="wg-kicker">IBM Z · OpenShift CI</p>
            <h2>
              From Prow URL
              <br />
              <em>to a running cluster</em>
            </h2>
            <p className="wg-hero-lead">
              How a libvirt job on s390x installs OpenShift, runs tests, and tears down — mapped to
              real <code>openshift-install</code> stages.
            </p>
          </div>
          <Schematic />
        </header>
      )}

      {jobName && (
        <p className="wg-context">
          Viewing for <code>{shortJob(jobName)}</code>
        </p>
      )}

      <div className="wg-toolbar">
        <div className="wg-seg" role="tablist" aria-label="Workflow">
          {GUIDE_WORKFLOWS.filter((w) => PRIMARY_WF.includes(w.id)).map((w) => (
            <button
              key={w.id}
              type="button"
              role="tab"
              aria-selected={wfId === w.id}
              className={wfId === w.id ? 'on' : ''}
              onClick={() => setWfId(w.id)}
            >
              {labelFor(w)}
            </button>
          ))}
          <button
            type="button"
            className="ghost"
            onClick={() => setShowMoreWf((v) => !v)}
            aria-expanded={showMoreWf}
          >
            {showMoreWf ? 'Less' : 'More'}
          </button>
        </div>
        {showMoreWf && (
          <div className="wg-seg wg-seg-extra">
            {GUIDE_WORKFLOWS.filter((w) => !PRIMARY_WF.includes(w.id)).map((w) => (
              <button
                key={w.id}
                type="button"
                className={wfId === w.id ? 'on' : ''}
                onClick={() => setWfId(w.id)}
              >
                {labelFor(w)}
              </button>
            ))}
          </div>
        )}
        <div className="wg-toolbar-meta">
          <p>{wf.summary}</p>
          <div className="wg-toolbar-links">
            <a href={wf.stepsCi} target="_blank" rel="noreferrer">
              steps.ci
            </a>
            <a href={wf.releaseYaml} target="_blank" rel="noreferrer">
              YAML
            </a>
          </div>
        </div>
      </div>

      {/* Interactive phase rail */}
      <section className="wg-rail" aria-label="Job phases">
        <div className="wg-rail-track" aria-hidden>
          <i />
        </div>
        {PHASES.map((p, i) => {
          const count = wf.steps.filter((s) => s.phase === p.id).length;
          const on = phase === p.id;
          return (
            <button
              key={p.id}
              type="button"
              className={`wg-rail-node ph-${p.id}${on ? ' on' : ''}`}
              onClick={() => setPhase(p.id)}
              aria-pressed={on}
            >
              <span className="wg-rail-dot">
                <span>{p.n}</span>
              </span>
              {i < PHASES.length - 1 && <span className="wg-rail-link" aria-hidden />}
              <span className="wg-rail-body">
                <span className="wg-rail-verb">{p.verb}</span>
                <strong>{p.title}</strong>
                <span className="wg-rail-plain">{p.plain}</span>
                <span className="wg-rail-map">{p.install}</span>
                <span className="wg-rail-count">{count} steps</span>
              </span>
            </button>
          );
        })}
      </section>

      {/* Mapping strip */}
      <section className="wg-map" aria-label="CI vs install mapping">
        <div className="wg-map-col">
          <span className="wg-map-label">CI phase</span>
          <strong>{phaseMeta.verb}</strong>
          <p>{phaseMeta.title} the job</p>
        </div>
        <div className="wg-map-arrow" aria-hidden>
          <svg viewBox="0 0 48 24" width="48" height="24">
            <path
              d="M2 12h38M32 4l12 8-12 8"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div className="wg-map-col">
          <span className="wg-map-label">OpenShift install</span>
          <strong>{phaseMeta.install.split('→')[0]?.trim() || phaseMeta.install}</strong>
          <p>{phaseMeta.install}</p>
        </div>
      </section>

      {/* Timeline steps for selected phase */}
      <section className="wg-timeline" aria-label={`${phaseMeta.title} steps`}>
        <div className="wg-section-head">
          <h3>
            {phaseMeta.title} steps
            <span>{phaseSteps.length}</span>
          </h3>
          <p>Plain English first — expand a row for detail and docs.</p>
        </div>
        <ol className="wg-tl">
          {phaseSteps.map((s, idx) => (
            <StepRow
              key={`${s.name}-${idx}`}
              index={idx + 1}
              step={s}
              open={openStep === s.name}
              onToggle={() => setOpenStep(openStep === s.name ? null : s.name)}
            />
          ))}
        </ol>
      </section>

      {/* Path diagram for environments */}
      <section className="wg-path" aria-label="Where the job runs">
        <div className="wg-section-head">
          <h3>Where it runs</h3>
          <p>
            Profile = leased lab. Workflow = steps above. Most Z jobs use{' '}
            <strong>libvirt-s390x-vpn</strong>.
          </p>
        </div>
        <div className="wg-path-flow" aria-hidden>
          {['Prow pod', 'VPN / intranet', 'Bastion DNS', 'qemu+tcp', 'Z LPAR'].map((n, i) => (
            <div key={n} className="wg-path-node">
              <span>{n}</span>
              {i < 4 && <i />}
            </div>
          ))}
        </div>
        <div className="wg-env-row">
          {CLUSTER_PROFILES.filter((p) => p.status === 'primary' || p.status === 'specialized').map(
            (p) => {
              const active = wf.profiles.includes(p.id);
              return (
                <article key={p.id} className={active ? 'wg-env on' : 'wg-env'}>
                  <header>
                    <h4>{friendlyProfile(p.id)}</h4>
                    {active && <span>Active</span>}
                  </header>
                  <p>{p.summary}</p>
                  <code>{p.id}</code>
                </article>
              );
            },
          )}
        </div>
      </section>

      <section className="wg-vars" aria-label="Environment variables">
        <div className="wg-section-head">
          <h3>Knobs that matter</h3>
          <p>Job <code>env:</code> in multiarch nightlies — these change behaviour most often.</p>
        </div>
        <div className="wg-var-grid">
          {(showAllEnv ? ENV_VARS : ENV_VARS.slice(0, 6)).map((e) => (
            <article key={e.name} className="wg-var-card">
              <code>{e.name}</code>
              <p>{e.meaning}</p>
              <span>
                usually <strong>{e.typical}</strong>
              </span>
            </article>
          ))}
        </div>
        <button type="button" className="btn wg-more-btn" onClick={() => setShowAllEnv((v) => !v)}>
          {showAllEnv ? 'Show fewer' : `Show ${ENV_VARS.length - 6} more`}
        </button>
      </section>

      {!compact && (
        <section className="wg-footer-grid">
          <div>
            <h3>Job name decoder</h3>
            <ul className="wg-chips">
              {JOB_PATTERNS.map((p) => (
                <li key={p.pattern}>
                  <code>{p.pattern}</code>
                  <span>{p.meaning}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3>4.13 → 5.x</h3>
            <ul className="wg-years">
              {VERSION_NOTES.map((v) => (
                <li key={v.version}>
                  <strong>{v.version}</strong>
                  <span>{v.notes}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </div>
  );
}

function Schematic() {
  return (
    <div className="wg-schematic" aria-hidden>
      <svg viewBox="0 0 420 220" role="img">
        <defs>
          <linearGradient id="wg-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#1a6bb5" stopOpacity="0.5" />
          </linearGradient>
          <filter id="wg-glow">
            <feGaussianBlur stdDeviation="2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {/* ambient grid */}
        <g stroke="currentColor" strokeOpacity="0.08" strokeWidth="1">
          {Array.from({ length: 8 }).map((_, i) => (
            <line key={`v${i}`} x1={40 + i * 48} y1={20} x2={40 + i * 48} y2={200} />
          ))}
          {Array.from({ length: 5 }).map((_, i) => (
            <line key={`h${i}`} x1={20} y1={30 + i * 40} x2={400} y2={30 + i * 40} />
          ))}
        </g>
        {/* flow path */}
        <path
          className="wg-schematic-path"
          d="M40 60 H140 V110 H220 V60 H320 V160 H380"
          fill="none"
          stroke="url(#wg-g)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#wg-glow)"
        />
        {[
          { x: 40, y: 60, t: 'Prow' },
          { x: 140, y: 60, t: 'ci-op' },
          { x: 220, y: 110, t: 'VPN' },
          { x: 320, y: 60, t: 'LPAR' },
          { x: 380, y: 160, t: 'Cluster' },
        ].map((n) => (
          <g key={n.t} transform={`translate(${n.x},${n.y})`}>
            <circle r="10" fill="var(--surface)" stroke="var(--accent)" strokeWidth="2" />
            <circle r="3.5" fill="var(--accent)" className="wg-schematic-pulse" />
            <text y="28" textAnchor="middle" fill="currentColor" fontSize="11" fontWeight="600">
              {n.t}
            </text>
          </g>
        ))}
        <text x="20" y="205" fill="currentColor" fillOpacity="0.45" fontSize="10">
          schematic · not to scale
        </text>
      </svg>
    </div>
  );
}

function labelFor(w: GuideWorkflow): string {
  if (w.id === 'vpn') return 'VPN';
  if (w.id === 'vpn-fips') return 'FIPS';
  if (w.id === 'hetero') return 'z-xz';
  if (w.id === 'upi') return 'UPI';
  if (w.id === 'ibmcloud') return 'IBM Cloud';
  return w.title;
}

function friendlyProfile(id: string): string {
  if (id === 'libvirt-s390x-vpn') return 'Z over VPN';
  if (id === 'libvirt-s390x-amd64') return 'Z + x86';
  if (id === 'ibmcloud-multi-s390x') return 'IBM Cloud';
  if (id === 'libvirt-s390x-2') return 'Legacy';
  return id;
}

function friendlyStepTitle(s: GuideStep): string {
  const stage = s.ocpStage.split('·')[0]?.trim();
  if (stage && stage.length < 48) return stage;
  return s.summary.split('.')[0] || s.name;
}

function shortJob(jobName: string): string {
  return jobName.replace(/^periodic-ci-openshift-multiarch-main-nightly-/, '…/');
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
  return (
    <li className={`wg-tl-item ph-${step.phase}${open ? ' open' : ''}`}>
      <button type="button" className="wg-tl-btn" onClick={onToggle} aria-expanded={open}>
        <span className="wg-tl-idx">{String(index).padStart(2, '0')}</span>
        <span className="wg-tl-main">
          <span className="wg-tl-title">
            {friendlyStepTitle(step)}
            {step.bestEffort ? <em>optional</em> : null}
          </span>
          <span className="wg-tl-tech mono">{step.name}</span>
        </span>
        <span className="wg-tl-ocp">{step.ocpStage}</span>
        <span className="wg-tl-chev" aria-hidden>
          {open ? '−' : '+'}
        </span>
      </button>
      {open && (
        <div className="wg-tl-body">
          <p>{step.detail}</p>
          {step.keyArtifacts && step.keyArtifacts.length > 0 && (
            <p className="wg-arts">
              Evidence:{' '}
              {step.keyArtifacts.map((a) => (
                <code key={a}>{a}</code>
              ))}
            </p>
          )}
          <div className="wg-tl-links">
            {step.stepsCi && (
              <a className="btn btn-primary" href={step.stepsCi} target="_blank" rel="noreferrer">
                steps.ci
              </a>
            )}
            {step.releaseYaml && (
              <a className="btn" href={step.releaseYaml} target="_blank" rel="noreferrer">
                YAML
              </a>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
