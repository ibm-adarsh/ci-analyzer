# Workbench architecture

## Data flow

```
Job index (static JSON)
        │
        ▼
 Discovery UI ──paste URL──► parseProwUrl
        │                         │
        ▼                         ▼
 execution route          analyzeExecution()
        │                         │
        │              ┌──────────┼──────────┐
        │              ▼          ▼          ▼
        │         started.json  steps/   prowjob.json
        │         finished.json artifacts build-log.txt
        │              │          │          │
        │              └──────────┼──────────┘
        │                         ▼
        │              diagnosis + config links
        ▼                         ▼
   Execution page tabs: Overview · Investigate · Steps · Artifacts · Config · CI log
```

## Modules

| Module | Responsibility |
|--------|----------------|
| `lib/gcs.ts` | CORS-safe GCS fetch/list helpers |
| `lib/url.ts` | Prow URL parse + route encoding |
| `lib/meta.ts` | Job name / prowjob → arch, workflow, config links |
| `lib/diagnosis.ts` | Patterns, snippets, evidence-bound diagnosis |
| `lib/analyze.ts` | End-to-end execution analysis |
| `lib/discovery.ts` | Dynamic IBM Z job/build discovery |
| `data/*` | Workflow order, fail patterns, step KB, LPAR map |

## GitHub Pages

- Vite `base: '/ci-analyzer/'`
- `HashRouter` so refreshes work without a custom 404 rewrite
- Build artifact: `web/dist`
- Job index regenerated in Actions when GCS is reachable; seed file ships in `public/data/`

## Configured vs observed

- **Configured:** links into `openshift/release` + step-registry from prowjob labels
- **Observed:** step directories actually present under the execution's GCS artifact prefix
- Missing associations are marked **unresolved**, never invented
