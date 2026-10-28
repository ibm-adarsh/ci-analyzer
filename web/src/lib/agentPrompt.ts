import type { DebugAnalysis } from './analyze';
import type { WorkflowStepView } from './analyze';
import { WORKFLOW_DOCS, WORKFLOW_SOURCE } from '../data/vpnWorkflow';
import { fmtDur } from './gcs';

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

/** Soft cap so encodeURIComponent(url) stays under common browser URL limits. */
export const GOOGLE_ASK_MAX_CHARS = 1800;

/**
 * Compact brief for Google AI Studio / AI Mode (no API key).
 * Full log tails do not fit URL transport — pair with clipboard copy of buildAgentPrompt.
 */
export function buildGoogleAskBrief(a: DebugAnalysis): string {
  const shortJob = a.jobName
    .replace(/^periodic-ci-openshift-multiarch-main-nightly-/, '')
    .replace(/^periodic-ci-openshift-multiarch-master-nightly-/, '');
  const lines: string[] = [];
  lines.push(
    'Concise root-cause analysis for this IBM Z (s390x / libvirt VPN) OpenShift CI failure. Prefer evidence over speculation. Reply with: (1) primary failure vs secondary, (2) 2–4 next checks, (3) what is still missing.',
  );
  lines.push(`Prow: ${a.raw}`);
  lines.push(`Job: ${shortJob}`);
  lines.push(`Build: ${a.buildId} · result=${a.result}`);
  if (a.meta.ocpVersion) {
    lines.push(
      `OCP ${a.meta.ocpVersion}${a.meta.fromVersion ? ` ← ${a.meta.fromVersion}` : ''}${a.meta.fips ? ' · FIPS' : ''}${a.meta.techPreview ? ' · TechPreview' : ''}`,
    );
  }
  lines.push(`Profile: ${a.meta.profile} · workflow: ${a.meta.workflow || 'openshift-e2e-libvirt-vpn'}`);
  if (a.leaseSlot) lines.push(`Lease: ${a.leaseSlot}`);
  if (a.firstFailed) lines.push(`First failed step: ${a.firstFailed}`);
  const failedSteps = a.workflow.filter((w) => w.status === 'failed').map((w) => w.name);
  if (failedSteps.length) lines.push(`Failed steps: ${failedSteps.slice(0, 6).join(', ')}`);
  if (a.testFailures?.failures?.length) {
    const product = a.testFailures.failures.filter(
      (f) =>
        f.severity === 'blocking' ||
        (f.severity !== 'informing' && f.suite !== 'monitor'),
    );
    const cases = (product.length ? product : a.testFailures.failures).slice(0, 8);
    lines.push(
      `Failed tests (${cases.length}${a.testFailures.failures.length > cases.length ? '+' : ''}):`,
    );
    for (const t of cases) {
      const name = t.name.replace(/\s*\[Suite:[^\]]+\]/g, '').trim();
      lines.push(`- ${name.slice(0, 120)}${t.severity === 'informing' ? ' (informing)' : ''}`);
    }
  }
  for (const f of a.diagnosis.facts.slice(0, 6)) {
    lines.push(`Fact: ${f}`);
  }
  const primary = a.workflow.find((w) => w.name === a.firstFailed);
  if (primary?.stepBase) lines.push(`Primary build-log: ${primary.stepBase}/build-log.txt`);
  lines.push(
    'If you can fetch URLs, open the Prow/GCS links above. Fuller prompt with log tails is on the clipboard.',
  );
  return trimToMax(lines.join('\n'), GOOGLE_ASK_MAX_CHARS);
}

/** Google AI Studio free web UI — prefill via ?prompt= (Google sign-in, no API key). */
export function googleAiStudioAskUrl(brief: string): string {
  const flat = brief.replace(/\r\n/g, '\n').trim();
  return `https://aistudio.google.com/prompts/new_chat?prompt=${encodeURIComponent(flat)}`;
}

function trimToMax(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 14)).trimEnd()}\n…[truncated]`;
}

/** Build a clean copy-paste brief for IBM BOB / any AI agent (plain text, no markdown). */
export function buildAgentPrompt(a: DebugAnalysis): string {
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

  const wfName = a.meta.workflow || WORKFLOW_SOURCE.name;
  const wfDocs = WORKFLOW_DOCS[wfName] || WORKFLOW_SOURCE;
  lines.push(section('Context'));
  lines.push(`Cluster profile: ${a.meta.profile}`);
  lines.push(`Topology: ${a.meta.topologyShort || a.meta.topology}`);
  if (a.meta.workerArch) lines.push(`Worker arch: ${a.meta.workerArch}`);
  lines.push(`Workflow: ${wfName}`);
  lines.push(`Workflow docs: ${wfDocs.stepsCi}`);
  lines.push(`Workflow YAML: ${wfDocs.yaml}`);
  lines.push(
    `OCP / BRANCH: ${a.meta.ocpVersion || 'unknown'}${a.meta.fromVersion ? ` (upgrade from ${a.meta.fromVersion})` : ''}`,
  );
  lines.push(
    `Suite: ${a.meta.suiteLabel || a.meta.testType}${a.meta.fips ? ' · FIPS' : ''}${a.meta.techPreview ? ' · TechPreview' : ''}`,
  );
  lines.push(`Installer: ${a.meta.installerLabel || a.meta.installer}`);
  lines.push(`Artifact test subdir: ${a.testSubdir || 'n/a'}`);
  if (a.leaseSlot) {
    lines.push(`Boskos lease: ${a.leaseSlot}`);
    if (a.lease?.pool) lines.push(`Boskos pool: ${a.lease.pool}`);
    // Prefer short host labels — never copy internal FQDNs into the prompt.
    const shortHost = (a.lease?.hostname || '').split('.')[0] || null;
    const qemuShort = a.lease?.qemuUri?.replace(
      /^(qemu\+tcp:\/\/)([^/:]+)/i,
      (_m, scheme: string, host: string) => `${scheme}${host.split('.')[0]}`,
    );
    if (qemuShort) {
      lines.push(`Libvirt URI (from ${a.lease?.connectionSource || 'step log'}): ${qemuShort}`);
    } else if (shortHost) {
      lines.push(`LPAR hostname: ${shortHost}`);
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
        `${t.label}: ${fmtDur(t.seconds)} — ${t.failedCount} failed, ${t.passedCount} passed, ${t.pendingCount} pending (status=${t.status})`,
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
      appendFailedStep(lines, w, a.firstFailed === w.name);
    }
    if (a.secondaryFailed.length) {
      lines.push(`Additional failed steps: ${a.secondaryFailed.join(', ')}`);
    }
    lines.push('');
  }

  if (a.testFailures && a.testFailures.failures.length) {
    const tf = a.testFailures;
    const product = tf.failures.filter(
      (f) =>
        f.severity === 'blocking' ||
        (f.severity !== 'informing' && f.suite !== 'monitor'),
    );
    const cases = product.length ? product : tf.failures.filter((f) => f.suite !== 'monitor');
    if (cases.length) {
      lines.push(section('Failed test cases'));
      const s = tf.summary;
      if (s.blockingFail != null) {
        lines.push(`Blocking failures (suite summary): ${s.blockingFail}`);
      }
      lines.push(`Failed test cases: ${cases.length}`);
      for (const t of cases.slice(0, 40)) {
        lines.push(
          `  - ${t.name.replace(/\s*\[Suite:[^\]]+\]/g, '').trim()}${
            t.suiteTag ? ` (Suite:${t.suiteTag})` : ''
          }`,
        );
      }
      if (cases.length > 40) lines.push(`  … +${cases.length - 40} more`);
      const linked = new Set(
        cases.map((t) => t.junitFile).filter((n): n is string => Boolean(n)),
      );
      for (const j of tf.junitFiles.filter((f) =>
        linked.size ? linked.has(f.name) : !/monitor/i.test(f.name),
      )) {
        lines.push(`JUnit: ${j.url}`);
      }
      lines.push('');
    }
  }

  if (!(a.firstFailed || failed.length) && a.result === 'RUNNING' && current) {
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
  lines.push('Generated by IBM Z Job Debugger for paste into IBM BOB or any AI agent.');

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

function appendFailedStep(lines: string[], w: WorkflowStepView, primary: boolean): void {
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
    lines.push(tail);
    lines.push('-----');
  } else {
    lines.push('Log tail not available inline; open build-log.txt from the URL above.');
  }
}
