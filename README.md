# IBM Z · CI Debugging Workbench

A developer-centric workbench for investigating IBM Z OpenShift CI failures on [prow.ci.openshift.org](https://prow.ci.openshift.org).

**Live:** [https://ibm-adarsh.github.io/ci-analyzer](https://ibm-adarsh.github.io/ci-analyzer)

Paste a Prow URL or browse recent `z-z` / `z-za` / `s390x` executions, then move from **what failed → evidence → configuration → next steps** without manually walking GCS trees or hunting through `openshift/release`.

---

## Problems it solves

| Without this tool | With the workbench |
|-------------------|--------------------|
| Browse enormous `build-log.txt` files by hand | Failure investigation panel with excerpts + pattern hypotheses (labeled) |
| Guess which artifact directory matters | Artifact explorer with relevance highlighting + preview |
| Search GitHub for the right ci-operator YAML | Config tab links built from `prowjob.json` labels |
| Jump between Prow, gcsweb, and step-registry | One execution page with deep links back to originals |

---

## Supported job categories

- **Multi-arch homogeneous** — job names matching `*z-z*` (Prow filter [`*z-z`](https://prow.ci.openshift.org/?job=*z-z))
- **Multi-arch heterogeneous** — `*z-za*`
- **Single-arch s390x** — `*s390x*` / `*libvirt-s390x` (Prow filter [`*s390x`](https://prow.ci.openshift.org/?job=*s390x))

Discovery uses **dynamic GCS prefix scans** under `gs://test-platform-results-public/logs/` for IBM Z naming conventions — not a fixed shortlist. A seed index ships for offline builds; CI regenerates a fresh index on deploy.

Configuration context comes from [openshift/release](https://github.com/openshift/release) (`ci-operator/config`, `ci-operator/jobs`, `ci-operator/step-registry`) via reconstructed links from execution metadata.

---

## Architecture

```
Browser (GitHub Pages static SPA)
  ├─ Job index JSON (build-time / scheduled GCS discovery)
  ├─ On-demand GCS JSON API (CORS-safe) for execution details, steps, logs, artifacts
  └─ Outbound links → Prow · gcsweb · openshift/release · steps.ci.openshift.org
```

| Layer | Location | Role |
|-------|----------|------|
| UI | `web/src/pages`, `web/src/components` | Discovery + execution workbench |
| Domain | `web/src/lib/*`, `web/src/data/*` | URL parse, GCS, analysis, diagnosis, discovery |
| Index generator | `web/scripts/generate-job-index.mjs` | Scheduled / CI job listing |
| Deploy | `.github/workflows/pages.yml` | `npm ci` → index → test → build → Pages |
| Legacy zero-dep UI | `tools/prow-job-analyzer/legacy.html` | Previous single-file analyzer (optional) |

**Stack:** Vite · React 19 · TypeScript · React Router (HashRouter for GitHub Pages) · Vitest  
**Hosting constraint:** static-only GitHub Pages — no server, no secrets in the frontend.

Base path: `/ci-analyzer/` (project Pages site).

---

## Local development

Prerequisites: Node.js 20+ and npm.

```bash
git clone https://github.com/ibm-adarsh/ci-analyzer.git
cd ci-analyzer/web
npm install
npm run generate:index   # optional; needs network to GCS
npm run dev
```

Open the URL Vite prints (typically `http://localhost:5173/ci-analyzer/`).

### Useful commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Dev server with HMR |
| `npm test` | Unit tests (Vitest) |
| `npm run build` | Production build → `web/dist` |
| `npm run preview` | Preview production build locally |
| `npm run generate:index` | Refresh `public/data/job-index.json` from GCS |
| `npm run lint` | Oxlint |

### Analyze a known URL

On the home page, paste e.g.:

```
https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/periodic-ci-openshift-multiarch-main-nightly-5.0-upgrade-from-nightly-4.22-ocp-ovn-remote-libvirt-multi-z-z/2107456138294333440
```

---

## GitHub Pages deployment

Workflow: `.github/workflows/pages.yml`

1. Install `web/` dependencies  
2. Generate job index from public GCS (`continue-on-error` + seed fallback)  
3. Run `npm test`  
4. Build with `base: /ci-analyzer/`  
5. Upload `web/dist` via `actions/upload-pages-artifact`  
6. Deploy with `actions/deploy-pages`

**Repo settings:** Settings → Pages → Source = **GitHub Actions**.

Triggers: push to `main` (paths under `web/` or the workflow), daily cron `06:00 UTC`, and `workflow_dispatch`.

### CORS / data access

- GCS **JSON API** (`storage/v1/.../o/...?alt=media`) returns CORS headers for public buckets — used for in-app fetches.
- Direct `storage.googleapis.com/{bucket}/{object}` links open in a new tab (download / view).
- `prow.ci.openshift.org/prowjobs.js` is **not** used (403 from browsers).
- No private tokens are embedded. All data is public CI output.

---

## Investigation workflow

1. **Discover** — filter by result / arch, or paste a Prow URL  
2. **Overview** — status, timing, observed steps  
3. **Investigate** — facts vs labeled hypotheses, evidence links, next actions  
4. **Steps & Logs** — phase-grouped steps, snippets, pattern hints  
5. **Artifacts** — browse real GCS prefixes; preview text logs  
6. **Config** — variant/profile/refs → openshift/release + step-registry links  

Deep links use HashRouter: `#/execution/<bucket>/<urlencoded-gcs-path>`.

---

## Evidence & confidence

Diagnostic claims are labeled:

- **Confirmed facts** — from `finished.json`, prowjob status, step directories  
- **Pattern hypotheses** — regex matches in logs (not proven root cause)  
- **Unresolved** — missing variant/workflow labels  

Primary failure prefers non-`best_effort` steps (gather/cleanup are secondary when install/test also failed).

---

## Security

- Static frontend only; no privileged credentials  
- Artifact access is limited to public GCS URLs the user already could open in Prow  
- Log previews are size-capped (~180KB)  
- Treat CI logs as sensitive engineering data when sharing  

---

## Legacy single-file analyzer

The previous zero-dependency HTML app is preserved at:

`tools/prow-job-analyzer/legacy.html`

Open via any static server. The `tools/prow-job-analyzer/index.html` entry redirects to the new workbench on GitHub Pages.

---

## Contributing

1. Change code under `web/src`  
2. Add/adjust Vitest coverage for pure logic (`web/src/lib/*.test.ts`)  
3. `npm test && npm run build`  
4. Open a PR  

---

## Known limitations

- Prow deck APIs are not browser-accessible; discovery uses GCS listings  
- Config YAML is linked, not fully parsed into an execution graph  
- Line-level Spyglass deep links are not always available — nearest artifact/log is used  
- Job index freshness depends on the last CI/scheduled generate run  
- GitHub Pages cannot proxy private artifacts  

---

## License

Apache 2.0 — see [LICENSE](LICENSE)
