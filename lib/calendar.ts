import type { WeekDayInfo, WeekSegment } from "./types";

const WEEKDAY_LABELS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"] as const;
const MONTH_LABELS_DE = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember"
] as const;

export type WeekDisplayInfo = {
  displayYear: number;
  displayKw: number;
  isCarryOverToNextYear: boolean;
};

function utcDate(year: number, monthIndex: number, day: number) {
  return new Date(Date.UTC(year, monthIndex, day));
}

export function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function parseIsoDate(value: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) {
    throw new Error(`Invalid ISO date: ${value}`);
  }
  return utcDate(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function getIsoWeekDates(year: number, kw: number): Date[] {
  // ISO week 1 is the week containing Jan 4.
  const jan4 = utcDate(year, 0, 4);
  const jan4Weekday = jan4.getUTCDay() || 7; // Sunday -> 7
  const week1Monday = addDays(jan4, 1 - jan4Weekday);
  const monday = addDays(week1Monday, (kw - 1) * 7);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

export function getIsoWeek(date: Date): { year: number; kw: number } {
  const d = new Date(date.getTime());
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + 4 - ((d.getUTCDay() || 7) as number));
  const yearStart = utcDate(d.getUTCFullYear(), 0, 1);
  const kw = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return { year: d.getUTCFullYear(), kw };
}

export function getIsoWeeksInYear(year: number): number {
  // Dec 28 always belongs to the last ISO week of the year.
  return getIsoWeek(utcDate(year, 11, 28)).kw;
}

export function weekDatesToInfo(dates: Date[]): WeekDayInfo[] {
  return dates.map((d) => ({
    date: formatIsoDate(d),
    isoWeekday: d.getUTCDay() === 0 ? 7 : d.getUTCDay(),
    day: d.getUTCDate(),
    month: d.getUTCMonth() + 1,
    year: d.getUTCFullYear()
  }));
}

export function splitWeekByMonth(dates: Date[]): WeekSegment[] {
  const infos = weekDatesToInfo(dates);
  const segments: WeekSegment[] = [];

  for (const info of infos) {
    const current = segments[segments.length - 1];
    if (!current || current.month !== info.month || current.year !== info.year) {
      segments.push({
        key: `${info.year}-${String(info.month).padStart(2, "0")}`,
        month: info.month,
        year: info.year,
        dates: [info.date],
        startDate: info.date,
        endDate: info.date,
        isSingleDay: true
      });
      continue;
    }
    current.dates.push(info.date);
    current.endDate = info.date;
    current.isSingleDay = current.dates.length === 1;
  }

  for (const seg of segments) {
    seg.isSingleDay = seg.dates.length === 1;
  }

  return segments;
}

export function getWeekDisplayInfo(baseYear: number, baseKw: number, dates: Date[]): WeekDisplayInfo {
  const spillsIntoNextYear = dates.some((d) => d.getUTCFullYear() > baseYear);
  if (spillsIntoNextYear) {
    return {
      displayYear: baseYear + 1,
      displayKw: 1,
      isCarryOverToNextYear: true
    };
  }

  return {
    displayYear: baseYear,
    displayKw: baseKw,
    isCarryOverToNextYear: false
  };
}

export function getSegmentWeekDisplayInfo(
  baseYear: number,
  baseKw: number,
  segmentYear: number
): WeekDisplayInfo {
  if (segmentYear > baseYear) {
    return {
      displayYear: segmentYear,
      displayKw: 1,
      isCarryOverToNextYear: true
    };
  }

  return {
    displayYear: baseYear,
    displayKw: baseKw,
    isCarryOverToNextYear: false
  };
}

export function getWeekdayLabel(isoWeekday: number): string {
  return WEEKDAY_LABELS[isoWeekday - 1] ?? "";
}

export function getWeekdayColumnIndexForIsoDate(isoDate: string): number {
  const d = parseIsoDate(isoDate);
  const isoWeekday = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  return isoWeekday - 1; // 0..6 -> H..N
}

export function formatDeDate(isoDate: string): string {
  const d = parseIsoDate(isoDate);
  return `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${d.getUTCFullYear()}`;
}

export function getMonthLabelDe(month: number): string {
  return MONTH_LABELS_DE[month - 1] ?? `Monat ${month}`;
}

export function getWeekLabel(year: number, kw: number): string {
  return `${year} · KW ${String(kw).padStart(2, "0")}`;
}

export function isValidIsoDate(value: string): boolean {
  try {
    const d = parseIsoDate(value);
    return formatIsoDate(d) === value;
  } catch {
    return false;
  }
}
