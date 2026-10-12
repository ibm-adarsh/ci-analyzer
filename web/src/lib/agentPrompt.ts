import type { DebugAnalysis } from './analyze';
import type { WorkflowStepView } from './analyze';
import { WORKFLOW_SOURCE } from '../data/vpnWorkflow';
import { fmtDur } from './gcs';

export type PromptMode = 'focused' | 'full';

const TAIL_LINES = 80;

function lastLines(text: string | null | undefined, n = TAIL_LINES): string | null {
  if (!text || text === '__REDACTED__') return text || null;
  const lines = text.split('\n');
  if (lines.length <= n) return text;
  return lines.slice(-n).join('\n');
}

function section(title: string): string {
  return `${title}\n${'-'.repeat(Math.min(title.length, 48))}`;
}

/** Build a clean copy-paste brief for an external AI agent (plain text, no markdown). */
export function buildAgentPrompt(a: DebugAnalysis, mode: PromptMode = 'focused'): string {
  const failed = a.workflow.filter((w) => w.status === 'failed');
  const current = a.workflow.find((w) => w.name === a.currentStep);
  const lines: string[] = [];

  lines.push('IBM Z OpenShift CI — failure analysis request');
  lines.push('');
  lines.push(
    'Please analyse this IBM Z (s390x / libvirt VPN) CI job failure or in-progress run. Use the URLs below to fetch logs and artifacts yourself. Prefer evidence over speculation; distinguish confirmed facts from hypotheses.',
  );
  lines.push('');

  lines.push(section('Job'));
  lines.push(`Prow URL: ${a.raw}`);
  lines.push(`Job name: ${a.jobName}`);
  lines.push(`Build ID: ${a.buildId}`);
  lines.push(`Overall result: ${a.result}`);
  lines.push(`Summary: ${a.progressSummary}`);
  if (a.started?.timestamp) {
    lines.push(`Started (UTC): ${new Date(a.started.timestamp * 1000).toISOString()}`);
  }
  if (a.started?.timestamp && a.finished?.timestamp) {
    lines.push(`Duration: ${fmtDur(a.finished.timestamp - a.started.timestamp)}`);
  }
  lines.push('');

  lines.push(section('Context'));
  lines.push(`Cluster profile: ${a.meta.profile}`);
  lines.push(`Topology: ${a.meta.topology}`);
  lines.push(`Workflow: ${a.meta.workflow || WORKFLOW_SOURCE.name}`);
  lines.push(`Workflow docs: ${WORKFLOW_SOURCE.stepsCi}`);
  lines.push(`Workflow YAML: ${WORKFLOW_SOURCE.yaml}`);
  lines.push(
    `OCP / BRANCH: ${a.meta.ocpVersion || 'unknown'}${a.meta.fromVersion ? ` (upgrade from ${a.meta.fromVersion})` : ''}`,
  );
  lines.push(
    `Test type: ${a.meta.testType}${a.meta.fips ? ' · FIPS' : ''}${a.meta.techPreview ? ' · TechPreview' : ''}`,
  );
  lines.push(`Installer: ${a.meta.installer}`);
  lines.push(`Artifact test subdir: ${a.testSubdir || 'n/a'}`);
  if (a.leaseSlot) {
    lines.push(`Boskos lease: ${a.leaseSlot}`);
    if (a.lease?.pool) lines.push(`Boskos pool: ${a.lease.pool}`);
    if (a.lease?.qemuUri) {
      lines.push(`Libvirt URI (from ${a.lease.connectionSource || 'step log'}): ${a.lease.qemuUri}`);
    } else if (a.lease?.hostname) {
      lines.push(`LPAR hostname: ${a.lease.hostname}`);
    }
  }
  if (a.release?.tag) {
    lines.push(
      `Release build tag: ${a.release.tag}${a.release.createdAt ? ` (created ${a.release.createdAt})` : ''}`,
    );
    if (a.release.initialTag) lines.push(`Upgrade from release: ${a.release.initialTag}`);
    lines.push(`Release evidence source: ${a.release.source}`);
  }
  if (a.release?.pullSpec) lines.push(`Release pullspec: ${a.release.pullSpec}`);
  if (a.release?.installTarget) lines.push(`Install-related image: ${a.release.installTarget}`);
  lines.push(`GCS job root: ${a.base}/`);
  lines.push(`GCS artifacts root: ${a.artBase}/`);
  lines.push('');

  const cfg = a.configLinks.links.filter((l) => l.group === 'config' || l.group === 'execution');
  if (cfg.length) {
    lines.push(section('Configuration links'));
    for (const l of cfg) {
      lines.push(`${l.label}${l.unresolved ? ' (unresolved)' : ''}: ${l.url}`);
    }
    lines.push('');
  }

  if (a.phaseTimings?.length) {
    lines.push(section('Phase durations'));
    lines.push('(Sum of step finished.json time deltas; not wall-clock exclusive.)');
    for (const t of a.phaseTimings) {
      lines.push(
        `${t.label}: ${fmtDur(t.seconds)} — ${t.timedSteps}/${t.stepCount} timed steps, status=${t.status}`,
      );
    }
    lines.push('');
  }

  if (a.firstFailed || failed.length) {
    lines.push(section('Failed steps'));
    if (a.firstFailed) {
      lines.push(`Primary failure signal: ${a.firstFailed}`);
    }
    for (const w of failed) {
      appendFailedStep(lines, w, a.firstFailed === w.name, mode);
    }
    if (a.secondaryFailed.length) {
      lines.push(`Additional failed steps: ${a.secondaryFailed.join(', ')}`);
    }
    lines.push('');
  } else if (a.result === 'RUNNING' && current) {
    lines.push(section('Currently in progress'));
    lines.push(`Current / next step: ${a.currentStep}`);
    appendStepArtifacts(lines, current);
    const tail = lastLines(current.logTail);
    if (tail === '__REDACTED__') {
      lines.push('Log status: redacted by Prow.');
    } else if (tail) {
      lines.push(`Last ${TAIL_LINES} lines of build-log.txt (partial while running):`);
      lines.push('-----');
      lines.push(tail);
      lines.push('-----');
    } else if (!current.observed) {
      lines.push('No artifact directory yet for this step (not started or not flushed).');
    }
    lines.push('');
  }

  if (mode === 'full') {
    lines.push(section('Workflow status'));
    lines.push('(Configured vpn workflow vs observed GCS directories)');
    for (const w of a.workflow) {
      const dur = w.duration != null ? ` · ${fmtDur(w.duration)}` : '';
      const obs = w.observed ? '' : ' · no artifact dir';
      lines.push(`[${w.status}] ${w.name} (${w.phase})${dur}${obs}`);
    }
    lines.push('');

    if (a.diagnosis.facts.length) {
      lines.push(section('Diagnosis facts'));
      for (const f of a.diagnosis.facts) lines.push(`- ${f}`);
      lines.push('');
    }
  } else {
    // Focused: compact workflow line for failed/current only + counts
    const passed = a.workflow.filter((w) => w.status === 'passed').length;
    const pending = a.workflow.filter((w) => w.status === 'pending' || w.status === 'current').length;
    lines.push(section('Workflow snapshot'));
    lines.push(
      `Steps: ${passed} passed, ${failed.length} failed, ${pending} pending/current (of ${a.workflow.length} configured/observed).`,
    );
    lines.push('');
  }

  lines.push(section('What I need from you'));
  lines.push('1. Identify the most likely primary failure vs secondary or best-effort symptoms.');
  lines.push('2. Cite concrete log lines or artifact paths that support the conclusion.');
  lines.push('3. Suggest the next 2–4 concrete investigative actions (which file to open, what to search for).');
  lines.push('4. If evidence is insufficient, say what is missing and which URL to fetch next.');
  lines.push(
    '5. You may fetch more from the GCS/Prow links above (install log, junit, gather-extra, must-gather, root build-log, release ImageStream).',
  );
  lines.push(
    '6. Consider IBM Z / libvirt VPN specifics: Boskos lease, bastion/qemu+tcp, etcd-on-ramfs, stale virsh volumes, multi-arch release images.',
  );
  lines.push('');
  lines.push('Generated by IBM Z Job Debugger for paste into an AI agent.');

  return lines.join('\n');
}

function appendStepArtifacts(lines: string[], w: WorkflowStepView): void {
  if (w.stepBase) {
    lines.push(`build-log.txt: ${w.stepBase}/build-log.txt`);
  }
  for (const art of w.keyArtifacts) {
    lines.push(`${art.label}: ${art.url}`);
  }
}

function appendFailedStep(
  lines: string[],
  w: WorkflowStepView,
  primary: boolean,
  mode: PromptMode,
): void {
  lines.push('');
  lines.push(
    `Step: ${w.name}${primary ? ' (primary)' : ''} · phase=${w.phase}${w.bestEffort ? ' · best_effort' : ''}${w.duration != null ? ` · ${fmtDur(w.duration)}` : ''}`,
  );
  appendStepArtifacts(lines, w);
  if (!w.stepBase && w.keyArtifacts.length === 0) {
    lines.push('No artifact URLs available for this step.');
  }

  const tail = lastLines(w.logTail);
  if (tail === '__REDACTED__') {
    lines.push('Log status: redacted by Prow.');
  } else if (tail) {
    lines.push(`Last ${TAIL_LINES} lines of build-log.txt:`);
    lines.push('-----');
    lines.push(mode === 'full' ? tail : tail);
    lines.push('-----');
  } else {
    lines.push('Log tail not available inline; open build-log.txt from the URL above.');
  }
}
