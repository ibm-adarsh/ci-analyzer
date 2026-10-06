# IBM Z · Prow Job Analyzer

> **Live demo → [https://ibm-adarsh.github.io/ci-analyzer](https://ibm-adarsh.github.io/ci-analyzer)**

A single-file, zero-dependency browser tool that fetches live GCS artifact data from [prow.ci.openshift.org](https://prow.ci.openshift.org) jobs and gives a deep, step-by-step failure analysis for **IBM Z homogeneous (z-z)** and **heterogeneous (z-za)** jobs running the `openshift-e2e-libvirt-vpn` workflow.

---

## ✨ Features

| Tab | What you get |
|-----|--------------|
| **Overview** | LPAR lease card (slot, hypervisor URI, DNS svc, zone), nightly release tag, job metadata, step execution summary, failure banner with root-cause hints |
| **Steps & Logs** | Every step grouped by PRE / TEST / POST phase with status badge, duration, last 80 log lines, error pattern detection, direct GCS artifact links |
| **Timeline** | Gantt-style chart of all step durations |
| **Environment** | Live env vars parsed from `build-log.txt` bash traces + expandable knowledge-base cards (what each var does & how to debug it) |
| **Debug Guide** | Full `openshift-e2e-libvirt-vpn` workflow reference with per-step cards + dynamic Job Status Checklist |
| **CI Operator Log** | Raw ci-operator `build-log.txt` with colour coding — lease acquisition line highlighted in purple, release import in blue, failures in red; regex filter |

### Key capabilities
- 🔑 **Exact lease slot** — extracted from the ci-operator root log (`Acquired 1 lease(s) for ...: [libvirt-s390x-0-1]`), not guessed from step logs
- 🏷️ **Nightly build tag** — `5.0.0-0.nightly-multi-2026-10-02-094431` shown in metadata
- 🖥️ **Full LPAR resolution** — slot `libvirt-s390x-0-1` → LPAR `lnxocp01`, `qemu+tcp://lnxocp01:16509/system`, DNS svc `sshd-0.bastion-z.svc.cluster.local`, Orange Zone
- ✅ **Self-test engine** — validates GCS reachability, lease extraction, and first-failure detection against real job URLs
- 🌙 **Dark / light theme**
- 📋 **Copy summary** to clipboard
- 🕘 **Recent jobs** history (localStorage)

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

---

## 📜 License

Apache 2.0 — see [LICENSE](LICENSE)
