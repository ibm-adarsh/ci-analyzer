import { BEST_EFFORT_STEPS, PHASE_MAP, PHASE_META } from '../data/workflow';
import { STEP_INFO } from '../data/stepInfo';
import { FAIL_PATTERNS } from '../data/failPatterns';
import type { Diagnosis, StepResult } from '../types';
import { fmtDur } from './gcs';

export function detectPatterns(log: string): { category: string; hint: string }[] {
  const found: { category: string; hint: string }[] = [];
  for (const p of FAIL_PATTERNS) {
    if (p.re.test(log)) found.push({ category: p.category, hint: p.hint });
  }
  return found;
}

export function extractSnippet(log: string, patterns: { category: string }[]): string | null {
  if (!log || patterns.length === 0) return null;
  const lines = log.split('\n');
  const snippets: string[] = [];
  for (const fp of FAIL_PATTERNS) {
    for (let i = 0; i < lines.length; i++) {
      if (fp.re.test(lines[i])) {
        snippets.push(lines.slice(Math.max(0, i - 1), i + 3).join('\n'));
        if (snippets.length >= 3) return snippets.join('\n──\n');
      }
    }
  }
  return snippets.length > 0 ? snippets.join('\n──\n') : null;
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
    d.hypotheses.push({
      tag: 'Hypothesis',
      text: 'Failure may have occurred before multi-stage steps, or artifacts are incomplete. Check root build-log.txt.',
    });
    return d;
  }

  const step = input.steps[ref];
  const info = STEP_INFO[ref];
  const pats = step?.patterns || [];
  const phase = Object.entries(PHASE_MAP).find(([, refs]) => refs.includes(ref));
  const phaseLbl = phase ? PHASE_META[phase[0] as keyof typeof PHASE_META].label : 'Unknown phase';
  const isBestEffort = BEST_EFFORT_STEPS.has(ref);

  d.summary = isBestEffort
    ? `Primary observed failure is best-effort step ${ref} (${phaseLbl}). Treat as secondary unless install/test also failed.`
    : `Primary failure signal: step ${ref} failed during ${phaseLbl}.`;
  d.confidence = pats.length ? 'medium' : 'low';
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

  for (const p of pats.slice(0, 4)) {
    d.hypotheses.push({ tag: `Pattern: ${p.category}`, text: p.hint });
  }
  if (!pats.length) {
    d.hypotheses.push({
      tag: 'Insufficient pattern evidence',
      text: 'No known FAIL_PATTERNS matched this step log. Inspect the step log before concluding a cause.',
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
