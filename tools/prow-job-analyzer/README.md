# IBM Z · Prow Job Analyzer

> **Live demo → [https://ibm-adarsh.github.io/ci-analyzer](https://ibm-adarsh.github.io/ci-analyzer)**

A single-file, zero-dependency browser **debugging workbench** that fetches live GCS artifact data from [prow.ci.openshift.org](https://prow.ci.openshift.org) jobs and correlates them with OpenShift CI configuration for **IBM Z homogeneous (z-z)**, **heterogeneous (z-za)**, and **single-arch s390x** jobs running the `openshift-e2e-libvirt-vpn` workflow.

---

## ✨ Features

| Tab | What you get |
|-----|--------------|
| **Overview** | Compact job health, LPAR lease, metadata, step chips |
| **Investigate** | Unified failure workbench — facts vs hypotheses, evidence, next steps |
| **Steps & Logs** | PRE / TEST / POST steps with status, duration, log search, GCS links |
| **Artifacts** | GCS artifact explorer with relevance highlighting + text preview |
| **Timeline** | Gantt-style chart of step durations |
| **Config** | Links to `openshift/release` ci-operator config, jobs, step-registry, Prow decks |
| **Environment** | Live env vars from bash traces + knowledge-base cards |
| **Debug Guide** | Full workflow reference + Job Status Checklist |
| **CI Operator Log** | Root `build-log.txt` with colour coding and regex filter |

### Key capabilities
- 🧭 **Job browser** — discover recent `*z-z`, `*z-za`, and `*s390x` executions from public GCS
- 🎯 **Evidence-driven diagnosis** — primary vs best-effort secondary failures; hypotheses clearly labeled
- 📦 **Artifact explorer** — browse real GCS prefixes; no invented paths
- 🔗 **Config correlation** — variant/profile from `prowjob.json` → GitHub config + [steps.ci.openshift.org](https://steps.ci.openshift.org/workflow/openshift-e2e-libvirt-vpn)
- 🔑 **Exact lease slot** — from ci-operator root log, with LPAR resolution
- ✅ **Self-test engine** — live GCS regression checks
- 🌙 **Dark / light theme** · 📋 **Copy summary** · 🕘 **Recent jobs** (localStorage)
- Shareable `#job=…&tab=…` deep links

---

## 🚀 Usage

### Option 1 — GitHub Pages (no install)

Open **[https://ibm-adarsh.github.io/ci-analyzer](https://ibm-adarsh.github.io/ci-analyzer)** in your browser and paste any Prow job URL.

### Option 2 — Local server (for development)

```bash
git clone https://github.com/ibm-adarsh/ci-analyzer
cd ci-analyzer
python3 -m http.server 8080
# open http://localhost:8080
```

### Supported URL formats

```
# Periodic job
https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/<JOB_NAME>/<BUILD_ID>

# Rehearse / PR job
https://prow.ci.openshift.org/view/gs/test-platform-results-public/pr-logs/pull/<ORG_REPO>/<PR>/<JOB_NAME>/<BUILD_ID>
```

---

## 🔍 Workflow Coverage: `openshift-e2e-libvirt-vpn`

```
PRE:
  upi-libvirt-cleanup-pre              ← cleans stale libvirt resources via Boskos lease
  ipi-install-rbac                     ← cluster RBAC setup
  upi-conf-libvirt-network             ← generates network.xml
  upi-conf-libvirt-agent               ← generates agent-config.yaml
  upi-conf-libvirt                     ← generates install-config.yaml
  ipi-conf-debug-kdump-configure-logs  ← kdump configuration
  ipi-debug-missing-static-pod-controller-degraded
  ipi-conf-etcd-on-ramfs               ← etcd on ramfs (ETCD_DISK_SPEED=slow for s390x)
  upi-install-libvirt-network          ← creates libvirt network on remote LPAR
  rhcos-conf-osstream                  ← configures RHCOS OS stream
  upi-install-libvirt                  ← deploys VMs, runs openshift-install  ← KEY STEP

TEST:
  openshift-e2e-libvirt-conf           ← validates cluster, sets TEST_PROVIDER
  openshift-e2e-libvirt-test           ← runs openshift-tests suite

POST:
  ipi-conf-debug-kdump-gather-logs     ← collects kdump crash dumps
  gather-must-gather                   ← oc adm must-gather  (best_effort)
  gather-extra                         ← CI-specific artifacts (best_effort)
  gather-audit-logs                    ← audit logs (best_effort)
  upi-libvirt-cleanup-post             ← destroys VMs/networks/storage
```

---

## 🖥️ IBM Z Infrastructure

| Property | Value |
|----------|-------|
| Cluster Profile | `libvirt-s390x-vpn` |
| Boskos Pool | `libvirt-s390x-vpn-quota-slice` |
| Lease Format | `libvirt-s390x-<lpar>-<slot>` |
| Architecture | `s390x` |
| Network Plugin | OVN-Kubernetes |
| Connectivity | VPN → `bastion-z.svc.cluster.local` → LPAR |
| LPAR Connection | `qemu+tcp://lnxocp0X:16509/system` |
| ETCD_DISK_SPEED | `slow` (etcd on ramfs) |
| VOLUME_CAPACITY | `120G` per node |
| DOMAIN_MEMORY | `24567 MiB` per VM |
| DOMAIN_VCPUS | `10` per VM |
| Topology | 3 control-plane + 2 workers |

### LPAR Map

| Lease Slot Prefix | LPAR | DNS Service | Zone |
|-------------------|------|-------------|------|
| `libvirt-s390x-0-*` | `lnxocp01` | `sshd-0.bastion-z.svc.cluster.local` | Orange Zone |
| `libvirt-s390x-1-*` | `lnxocp02` | `sshd-1.bastion-z.svc.cluster.local` | Orange Zone |
| `libvirt-s390x-2-*` | `lnxocp06` | `sshd-2.bastion-z.svc.cluster.local` | Orange Zone |
| `libvirt-s390x-oz-0-*` | `lnxocp11` | `sshd-11.bastion-z.svc.cluster.local` | Orange Zone |
| `libvirt-s390x-oz-1-*` | `lnxocp12` | `sshd-12.bastion-z.svc.cluster.local` | Orange Zone |
| `libvirt-s390x-oz-2-*` | `lnxocp13` | `sshd-13.bastion-z.svc.cluster.local` | Orange Zone |
| `libvirt-s390x-oz-3-*` | `lnxocp14` | `sshd-14.bastion-z.svc.cluster.local` | Orange Zone |

---

## 📁 Key Artifact Files

| File | Purpose |
|------|---------|
| `build-log.txt` *(root)* | ci-operator runner log — **lease acquisition, release import, step orchestration** |
| `upi-install-libvirt/.openshift_install.log` | Full installer log — **start here for install failures** |
| `upi-install-libvirt/build-log.txt` | Step wrapper log |
| `openshift-e2e-libvirt-test/build-log.txt` | Test output + `Failing tests:` summary |
| `openshift-e2e-libvirt-test/artifacts/junit/` | JUnit XML with individual test results |
| `gather-extra/build-log.txt` | Cluster health (nodes, operators, pods) |
| `must-gather.tar` | Full must-gather archive |

---

## 🏗️ Technical Notes

- **Zero dependencies** — single HTML file, all CSS and JS inline
- **CORS-safe** — all GCS fetches use the JSON API (`storage/v1/b/{bucket}/o/{path}?alt=media`) which allows browser-side requests
- **Step discovery** is fully dynamic via GCS directory listing — no hardcoded step names
- **Duration inference** — `finished.json` has no `start_time`; durations are computed as `step_end_ts − prev_step_end_ts`
- **Lease extraction** — parsed from root ci-operator `build-log.txt` (`Acquired 1 lease(s) for ...: [slot]`), with step log fallback
- **Primary failure** — first failed step in workflow order, preferring non-`best_effort` steps
- **Config correlation** — uses `prowjob.json` labels (`ci-operator.openshift.io/variant`, cluster profile, refs) to build GitHub links; marks unresolved when labels are missing
- **Job browser** — lists recent builds for a curated catalog of IBM Z job names under `gs://test-platform-results-public/logs/`
- **Headless check** — `node verify-workbench.mjs` (or the Python GCS checks in CI notes) validates representative success/failure/z-z/z-za/s390x cases against live public artifacts

---

## 📜 License

Apache 2.0 — see [LICENSE](LICENSE)
