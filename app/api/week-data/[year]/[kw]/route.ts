import { NextResponse } from "next/server";
import { AuthError, requireCurrentUser } from "@/lib/auth";
import { getWeekCarData, saveWeekCarData } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = Promise<{ year: string; kw: string }>;

function parseParams(params: { year: string; kw: string }) {
  const y = Number(params.year);
  const w = Number(params.kw);
  if (!Number.isInteger(y) || !Number.isInteger(w) || y < 2000 || y > 2100 || w < 1 || w > 53) {
    return null;
  }
  return { year: y, kw: w };
}

export async function GET(_req: Request, { params }: { params: Params }) {
  try {
    await requireCurrentUser();
    const resolved = await params;
    const parsed = parseParams(resolved);
    if (!parsed) return NextResponse.json({ error: "Invalid week" }, { status: 400 });

    const carData = await getWeekCarData(parsed.year, parsed.kw);
    return NextResponse.json({ carData });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Failed to load week car data" }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: { params: Params }) {
  try {
    await requireCurrentUser();
    const resolved = await params;
    const parsed = parseParams(resolved);
    if (!parsed) return NextResponse.json({ error: "Invalid week" }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const carData = await saveWeekCarData(parsed.year, parsed.kw, body ?? {});
    return NextResponse.json({ carData });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Failed to save week car data" }, { status: 500 });
  }
}
