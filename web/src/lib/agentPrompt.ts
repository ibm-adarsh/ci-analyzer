import type { DebugAnalysis } from './analyze';
import { WORKFLOW_SOURCE } from '../data/vpnWorkflow';
import { fmtDur } from './gcs';

export type PromptMode = 'focused' | 'full';

function truncate(s: string | null | undefined, max = 2500): string {
  if (!s) return '';
  if (s.length <= max) return s;
  return `${s.slice(0, max)}\n\n… [truncated ${s.length - max} chars — fetch full file from the artifact URL above]`;
}

/** Build a copy-paste prompt for an external AI agent to continue debugging. */
export function buildAgentPrompt(a: DebugAnalysis, mode: PromptMode = 'focused'): string {
  const failed = a.workflow.filter((w) => w.status === 'failed');
  const current = a.workflow.find((w) => w.name === a.currentStep);
  const lines: string[] = [];

  lines.push('# IBM Z OpenShift CI — failure analysis request');
  lines.push('');
  lines.push(
    'Please analyse this IBM Z (s390x / libvirt VPN) CI job failure (or in-progress run). Use the links below to fetch logs and artifacts yourself. Prefer evidence over speculation; distinguish confirmed facts from hypotheses.',
  );
  lines.push('');
  lines.push('## Job');
  lines.push(`- **Prow URL:** ${a.raw}`);
  lines.push(`- **Job name:** \`${a.jobName}\``);
  lines.push(`- **Build ID:** \`${a.buildId}\``);
  lines.push(`- **Overall result:** ${a.result}`);
  lines.push(`- **Summary:** ${a.progressSummary}`);
  if (a.started?.timestamp) {
    lines.push(`- **Started (UTC):** ${new Date(a.started.timestamp * 1000).toISOString()}`);
  }
  if (a.started?.timestamp && a.finished?.timestamp) {
    lines.push(`- **Duration:** ${fmtDur(a.finished.timestamp - a.started.timestamp)}`);
  }
  lines.push('');

  lines.push('## Context');
  lines.push(`- **Cluster profile:** \`${a.meta.profile}\``);
  lines.push(`- **Topology:** ${a.meta.topology}`);
  lines.push(`- **Workflow:** \`${a.meta.workflow || WORKFLOW_SOURCE.name}\` ([workflow YAML](${WORKFLOW_SOURCE.yaml}))`);
  lines.push(`- **OCP / BRANCH:** ${a.meta.ocpVersion || 'unknown'}${a.meta.fromVersion ? ` (upgrade from ${a.meta.fromVersion})` : ''}`);
  lines.push(`- **Test type:** ${a.meta.testType}${a.meta.fips ? ' · FIPS' : ''}${a.meta.techPreview ? ' · TechPreview' : ''}`);
  lines.push(`- **Installer:** ${a.meta.installer}`);
  lines.push(`- **Artifact test subdir:** \`${a.testSubdir || 'n/a'}\``);
  if (a.leaseSlot) lines.push(`- **Boskos lease:** \`${a.leaseSlot}\``);
  if (a.release?.tag) {
    lines.push(`- **Release build tag:** \`${a.release.tag}\`${a.release.createdAt ? ` (created ${a.release.createdAt})` : ''}`);
    lines.push(`- **Release evidence source:** ${a.release.source}`);
  }
  if (a.release?.pullSpec) lines.push(`- **Tests image pullspec:** \`${a.release.pullSpec}\``);
  if (a.release?.installTarget) lines.push(`- **Install-related image:** \`${a.release.installTarget}\``);
  lines.push(`- **GCS job root:** ${a.base}/`);
  lines.push(`- **GCS artifacts root:** ${a.artBase}/`);
  lines.push('');

  const cfg = a.configLinks.links.filter((l) => l.group === 'config' || l.group === 'execution');
  if (cfg.length) {
    lines.push('## Configuration / navigation links');
    for (const l of cfg) {
      lines.push(`- ${l.label}${l.unresolved ? ' (unresolved)' : ''}: ${l.url}`);
    }
    lines.push('');
  }

  if (a.firstFailed || failed.length) {
    lines.push('## Failed steps (investigate these first)');
    const primary = a.firstFailed;
    if (primary) {
      lines.push(`- **Primary failure signal:** \`${primary}\``);
    }
    for (const w of failed) {
      const mark = w.name === primary ? ' **(primary)**' : '';
      lines.push(`- \`${w.name}\`${mark} · phase=${w.phase}${w.bestEffort ? ' · best_effort' : ''}`);
      if (w.stepBase) {
        lines.push(`  - Step log: ${w.stepBase}/build-log.txt`);
      }
      for (const art of w.keyArtifacts) {
        lines.push(`  - ${art.label}: ${art.url}`);
      }
    }
    if (a.secondaryFailed.length) {
      lines.push(`- Additional failed steps: ${a.secondaryFailed.map((s) => `\`${s}\``).join(', ')}`);
    }
    lines.push('');
  }

  if (a.result === 'RUNNING' && a.currentStep) {
    lines.push('## Currently in progress');
    lines.push(`- **Current / next step:** \`${a.currentStep}\``);
    if (current?.stepBase) {
      lines.push(`- Partial log (if present): ${current.stepBase}/build-log.txt`);
    } else {
      lines.push('- No artifact directory yet for this step (not started or not flushed).');
    }
    lines.push('');
  }

  lines.push('## Workflow status (configured vpn workflow vs observed GCS dirs)');
  for (const w of a.workflow) {
    const dur = w.duration != null ? ` · ${fmtDur(w.duration)}` : '';
    const obs = w.observed ? '' : ' · no artifact dir';
    lines.push(`- [${w.status}] \`${w.name}\` (${w.phase})${dur}${obs}`);
  }
  lines.push('');

  if (a.phaseTimings?.length) {
    lines.push('## Phase durations (sum of step finished.json deltas)');
    for (const t of a.phaseTimings) {
      lines.push(
        `- **${t.label}:** ${fmtDur(t.seconds)} (${t.timedSteps}/${t.stepCount} timed steps, status=${t.status})`,
      );
    }
    lines.push('');
  }

  // Evidence excerpts
  const focusSteps = failed.length
    ? failed
    : current
      ? [current]
      : a.workflow.filter((w) => w.status === 'passed').slice(-1);

  if (focusSteps.length) {
    lines.push(mode === 'full' ? '## Log excerpts (expanded)' : '## Log excerpts (focused)');
    for (const w of focusSteps) {
      const excerpt = w.failureSnippet || (mode === 'full' ? w.logTail : w.logTail?.split('\n').slice(-40).join('\n'));
      if (!excerpt || excerpt === '__REDACTED__') {
        lines.push(`### \`${w.name}\``);
        lines.push(excerpt === '__REDACTED__' ? '_Log redacted by Prow._' : '_No inline excerpt; open the step log URL._');
        lines.push('');
        continue;
      }
      lines.push(`### \`${w.name}\``);
      lines.push('```');
      lines.push(truncate(excerpt, mode === 'full' ? 6000 : 2500));
      lines.push('```');
      lines.push('');
    }
  }

  if (mode === 'full') {
    lines.push('## Diagnosis facts');
    for (const f of a.diagnosis.facts) lines.push(`- ${f}`);
    lines.push('');
  }

  lines.push('## What I need from you');
  lines.push('1. Identify the most likely **primary** failure vs secondary/best-effort symptoms.');
  lines.push('2. Cite concrete log lines / artifact paths that support the conclusion.');
  lines.push('3. Suggest the next 2–4 concrete investigative actions (which file to open, what to search for).');
  lines.push('4. If evidence is insufficient, say what is missing and which URL to fetch next.');
  lines.push('5. You may fetch additional files from the GCS/Prow links above (install log, junit, gather-extra, must-gather, root build-log, release ImageStream).');
  lines.push('6. Consider IBM Z / libvirt VPN specifics: Boskos lease, bastion/`qemu+tcp`, etcd-on-ramfs, stale virsh volumes, multi-arch release images.');
  lines.push('');
  lines.push('_Generated by IBM Z Job Debugger for developer paste into an AI agent._');

  return lines.join('\n');
}
