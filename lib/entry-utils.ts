import type { DailyEntry, DailyLine } from "./types";

export function hasMeaningfulLineData(line: DailyLine) {
  const hasExplicitStatusCode = (() => {
    const code = line.lohnType.trim().toUpperCase();
    return Boolean(code && code !== "S");
  })();

  return Boolean(
    line.siteNameOrt.trim() ||
      line.beginn.trim() ||
      line.ende.trim() ||
      line.pauseOverride.trim() ||
      line.dayHoursOverride.trim() ||
      hasExplicitStatusCode ||
      line.ausloese.trim() ||
      line.zulage.trim() ||
      line.projektnummer.trim() ||
      line.kabelschachtInfo.trim() ||
      line.smNr.trim() ||
      line.bauleiter.trim() ||
      line.arbeitskollege.trim()
  );
}

export function countMeaningfulLines(entry: DailyEntry | null | undefined) {
  if (!entry) return 0;
  return entry.lines.filter(hasMeaningfulLineData).length;
}

export function entryHasMeaningfulContent(entry: DailyEntry | null | undefined) {
  return countMeaningfulLines(entry) > 0;
}
