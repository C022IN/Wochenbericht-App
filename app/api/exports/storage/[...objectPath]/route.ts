import path from "node:path";
import { NextResponse } from "next/server";
import { AuthError, requireCurrentUser } from "@/lib/auth";
import { getSupabaseConfig } from "@/lib/supabase-rest";

export const runtime = "nodejs";

type Params = { params: Promise<{ objectPath: string[] }> };

function getBucketName() {
  return process.env.SUPABASE_EXPORTS_BUCKET?.trim() || "wochenbericht-exports";
}

function getContentType(filename: string) {
  if (filename.toLowerCase().endsWith(".pdf")) {
    return "application/pdf";
  }

  return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
}

function decodeObjectPath(segments: string[]) {
  return segments.map((segment) => decodeURIComponent(segment)).join("/");
}

function isAllowedObjectPath(objectPath: string) {
  if (!objectPath || objectPath.includes("\\") || objectPath.includes("//")) return false;

  const segments = objectPath.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    return false;
  }

  return /\.(xlsx|pdf)$/i.test(segments[segments.length - 1] ?? "");
}

function sanitizeDownloadName(value: string, fallback: string) {
  const normalized = value.replace(/[<>:"/\\|?*\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim();
  return normalized || fallback;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const user = await requireCurrentUser();
    const { objectPath: rawObjectPath } = await params;
    const objectPath = decodeObjectPath(rawObjectPath);

    if (!isAllowedObjectPath(objectPath)) {
      return NextResponse.json({ error: "Invalid export object path" }, { status: 400 });
    }

    const expectedPrefix = `exports/${user.id}/`;
    if (!objectPath.startsWith(expectedPrefix)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const config = getSupabaseConfig();
    if (!config) {
      return NextResponse.json({ error: "Supabase storage is not configured." }, { status: 503 });
    }

    const upstream = await fetch(`${config.url}/storage/v1/object/${getBucketName()}/${objectPath}`, {
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`
      },
      cache: "no-store"
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      return NextResponse.json(
        { error: text || `Failed to load export file (${upstream.status})` },
        { status: upstream.status }
      );
    }

    const bytes = Buffer.from(await upstream.arrayBuffer());
    const fallbackName = path.posix.basename(objectPath);
    const requestedName = new URL(request.url).searchParams.get("dl");
    const downloadName = sanitizeDownloadName(requestedName ?? fallbackName, fallbackName);

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": upstream.headers.get("content-type") || getContentType(fallbackName),
        "Content-Disposition": `attachment; filename="${downloadName.replace(/["\\]/g, "_")}"`,
        "Cache-Control": "private, no-store"
      }
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json({ error: "Failed to load export file" }, { status: 500 });
  }
}
