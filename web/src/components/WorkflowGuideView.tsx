import { useEffect, useMemo, useState } from 'react';
import {
  CI_LAYERS,
  CLUSTER_PROFILES,
  DEBUG_PLAYBOOK,
  EDIT_PATHS,
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
  workflowName?: string | null;
  jobName?: string | null;
  compact?: boolean;
}

type Phase = 'pre' | 'test' | 'post';
type SectionId = 'playbook' | 'anatomy' | 'steps' | 'profiles' | 'env' | 'decode';

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

const SECTIONS: { id: SectionId; label: string }[] = [
  { id: 'playbook', label: 'Debug playbook' },
  { id: 'anatomy', label: 'CI anatomy' },
  { id: 'steps', label: 'Steps' },
  { id: 'profiles', label: 'Profiles' },
  { id: 'env', label: 'Env knobs' },
  { id: 'decode', label: 'Job decoder' },
];

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
  const [showMoreWf, setShowMoreWf] = useState(
    !PRIMARY_WF.includes(initial.id) && initial.id !== 'vpn',
  );
  const [phase, setPhase] = useState<Phase>('pre');
  const [openStep, setOpenStep] = useState<string | null>(null);
  const [showAllEnv, setShowAllEnv] = useState(false);
  const [query, setQuery] = useState('');
  const [activeSection, setActiveSection] = useState<SectionId>('playbook');

  const wf = workflowByName(wfId) || GUIDE_WORKFLOWS[0];
  const phaseMeta = PHASES.find((p) => p.id === phase)!;

  const filteredSteps = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? wf.steps.filter(
          (s) =>
            s.name.toLowerCase().includes(q) ||
            s.summary.toLowerCase().includes(q) ||
            s.ocpStage.toLowerCase().includes(q) ||
            (s.whenFails || '').toLowerCase().includes(q),
        )
      : wf.steps.filter((s) => s.phase === phase);
    return base;
  }, [wf.steps, phase, query]);

  useEffect(() => {
    setOpenStep(null);
  }, [wfId, phase, query]);

  useEffect(() => {
    setWfId(initial.id);
    if (!PRIMARY_WF.includes(initial.id)) setShowMoreWf(true);
  }, [initial.id]);

  const scrollTo = (id: SectionId) => {
    setActiveSection(id);
    const el = document.getElementById(`wg-${id}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className={`wg ${compact ? 'wg-compact' : ''}`}>
      {!compact && (
        <header className="wg-hero">
          <div className="wg-hero-copy">
            <p className="wg-kicker">IBM Z · OpenShift CI · Developer guide</p>
            <h2>
              Debug a libvirt job
              <br />
              <em>like you own the step-registry</em>
            </h2>
            <p className="wg-hero-lead">
              Map Prow → workflow → leaf refs → LPAR. Know which log to open, which env knob
              moved, and where to edit in <code>openshift/release</code>.
            </p>
            <div className="wg-hero-actions">
              <button type="button" className="btn btn-primary" onClick={() => scrollTo('playbook')}>
                Start with playbook
              </button>
              <button type="button" className="btn" onClick={() => scrollTo('steps')}>
                Browse steps
              </button>
              <a
                className="btn"
                href="https://github.com/openshift/release/tree/main/ci-operator/config/openshift/multiarch"
                target="_blank"
                rel="noreferrer"
              >
                multiarch config
              </a>
            </div>
          </div>
          <Schematic />
        </header>
      )}

      {jobName && (
        <p className="wg-context">
          Context for <code>{shortJob(jobName)}</code>
          {workflowName ? (
            <>
              {' '}
              · workflow <code>{workflowName}</code>
            </>
          ) : null}
        </p>
      )}

      {!compact && (
        <nav className="wg-toc" aria-label="Guide sections">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={activeSection === s.id ? 'on' : ''}
              onClick={() => scrollTo(s.id)}
            >
              {s.label}
            </button>
          ))}
        </nav>
      )}

      <section id="wg-playbook" className="wg-playbook">
        <div className="wg-section-head">
          <h3>Debug playbook</h3>
          <p>Five moves when a Z libvirt job fails — before deep-diving every artifact.</p>
        </div>
        <ol className="wg-playbook-list">
          {DEBUG_PLAYBOOK.map((item, i) => (
            <li key={item.title}>
              <span className="wg-playbook-n">{String(i + 1).padStart(2, '0')}</span>
              <div>
                <strong>{item.title}</strong>
                <p>{item.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {!compact && (
        <section id="wg-anatomy" className="wg-anatomy">
          <div className="wg-section-head">
            <h3>CI anatomy</h3>
            <p>How a nightly name becomes leaf artifact directories you debug in GCS.</p>
          </div>
          <div className="wg-layers" aria-label="CI layers">
            {CI_LAYERS.map((layer, i) => (
              <div key={layer.name} className="wg-layer">
                <span className="wg-layer-n">{i + 1}</span>
                <strong>{layer.name}</strong>
                <p>{layer.blurb}</p>
                {i < CI_LAYERS.length - 1 && <i className="wg-layer-arrow" aria-hidden />}
              </div>
            ))}
          </div>
          <div className="wg-ocp-map" aria-label="openshift-install mapping">
            {OCP_INSTALL_PHASES.map((p) => (
              <article key={p.id}>
                <h4>{p.title}</h4>
                <p>{p.mapsTo}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      <div className="wg-toolbar" id="wg-steps">
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
          <div>
            <strong className="wg-wf-title">{wf.title}</strong>
            <p>{wf.summary}</p>
            <span className="wg-since">Since {wf.since}</span>
          </div>
          <div className="wg-toolbar-links">
            <a href={wf.stepsCi} target="_blank" rel="noreferrer">
              steps.ci
            </a>
            <a href={wf.releaseYaml} target="_blank" rel="noreferrer">
              workflow YAML
            </a>
          </div>
        </div>
      </div>

      <section className="wg-rail" aria-label="Job phases">
        {PHASES.map((p) => {
          const count = wf.steps.filter((s) => s.phase === p.id).length;
          const on = !query && phase === p.id;
          return (
            <button
              key={p.id}
              type="button"
              className={`wg-rail-node ph-${p.id}${on ? ' on' : ''}`}
              onClick={() => {
                setPhase(p.id);
                setQuery('');
              }}
              aria-pressed={on}
            >
              <span className="wg-rail-dot">
                <span>{p.n}</span>
              </span>
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

      <section className="wg-map" aria-label="CI vs install mapping">
        <div className="wg-map-col">
          <span className="wg-map-label">CI phase</span>
          <strong>{query ? 'Search' : phaseMeta.verb}</strong>
          <p>{query ? `Matching “${query}”` : `${phaseMeta.title} the job`}</p>
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
          <strong>
            {query
              ? `${filteredSteps.length} hit${filteredSteps.length === 1 ? '' : 's'}`
              : phaseMeta.install.split('→')[0]?.trim() || phaseMeta.install}
          </strong>
          <p>{query ? 'Across PRE / TEST / POST' : phaseMeta.install}</p>
        </div>
      </section>

      <section className="wg-timeline" aria-label={`${phaseMeta.title} steps`}>
        <div className="wg-section-head wg-section-head-row">
          <div>
            <h3>
              {query ? 'Matching steps' : `${phaseMeta.title} steps`}
              <span>{filteredSteps.length}</span>
            </h3>
            <p>Expand a row for failure tips, evidence files, and docs links.</p>
          </div>
          <label className="wg-search">
            <span className="sr-only">Search steps</span>
            <input
              type="search"
              placeholder="Search step name, stage, failure…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query ? (
              <button type="button" className="wg-search-clear" onClick={() => setQuery('')}>
                Clear
              </button>
            ) : null}
          </label>
        </div>
        {filteredSteps.length === 0 ? (
          <p className="wg-empty">No steps match that search in {wf.name}.</p>
        ) : (
          <ol className="wg-tl">
            {filteredSteps.map((s, idx) => (
              <StepRow
                key={`${s.name}-${idx}`}
                index={idx + 1}
                step={s}
                showPhase={!!query}
                open={openStep === s.name}
                onToggle={() => setOpenStep(openStep === s.name ? null : s.name)}
              />
            ))}
          </ol>
        )}
      </section>

      <section id="wg-profiles" className="wg-path" aria-label="Where the job runs">
        <div className="wg-section-head">
          <h3>Where it runs</h3>
          <p>
            Profile = leased lab + secrets. Workflow = steps above. Most Z jobs use{' '}
            <strong>libvirt-s390x-vpn</strong>; z-xz / z-za use mixed-arch profiles.
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
                  <p className="wg-env-usage">{p.usage}</p>
                  <p className="wg-env-conn">{p.connectivity}</p>
                  <code>{p.id}</code>
                  {p.typicalJobs.length > 0 && (
                    <ul className="wg-env-jobs">
                      {p.typicalJobs.slice(0, 3).map((j) => (
                        <li key={j}>
                          <code>{j}</code>
                        </li>
                      ))}
                    </ul>
                  )}
                </article>
              );
            },
          )}
        </div>
      </section>

      <section id="wg-env" className="wg-vars" aria-label="Environment variables">
        <div className="wg-section-head">
          <h3>Knobs that matter</h3>
          <p>
            Job <code>env:</code> in multiarch nightlies — these change install/test behaviour most
            often.
          </p>
        </div>
        <div className="wg-var-grid">
          {(showAllEnv ? ENV_VARS : ENV_VARS.slice(0, compact ? 4 : 6)).map((e) => (
            <article key={e.name} className="wg-var-card">
              <code>{e.name}</code>
              <p>{e.meaning}</p>
              <span>
                usually <strong>{e.typical}</strong>
              </span>
              <span className="wg-var-where">{e.where}</span>
            </article>
          ))}
        </div>
        <button type="button" className="btn wg-more-btn" onClick={() => setShowAllEnv((v) => !v)}>
          {showAllEnv
            ? 'Show fewer'
            : `Show ${ENV_VARS.length - (compact ? 4 : 6)} more`}
        </button>
      </section>

      {!compact && (
        <>
          <section className="wg-edit" aria-label="Where to edit">
            <div className="wg-section-head">
              <h3>Where to edit in openshift/release</h3>
              <p>Pick the change locus before opening a PR against the release repo.</p>
            </div>
            <ul className="wg-edit-list">
              {EDIT_PATHS.map((e) => (
                <li key={e.path}>
                  <strong>{e.change}</strong>
                  <code>{e.path}</code>
                  <a href={e.url} target="_blank" rel="noreferrer">
                    Open
                  </a>
                </li>
              ))}
            </ul>
          </section>

          <section id="wg-decode" className="wg-footer-grid">
            <div>
              <h3>Job name decoder</h3>
              <ul className="wg-chips">
                {JOB_PATTERNS.map((p) => (
                  <li key={p.pattern}>
                    <code>{p.pattern}</code>
                    <span>
                      {p.meaning}
                      <em className="wg-chip-ex">{p.example}</em>
                    </span>
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
        </>
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
        <g stroke="currentColor" strokeOpacity="0.08" strokeWidth="1">
          {Array.from({ length: 8 }).map((_, i) => (
            <line key={`v${i}`} x1={40 + i * 48} y1={20} x2={40 + i * 48} y2={200} />
          ))}
          {Array.from({ length: 5 }).map((_, i) => (
            <line key={`h${i}`} x1={20} y1={30 + i * 40} x2={400} y2={30 + i * 40} />
          ))}
        </g>
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
  if (w.id === 'hetero') return 'z-xz / z-za';
  if (w.id === 'upi') return 'UPI';
  if (w.id === 'ibmcloud') return 'IBM Cloud';
  return w.title;
}

function friendlyProfile(id: string): string {
  if (id === 'libvirt-s390x-vpn') return 'Z over VPN';
  if (id === 'libvirt-s390x-amd64') return 'Z + x86';
  if (id === 'libvirt-s390x-vpn-arm64') return 'Z + arm64';
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
  showPhase,
}: {
  index: number;
  step: GuideStep;
  open: boolean;
  onToggle: () => void;
  showPhase?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <li className={`wg-tl-item ph-${step.phase}${open ? ' open' : ''}`}>
      <button type="button" className="wg-tl-btn" onClick={onToggle} aria-expanded={open}>
        <span className="wg-tl-idx">{String(index).padStart(2, '0')}</span>
        <span className="wg-tl-main">
          <span className="wg-tl-title">
            {friendlyStepTitle(step)}
            {showPhase ? <em className="wg-phase-tag">{step.phase.toUpperCase()}</em> : null}
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
          {step.whenFails && (
            <div className="wg-when-fails">
              <strong>When this fails</strong>
              <p>{step.whenFails}</p>
            </div>
          )}
          {step.keyArtifacts && step.keyArtifacts.length > 0 && (
            <p className="wg-arts">
              Evidence:{' '}
              {step.keyArtifacts.map((a) => (
                <code key={a}>{a}</code>
              ))}
            </p>
          )}
          <div className="wg-tl-links">
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
              {copied ? 'Copied' : 'Copy step name'}
            </button>
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
