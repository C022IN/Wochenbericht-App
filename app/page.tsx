import Link from "next/link";
import {
  formatDeDate,
  getIsoWeek,
  getIsoWeekDates,
  getIsoWeeksInYear,
  getMonthLabelDe,
  getWeekDisplayInfo
} from "@/lib/calendar";
import { listWeekSummaries, getProfile } from "@/lib/db";
import { getTemplateStatus } from "@/lib/template";
import { ProfileCard } from "@/components/ProfileCard";
import { WeekGridPanel, type WeekDisplayItem } from "@/components/WeekGridPanel";
import { requirePageUser } from "@/lib/auth";

type PageProps = {
  searchParams?: Promise<SearchParams>;
};

type SearchParams = Record<string, string | string[] | undefined>;

function parseYear(searchParams?: SearchParams) {
  const raw = searchParams?.year;
  const value = Array.isArray(raw) ? raw[0] : raw;
  const current = new Date().getFullYear();
  const year = value ? Number(value) : current;
  return Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : current;
}

export default async function HomePage({ searchParams }: PageProps) {
  await requirePageUser("/");
  const resolvedSearchParams = await searchParams;
  const year = parseYear(resolvedSearchParams);
  const [weekSummaries, profile, template] = await Promise.all([
    listWeekSummaries(year),
    getProfile(),
    getTemplateStatus()
  ]);

  const todayIso = new Date().toISOString().slice(0, 10);
  const todayWeek = getIsoWeek(new Date());
  const totalWeeks = getIsoWeeksInYear(year);
  const yearOptions = [year - 1, year, year + 1];

  let currentIdx = 0;
  const weekItems: WeekDisplayItem[] = weekSummaries.map((summary, i) => {
    const weekDateObjects = getIsoWeekDates(summary.year, summary.kw);
    const weekDates = weekDateObjects.map((d) => d.toISOString().slice(0, 10));
    const displayWeek = getWeekDisplayInfo(summary.year, summary.kw, weekDateObjects);
    const isCurrentWeek = summary.year === todayWeek.year && summary.kw === todayWeek.kw;
    if (isCurrentWeek) currentIdx = i;
    const splitLabel =
      summary.segments.length > 1
        ? `${getMonthLabelDe(summary.segments[0].month)} / ${getMonthLabelDe(summary.segments[1].month)}`
        : getMonthLabelDe(summary.segments[0].month);
    return {
      year: summary.year,
      kw: summary.kw,
      displayKw: displayWeek.displayKw,
      displayYear: displayWeek.displayYear,
      isCarryOverToNextYear: displayWeek.isCarryOverToNextYear,
      isCurrentWeek,
      isMonthSplit: summary.isMonthSplit,
      splitLabel,
      first: formatDeDate(weekDates[0]),
      last: formatDeDate(weekDates[6]),
      filledDays: summary.filledDays,
      pct: Math.round((summary.filledDays / 7) * 100)
    };
  });

  return (
    <main className="shell grid" style={{ gap: "1rem" }}>
      <section className="hero">
        <h1>Wochenbericht</h1>
        <p>1. KW wählen  2. Tag ausfüllen  3. Export</p>
      </section>

      <section className="grid cols-2">
        <section className="card">
          <div className="toolbar spread">
            <div>
              <h2>KW {year}</h2>
              <p className="small" style={{ marginTop: "0.2rem" }}>
                {totalWeeks} Wochen
              </p>
            </div>

            <div className="toolbar">
              <div>
                <div className="small" style={{ marginBottom: "0.25rem" }}>
                  Jahr
                </div>
                <div className="toolbar">
                  {yearOptions.map((y) => (
                    <Link key={y} className={`btn ${y === year ? "primary" : ""}`} href={`/?year=${y}`}>
                      {y}
                    </Link>
                  ))}
                </div>
              </div>

              <Link className="btn" href={`/day/${todayIso}`}>
                Heute
              </Link>
              <Link className="btn primary" href={`/week/${todayWeek.year}/${todayWeek.kw}`}>
                Aktuelle KW
              </Link>
            </div>
          </div>

          <WeekGridPanel items={weekItems} currentIdx={currentIdx} />
        </section>

        <div className="grid" style={{ alignContent: "start" }}>
          <ProfileCard initialProfile={profile} />

          {!template.ok ? (
            <section className="card">
              <h2>Template fehlt</h2>
              <p className="small">{template.error}</p>
              <div className="muted-box" style={{ marginTop: "0.6rem", wordBreak: "break-all" }}>
                {template.templatePath}
              </div>
            </section>
          ) : null}
        </div>
      </section>
    </main>
  );
}
