import { NextResponse } from "next/server";
import { supabaseRestJson } from "@/lib/supabase-rest";

export const runtime = "nodejs";

// Lightweight scheduled ping so the free-tier Supabase project never sits idle long enough
// to auto-pause (which pauses after ~7 days and makes the next cold load error out). Runs
// mid-week (see vercel.json) so, together with the Sunday report cron, the DB is touched
// roughly twice a week. The request itself resuming a paused project is the point, so this
// never returns 5xx — a failed ping still nudged the project awake for the next visitor.
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const authHeader = request.headers.get("authorization");
  const isVercelCron = (request.headers.get("user-agent") || "").toLowerCase().includes("vercel-cron");

  if (cronSecret && authHeader !== `Bearer ${cronSecret}` && !isVercelCron) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await supabaseRestJson("/rest/v1/wochenbericht_profiles?select=user_id&limit=1");
    return NextResponse.json({ ok: true, warmed: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    // Still 200: the ping's job is to nudge the project awake, not to succeed on the first try.
    return NextResponse.json({ ok: false, warmed: false, note: message });
  }
}
