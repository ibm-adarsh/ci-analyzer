# Debugger architecture

## Data flow

```
Paste Prow URL ──► parseProwUrl ──► /e/:bucket/:path
                                         │
                                         ▼
                               analyzeExecution()
                                         │
                    ┌────────────────────┼────────────────────┐
                    ▼                    ▼                    ▼
              started.json          step dirs            prowjob.json
              finished.json         build-log.txt        release ImageStream
                    │                    │                    │
                    └────────────────────┼────────────────────┘
                                         ▼
                         Debug view  ·  AI agent prompt
```

## Modules

| Module | Responsibility |
|--------|----------------|
| `lib/url.ts` | Prow URL parse + route encoding |
| `lib/gcs.ts` | CORS-safe GCS fetch/list helpers |
| `lib/meta.ts` | Job name / prowjob → profile, workflow, config links |
| `data/vpnWorkflow.ts` | Configured leaf steps for RUNNING pending display |
| `lib/analyze.ts` | End-to-end execution analysis |
| `lib/diagnosis.ts` | Patterns, snippets, evidence-bound diagnosis |
| `lib/release.ts` | Nightly tag / pullspecs / lease parsing |
| `lib/agentPrompt.ts` | Copy-paste prompt for external AI agents |
| `data/*` | Fail patterns, step KB, LPAR map, constants |

## GitHub Pages

- Vite `base: '/ci-analyzer/'`
- `HashRouter` so refreshes work without a custom 404 rewrite
- Build artifact: `web/dist`

## Configured vs observed

- **Configured:** leaf steps from `openshift-e2e-libvirt-vpn` in openshift/release
- **Observed:** step directories present under the execution's GCS artifact prefix
- Missing dirs on a RUNNING job are **pending / current**, not treated as success
