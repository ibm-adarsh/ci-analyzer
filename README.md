# IBM Z CI Analyzer

A browser-based tool for analysing IBM Z OpenShift CI job failures on [prow.ci.openshift.org](https://prow.ci.openshift.org). Zero dependencies — single HTML file, runs entirely in the browser.

## 🌐 Access on GitHub Pages

The tool is hosted at:

**[https://ibm-adarsh.github.io/ci-analyzer](https://ibm-adarsh.github.io/ci-analyzer)**

Open the URL, paste a Prow job URL, and click **Analyze**. No install, no login.

> **Note:** If the link returns a 404, the GitHub Pages source needs to be enabled once.  
> Go to **[Settings → Pages](https://github.com/ibm-adarsh/ci-analyzer/settings/pages)**, set **Source** to **GitHub Actions**, and save.  
> Then re-run the workflow from [Actions → Deploy to GitHub Pages → Run workflow](https://github.com/ibm-adarsh/ci-analyzer/actions/workflows/pages.yml).

---

## 🚀 Run Locally

The tool is a single HTML file — it needs a local HTTP server (not `file://`) because the browser blocks cross-origin GCS API requests from `file://` URLs.

### Option 1 — Python (recommended, no install needed)

```bash
git clone https://github.com/ibm-adarsh/ci-analyzer.git
cd ci-analyzer
python3 -m http.server 8080
```

Open **http://localhost:8080/tools/prow-job-analyzer/** in your browser.

### Option 2 — Node.js (`npx`)

```bash
git clone https://github.com/ibm-adarsh/ci-analyzer.git
cd ci-analyzer
npx serve .
```

Open the URL printed by `npx serve` and navigate to `tools/prow-job-analyzer/`.

### Option 3 — Any other static server

```bash
# Ruby
ruby -run -e httpd . -p 8080

# PHP
php -S localhost:8080

# Go
go run golang.org/x/tools/cmd/httptest/...  # or any other go static server
```

Then open **http://localhost:8080/tools/prow-job-analyzer/**.

> **Why not `file://`?**  
> The tool fetches job artifacts from the GCS JSON API (`storage.googleapis.com`).  
> Browsers apply stricter CORS rules to `file://` origins and will block these requests.  
> A local HTTP server serves the file from `http://localhost` which is allowed.

---

## 📋 Supported Prow URL Formats

Paste any of these into the analyzer:

```
# Periodic / nightly job
https://prow.ci.openshift.org/view/gs/test-platform-results-public/logs/<JOB_NAME>/<BUILD_ID>

# PR rehearse job
https://prow.ci.openshift.org/view/gs/test-platform-results-public/pr-logs/pull/<ORG_REPO>/<PR_NUMBER>/<JOB_NAME>/<BUILD_ID>
```

---

## ✨ What the tool shows

| Tab | Content |
|-----|---------|
| **Overview** | LPAR lease card (slot, hypervisor URI, DNS service, zone), nightly release tag, job metadata, step execution summary, failure banner with root-cause hints |
| **Steps & Logs** | Every step grouped by PRE / TEST / POST phase — status badge, duration, last 80 log lines, error pattern detection, direct GCS links |
| **Timeline** | Gantt-style chart of all step durations |
| **Environment** | Live env vars parsed from `build-log.txt` bash traces + expandable knowledge-base cards |
| **Debug Guide** | Full `openshift-e2e-libvirt-vpn` workflow reference with per-step cards and a dynamic Job Status Checklist |
| **CI Operator Log** | Raw ci-operator `build-log.txt` with colour-coded lease, release import, and failure lines; regex filter |

---

## 🏗️ Repo Layout

```
ci-analyzer/
├── tools/
│   ├── prow-job-analyzer/       ← the browser tool (source of truth)
│   │   ├── index.html           ← single-file app (all CSS + JS inline)
│   │   └── README.md            ← detailed tool reference
│   ├── build/                   ← CI Jenkins image & release pipeline
│   ├── changelog/               ← changelog generation utility
│   ├── godepversion/            ← Go dependency version helper
│   ├── gotest2junit/            ← go test → JUnit XML converter
│   ├── hack/                    ← build scripts and Makefile helpers
│   ├── import-verifier/         ← Go import restriction verifier
│   ├── junitmerge/              ← merges multiple JUnit XML files
│   └── junitreport/             ← produces JUnit reports from test output
├── .github/
│   └── workflows/
│       └── pages.yml            ← GitHub Actions: auto-deploy to Pages on push
├── .gitignore
├── LICENSE                      ← Apache 2.0
└── README.md                    ← this file
```

> `docs/` is **not committed** — it is built by the CI workflow at deploy time and served by GitHub Pages.

---

## 🔄 How GitHub Pages deployment works

Every push to `main` that touches `tools/prow-job-analyzer/index.html` or `.github/workflows/pages.yml` triggers the [Deploy to GitHub Pages](.github/workflows/pages.yml) workflow:

1. Checks out the repo
2. Copies `tools/prow-job-analyzer/index.html` → `docs/index.html`
3. Uploads `docs/` as a GitHub Pages artifact
4. Deploys to `https://ibm-adarsh.github.io/ci-analyzer`

No manual steps needed after the initial Pages source setting.

---

## 🛠️ Making changes

Edit the tool source:

```
tools/prow-job-analyzer/index.html
```

Then commit and push to `main`. The Pages deployment runs automatically within ~30 seconds.

To test locally before pushing, use the local server instructions above.

---

## 📜 License

Apache 2.0 — see [LICENSE](LICENSE)
