# Wochenbericht App (Next.js + Supabase + Export Worker)

Technician weekly report app (`KW`) with day entry, Excel export from your Axians template, and Vercel-ready deployment support.

## What this repo now supports

- Next.js UI (dashboard, week view, day entry)
- Supabase Auth (email/password via Supabase Auth REST)
- Supabase DB for profile + entries
- Supabase Storage for generated export files (`.xlsx`, optional `.pdf`)
- Month-split export rule for weeks that cross months
- External export worker (Python + `openpyxl`) for online Excel generation
- Built-in Vercel Python export function for XLSX generation without a separate worker
- Optional PDF generation in worker (LibreOffice on worker host)
- Local fallback mode for development (JSON DB + local Python export)

## Architecture (Vercel-ready)

- `Vercel`: UI + API routes + auth cookies + DB access + export orchestration
- `Vercel Python Function`: optional built-in XLSX export path at `/api/export_worker`
- `Supabase`: Auth + Postgres (entries/profile) + Storage (generated files)
- `Worker` (separate container): runs Python exporter (`openpyxl`) and optional LibreOffice PDF conversion

## Quick start (local dev)

1. Install Node dependencies

```powershell
npm install
```

2. Copy env file

```powershell
Copy-Item .env.example .env.local
```

3. For local-only development (no Supabase/auth), set:

```env
AUTH_DISABLED=1
DB_BACKEND=local
STORAGE_BACKEND=local
```

4. Install Python dependency for local exporter

```powershell
python -m pip install openpyxl
```

5. Start app

```powershell
npm run dev
```

## Vercel deployment (recommended path)

### 1. Create Supabase project

- Run SQL in `supabase/schema.sql`
- Create at least one user in Supabase Auth (or allow signup in app)
- Create bucket `wochenbericht-exports` (SQL script also inserts it)

### 2. Set Vercel environment variables

Required:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_EXPORTS_BUCKET`
- `EXPORT_WORKER_TOKEN`
- `DISABLE_PDF_EXPORT=1` (initially)
- `NEXT_PUBLIC_DISABLE_PDF_EXPORT=1` (UI hides PDF buttons)

Optional:

- `EXPORT_WORKER_URL` (set this only if you want to use an external worker instead of the built-in Vercel Python function)
- `TEMPLATE_XLSX_URL` (remote template URL, e.g. Supabase Storage public/signed URL)
- `SUPABASE_EXPORTS_PUBLIC_BUCKET=1` (otherwise app generates signed URLs)
- `SUPABASE_EXPORTS_SIGNED_URL_TTL_SECONDS=86400`
- `DISABLE_VERCEL_PYTHON_EXPORT_WORKER=1` (forces the JS fallback when no external worker is configured)

### 3. Deploy the export worker

The worker lives in `worker/`.

- Dockerfile: `worker/Dockerfile`
- Endpoint expected by app: `POST /export-week`
- Worker deployment guide: `worker/README.md`

Worker env:

- `EXPORT_WORKER_TOKEN` (must match Vercel app)
- `ENABLE_PDF_EXPORT=0` (default)
- `PYTHON_BIN=python` (optional)

The worker container now runs behind Gunicorn for production instead of the Flask development server.

To enable PDF later:

- install LibreOffice in the worker image (see commented line in `worker/Dockerfile`)
- set `ENABLE_PDF_EXPORT=1`
- unset `DISABLE_PDF_EXPORT` / `NEXT_PUBLIC_DISABLE_PDF_EXPORT` on Vercel

If you only need XLSX export, Vercel can now run the Python export logic directly via the built-in function at `/api/export_worker`. In that setup, you do not need `EXPORT_WORKER_URL`.

If Deployment Protection or Vercel Authentication is enabled, the app forwards the incoming request cookies to the built-in worker and can also use `VERCEL_AUTOMATION_BYPASS_SECRET` when Vercel provides it.

## GitHub Actions CI/CD (deploys to Vercel)

This repo includes `/.github/workflows/ci-vercel.yml`:

- Pull requests: runs CI (`npm ci`, TypeScript check, Next.js build, Python syntax check)
- Push to `main`: runs CI, then deploys to Vercel (production) using the Vercel CLI

For the export worker, this repo also includes `/.github/workflows/ci-railway-worker.yml`:

- Pull requests touching worker files: validates Python, builds the worker Docker image, and checks `GET /health`
- Pushes to `main` touching worker files: runs the same worker CI checks
- Railway should be configured with `Wait for CI` so it auto-updates only after that workflow passes

Add these GitHub repository secrets before enabling the deploy job:

- `VERCEL_TOKEN` (create in Vercel Account Settings -> Tokens)
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

You can get `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` from:

- Vercel project settings, or
- local `vercel link` (it writes `.vercel/project.json`, which is gitignored)

Important:

- App runtime secrets (Supabase, worker URL/token, etc.) should be configured in the Vercel project environment variables, not in GitHub secrets.

## Export behavior

- A normal week exports as one file.
- If an ISO week spans two months, exports are split by month.
- Example: `KW 9 / 2026` includes `2026-03-01` (Sunday), so the app creates:
  - February report (`23.02.2026` to `28.02.2026`)
  - March report (`01.03.2026`)

## Auth notes

- Login/signup are provided by app routes that proxy to Supabase Auth REST:
  - `POST /api/auth/login`
  - `POST /api/auth/signup`
  - `POST /api/auth/logout`
- Protected pages redirect to `/login`
- Protected APIs return `401` if unauthenticated

## Main files

- `app/page.tsx` dashboard + overview
- `app/week/[year]/[kw]/page.tsx` week details + export panel
- `app/day/[date]/page.tsx` day entry
- `components/DailyEntryForm.tsx` line editor (Arbeitszeit/Baustelle rows)
- `lib/db.ts` local/Supabase DB adapter
- `lib/auth.ts` Supabase auth (REST + cookies)
- `lib/export.ts` export orchestration (local or worker backend)
- `lib/supabase-storage.ts` Supabase Storage uploads + URLs
- `scripts/export_wochenbericht.py` Excel template writer
- `worker/app.py` HTTP worker for online XLSX/PDF generation
