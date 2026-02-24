import { NextResponse } from "next/server";
import { clearSessionCookies } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST() {
  clearSessionCookies();
  return NextResponse.json({ ok: true });
}
