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

export function isLocalExportBackendAvailable() {
  // Local backend requires Python and filesystem access. Treat Vercel as unavailable.
  if (isVercelRuntime()) return false;
  return true;
}

export function isExportGenerationAvailable() {
  return hasExternalExportWorker() || isLocalExportBackendAvailable();
}
