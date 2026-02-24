import { NextResponse } from "next/server";
import { AuthError, requireCurrentUser } from "@/lib/auth";
import { exportWeekReports } from "@/lib/export";
import { hasExternalExportWorker, isExportGenerationAvailable, isPdfExportDisabled } from "@/lib/runtime";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await requireCurrentUser();
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const year = Number((body as { year?: unknown }).year);
    const kw = Number((body as { kw?: unknown }).kw);
    const formatRaw = (body as { format?: unknown }).format;
    const format = formatRaw === "pdf" || formatRaw === "both" ? formatRaw : "xlsx";

    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return NextResponse.json({ error: "Invalid year" }, { status: 400 });
    }
    if (!Number.isInteger(kw) || kw < 1 || kw > 53) {
      return NextResponse.json({ error: "Invalid KW" }, { status: 400 });
    }
    if (isPdfExportDisabled() && (format === "pdf" || format === "both")) {
      return NextResponse.json(
        { error: "PDF export is disabled for this deployment. Enable worker PDF later if needed." },
        { status: 400 }
      );
    }
    if (!hasExternalExportWorker() && !isExportGenerationAvailable()) {
      return NextResponse.json(
        { error: "Export generation is disabled on this deployment. Configure an external export worker." },
        { status: 503 }
      );
    }

    const result = await exportWeekReports({ year, kw, format });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Export failed" },
      { status: 500 }
    );
  }
}
