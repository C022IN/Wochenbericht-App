# Wochenbericht App (Next.js + Supabase + Export Worker)

Technician weekly report app (`KW`) with day entry, Excel export from your Axians template, and Vercel-ready deployment support.

## What this repo now supports

- Next.js UI (dashboard, week view, day entry)
- Supabase Auth (email/password via Supabase Auth REST)
- Supabase DB for profile + entries
- Supabase Storage for generated export files (`.xlsx`, optional `.pdf`)
- Month-split export rule for weeks that cross months
- External export worker (Python + `openpyxl`) for online Excel generation
- Optional PDF generation in worker (LibreOffice on worker host)
- Local fallback mode for development (JSON DB + local Python export)

## Architecture (Vercel-ready)

- `Vercel`: UI + API routes + auth cookies + DB access + export orchestration
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
- `EXPORT_WORKER_URL`
- `EXPORT_WORKER_TOKEN`
- `DISABLE_PDF_EXPORT=1` (initially)
- `NEXT_PUBLIC_DISABLE_PDF_EXPORT=1` (UI hides PDF buttons)

Optional:

- `TEMPLATE_XLSX_URL` (remote template URL, e.g. Supabase Storage public/signed URL)
- `SUPABASE_EXPORTS_PUBLIC_BUCKET=1` (otherwise app generates signed URLs)
- `SUPABASE_EXPORTS_SIGNED_URL_TTL_SECONDS=86400`

### 3. Deploy the export worker

The worker lives in `worker/`.

Example build context:

- Dockerfile: `worker/Dockerfile`
- Endpoint expected by app: `POST /export-week`

Worker env:

- `EXPORT_WORKER_TOKEN` (must match Vercel app)
- `ENABLE_PDF_EXPORT=0` (default)
- `PYTHON_BIN=python` (optional)

To enable PDF later:

- install LibreOffice in worker image (see commented line in `worker/Dockerfile`)
- set `ENABLE_PDF_EXPORT=1`
- unset `DISABLE_PDF_EXPORT` / `NEXT_PUBLIC_DISABLE_PDF_EXPORT` on Vercel

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
