import { NextResponse } from "next/server";
import { getIsoWeek } from "@/lib/calendar";
import { exportWeekReportBuffer } from "@/lib/export";
import { sendMail } from "@/lib/mailer";

export const runtime = "nodejs";

function getCompletedWeek(): { year: number; kw: number } {
  // Cron runs on Sunday (UTC). The completed work week Mon–Sat is ISO days 1–6
  // of the same ISO week as Saturday (yesterday). Using Saturday avoids any
  // edge case where "Sunday UTC" might differ from the user's local date.
  const now = new Date();
  const saturday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
  return getIsoWeek(saturday);
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const authHeader = request.headers.get("authorization");

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = process.env.REPORT_USER_ID?.trim();
  if (!userId) {
    return NextResponse.json({ error: "REPORT_USER_ID is not configured." }, { status: 500 });
  }

  const recipient = process.env.REPORT_RECIPIENT_EMAIL?.trim() || process.env.GMAIL_SENDER?.trim();
  if (!recipient) {
    return NextResponse.json({ error: "No recipient email configured (set REPORT_RECIPIENT_EMAIL or GMAIL_SENDER)." }, { status: 500 });
  }

  const { year, kw } = getCompletedWeek();

  try {
    const reports = await exportWeekReportBuffer({ year, kw, userId });

    if (reports.length === 0) {
      return NextResponse.json({ ok: true, year, kw, message: "No report segments generated." });
    }

    const subject = `Wochenbericht KW ${kw} / ${year}`;
    const text = [
      `Hallo,`,
      ``,
      `anbei dein Wochenbericht für KW ${kw} / ${year}.`,
      ``,
      `Bitte prüfe die Angaben und leite das Dokument an deine Arbeitsstelle weiter.`,
      ``,
      `Dateien: ${reports.map((r) => r.filename).join(", ")}`
    ].join("\n");

    await sendMail({
      to: recipient,
      subject,
      text,
      attachments: reports.map((r) => ({
        filename: r.filename,
        content: r.buffer
      }))
    });

    return NextResponse.json({
      ok: true,
      year,
      kw,
      recipient,
      files: reports.map((r) => r.filename),
      warnings: reports.flatMap((r) => r.warnings)
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
