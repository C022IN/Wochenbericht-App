import Link from "next/link";
import { notFound } from "next/navigation";
import { DailyEntryForm } from "@/components/DailyEntryForm";
import {
  addDays,
  formatDeDate,
  formatIsoDate,
  getIsoWeek,
  getIsoWeekDates,
  getWeekdayLabel,
  isValidIsoDate,
  parseIsoDate,
  weekDatesToInfo
} from "@/lib/calendar";
import { getEntriesByDates, getEntry, getProfile } from "@/lib/db";
import { requirePageUser } from "@/lib/auth";

type PageProps = {
  params: Promise<{ date: string }>;
};

export default async function DayPage({ params }: PageProps) {
  const { date: rawDate } = await params;
  const date = decodeURIComponent(rawDate);
  if (!isValidIsoDate(date)) notFound();
  await requirePageUser(`/day/${date}`);

  const jsDate = parseIsoDate(date);
  const week = getIsoWeek(jsDate);
  const weekDates = getIsoWeekDates(week.year, week.kw);
  const isoWeekDates = weekDates.map((d) => d.toISOString().slice(0, 10));

  const prevDate = formatIsoDate(addDays(jsDate, -1));
  const nextDate = formatIsoDate(addDays(jsDate, 1));
  const todayIso = new Date().toISOString().slice(0, 10);

  const [entry, profile, entriesByDate] = await Promise.all([
    getEntry(date),
    getProfile(),
    getEntriesByDates(isoWeekDates)
  ]);

  return (
    <main className="shell grid" style={{ gap: "1rem" }}>
      <section className="hero">
        <div className="toolbar spread">
          <div>
            <h1>Tagesbericht {formatDeDate(date)}</h1>
          </div>
          <div className="toolbar">
            <Link className="btn" href={`/day/${prevDate}`}>
              Vortag
            </Link>
            <Link className="btn" href={`/day/${nextDate}`}>
              Folgetag
            </Link>
            <Link className="btn" href={`/week/${week.year}/${week.kw}`}>
              KW {String(week.kw).padStart(2, "0")}
            </Link>
            <Link className="btn" href={`/?year=${week.year}`}>
              Übersicht
            </Link>
          </div>
        </div>
      </section>

      <section className="card">
        <h2>Woche</h2>
        <div className="day-strip" style={{ marginTop: "0.8rem" }}>
          {weekDatesToInfo(weekDates).map((day) => {
            const hasContent = Boolean(
              entriesByDate[day.date]?.lines?.some((line) => line.siteNameOrt || line.beginn || line.ende)
            );
            const isCurrent = day.date === date;
            const isToday = day.date === todayIso;
            const classes = ["day-chip", isCurrent ? "active" : "", isToday ? "today" : ""]
              .filter(Boolean)
              .join(" ");

            return (
              <Link key={day.date} href={`/day/${day.date}`} className={classes}>
                <strong>{getWeekdayLabel(day.isoWeekday)}</strong>
                <div>{formatDeDate(day.date)}</div>
                <div className={hasContent ? "pill ok" : "pill"}>{hasContent ? "Erfasst" : "Leer"}</div>
              </Link>
            );
          })}
        </div>
      </section>

      <DailyEntryForm
        date={date}
        initialEntry={entry}
        defaults={{
          proj: profile.defaultArbeitsstaetteProjekte,
          arbeit: profile.defaultArtDerArbeit
        }}
        weekContext={{ weekYear: week.year, weekKw: week.kw }}
      />
    </main>
  );
}
