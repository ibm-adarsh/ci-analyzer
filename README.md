# IBM Z · Job Debugger

Paste a [Prow](https://prow.ci.openshift.org) job URL. Get the debug context a developer needs for IBM Z (`libvirt-s390x-vpn` / `vpn-oz`) failures — without manually hunting GCS trees, step-registry YAML, and release tags.

**Live:** [https://ibm-adarsh.github.io/ci-analyzer](https://ibm-adarsh.github.io/ci-analyzer)

This is **not** a fleet dashboard. One job link → workflow status, logs, artifacts, release build, profile/env.

---

## What you get from one URL

| Area | Content |
|------|---------|
| **Status** | PASSED / FAILED / RUNNING with an explicit “what is in progress” line |
| **Workflow** | Full `openshift-e2e-libvirt-vpn` leaf steps from [openshift/release](https://github.com/openshift/release/blob/master/ci-operator/step-registry/openshift/e2e/libvirt/vpn/openshift-e2e-libvirt-vpn-workflow.yaml) — including **pending** steps that have no GCS directory yet |
| **Per step** | Status, duration, last ~100 log lines, key artifact links (install log, junit, must-gather, …) |
| **Failure focus** | First non-best-effort failed step, log excerpt, pattern hypotheses (labeled, not claimed root cause) |
| **Context** | Cluster profile, topology, OCP/BRANCH, test type, lease → LPAR, ci-operator config link |
| **Release** | Nightly tag + tests/install image pullspecs (from root log or `artifacts/release` ImageStream) |
| **AI agent prompt** | Copy-paste brief (focused or full) with job URL, failed-step artifact links, workflow status, log excerpts, and follow-up instructions for any AI agent |

### RUNNING job example (the bug you hit)

If PRE finished and `openshift-e2e-libvirt-conf` passed but `openshift-e2e-libvirt-test` has no artifact dir yet, the debugger reports:

> In progress: waiting for / starting **openshift-e2e-libvirt-test** …

It will **not** imply the job is done because 12 observed steps passed.

---

## Local development

```bash
cd web
npm install
npm run dev
```

Open the Vite URL (base path `/ci-analyzer/`), paste a Prow link, click **Debug**.

```bash
npm test          # Vitest
npm run build     # GitHub Pages bundle → web/dist
```

---

## Deploy (GitHub Pages)

`.github/workflows/pages.yml` builds `web/` and publishes `web/dist`.

Settings → Pages → Source = **GitHub Actions**.

---

## Scope

Focused on IBM Z libvirt **vpn** / **vpn-oz** style jobs using workflow `openshift-e2e-libvirt-vpn` (+ fips variant). Workflow leaf order is taken from the release step-registry chains (`upi-conf-libvirt`, `upi-install-libvirt`, `openshift-e2e-libvirt-test`, `gather`).

Legacy zero-dep HTML (optional): `tools/prow-job-analyzer/legacy.html`.

---

## License

Apache 2.0 — see [LICENSE](LICENSE)
