import { NextResponse } from "next/server";
import { AuthError, signUpWithPassword } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = typeof (body as { email?: unknown } | null)?.email === "string" ? String((body as { email: string }).email).trim() : "";
  const password =
    typeof (body as { password?: unknown } | null)?.password === "string"
      ? String((body as { password: string }).password)
      : "";

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }

  try {
    const { user, hasSession } = await signUpWithPassword(email, password);
    return NextResponse.json({
      ok: true,
      user,
      hasSession,
      message: hasSession ? undefined : "Signup created. Check your email if confirmation is enabled."
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Signup failed" }, { status: 500 });
  }
}
