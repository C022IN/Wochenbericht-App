export function isVercelRuntime() {
  return process.env.VERCEL === "1";
}

export function isPdfExportDisabled() {
  if (process.env.DISABLE_PDF_EXPORT === "1") return true;
  return isVercelRuntime() && process.env.ENABLE_PDF_EXPORT_ON_VERCEL !== "1";
}

export function hasExternalExportWorker() {
  return Boolean(process.env.EXPORT_WORKER_URL?.trim());
}

function normalizeBaseUrl(value: string) {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function getBuiltInVercelExportWorkerBaseUrl() {
  if (!isVercelRuntime() || process.env.DISABLE_VERCEL_PYTHON_EXPORT_WORKER === "1") {
    return null;
  }

  const raw =
    process.env.VERCEL_URL?.trim() ||
    process.env.VERCEL_BRANCH_URL?.trim() ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() ||
    "";

  const baseUrl = normalizeBaseUrl(raw);
  return baseUrl || null;
}

export function hasBuiltInVercelExportWorker() {
  return Boolean(getBuiltInVercelExportWorkerBaseUrl());
}

export function getExportWorkerUrl() {
  const external = process.env.EXPORT_WORKER_URL?.trim();
  if (external) return external;

  const baseUrl = getBuiltInVercelExportWorkerBaseUrl();
  if (!baseUrl) return null;
  return `${baseUrl}/api/export_worker`;
}

export function isLocalExportBackendAvailable() {
  // Local backend requires Python and filesystem access. Treat Vercel as unavailable.
  if (isVercelRuntime()) return false;
  return true;
}

/** JS-based export (exceljs) runs in any Node.js environment including Vercel. */
export function isJsExportAvailable() {
  return true;
}

export function isExportGenerationAvailable() {
  return Boolean(getExportWorkerUrl()) || isLocalExportBackendAvailable() || isJsExportAvailable();
}
