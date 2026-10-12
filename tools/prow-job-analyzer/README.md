# IBM Z · Prow Job Analyzer (legacy + redirect)

The **primary product** is the Vite/React debugger in [`../../web`](../../web).

| File | Purpose |
|------|---------|
| `index.html` | Redirects to the GitHub Pages debugger |
| `legacy.html` | Previous zero-dependency single-file analyzer |

## Legacy UI

```bash
cd tools/prow-job-analyzer
python3 -m http.server 8080
# open http://localhost:8080/legacy.html
```

## Debugger

```bash
cd ../../web
npm install
npm run dev
```

See the [root README](../../README.md) for usage and deployment.
