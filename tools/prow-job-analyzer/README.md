# IBM Z · Prow Job Analyzer (legacy + redirect)

The **primary product** is now the Vite/React workbench in [`../../web`](../../web).

| File | Purpose |
|------|---------|
| `index.html` | Redirects to the GitHub Pages workbench |
| `legacy.html` | Previous zero-dependency single-file analyzer |
| `verify-workbench.mjs` | Optional Node GCS contract checks |

## Legacy UI

```bash
cd tools/prow-job-analyzer
python3 -m http.server 8080
# open http://localhost:8080/legacy.html
```

## New workbench

```bash
cd ../../web
npm install
npm run dev
```

See the [root README](../../README.md) for architecture, deployment, and verification.
