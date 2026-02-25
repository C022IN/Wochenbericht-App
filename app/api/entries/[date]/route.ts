import { NextResponse } from "next/server";
import { AuthError, requireCurrentUser } from "@/lib/auth";
import { isValidIsoDate } from "@/lib/calendar";
import { getEntry, saveEntry } from "@/lib/db";

export const runtime = "nodejs";

type Params = { params: Promise<{ date: string }> };

export async function GET(_: Request, { params }: Params) {
  try {
    await requireCurrentUser();
    const { date: rawDate } = await params;
    const date = decodeURIComponent(rawDate);
    if (!isValidIsoDate(date)) {
      return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
    }

    const entry = await getEntry(date);
    return NextResponse.json({ entry });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Failed to load entry" }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: Params) {
  try {
    await requireCurrentUser();
    const { date: rawDate } = await params;
    const date = decodeURIComponent(rawDate);
    if (!isValidIsoDate(date)) {
      return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
    }

    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const entry = await saveEntry(date, body);
    return NextResponse.json({ entry });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Failed to save entry";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
