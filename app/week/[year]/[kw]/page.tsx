import Link from "next/link";
import { notFound } from "next/navigation";
import { ExportPanel } from "@/components/ExportPanel";
import {
  addDays,
  formatDeDate,
  getIsoWeek,
  getIsoWeekDates,
  getMonthLabelDe,
  getSegmentWeekDisplayInfo,
  getWeekDisplayInfo,
  getWeekLabel,
  getWeekdayLabel,
  splitWeekByMonth,
  weekDatesToInfo
} from "@/lib/calendar";
import { getEntriesByDates, getWeekSummary } from "@/lib/db";
import { requirePageUser } from "@/lib/auth";

type PageProps = {
  params: { year: string; kw: string };
};

function parseParams({ year, kw }: PageProps["params"]) {
  const y = Number(year);
  const w = Number(kw);
  if (!Number.isInteger(y) || !Number.isInteger(w) || y < 2000 || y > 2100 || w < 1 || w > 53) {
    return null;
  }
  return { year: y, kw: w };
}

export default async function WeekPage({ params }: PageProps) {
  await requirePageUser(`/week/${params.year}/${params.kw}`);
  const parsed = parseParams(params);
  if (!parsed) notFound();

  const { year, kw } = parsed;
  const weekDates = getIsoWeekDates(year, kw);
  const isoDates = weekDates.map((d) => d.toISOString().slice(0, 10));
  const [entriesByDate, summary] = await Promise.all([getEntriesByDates(isoDates), getWeekSummary(year, kw)]);
  const dayInfos = weekDatesToInfo(weekDates);
  const segments = splitWeekByMonth(weekDates);
  const displayWeek = getWeekDisplayInfo(year, kw, weekDates);

  const todayIso = new Date().toISOString().slice(0, 10);
  const prevWeek = getIsoWeek(addDays(weekDates[0], -1));
  const nextWeek = getIsoWeek(addDays(weekDates[6], 1));

  return (
    <main className="shell grid" style={{ gap: "1rem" }}>
      <section className="hero">
        <div className="toolbar spread">
          <div>
            <h1>{getWeekLabel(displayWeek.displayYear, displayWeek.displayKw)}</h1>
            <p>
              {formatDeDate(isoDates[0])} - {formatDeDate(isoDates[6])}
            </p>
          </div>
          <div className="toolbar">
            <Link className="btn" href={`/week/${prevWeek.year}/${prevWeek.kw}`}>
              Vorwoche
            </Link>
            <Link className="btn" href={`/week/${nextWeek.year}/${nextWeek.kw}`}>
              Folgewoche
            </Link>
            <Link className="btn" href={`/day/${isoDates[0]}`}>
              Montag
            </Link>
            <Link className="btn" href={`/?year=${year}`}>
              Übersicht
            </Link>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="toolbar spread">
          <h2>Tage</h2>
          <div className="toolbar">
            <span className={summary.isMonthSplit ? "pill warn" : "pill ok"}>
              {summary.isMonthSplit ? "Split" : "OK"}
            </span>
            <span className="pill">{summary.filledDays}/7</span>
          </div>
        </div>

        <div className="day-strip" style={{ marginTop: "0.8rem" }}>
          {dayInfos.map((day) => {
            const entry = entriesByDate[day.date];
            const lineCount =
              entry?.lines.filter((line) => {
                return (
                  line.siteNameOrt.trim() ||
                  line.beginn.trim() ||
                  line.ende.trim() ||
                  line.projektnummer.trim() ||
                  line.smNr.trim()
                );
              }).length ?? 0;

            const isToday = day.date === todayIso;
            const classes = ["day-chip", lineCount ? "active" : "", isToday ? "today" : ""]
              .filter(Boolean)
              .join(" ");

            return (
              <Link key={day.date} className={classes} href={`/day/${day.date}`}>
                <strong>{getWeekdayLabel(day.isoWeekday)}</strong>
                <div>{formatDeDate(day.date)}</div>
                <div className="small">{getMonthLabelDe(day.month)}</div>
                <div className={lineCount ? "pill ok" : "pill"}>{lineCount ? `${lineCount} Zeilen` : "Leer"}</div>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="grid cols-2">
        <section className="card">
          <h2>Dateien</h2>
          <div className="segment-list" style={{ marginTop: "0.8rem" }}>
            {segments.map((segment) => {
              const segWeekDisplay = getSegmentWeekDisplayInfo(year, kw, segment.year);
              return (
                <article className="segment-card" key={`${segment.key}-${segment.startDate}`}>
                  <div className="toolbar spread">
                    <strong>
                      {getMonthLabelDe(segment.month)} {segment.year}
                    </strong>
                    <span className={segment.isSingleDay ? "pill warn" : "pill ok"}>
                      {segment.isSingleDay ? "1 Tag" : `${segment.dates.length} Tage`}
                    </span>
                  </div>
                  <div className="small">
                    {formatDeDate(segment.startDate)} - {formatDeDate(segment.endDate)}
                  </div>
                  <div className="toolbar">
                    <span className={`pill ${segWeekDisplay.isCarryOverToNextYear ? "warn" : ""}`}>
                      KW {String(segWeekDisplay.displayKw).padStart(2, "0")} ({segWeekDisplay.displayYear})
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <ExportPanel year={year} kw={kw} />
      </section>
    </main>
  );
}
