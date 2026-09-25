# Export Worker

This worker is the production export backend that Vercel should call for Excel generation.

If you only need XLSX generation, the main app can also use the built-in Vercel Python function at `/api/export_worker` and skip this separate worker entirely.

It accepts:

- `GET /health`
- `POST /export-week`

## Why this exists

Vercel cannot rely on the local Python/filesystem export path used in development. In production, the Next.js app should send export jobs to this worker using:

- `EXPORT_WORKER_URL=https://your-worker.example.com/export-week`
- `EXPORT_WORKER_TOKEN=...`

## Worker environment

Start from `worker/.env.example`.

Required:

- `EXPORT_WORKER_TOKEN`

Optional:

- `ENABLE_PDF_EXPORT=1` after LibreOffice is installed
- `PYTHON_BIN`
- `GUNICORN_WORKERS`
- `GUNICORN_THREADS`
- `GUNICORN_TIMEOUT`
- `GUNICORN_GRACEFUL_TIMEOUT`
- `GUNICORN_KEEPALIVE`

## Local smoke test

Build:

```powershell
docker build -f worker/Dockerfile -t wochenbericht-export-worker .
```

Run:

```powershell
docker run --rm -p 8080:8080 `
  -e EXPORT_WORKER_TOKEN=replace-me `
  -e ENABLE_PDF_EXPORT=0 `
  wochenbericht-export-worker
```

Health check:

```powershell
curl http://localhost:8080/health
```

## Production deployment

Any container host with HTTPS works: Cloud Run, Render, Railway, Fly.io, etc.

Production requirements:

- Public HTTPS URL reachable from Vercel
- `EXPORT_WORKER_TOKEN` configured
- Request timeout high enough for export generation
- Persistent filesystem is not required

### Example: Google Cloud Run

Build and push an image from the repo root:

```powershell
docker build -f worker/Dockerfile -t REGION-docker.pkg.dev/PROJECT_ID/REPO/wochenbericht-export-worker:latest .
docker push REGION-docker.pkg.dev/PROJECT_ID/REPO/wochenbericht-export-worker:latest
```

Deploy:

```powershell
gcloud run deploy wochenbericht-export-worker `
  --image REGION-docker.pkg.dev/PROJECT_ID/REPO/wochenbericht-export-worker:latest `
  --region REGION `
  --platform managed `
  --allow-unauthenticated `
  --port 8080 `
  --timeout 300 `
  --set-env-vars EXPORT_WORKER_TOKEN=replace-me,ENABLE_PDF_EXPORT=0
```

After deploy, the worker URL used by Vercel is:

```text
https://YOUR_CLOUD_RUN_HOST/export-week
```

### Railway auto-update flow

If the Railway service is connected to your GitHub repository and branch, Railway already handles automatic deploys on push.

The recommended setup is:

1. Enable Railway `Wait for CI` on the worker service.
2. Keep the service connected to the production branch, usually `main`.
3. Let GitHub Actions validate the worker before Railway deploys it.

This repo includes a worker-specific workflow at `.github/workflows/ci-railway-worker.yml` that:

- validates the Python files
- builds `worker/Dockerfile`
- starts the worker container
- checks `GET /health`

That gives you: push to `main` -> CI passes -> Railway updates the worker automatically.

## Vercel wiring

Set these in the Vercel project:

```env
EXPORT_WORKER_URL=https://your-worker.example.com/export-week
EXPORT_WORKER_TOKEN=replace-me
DISABLE_PDF_EXPORT=1
NEXT_PUBLIC_DISABLE_PDF_EXPORT=1
```

If worker PDF export is enabled later, remove the two PDF-disable flags from Vercel and rebuild the worker image with LibreOffice installed.
