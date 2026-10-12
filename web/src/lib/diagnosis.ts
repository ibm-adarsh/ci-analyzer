import { BEST_EFFORT_STEPS, PHASE_META } from '../data/workflow';
import { VPN_WORKFLOW_STEPS } from '../data/vpnWorkflow';
import { STEP_INFO } from '../data/stepInfo';
import type { Diagnosis, StepResult } from '../types';
import { fmtDur } from './gcs';

function phaseForStep(ref: string): keyof typeof PHASE_META | null {
  const def = VPN_WORKFLOW_STEPS.find((s) => s.name === ref);
  if (def) return def.phase;
  if (ref.includes('gather') || ref.includes('cleanup-post') || ref.includes('kdump-gather')) return 'post';
  if (ref.includes('test') || ref.includes('e2e')) return 'test';
  if (ref.includes('install') || ref.includes('conf') || ref.includes('cleanup-pre')) return 'pre';
  return null;
}

/** Pull a short evidence window around the first error-ish lines (no canned hypotheses). */
export function extractSnippet(log: string): string | null {
  if (!log) return null;
  const lines = log.split('\n');
  const re =
    /\b(error|failed|failure|fatal|panic|timeout|deadline exceeded|exit status [1-9])/i;
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) {
      return lines.slice(Math.max(0, i - 2), Math.min(lines.length, i + 6)).join('\n');
    }
  }
  const tail = lines.slice(-40).join('\n').trim();
  return tail || null;
}

export function buildDiagnosis(input: {
  result: string;
  firstFailed: string | null;
  secondaryFailed: string[];
  steps: Record<string, StepResult>;
  artBase: string;
  raw: string;
  counts: Record<string, number>;
}): Diagnosis {
  const d: Diagnosis = {
    summary: '',
    facts: [],
    hypotheses: [],
    nextSteps: [],
    evidence: [],
    primaryStep: input.firstFailed,
    secondarySteps: input.secondaryFailed,
    confidence: 'none',
  };

  if (input.result === 'PASSED') {
    d.summary = 'Job completed successfully. No failing step detected in finished.json / prowjob status.';
    d.confidence = 'high';
    d.facts.push('Overall result: PASSED');
    d.facts.push(`${input.counts.passed || 0} steps passed`);
    d.nextSteps.push({ label: 'Browse artifacts', tab: 'artifacts' });
    return d;
  }

  if (input.result === 'RUNNING') {
    d.summary = 'Job is still running — results are partial.';
    d.confidence = 'low';
    d.facts.push('Overall result: RUNNING');
    const running = Object.entries(input.steps).find(([, v]) => v.status === 'running');
    if (running) d.facts.push(`Currently executing step: ${running[0]}`);
    d.nextSteps.push({ label: 'Open CI Operator Log', tab: 'prowlog' });
    return d;
  }

  const ref = input.firstFailed;
  if (!ref) {
    d.summary = 'Job marked failed, but no failed step directory was found under artifacts/.';
    d.confidence = 'low';
    d.facts.push(`Overall result: ${input.result}`);
    d.facts.push('No step with status=failed in discovered artifact directories');
    d.nextSteps.push({ label: 'Inspect CI Operator Log', tab: 'prowlog' });
    d.nextSteps.push({ label: 'Browse artifacts', tab: 'artifacts' });
    d.facts.push('Check root build-log.txt — failure may be before multi-stage steps or artifacts incomplete.');
    return d;
  }

  const step = input.steps[ref];
  const info = STEP_INFO[ref];
  const phaseKey = phaseForStep(ref);
  const phaseLbl = phaseKey ? PHASE_META[phaseKey].label : 'Unknown phase';
  const isBestEffort = BEST_EFFORT_STEPS.has(ref);

  d.summary = isBestEffort
    ? `Primary observed failure is best-effort step ${ref} (${phaseLbl}). Treat as secondary unless install/test also failed.`
    : `Primary failure signal: step ${ref} failed during ${phaseLbl}.`;
  d.confidence = step?.finJson?.passed === false ? 'medium' : 'low';
  d.facts.push(`First failing step (non-best-effort preferred): ${ref}`);
  d.facts.push(`Phase: ${phaseLbl}`);
  if (step?.duration != null) d.facts.push(`Step duration (inferred): ${fmtDur(step.duration)}`);
  if (step?.finJson?.passed === false) d.facts.push('Confirmed by step finished.json: passed=false');
  if (isBestEffort) d.facts.push('This step is typically best_effort / optional_on_success');
  if (input.secondaryFailed.length) {
    d.facts.push(`Additional failed steps: ${input.secondaryFailed.join(', ')}`);
  }

  d.evidence.push({
    label: `${ref}/build-log.txt`,
    url: `${input.artBase}/${ref}/build-log.txt`,
    kind: 'log',
    primary: true,
    desc: 'Step execution log',
  });
  if (ref.includes('upi-install-libvirt')) {
    d.evidence.push({
      label: `${ref}/.openshift_install.log`,
      url: `${input.artBase}/${ref}/.openshift_install.log`,
      kind: 'log',
      primary: true,
      desc: 'Full openshift-install log',
    });
  }
  if (ref === 'openshift-e2e-libvirt-test') {
    d.evidence.push({
      label: `${ref}/artifacts/junit/`,
      url: `${input.artBase}/${ref}/artifacts/junit/`,
      kind: 'dir',
      primary: true,
      desc: 'JUnit XML test results',
    });
  }
  for (const g of ['gather-extra', 'gather-must-gather', 'gather-audit-logs']) {
    if (input.steps[g]) {
      d.evidence.push({
        label: `${g}/build-log.txt`,
        url: `${input.artBase}/${g}/build-log.txt`,
        kind: 'log',
        primary: false,
        desc: STEP_INFO[g]?.desc || 'Post-gather artifact',
      });
    }
  }
  if (input.steps['gather-must-gather']) {
    d.evidence.push({
      label: 'gather-must-gather/must-gather.tar.gz',
      url: `${input.artBase}/gather-must-gather/must-gather.tar.gz`,
      kind: 'archive',
      primary: false,
      desc: 'Must-gather archive (if produced)',
    });
  }

  d.nextSteps.push({ label: `Open ${ref} in Steps`, tab: 'steps' });
  d.nextSteps.push({ label: 'Browse Artifact Explorer', tab: 'artifacts' });
  d.nextSteps.push({ label: 'Correlate with openshift/release config', tab: 'config' });
  d.nextSteps.push({ label: 'Open original Prow page', href: input.raw });
  for (const h of (info?.hints || []).slice(0, 2)) {
    d.nextSteps.push({ label: h.t.replace(/<[^>]+>/g, '') });
  }

  return d;
}
