import { NextResponse } from "next/server";
import { AuthError, requireCurrentUser } from "@/lib/auth";
import { getProfile, saveProfile } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireCurrentUser();
    const profile = await getProfile();
    return NextResponse.json({ profile });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Failed to load profile" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    await requireCurrentUser();
    const body = await request.json().catch(() => ({}));
    const profile = await saveProfile(body ?? {});
    return NextResponse.json({ profile });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Failed to save profile" }, { status: 500 });
  }
}
