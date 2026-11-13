# IBM Z Job Debugger — Architecture

**In one line:** You paste a Prow CI job link. The web app (in your browser) downloads the job’s public logs and files from Google Cloud Storage, then shows a clear debug page for IBM Z OpenShift jobs. There is no app server, no API keys, and no private buckets.

**Live app:** [ibm-adarsh.github.io/ci-analyzer](https://ibm-adarsh.github.io/ci-analyzer)

This page explains **what the app is**, **what tech it uses**, **how data moves**, and **where the code lives**. Diagrams first; short text under each.

---

## Table of contents

1. [Who this is for](#1-who-this-is-for)
2. [Tech and languages](#2-tech-and-languages)
3. [Folders in the repo](#3-folders-in-the-repo)
4. [Big picture](#4-big-picture)
5. [What the user does](#5-what-the-user-does)
6. [Pages and URLs](#6-pages-and-urls)
7. [Where job files live (GCS)](#7-where-job-files-live-gcs)
8. [Full flow for one job](#8-full-flow-for-one-job)
9. [How analysis works](#9-how-analysis-works)
10. [Workflows we know about](#10-workflows-we-know-about)
11. [Failed tests: blocking vs informing](#11-failed-tests-blocking-vs-informing)
12. [Code map](#12-code-map)
13. [What you see on the job page](#13-what-you-see-on-the-job-page)
14. [Build, test, and publish](#14-build-test-and-publish)
15. [Safety](#15-safety)
16. [Simple word list](#16-simple-word-list)

---

## 1. Who this is for

| Person | What they get |
|--------|----------------|
| **IBM Z CI engineer** | From one failed Prow link → lease/LPAR, failed step, junit, must-gather, release tag |
| **New developer** | Learn PRE → TEST → POST for VPN / FIPS / hetero / HyperShift jobs |
| **Someone using an AI helper** | Copy a ready-made failure note (URL, file links, log bits) into IBM BOB or another agent |

This is **not** a big dashboard of all jobs.  
**One link in → one clear debug view out.**

---

## 2. Tech and languages

The shipped product is a **web page only**. All analysis runs **in your browser**.

```mermaid
flowchart TB
  subgraph Languages["Languages"]
    TS[TypeScript · app logic]
    TSX[TSX · React screens]
    CSS[CSS · styles.css]
    YAML[YAML · GitHub Actions only]
    MD[Markdown · docs]
  end

  subgraph Runtime["Runs in the browser"]
    React[React 19]
    Router[react-router-dom 7]
    Fetch[fetch → GCS JSON API]
  end

  subgraph Tooling["Build and CI tools"]
    Vite[Vite 8 · build + local server]
    Vitest[Vitest 5 · tests]
    TSC[TypeScript check]
    Oxlint[oxlint · lint]
    Node[Node.js 22 · CI]
    GHA[GitHub Actions · publish site]
  end

  TS --> React
  TSX --> React
  Vite --> React
  GHA --> Vite
```

| Part | Tech | Why we use it |
|------|------|----------------|
| **Screens** | React 19 + TypeScript (TSX) | UI with clear types |
| **URLs** | `react-router-dom` (`BrowserRouter`) | Clean paths under `/ci-analyzer/...` |
| **Build / local run** | Vite 8 | Fast local work; `base: '/ci-analyzer/'` for GitHub Pages |
| **Look** | Plain CSS (`web/src/styles.css`) | No big CSS library |
| **Downloads** | Browser `fetch` → GCS JSON API (`?alt=media`) | Works with browser CORS rules |
| **Tests** | Vitest + Testing Library + jsdom | Unit tests; optional live smoke scripts |
| **Lint** | oxlint | Quick checks on TS/TSX |
| **Hosting** | GitHub Pages | Only static files from `web/dist` |
| **CI** | GitHub Actions | Install → test → build → publish |
| **Built-in knowledge** | TypeScript data from [openshift/release](https://github.com/openshift/release) | Workflow steps, LPAR map, guide text — **inside the JS bundle**, not loaded later |

**Languages in this repo**

| Language | Where | Role |
|----------|-------|------|
| **TypeScript / TSX** | `web/src/**` | The whole app |
| **CSS** | `web/src/styles.css` | Colors and layout |
| **JSON** | `package.json`, job files in GCS | Dependencies; `started.json`, `finished.json`, `prowjob.json` |
| **YAML** | `.github/workflows/pages.yml` | Publish pipeline |
| **Markdown** | `README.md`, `ARCHITECTURE.md` | Docs |
| **HTML** | `web/index.html`, build `404.html` | App shell; deep links on Pages |

There is **no** Node/Express/Python backend for the debugger. GitHub Pages only serves files.

---

## 3. Folders in the repo

```mermaid
flowchart TB
  ROOT[ci-analyzer/]
  ROOT --> WEB[web/ · THE APP]
  ROOT --> GHA[.github/workflows/pages.yml]
  ROOT --> DOCS[ARCHITECTURE.md · README.md]
  ROOT --> CACHE[.cache/release · local clone, not in git]

  WEB --> SRC[src/]
  SRC --> PAGES[pages/ · Home · Job · Guide]
  SRC --> COMP[components/ · header · badges]
  SRC --> LIB[lib/ · analyze · gcs · junit · …]
  SRC --> DATA[data/ · workflows · hints · guide]
  SRC --> TYPES[types.ts · shared shapes]
  WEB --> PUBLIC[public/ · favicon]
  WEB --> SCRIPTS[scripts/ · live smoke]
```

| Path | What it is |
|------|------------|
| `web/` | The product (Vite + React) |
| `web/src/pages/` | Full screens |
| `web/src/lib/` | Fetch + parse + analyze |
| `web/src/data/` | Fixed IBM Z CI knowledge |
| `web/scripts/` | Live GCS smoke tests |
| `.github/workflows/pages.yml` | Test, build, publish |
| `.cache/release/` | Optional local clone of openshift/release (ignored by git) |

---

## 4. Big picture

```mermaid
flowchart LR
  User([Engineer]) -->|paste Prow URL| App[IBM Z Job Debugger<br/>site on GitHub Pages]
  App -->|HTTPS download<br/>GCS JSON API| GCS[(Public GCS<br/>test-platform-results-public)]
  App -.->|open links only| Prow[Prow site<br/>prow.ci.openshift.org]
  App -.->|step docs links| StepsCI[steps.ci.openshift.org]
  App -.->|config links| ReleaseGH[github.com/openshift/release]
  App --- Static[Knowledge in the app bundle<br/>workflows · LPAR · hints · guide]
```

| Layer | Plain meaning |
|-------|----------------|
| **UI** | Single-page app under `/ci-analyzer/...` |
| **Brain** | `analyzeExecution()` in `web/src/lib/analyze.ts` |
| **Downloads** | `web/src/lib/gcs.ts` talking to public GCS |
| **Knowledge** | `web/src/data/*` baked into the build |
| **Publish** | GitHub Actions uploads `web/dist` |

**Key point:** We do **not** scrape Prow’s HTML. We only read the **public GCS files** that Prow already wrote for that job.

---

## 5. What the user does

```mermaid
flowchart TD
  A[Open Home] --> B[Paste a Prow job link]
  B --> C{URL looks valid?}
  C -->|no| D[Show an error]
  C -->|yes| E[Go to the job page]
  E --> F[App runs analyzeExecution]
  F --> G[Progress while files download]
  G --> H[Show the debug view]
  H --> I[Debug tab]
  H --> J[AI prompt tab]
  H --> K[Guide tab]
  A --> L[Or open /guide]
```

**Links we accept (examples)**

- `https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/<job>/<id>`
- Paths under the same public bucket

**Result:** one `DebugAnalysis` object (`web/src/types.ts`) that fills every panel.

---

## 6. Pages and URLs

```mermaid
flowchart TB
  Layout[Layout · header · theme · Job Monitor]
  Layout --> Home["/  Home · paste URL"]
  Layout --> Guide["/guide  Workflow guide"]
  Layout --> Exec["/execution/...  Job debug page"]

  Home -->|parse URL then go| Exec
  Exec --> Tabs[Tabs: Debug · AI prompt · Guide]
  Exec -.->|optional| Compare[Compare to last green build]
```

| URL | File | Job |
|-----|------|-----|
| `/` | `HomePage.tsx` | Paste / check URL |
| `/guide` | `WorkflowGuidePage.tsx` | Teach workflows |
| `/execution/...` | `ExecutionPage.tsx` | Full job analysis |
| anything else | redirect to `/` | Safety net |

**Why `404.html`?** GitHub Pages has no app server. A deep link like `/ci-analyzer/execution/...` must still load the app. The build copies `index.html` to `404.html` so that works.

**Base path:** Vite uses `/ci-analyzer/`. React Router uses the same path without the trailing slash.

---

## 7. Where job files live (GCS)

Default bucket: **`test-platform-results-public`**  
Usual path: `logs/<jobName>/<buildId>/` (or `pr-logs/...` for PRs)

```mermaid
flowchart TB
  ROOT["logs/jobName/buildId/"]
  ROOT --> S[started.json]
  ROOT --> F[finished.json]
  ROOT --> P[prowjob.json]
  ROOT --> L[build-log.txt]
  ROOT --> ART[artifacts/]
  ART --> SUB["optional test subfolder/"]
  SUB --> STEP1["upi-install-libvirt/"]
  SUB --> STEP2["openshift-e2e-libvirt-test/  or  conformance-tests/"]
  SUB --> STEP3["gather-must-gather/ …"]
  STEP1 --> FIN1[finished.json]
  STEP1 --> LOG1[build-log.txt]
  STEP1 --> A1[artifacts/.openshift_install.log]
  STEP2 --> FIN2[finished.json]
  STEP2 --> JUNIT[artifacts/junit/*.xml]
  STEP2 --> SUM[artifacts/test-failures-summary*.json]
  STEP2 --> E2E[artifacts/e2e.log]
```

| File | What we use it for |
|------|--------------------|
| `started.json` / `finished.json` | Start/end time, pass/fail |
| `prowjob.json` | Job state, labels, profile |
| Root `build-log.txt` | Lease, profile, release lines |
| `artifacts/` listing | Find the test subfolder |
| Per-step `finished.json` | Step pass/fail and duration |
| Per-step `build-log.txt` | Failure text, libvirt host |
| `artifacts/release/...` | Nightly tag / image names |
| junit + failure summary JSON | Failed tests (blocking vs informing) |

### Why the GCS JSON API?

```mermaid
flowchart LR
  Browser -->|often blocked| Direct["Direct file URL"]
  Browser -->|works| API["…/storage/v1/b/…/o/…?alt=media"]
  API --> Helper[gcs.ts helpers]
```

“Compare to last green” also lists builds from the **same GCS job folder** — still no HTML scraping.

---

## 8. Full flow for one job

```mermaid
sequenceDiagram
  actor U as User
  participant H as Home
  participant URL as url.ts
  participant E as Job page
  participant A as analyzeExecution
  participant G as gcs.ts
  participant GCS as Public GCS
  participant KB as data/* knowledge

  U->>H: Paste Prow link
  H->>URL: parseProwUrl
  URL-->>H: bucket, path, job name, build id
  H->>E: Open job page
  E->>A: Start analysis

  par Job root
    A->>G: started / finished / prowjob
    G->>GCS: download
    A->>G: root build-log.txt
  and Artifacts
    A->>G: list artifacts/
    A->>A: find test subfolder
    A->>G: each step finished + log
  end

  A->>KB: pick workflow + step list
  A->>A: meta · lease · release · diagnosis · junit
  A-->>E: DebugAnalysis
  E-->>U: Show workflow, logs, AI prompt
```

---

## 9. How analysis works

```mermaid
flowchart TB
  IN[Parsed URL] --> ROOT[Fetch job root files]
  ROOT --> ART[List artifacts · pick subfolder]
  ART --> STEPS[Fetch each step]
  STEPS --> REL[Find release tag]
  STEPS --> LEASE[Find lease / libvirt host]
  ROOT --> META[Job facts from name + prowjob + log]
  META --> WFNAME[Pick workflow name]
  WFNAME --> WF[Match known steps to GCS folders]
  WF --> DIAG[Build diagnosis]
  STEPS --> JUNIT{Did the test step fail?}
  JUNIT -->|yes| TF[Collect failed tests]
  JUNIT -->|no| OUT
  DIAG --> OUT[DebugAnalysis]
  REL --> OUT
  LEASE --> OUT
  META --> OUT
  TF --> OUT
```

**Known steps vs folders on disk**

1. Guess the workflow from job name + cluster profile.
2. Load that workflow’s step list.
3. Match step names to folders under `artifacts/`.
4. If the job is still **RUNNING**, missing folders are **pending / current** — not treated as success.

```mermaid
flowchart LR
  subgraph Known["Steps we expect"]
    C1[cleanup-pre]
    C2[install]
    C3[test]
    C4[gather]
  end
  subgraph Seen["Folders that exist"]
    O1[cleanup-pre ✔]
    O2[install ✔]
  end
  Known --> Merge[Merge]
  Seen --> Merge
  Merge --> UI["cleanup ✔ · install ✔ · test = in progress · gather = waiting"]
```

---

## 10. Workflows we know about

Common workflows for the IBM Z dashboard (from openshift/release):

| Workflow | Typical jobs | Test step name |
|----------|--------------|----------------|
| `openshift-e2e-libvirt-vpn` | z-z e2e, serial, upgrade, agent | `openshift-e2e-libvirt-test` |
| `openshift-e2e-libvirt-vpn-fips` | FIPS jobs | same (+ `fips-check` in PRE) |
| `openshift-e2e-libvirt-heterogeneous-vpn` | z-za / vpn-amd64 / vpn-arm64 | `openshift-e2e-libvirt-test` |
| `hypershift-mce-ibmz-conformance-…-oz` | MCE IBM Z HCP | `conformance-tests` |

```mermaid
flowchart TB
  Job[Job name + profile] --> Infer[Pick workflow]
  Infer --> VPN[libvirt VPN]
  Infer --> FIPS[VPN + FIPS]
  Infer --> HETERO[hetero VPN]
  Infer --> HCP[HyperShift HCP]

  VPN --> Phases[PRE → TEST → POST]
  FIPS --> Phases
  HETERO --> Phases
  HCP --> HCPFlow

  subgraph HCPFlow["HCP order"]
    M[Install mgmt cluster] --> Ops[Install MCE / KubeVirt / …]
    Ops --> Create[Create HCP · PRE]
    Create --> Ready[Wait for guest · TEST]
    Ready --> Conf[conformance-tests · TEST]
    Conf --> Post[gather + cleanup · POST]
  end
```

| File | Holds |
|------|--------|
| `web/src/data/vpnWorkflow.ts` | Step lists + workflow pick logic |
| `web/src/data/workflowGuide.ts` | Guide text for people |
| `web/src/data/stepInfo.ts` | Per-step tips |
| `web/src/data/lpar.ts` + lease helpers | Lease → host / LPAR |

For junit, HCP jobs use `conformance-tests`; VPN-family jobs use `openshift-e2e-libvirt-test`.

---

## 11. Failed tests: blocking vs informing

When the test step fails, we build a failed-test list close to how Prow / Sippy talk about severity.

```mermaid
flowchart TB
  Fail[Test step failed] --> Collect[collectTestFailures]
  Collect --> Sum[Read test-failures-summary JSON]
  Collect --> JUnit[Also read junit XML]
  Sum --> Merge[Merge names + messages]
  JUnit --> Merge
  Merge --> Sev[Mark severity]
  Sev --> Block[Blocking]
  Sev --> Info[Informing]
  Block --> UI[Failed tests panel + AI prompt]
  Info --> UI
```

| Word | Meaning here |
|------|----------------|
| **Blocking** | Main failures that explain the suite fail |
| **Informing** | Extra / monitor fails that should not steal the main story |
| **Unknown** | Kept when we are not sure — we do not hide them |

Code: `web/src/lib/junit.ts`, called from `analyzeExecution`.

---

## 12. Code map

```mermaid
flowchart TB
  Pages[pages/*] --> Analyze[analyze.ts]
  Analyze --> GCS[gcs.ts]
  Analyze --> URL[url.ts]
  Analyze --> Meta[meta.ts · jobFacets.ts]
  Analyze --> Lease[lease.ts · lparResolve.ts]
  Analyze --> Rel[release.ts]
  Analyze --> JUnit[junit.ts]
  Analyze --> Diag[diagnosis.ts]
  Analyze --> WF[vpnWorkflow.ts]
  Pages --> Prompt[agentPrompt.ts]
  Pages --> Guide[workflowGuide.ts]
  Pages --> Compare[compare.ts · jobHistory.ts]
  WF --> StepInfo[stepInfo.ts]
  Lease --> LPAR[lpar.ts]
```

| Module under `web/src/` | Language | Job |
|-------------------------|----------|-----|
| `lib/url.ts` | TypeScript | Parse / encode Prow URLs |
| `lib/gcs.ts` | TypeScript | Download and list public files |
| `lib/analyze.ts` | TypeScript | Run the full analysis |
| `lib/meta.ts` / `jobFacets.ts` | TypeScript | Profile, topology, header pills |
| `lib/lease.ts` / `lparResolve.ts` | TypeScript | Lease → short host / LPAR |
| `lib/release.ts` | TypeScript | Nightly tag / images |
| `lib/junit.ts` | TypeScript | Failed tests |
| `lib/diagnosis.ts` | TypeScript | Facts, ideas, evidence links |
| `lib/compare.ts` / `jobHistory.ts` | TypeScript | Diff vs last green |
| `lib/agentPrompt.ts` | TypeScript | Copy-paste AI brief |
| `data/vpnWorkflow.ts` | TypeScript | Known workflows and steps |
| `data/*` guide / hints / LPAR | TypeScript | Teaching + tips |
| `pages/*.tsx` / `components/*.tsx` | TSX | UI |
| `types.ts` | TypeScript | Shared types |
| `styles.css` | CSS | Look and feel |

---

## 13. What you see on the job page

```mermaid
flowchart TB
  DA[DebugAnalysis]
  DA --> Hero[Status · pills · lease/LPAR · release]
  DA --> Timeline[PRE → TEST → POST times]
  DA --> Steps[Steps · log tails · key files]
  DA --> Tests[Failed tests · blocking / informing]
  DA --> Diag[Diagnosis]
  DA --> Prompt[AI prompt to copy]
  DA --> GuideTab[Guide for this workflow]
```

**Useful file links** (from `keyArtifactsFor()`):

| Step | Links we highlight |
|------|--------------------|
| `upi-install-libvirt` | `artifacts/.openshift_install.log` |
| `openshift-e2e-libvirt-test` / `conformance-tests` | `artifacts/junit/`, `artifacts/e2e.log` |
| `gather-must-gather` | `artifacts/must-gather.tar.gz` |
| HCP create step | `artifacts/` |

Theme and “recent jobs” stay in **`localStorage`** only (on your machine).

---

## 14. Build, test, and publish

```mermaid
flowchart LR
  Dev[npm run dev] --> Local[Local site]
  Push[Push to main] --> CI[GitHub Actions · Node 22]
  CI --> Install[npm ci]
  Install --> Unit[npm test]
  Unit --> Build[npm run build]
  Build --> Copy[Copy index.html → 404.html]
  Copy --> Pages[GitHub Pages]
```

| Command (in `web/`) | What it does |
|---------------------|--------------|
| `npm install` | Install packages |
| `npm run dev` | Local app |
| `npm test` | Unit tests |
| `npm run build` | Typecheck + production files + `404.html` |
| `npm run lint` | Lint |
| `npx tsx scripts/smoke-all-workflows.mts` | Live check against real GCS jobs |

Publish runs on push to `main` when `web/**` (or the workflow file) changes, or when you start the workflow by hand.

---

## 15. Safety

```mermaid
flowchart TB
  subgraph Trust["What we use"]
    Pages[Static files on GitHub Pages]
    PubGCS[Public GCS files]
    Bundled[Workflow knowledge in the JS bundle]
  end

  subgraph Never["What we do not have"]
    Backend[App backend]
    Secrets[API keys / cloud passwords]
    Private[Private buckets / kubeconfigs]
  end

  Browser[Your browser] --> Pages
  Browser --> PubGCS
  Browser --> Bundled
```

- We can only read what is already **public** on GCS.
- If GCS returns a “redacted” stub, we show that as redacted.
- The AI prompt is built **on your machine** for you to copy. This app does **not** call an LLM.

---

## 16. Simple word list

| Word | Plain meaning |
|------|----------------|
| **Prow** | OpenShift CI system and its web UI |
| **GCS** | Google Cloud Storage — where job logs and files are stored |
| **ci-operator** | Tool that expands a workflow into many small steps |
| **Workflow** | Named recipe of steps (from openshift/release) |
| **Leaf step** | One real folder under `artifacts/` (e.g. install or test) |
| **PRE / TEST / POST** | Three stages on the timeline |
| **Boskos lease** | Temporary claim on a libvirt machine slot |
| **Cluster profile** | e.g. `libvirt-s390x-vpn` or `libvirt-s390x-vpn-hcp` |
| **HCP** | Hosted control plane (HyperShift guest cluster) |
| **SPA** | Single-page app — routing happens in the browser |
| **CORS** | Browser rule that makes us use the GCS JSON API form |

---

## Remember this

```mermaid
flowchart LR
  In[Prow link] --> Browser[Browser runs TypeScript]
  Browser --> Evidence[Public GCS files]
  Browser --> KB[Built-in workflow knowledge]
  Evidence --> Out[Clear debug view]
  KB --> Out
  Out --> Human[You]
  Out --> Agent[Copy-paste AI brief]
```

**Prow link in → public job files + built-in IBM Z knowledge → structured debug view** (workflow, failure focus, release/lease, failed tests, AI brief). All smarts run in the browser. GCS is the source of truth for what the job actually did.
