import path from "node:path";
import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { AuthError, requireCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";

const EXPORTS_DIR = path.join(process.cwd(), "exports");

type Params = { params: Promise<{ filename: string }> };

function getContentType(filename: string) {
  if (filename.toLowerCase().endsWith(".pdf")) {
    return "application/pdf";
  }

  return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
}

function isAllowedExportFile(filename: string) {
  const normalized = path.basename(filename);
  return (
    normalized === filename &&
    /\.(xlsx|pdf)$/i.test(filename) &&
    !filename.includes("/") &&
    !filename.includes("\\")
  );
}

export async function GET(_: Request, { params }: Params) {
  try {
    await requireCurrentUser();
    const { filename: rawFilename } = await params;
    const filename = decodeURIComponent(rawFilename);

    if (!isAllowedExportFile(filename)) {
      return NextResponse.json({ error: "Invalid export filename" }, { status: 400 });
    }

    const filePath = path.join(EXPORTS_DIR, filename);
    const file = await readFile(filePath).catch(() => null);
    if (!file) {
      return NextResponse.json({ error: "Export file not found" }, { status: 404 });
    }

    return new NextResponse(file, {
      status: 200,
      headers: {
        "Content-Type": getContentType(filename),
        "Content-Disposition": `attachment; filename="${filename.replace(/["\\]/g, "_")}"`,
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
