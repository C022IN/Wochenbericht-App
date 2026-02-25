import { NextResponse } from "next/server";
import { AuthError, signInWithPassword } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const identifier =
    typeof (body as { identifier?: unknown } | null)?.identifier === "string"
      ? String((body as { identifier: string }).identifier).trim()
      : typeof (body as { email?: unknown } | null)?.email === "string"
        ? String((body as { email: string }).email).trim()
        : "";
  const password =
    typeof (body as { password?: unknown } | null)?.password === "string"
      ? String((body as { password: string }).password)
      : "";

  if (!identifier || !password) {
    return NextResponse.json({ error: "Email/username and password are required." }, { status: 400 });
  }

  try {
    const user = await signInWithPassword(identifier, password);
    return NextResponse.json({ ok: true, user });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
