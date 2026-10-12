import { useMemo, useState } from 'react';
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

const PHASE_COPY: Record<
  'pre' | 'test' | 'post',
  { title: string; plain: string; install: string }
> = {
  pre: {
    title: 'Build the cluster',
    plain: 'Clean the LPAR, write install config, create VMs, run openshift-install until the cluster is up.',
    install: 'install-config → bootstrap → install-complete',
  },
  test: {
    title: 'Run the tests',
    plain: 'Confirm the API is healthy, then run openshift-tests (conformance, serial, upgrade, …).',
    install: 'post-install validation',
  },
  post: {
    title: 'Collect logs & tear down',
    plain: 'Gather must-gather / extras (best-effort), then destroy libvirt resources for the next job.',
    install: 'debug artifacts → deprovision',
  },
};

/** Primary workflows shown in the picker; others available via “More”. */
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
  const [wfId, setWfId] = useState(
    PRIMARY_WF.includes(initial.id) ? initial.id : initial.id === 'upi' ? 'vpn' : initial.id,
  );
  const [showMoreWf, setShowMoreWf] = useState(
    !PRIMARY_WF.includes(initial.id) && initial.id !== 'vpn',
  );
  const [openStep, setOpenStep] = useState<string | null>(null);
  const [showAllEnv, setShowAllEnv] = useState(false);

  const wf = workflowByName(wfId) || GUIDE_WORKFLOWS[0];
  const primaryEnvs = ENV_VARS.slice(0, 8);
  const extraEnvs = ENV_VARS.slice(8);

  return (
    <div className={`wg ${compact ? 'wg-compact' : ''}`}>
      {!compact && (
        <header className="wg-hero">
          <h2>Understand an IBM Z CI job</h2>
          <p>
            One story: how a Prow job installs OpenShift on IBM Z libvirt, runs tests, then cleans up.
            Technical step names are optional — expand only what you need.
          </p>
        </header>
      )}

      {jobName && (
        <p className="wg-context">
          Context for this job: <strong className="mono">{jobName.split('/').pop()}</strong>
        </p>
      )}

      {/* Workflow choice — simple, not a card wall */}
      <div className="wg-pick">
        <span className="wg-pick-label">Workflow</span>
        <div className="wg-pick-row">
          {GUIDE_WORKFLOWS.filter((w) => PRIMARY_WF.includes(w.id)).map((w) => (
            <button
              key={w.id}
              type="button"
              className={wfId === w.id ? 'on' : ''}
              onClick={() => {
                setWfId(w.id);
                setOpenStep(null);
              }}
            >
              {labelFor(w)}
            </button>
          ))}
          <button
            type="button"
            className="wg-more"
            onClick={() => setShowMoreWf((v) => !v)}
            aria-expanded={showMoreWf}
          >
            {showMoreWf ? 'Less' : 'More…'}
          </button>
        </div>
        {showMoreWf && (
          <div className="wg-pick-row wg-pick-extra">
            {GUIDE_WORKFLOWS.filter((w) => !PRIMARY_WF.includes(w.id)).map((w) => (
              <button
                key={w.id}
                type="button"
                className={wfId === w.id ? 'on' : ''}
                onClick={() => {
                  setWfId(w.id);
                  setOpenStep(null);
                }}
              >
                {labelFor(w)}
              </button>
            ))}
          </div>
        )}
        <p className="wg-lead">
          {wf.summary}
          <span className="wg-links">
            <a href={wf.stepsCi} target="_blank" rel="noreferrer">
              Docs
            </a>
            <a href={wf.releaseYaml} target="_blank" rel="noreferrer">
              Source
            </a>
          </span>
        </p>
      </div>

      {/* Big 3-phase story */}
      <section className="wg-story" aria-label="Job phases">
        <h3 className="wg-h">The job in three phases</h3>
        <div className="wg-phases">
          {(['pre', 'test', 'post'] as const).map((ph, i) => {
            const c = PHASE_COPY[ph];
            const count = wf.steps.filter((s) => s.phase === ph).length;
            return (
              <article key={ph} className={`wg-phase ph-${ph}`}>
                <div className="wg-phase-n">{i + 1}</div>
                <h4>{c.title}</h4>
                <p>{c.plain}</p>
                <p className="wg-phase-map">
                  <span>Install stage</span> {c.install}
                </p>
                <p className="wg-phase-count">
                  {count} CI step{count === 1 ? '' : 's'} below
                </p>
              </article>
            );
          })}
        </div>
      </section>

      {/* Steps — friendly first */}
      <section className="wg-steps" aria-label="Steps">
        <h3 className="wg-h">Steps (click to expand)</h3>
        <p className="wg-sub">
          Plain English first. The <code>technical-name</code> is what you see in Prow / GCS.
        </p>
        {(['pre', 'test', 'post'] as const).map((ph) => {
          const steps = wf.steps.filter((s) => s.phase === ph);
          if (!steps.length) return null;
          return (
            <div key={ph} className={`wg-bucket ph-${ph}`}>
              <h4>
                <span className="wg-badge">{PHASE_COPY[ph].title}</span>
              </h4>
              <ul>
                {steps.map((s, idx) => (
                  <StepRow
                    key={`${s.name}-${idx}`}
                    step={s}
                    open={openStep === s.name}
                    onToggle={() => setOpenStep(openStep === s.name ? null : s.name)}
                  />
                ))}
              </ul>
            </div>
          );
        })}
      </section>

      {/* Environments — short cards */}
      <section className="wg-env" aria-label="Environments">
        <h3 className="wg-h">Where the job runs</h3>
        <p className="wg-sub">
          The <strong>cluster profile</strong> is the leased lab environment (credentials + LPAR). The
          workflow is the list of steps above.
        </p>
        <div className="wg-env-grid">
          {CLUSTER_PROFILES.filter((p) => p.status !== 'legacy' || showMoreWf).map((p) => {
            const active = wf.profiles.includes(p.id);
            return (
              <article key={p.id} className={active ? 'wg-env-card on' : 'wg-env-card'}>
                <h4>{friendlyProfile(p.id)}</h4>
                <p>{p.summary}</p>
                <p className="wg-env-path">{p.connectivity}</p>
                {active && <span className="wg-tag">Used by this workflow</span>}
              </article>
            );
          })}
        </div>
      </section>

      {/* Env vars — essentials */}
      <section className="wg-vars" aria-label="Environment variables">
        <h3 className="wg-h">Important settings</h3>
        <p className="wg-sub">Set in the multiarch nightly job config. These change job behaviour most often.</p>
        <dl className="wg-var-list">
          {(showAllEnv ? ENV_VARS : primaryEnvs).map((e) => (
            <div key={e.name} className="wg-var">
              <dt>
                <code>{e.name}</code>
              </dt>
              <dd>
                <span className="wg-var-mean">{e.meaning}</span>
                <span className="wg-var-typ">
                  Usually: <strong>{e.typical}</strong>
                </span>
              </dd>
            </div>
          ))}
        </dl>
        {extraEnvs.length > 0 && (
          <button type="button" className="btn" onClick={() => setShowAllEnv((v) => !v)}>
            {showAllEnv ? 'Show fewer' : `Show ${extraEnvs.length} more settings`}
          </button>
        )}
      </section>

      {!compact && (
        <>
          <section className="wg-names" aria-label="Job names">
            <h3 className="wg-h">Reading a job name</h3>
            <ul className="wg-name-list">
              {JOB_PATTERNS.map((p) => (
                <li key={p.pattern}>
                  <code>{p.pattern}</code>
                  <span>{p.meaning}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="wg-hist" aria-label="Version history">
            <h3 className="wg-h">Across OCP versions</h3>
            <ol className="wg-hist-list">
              {VERSION_NOTES.map((v) => (
                <li key={v.version}>
                  <strong>{v.version}</strong>
                  <span>{v.notes}</span>
                </li>
              ))}
            </ol>
          </section>
        </>
      )}
    </div>
  );
}

function labelFor(w: GuideWorkflow): string {
  if (w.id === 'vpn') return 'VPN (usual)';
  if (w.id === 'vpn-fips') return 'VPN + FIPS';
  if (w.id === 'hetero') return 'Mixed arch (z-xz)';
  if (w.id === 'upi') return 'UPI / external';
  if (w.id === 'ibmcloud') return 'IBM Cloud';
  return w.title;
}

function friendlyProfile(id: string): string {
  if (id === 'libvirt-s390x-vpn') return 'Z libvirt over VPN';
  if (id === 'libvirt-s390x-amd64') return 'Z + x86 mixed';
  if (id === 'ibmcloud-multi-s390x') return 'IBM Cloud s390x';
  if (id === 'libvirt-s390x-2') return 'Legacy Z libvirt';
  return id;
}

function friendlyStepTitle(s: GuideStep): string {
  // Prefer first clause of ocpStage or a short rewrite from summary
  const stage = s.ocpStage.split('·')[0]?.trim();
  if (stage && stage.length < 48) return stage;
  return s.summary.split('.')[0] || s.name;
}

function StepRow({
  step,
  open,
  onToggle,
}: {
  step: GuideStep;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <li className={open ? 'open' : ''}>
      <button type="button" className="wg-step" onClick={onToggle} aria-expanded={open}>
        <span className="wg-step-main">
          <span className="wg-step-title">
            {friendlyStepTitle(step)}
            {step.bestEffort ? <em> · optional</em> : null}
          </span>
          <span className="wg-step-tech mono">{step.name}</span>
        </span>
        <span className="wg-chev" aria-hidden>
          {open ? '−' : '+'}
        </span>
      </button>
      {open && (
        <div className="wg-step-body">
          <p>{step.detail}</p>
          <p className="wg-step-sum">{step.summary}</p>
          {step.keyArtifacts && step.keyArtifacts.length > 0 && (
            <p className="wg-arts">
              Look at:{' '}
              {step.keyArtifacts.map((a) => (
                <code key={a}>{a}</code>
              ))}
            </p>
          )}
          <div className="wg-step-links">
            {step.stepsCi && (
              <a className="btn" href={step.stepsCi} target="_blank" rel="noreferrer">
                Step docs
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
