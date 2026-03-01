import { Workbook } from "exceljs";

const WEEKDAY_COLS = ["H", "I", "J", "K", "L", "M", "N"] as const;
const DATA_ROW_START = 10;
const DATA_ROW_END = 49;

function parseDecimal(value: string): number | string | null {
  if (!value || typeof value !== "string") return null;
  const txt = value.trim().replace(",", ".");
  if (!txt) return null;
  const num = parseFloat(txt);
  if (Number.isFinite(num)) return num;
  return value.trim();
}

/** Convert an "HH:MM" string to an Excel day-fraction (0–1). */
function timeToExcelFraction(value: string): number | null {
  if (!value || typeof value !== "string") return null;
  const parts = value.split(":");
  if (parts.length < 2) return null;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (!Number.isInteger(h) || !Number.isInteger(m)) return null;
  return (h * 60 + m) / (24 * 60);
}

function grossHoursFromFractions(startFrac: number | null, endFrac: number | null): number | null {
  if (startFrac === null || endFrac === null) return null;
  let diff = endFrac - startFrac;
  if (diff < 0) diff += 1; // midnight crossing
  return diff * 24;
}

function autoPauseHours(hours: number | null): number | null {
  if (hours === null) return null;
  if (hours > 9.5) return 0.75;
  if (hours > 6) return 0.5;
  return 0.0;
}

function inferPauseFromNetHours(netHours: number | null): number | null {
  if (netHours === null) return null;
  for (const pause of [0, 0.5, 0.75]) {
    const gross = netHours + pause;
    if (autoPauseHours(gross) === pause) return pause;
  }
  return null;
}

type ExportRow = {
  date: string;
  siteNameOrt: string;
  beginn: string;
  ende: string;
  pauseOverride: string;
  dayHoursOverride: string;
  lohnType: string;
  ausloese: string;
  zulage: string;
  projektnummer: string;
  kabelschachtInfo: string;
  smNr: string;
  bauleiter: string;
  arbeitskollege: string;
};

export type JsExportPayload = {
  kw: number;
  reportEnd: string; // ISO date, e.g. "2026-02-28"
  reportStartDe: string; // German formatted string, e.g. "23.02.2026"
  reportEndDe: string; // German formatted string, e.g. "28.02.2026"
  allWeekDates: string[];
  segmentDates: string[];
  profile: {
    name: string;
    vorname: string;
    arbeitsstaetteProjekte: string;
    artDerArbeit: string;
  };
  rows: ExportRow[];
  carData: {
    kennzeichen: string;   // → U50
    kennzeichen2: string;  // → V50
    kmStand: string;       // → U51
    kmGefahren: string;    // → V51
  };
};

function computeDayCellValue(row: ExportRow): number | string | null {
  if (typeof row.dayHoursOverride === "string") {
    const s = row.dayHoursOverride.trim();
    if (s && s !== "__AUTO_FROM_TIME__") return parseDecimal(s);
  }

  const startFrac = timeToExcelFraction(row.beginn);
  const endFrac = timeToExcelFraction(row.ende);
  const gross = grossHoursFromFractions(startFrac, endFrac);
  if (gross === null) return null;

  const pauseOverride = parseDecimal(row.pauseOverride);
  if (typeof pauseOverride === "number") {
    return Math.round((gross - pauseOverride) * 100) / 100;
  }

  const pauseAuto = autoPauseHours(gross) ?? 0;
  return Math.round((gross - pauseAuto) * 100) / 100;
}

/** ISO weekday index 0–6 (0 = Monday) from an ISO date string. */
function isoWeekdayIndex(isoDate: string): number | null {
  try {
    const d = new Date(`${isoDate}T00:00:00Z`);
    return (d.getUTCDay() + 6) % 7; // 0=Mon … 6=Sun
  } catch {
    return null;
  }
}

export async function exportXlsxJs(
  templateBuffer: Buffer,
  payload: JsExportPayload
): Promise<{ buffer: Buffer; rowsWritten: number; rowsTruncated: number; warnings: string[] }> {
  const workbook = new Workbook();
  await workbook.xlsx.load(templateBuffer);

  const ws = workbook.getWorksheet("Wochenbericht");
  if (!ws) throw new Error("Sheet 'Wochenbericht' not found in template");

  // --- Header ---
  ws.getCell("H1").value = payload.kw;
  ws.getCell("L1").value = payload.reportStartDe;
  ws.getCell("R1").value = payload.reportEndDe;

  ws.getCell("D3").value = payload.profile.name;
  ws.getCell("P3").value = payload.profile.vorname;
  ws.getCell("D5").value = payload.profile.arbeitsstaetteProjekte;
  ws.getCell("D6").value = payload.profile.artDerArbeit;

  // --- Footer: car data (rows 50–51) ---
  ws.getCell("U50").value = payload.carData.kennzeichen || null;
  ws.getCell("V50").value = payload.carData.kennzeichen2 || null;
  const kmStand = parseDecimal(payload.carData.kmStand);
  const kmStandCell = ws.getCell("U51");
  kmStandCell.value = kmStand !== null ? kmStand : (payload.carData.kmStand || null);
  if (kmStand !== null) kmStandCell.numFmt = "#,##0.##";
  const kmGefahren = parseDecimal(payload.carData.kmGefahren);
  const kmGefahrenCell = ws.getCell("V51");
  kmGefahrenCell.value = kmGefahren !== null ? kmGefahren : (payload.carData.kmGefahren || null);
  if (kmGefahren !== null) kmGefahrenCell.numFmt = "#,##0.##";

  // --- Row 9: day-of-month headers ---
  const segmentDates = new Set(payload.segmentDates);
  for (const col of WEEKDAY_COLS) {
    ws.getCell(`${col}9`).value = null;
  }
  for (const isoDate of payload.allWeekDates) {
    if (!segmentDates.has(isoDate)) continue;
    const idx = isoWeekdayIndex(isoDate);
    if (idx === null) continue;
    const dayOfMonth = parseInt(isoDate.slice(8, 10), 10);
    ws.getCell(`${WEEKDAY_COLS[idx]}9`).value = dayOfMonth;
  }

  // --- Clear data rows 10–49 ---
  for (let row = DATA_ROW_START; row <= DATA_ROW_END; row++) {
    ws.getCell(`A${row}`).value = null;
    ws.getCell(`E${row}`).value = null;
    ws.getCell(`F${row}`).value = null;
    for (const col of WEEKDAY_COLS) ws.getCell(`${col}${row}`).value = null;
    for (const col of ["Q", "R", "S", "T", "U", "V", "W", "X"]) {
      ws.getCell(`${col}${row}`).value = null;
    }
  }

  // --- Write data rows ---
  const maxRows = DATA_ROW_END - DATA_ROW_START + 1;
  const rowsTruncated = Math.max(0, payload.rows.length - maxRows);
  const rowsToWrite = payload.rows.slice(0, maxRows);

  for (let idx = 0; idx < rowsToWrite.length; idx++) {
    const rowData = rowsToWrite[idx];
    const rowNo = DATA_ROW_START + idx;
    const dayCellValue = computeDayCellValue(rowData);
    const wdIdx = isoWeekdayIndex(rowData.date);
    const weekdayCol = wdIdx !== null ? WEEKDAY_COLS[wdIdx] : null;

    ws.getCell(`A${rowNo}`).value = rowData.siteNameOrt || null;

    const startFrac = timeToExcelFraction(rowData.beginn);
    const endFrac = timeToExcelFraction(rowData.ende);
    if (startFrac !== null) ws.getCell(`E${rowNo}`).value = startFrac;
    if (endFrac !== null) ws.getCell(`F${rowNo}`).value = endFrac;

    const pauseOverride = parseDecimal(rowData.pauseOverride);
    if (typeof pauseOverride === "number") {
      const pauseCell = ws.getCell(`G${rowNo}`);
      pauseCell.value = pauseOverride;
      pauseCell.numFmt = "0.##";
    } else if (!rowData.beginn && !rowData.ende && typeof dayCellValue === "number") {
      const p = inferPauseFromNetHours(dayCellValue);
      if (typeof p === "number" && p > 0) {
        const pauseCell = ws.getCell(`G${rowNo}`);
        pauseCell.value = p;
        pauseCell.numFmt = "0.##";
      }
    }

    if (weekdayCol !== null) {
      if (typeof dayCellValue === "number" && dayCellValue >= 0) {
        const hourCell = ws.getCell(`${weekdayCol}${rowNo}`);
        hourCell.value = dayCellValue;
        hourCell.numFmt = "0.##";
      } else if (typeof dayCellValue === "string" && dayCellValue.trim()) {
        const marker = dayCellValue.trim();
        ws.getCell(`${weekdayCol}${rowNo}`).value = marker.toLowerCase() === "x" ? "x" : marker;
      }
    }

    ws.getCell(`Q${rowNo}`).value = rowData.lohnType || null;
    ws.getCell(`R${rowNo}`).value = rowData.ausloese || null;

    const zulage = parseDecimal(rowData.zulage);
    if (zulage !== null) {
      const zulageCell = ws.getCell(`S${rowNo}`);
      zulageCell.value = zulage;
      zulageCell.numFmt = "0.##";
    } else {
      ws.getCell(`S${rowNo}`).value = null;
    }
    ws.getCell(`T${rowNo}`).value = rowData.projektnummer || null;
    ws.getCell(`U${rowNo}`).value = rowData.kabelschachtInfo || null;

    const smNr = parseDecimal(rowData.smNr);
    if (smNr !== null) {
      const smNrCell = ws.getCell(`V${rowNo}`);
      smNrCell.value = smNr;
      smNrCell.numFmt = "0.##";
    } else {
      ws.getCell(`V${rowNo}`).value = rowData.smNr || null;
    }

    ws.getCell(`W${rowNo}`).value = rowData.bauleiter || null;
    ws.getCell(`X${rowNo}`).value = rowData.arbeitskollege || null;
  }

  const rawBuffer = await workbook.xlsx.writeBuffer();
  const warnings: string[] = [];
  if (rowsTruncated > 0) {
    warnings.push(
      `More than 40 lines for this report. Export truncated by ${rowsTruncated} line(s) to fit Excel rows 10-49.`
    );
  }

  return {
    buffer: Buffer.from(rawBuffer),
    rowsWritten: rowsToWrite.length,
    rowsTruncated,
    warnings
  };
}
