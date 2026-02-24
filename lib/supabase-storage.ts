import { getSupabaseConfig, supabaseRestJson } from "./supabase-rest";

function getBucketName() {
  return process.env.SUPABASE_EXPORTS_BUCKET?.trim() || "wochenbericht-exports";
}

export function isSupabaseStorageEnabled() {
  if (process.env.STORAGE_BACKEND?.trim() === "local") return false;
  return Boolean(getSupabaseConfig());
}

function normalizeObjectPath(objectPath: string) {
  return objectPath.replace(/^\/+/, "");
}

export async function uploadExportObject(opts: {
  objectPath: string;
  contentType: string;
  data: Buffer;
}) {
  const config = getSupabaseConfig();
  if (!config) {
    throw new Error("Supabase storage is not configured.");
  }

  const bucket = getBucketName();
  const objectPath = normalizeObjectPath(opts.objectPath);
  const res = await fetch(`${config.url}/storage/v1/object/${bucket}/${objectPath}`, {
    method: "POST",
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      "Content-Type": opts.contentType,
      "x-upsert": "true"
    },
    body: opts.data
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase storage upload failed (${res.status}): ${text}`);
  }

  return { bucket, objectPath };
}

export async function getExportDownloadUrl(objectPath: string) {
  const config = getSupabaseConfig();
  if (!config) {
    throw new Error("Supabase storage is not configured.");
  }

  const bucket = getBucketName();
  const normalizedPath = normalizeObjectPath(objectPath);
  if (process.env.SUPABASE_EXPORTS_PUBLIC_BUCKET === "1") {
    return `${config.url}/storage/v1/object/public/${bucket}/${normalizedPath}`;
  }

  const expiresIn = Number(process.env.SUPABASE_EXPORTS_SIGNED_URL_TTL_SECONDS || "86400");
  const payload = await supabaseRestJson<{ signedURL?: string }>(
    `/storage/v1/object/sign/${bucket}/${normalizedPath}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expiresIn: Number.isFinite(expiresIn) ? expiresIn : 86400 })
    }
  );

  if (!payload.signedURL) {
    throw new Error("Supabase signed URL generation failed.");
  }

  return `${config.url}/storage/v1${payload.signedURL}`;
}
