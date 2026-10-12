export type JobResult = 'PASSED' | 'FAILED' | 'ABORTED' | 'RUNNING' | 'UNKNOWN';
export type StepStatus = 'passed' | 'failed' | 'running' | 'unknown' | 'skipped';
export type ArchClass =
  | 'multi-arch-homogeneous'
  | 'multi-arch-heterogeneous'
  | 'single-arch-s390x'
  | 's390x'
  | 'ppc64le'
  | 'unknown';

export type Confidence = 'high' | 'medium' | 'low' | 'none';

export interface FailPattern {
  re: RegExp;
  category: string;
  hint: string;
}

export interface StepInfo {
  desc: string;
  hints: { t: string; cls?: string }[];
  keyFiles: string[];
}

export interface ParsedUrl {
  bucket: string;
  gcsPath: string;
  jobName: string;
  buildId: string;
  raw: string;
}

export interface JobMeta {
  isRehearse: boolean;
  ocpVersion: string | null;
  fromVersion: string | null;
  testType: string;
  installer: string;
  fips: boolean;
  techPreview: boolean;
  topology: string;
  arch: string;
  profile: string;
  workflow: string | null;
  archClass: ArchClass;
  variant?: string;
  jobRelease?: string;
  prowType?: string;
  refsOrg?: string;
  refsRepo?: string;
  refsBranch?: string;
}

export interface StepResult {
  status: StepStatus;
  duration: number | null;
  finJson: { passed?: boolean; timestamp?: number } | null;
  logTail: string | null;
  logText: string | null;
  patterns: { category: string; hint: string }[];
  failureSnippet: string | null;
  stepBase: string;
}

export interface EvidenceItem {
  label: string;
  url: string;
  kind: string;
  primary: boolean;
  desc: string;
}

export interface Diagnosis {
  summary: string;
  facts: string[];
  hypotheses: { tag: string; text: string }[];
  nextSteps: { label: string; href?: string; tab?: string }[];
  evidence: EvidenceItem[];
  primaryStep: string | null;
  secondarySteps: string[];
  confidence: Confidence;
}

export interface ConfigLinks {
  org: string;
  repo: string;
  branch: string;
  variant: string | null;
  workflow: string | null;
  profile: string;
  archClass: ArchClass | null;
  prowType: string | null;
  links: { label: string; url: string; group: string; unresolved?: boolean }[];
}

export interface Analysis {
  raw: string;
  jobName: string;
  buildId: string;
  bucket: string;
  gcsPath: string;
  base: string;
  artBase: string;
  testSubdir: string | null;
  started: { timestamp?: number } | null;
  finished: { passed?: boolean; timestamp?: number; result?: string } | null;
  prowjob: Record<string, unknown> | null;
  prowLog: string | null;
  steps: Record<string, StepResult>;
  meta: JobMeta;
  result: JobResult;
  counts: Record<StepStatus, number>;
  firstFailed: string | null;
  secondaryFailed: string[];
  phaseStatus: Record<string, string>;
  orderedForFailure: string[];
  diagnosis: Diagnosis;
  configLinks: ConfigLinks;
}

export interface JobIndexEntry {
  jobName: string;
  buildId: string;
  gcsPath: string;
  prowUrl: string;
  result: JobResult;
  archClass: ArchClass;
  startedAt: number | null;
  finishedAt: number | null;
  durationSec: number | null;
  variant: string | null;
  profile: string | null;
  ocpVersion: string | null;
}

export interface JobIndex {
  generatedAt: string;
  bucket: string;
  source: string;
  executions: JobIndexEntry[];
  jobNames: string[];
}

export interface ArtifactEntry {
  name: string;
  fullPath: string;
  isDir: boolean;
  size?: number;
  updated?: string | null;
  contentType?: string;
}
