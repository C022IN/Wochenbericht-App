import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json(
    { error: "Signup is disabled. Contact an administrator to create your account." },
    { status: 403 }
  );
}
