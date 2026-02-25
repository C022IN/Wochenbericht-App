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

          <div className="week-grid" style={{ marginTop: "0.8rem" }}>
            {weekSummaries.map((summary) => {
              const weekDateObjects = getIsoWeekDates(summary.year, summary.kw);
              const weekDates = weekDateObjects.map((d) => d.toISOString().slice(0, 10));
              const first = weekDates[0];
              const last = weekDates[6];
              const splitLabel =
                summary.segments.length > 1
                  ? `${getMonthLabelDe(summary.segments[0].month)} / ${getMonthLabelDe(summary.segments[1].month)}`
                  : getMonthLabelDe(summary.segments[0].month);
              const pct = Math.round((summary.filledDays / 7) * 100);
              const isCurrentWeek = summary.year === todayWeek.year && summary.kw === todayWeek.kw;
              const displayWeek = getWeekDisplayInfo(summary.year, summary.kw, weekDateObjects);

              return (
                <Link
                  key={`${summary.year}-${summary.kw}`}
                  className={`week-card${isCurrentWeek ? " current-week" : ""}`}
                  href={`/week/${summary.year}/${summary.kw}`}
                >
                  <div className="toolbar spread">
                    <strong>
                      KW {String(displayWeek.displayKw).padStart(2, "0")}
                      {displayWeek.isCarryOverToNextYear ? ` (${displayWeek.displayYear})` : ""}
                    </strong>
                    {summary.isMonthSplit ? <span className="pill warn">Split</span> : <span className="pill ok">OK</span>}
                  </div>

                  <div className="week-meta">
                    <span>{formatDeDate(first)}</span>
                    <span>{formatDeDate(last)}</span>
                  </div>

                  <div className="small">{splitLabel}</div>

                  <div className="progress" aria-label={`Fortschritt KW ${displayWeek.displayKw}`}>
                    <span style={{ width: `${pct}%` }} />
                  </div>

                  <div className="week-meta">
                    <span>{summary.filledDays}/7 Tage</span>
                    <span>{pct}%</span>
                  </div>
                </Link>
              );
            })}
          </div>
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
