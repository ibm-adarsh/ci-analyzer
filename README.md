# ci-analyzer

CI tooling for IBM Z OpenShift jobs.

## Tools

### [prow-job-analyzer](tools/prow-job-analyzer/)

**Live → [https://ibm-adarsh.github.io/ci-analyzer](https://ibm-adarsh.github.io/ci-analyzer)**

A single-file, zero-dependency browser tool that fetches live GCS artifact data from [prow.ci.openshift.org](https://prow.ci.openshift.org) jobs and gives a deep, step-by-step failure analysis for **IBM Z** jobs running the `openshift-e2e-libvirt-vpn` workflow.

See [tools/prow-job-analyzer/README.md](tools/prow-job-analyzer/README.md) for full documentation.

### Other tools

| Tool | Description |
|------|-------------|
| [build](tools/build/) | CI Jenkins image and release pipeline definitions |
| [changelog](tools/changelog/) | Changelog generation utility |
| [godepversion](tools/godepversion/) | Go dependency version helper |
| [gotest2junit](tools/gotest2junit/) | Converts `go test` output to JUnit XML |
| [hack](tools/hack/) | Build scripts and Makefile helpers |
| [import-verifier](tools/import-verifier/) | Verifies Go import restrictions |
| [junitmerge](tools/junitmerge/) | Merges multiple JUnit XML files |
| [junitreport](tools/junitreport/) | Produces JUnit reports from test output |

## License

Apache 2.0 — see [LICENSE](LICENSE)
