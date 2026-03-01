import { spawn } from "node:child_process";
import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  formatDeDate,
  getIsoWeekDates,
  getMonthLabelDe,
  getSegmentWeekDisplayInfo,
  getWeekdayColumnIndexForIsoDate,
  splitWeekByMonth
} from "./calendar";
import { getCurrentUserId } from "./auth";
import { getEntriesByDates, getProfile, getWeekCarData } from "./db";
import { hasExternalExportWorker, isLocalExportBackendAvailable } from "./runtime";
import { isSupabaseStorageEnabled, getExportDownloadUrl, uploadExportObject } from "./supabase-storage";
import { loadTemplateBytes } from "./template";
import { exportXlsxJs } from "./export-xlsx-js";
import type { DailyEntry } from "./types";

const EXPORTS_DIR = path.join(process.cwd(), "exports");
const TMP_DIR = path.join(EXPORTS_DIR, ".tmp");

type ExportFormat = "xlsx" | "pdf" | "both";

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

type SegmentPayload = {
  year: number;
  kw: number;
  segmentKey: string;
  month: number;
  weekStart: string;
  weekEnd: string;
  reportStart: string;
  reportEnd: string;
  allWeekDates: string[];
  segmentDates: string[];
  profile: {
    name: string;
    vorname: string;
    arbeitsstaetteProjekte: string;
    artDerArbeit: string;
  };
  rows: ExportRow[];
  segmentDateColumnIndexes: Record<string, number>;
  reportStartDe: string;
  reportEndDe: string;
  carData: {
    kennzeichen: string;
    kennzeichen2: string;
    kmStand: string;
    kmGefahren: string;
  };
};

type PreparedSegment = {
  baseName: string;
  segmentKey: string;
  month: number;
  dates: string[];
  reportYear: number;
  reportKw: number;
  isCarryOverToNextYear: boolean;
  payloadWrapper: {
    templatePath: string;
    payload: SegmentPayload;
  };
};

type FinalReport = {
  segmentKey: string;
  month: number;
  dates: string[];
  reportYear: number;
  reportKw: number;
  isCarryOverToNextYear: boolean;
  xlsxUrl: string;
  xlsxBase64?: string;
  xlsxFilename?: string;
  pdfUrl?: string;
  warnings: string[];
  rowsWritten?: number;
  rowsTruncated?: number;
};

type WorkerSegmentResult = {
  baseName: string;
  segmentKey: string;
  month: number;
  dates: string[];
  reportYear: number;
  reportKw: number;
  isCarryOverToNextYear: boolean;
  warnings?: string[];
  rowsWritten?: number;
  rowsTruncated?: number;
  xlsxBase64: string;
  pdfBase64?: string;
};

function ensureFileNameSafe(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

function ensureDownloadBaseName(value: string): string {
  return value.replace(/[<>:"/\\|?*\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim();
}

function ensureObjectPathSafe(value: string): string {
  return value.replace(/[^a-zA-Z0-9/_-]+/g, "_");
}

async function ensureDirs() {
  await mkdir(EXPORTS_DIR, { recursive: true });
  await mkdir(TMP_DIR, { recursive: true });
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function buildReportBaseName(opts: { month: number; year: number; kw: number }) {
  return ensureDownloadBaseName(
    `AXIANS OFM Wochenbericht ${getMonthLabelDe(opts.month)} ${opts.year} KW ${opts.kw}`
  );
}

function collectSegmentHeaderValues(
  entries: Record<string, DailyEntry | null>,
  segmentDates: string[],
  fallbackA: string,
  fallbackB: string
) {
  const projects = new Set<string>();
  const workTypes = new Set<string>();

  for (const date of segmentDates) {
    const entry = entries[date];
    if (!entry) continue;
    if (entry.arbeitsstaetteProjekte.trim()) projects.add(entry.arbeitsstaetteProjekte.trim());
    if (entry.artDerArbeit.trim()) workTypes.add(entry.artDerArbeit.trim());
  }

  const joinedProjects = [...projects].join(" | ");
  const joinedWorkTypes = [...workTypes].join(" | ");

  return {
    arbeitsstaetteProjekte: joinedProjects || fallbackA,
    artDerArbeit: joinedWorkTypes || fallbackB
  };
}

function flattenRowsForSegment(
  entries: Record<string, DailyEntry | null>,
  segmentDates: string[]
): ExportRow[] {
  const rows: ExportRow[] = [];

  for (const date of segmentDates) {
    const entry = entries[date];
    if (!entry) continue;
    for (const line of entry.lines) {
      const isBaustelleLine = line.lineType === "baustelle";
      const beginn = isBaustelleLine ? "" : line.beginn;
      const ende = isBaustelleLine ? "" : line.ende;
      const pauseOverride = isBaustelleLine ? "" : line.pauseOverride;
      const hasExplicitStatusCode = (() => {
        const code = line.lohnType.trim().toUpperCase();
        return Boolean(code && code !== "S");
      })();
      const hasMeaningfulData =
        line.siteNameOrt.trim() ||
        beginn.trim() ||
        ende.trim() ||
        line.dayHoursOverride.trim() ||
        hasExplicitStatusCode ||
        line.ausloese.trim() ||
        line.zulage.trim() ||
        line.projektnummer.trim() ||
        line.kabelschachtInfo.trim() ||
        line.smNr.trim() ||
        line.bauleiter.trim() ||
        line.arbeitskollege.trim();
      if (!hasMeaningfulData) continue;

      rows.push({
        date,
        siteNameOrt: line.siteNameOrt,
        beginn,
        ende,
        pauseOverride,
        dayHoursOverride:
          line.dayHoursOverride.trim() ||
          (beginn.trim() && ende.trim() ? "__AUTO_FROM_TIME__" : ""),
        lohnType: line.lohnType,
        ausloese: line.ausloese,
        zulage: line.zulage,
        projektnummer: line.projektnummer,
        kabelschachtInfo: line.kabelschachtInfo,
        smNr: line.smNr,
        bauleiter: line.bauleiter,
        arbeitskollege: line.arbeitskollege
      });
    }
  }

  return rows;
}

async function buildPreparedSegments(year: number, kw: number) {
  const weekDates = getIsoWeekDates(year, kw);
  const allWeekDates = weekDates.map(toIsoDate);
  const segments = splitWeekByMonth(weekDates);
  const [entries, profile, weekCarData] = await Promise.all([
    getEntriesByDates(allWeekDates),
    getProfile(),
    getWeekCarData(year, kw)
  ]);

  const prepared: PreparedSegment[] = [];

  for (const segment of segments) {
    const headers = collectSegmentHeaderValues(
      entries,
      segment.dates,
      profile.defaultArbeitsstaetteProjekte,
      profile.defaultArtDerArbeit
    );
    const rows = flattenRowsForSegment(entries, segment.dates);
    const segmentWeekDisplay = getSegmentWeekDisplayInfo(year, kw, segment.year);

    const baseName = buildReportBaseName({
      month: segment.month,
      year: segment.year,
      kw: segmentWeekDisplay.displayKw
    });

    prepared.push({
      baseName,
      segmentKey: segment.key,
      month: segment.month,
      dates: segment.dates,
      reportYear: segmentWeekDisplay.displayYear,
      reportKw: segmentWeekDisplay.displayKw,
      isCarryOverToNextYear: segmentWeekDisplay.isCarryOverToNextYear,
      payloadWrapper: {
        templatePath: "__TEMPLATE_AT_RUNTIME__",
        payload: {
          year: segmentWeekDisplay.displayYear,
          kw: segmentWeekDisplay.displayKw,
          segmentKey: segment.key,
          month: segment.month,
          weekStart: allWeekDates[0],
          weekEnd: allWeekDates[6],
          reportStart: segment.startDate,
          reportEnd: segment.endDate,
          allWeekDates,
          segmentDates: segment.dates,
          profile: {
            name: profile.name,
            vorname: profile.vorname,
            arbeitsstaetteProjekte: headers.arbeitsstaetteProjekte,
            artDerArbeit: headers.artDerArbeit
          },
          rows,
          segmentDateColumnIndexes: Object.fromEntries(
            segment.dates.map((d) => [d, getWeekdayColumnIndexForIsoDate(d)])
          ),
          reportStartDe: formatDeDate(segment.startDate),
          reportEndDe: formatDeDate(segment.endDate),
          carData: {
            kennzeichen: profile.kennzeichen,
            kennzeichen2: weekCarData.kennzeichen2,
            kmStand: weekCarData.kmStand,
            kmGefahren: weekCarData.kmGefahren
          }
        }
      }
    });
  }

  return {
    allWeekDates,
    isMonthSplit: segments.length > 1,
    prepared
  };
}

async function runCommand(command: string, args: string[]) {
  return await new Promise<{ code: number; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, { shell: false });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

async function runPythonTemplateExport(payloadFile: string, outputFile: string) {
  const python = process.env.PYTHON_BIN || "python";
  const scriptPath = path.join(process.cwd(), "scripts", "export_wochenbericht.py");

  const result = await runCommand(python, [scriptPath, "--payload-file", payloadFile, "--output", outputFile]);

  if (result.code !== 0) {
    throw new Error(`Python export failed (${result.code}): ${result.stderr || result.stdout}`);
  }

  try {
    return JSON.parse(result.stdout || "{}") as {
      rows_written?: number;
      rows_truncated?: number;
      warnings?: string[];
    };
  } catch {
    return { warnings: result.stdout ? [result.stdout.trim()] : [] };
  }
}

async function trySofficeConvert(xlsxPath: string): Promise<{ pdfPath?: string; warning?: string }> {
  const configured = process.env.SOFFICE_PATH?.trim();
  const candidates = [
    configured,
    "soffice",
    "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
    "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe"
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    try {
      if (candidate.includes("\\") || candidate.includes("/")) {
        await access(candidate);
      }
      const out = await runCommand(candidate, [
        "--headless",
        "--convert-to",
        "pdf",
        "--outdir",
        EXPORTS_DIR,
        xlsxPath
      ]);
      if (out.code === 0) {
        const pdfPath = xlsxPath.replace(/\.xlsx$/i, ".pdf");
        return { pdfPath };
      }
    } catch {
      // try next candidate
    }
  }

  return {
    warning:
      "PDF export requires LibreOffice (soffice). Install LibreOffice and set SOFFICE_PATH in .env.local if not on PATH."
  };
}

async function exportLocal(prepared: PreparedSegment[], format: ExportFormat): Promise<FinalReport[]> {
  await ensureDirs();
  const template = await loadTemplateBytes();
  const templatePath = path.join(TMP_DIR, `template_${Date.now()}_${ensureFileNameSafe(template.filename)}`);
  await writeFile(templatePath, template.bytes);

  const reports: FinalReport[] = [];

  for (const segment of prepared) {
    const payloadPath = path.join(TMP_DIR, `${segment.baseName}.json`);
    const xlsxPath = path.join(EXPORTS_DIR, `${segment.baseName}.xlsx`);
    const payloadWrapper = { ...segment.payloadWrapper, templatePath };

    await writeFile(payloadPath, JSON.stringify(payloadWrapper), "utf8");

    const pyResult = await runPythonTemplateExport(payloadPath, xlsxPath);
    const report: FinalReport = {
      segmentKey: segment.segmentKey,
      month: segment.month,
      dates: segment.dates,
      reportYear: segment.reportYear,
      reportKw: segment.reportKw,
      isCarryOverToNextYear: segment.isCarryOverToNextYear,
      xlsxUrl: `/api/exports/${encodeURIComponent(path.basename(xlsxPath))}`,
      xlsxFilename: path.basename(xlsxPath),
      warnings: pyResult.warnings ?? [],
      rowsWritten: pyResult.rows_written,
      rowsTruncated: pyResult.rows_truncated
    };

    if (format === "pdf" || format === "both") {
      const pdf = await trySofficeConvert(xlsxPath);
      if (pdf.pdfPath) {
        report.pdfUrl = `/api/exports/${encodeURIComponent(path.basename(pdf.pdfPath))}`;
      } else if (pdf.warning) {
        report.warnings.push(pdf.warning);
      }
    }

    reports.push(report);
  }

  return reports;
}

async function uploadWorkerFileToStorage(opts: {
  userId: string;
  baseName: string;
  ext: "xlsx" | "pdf";
  bytes: Buffer;
}) {
  if (!isSupabaseStorageEnabled()) {
    throw new Error("Supabase Storage is required for worker export mode.");
  }

  const safeUser = ensureObjectPathSafe(opts.userId);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const objectPath = `exports/${safeUser}/${stamp}/${opts.baseName}.${opts.ext}`;
  await uploadExportObject({
    objectPath,
    contentType:
      opts.ext === "xlsx"
        ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        : "application/pdf",
    data: opts.bytes
  });
  return getExportDownloadUrl(objectPath);
}

async function callExportWorker(prepared: PreparedSegment[], format: ExportFormat): Promise<WorkerSegmentResult[]> {
  const endpoint = process.env.EXPORT_WORKER_URL?.trim();
  if (!endpoint) {
    throw new Error("EXPORT_WORKER_URL is not configured.");
  }

  const template = await loadTemplateBytes();
  const payload = {
    format,
    templateFilename: template.filename,
    templateBase64: template.bytes.toString("base64"),
    segments: prepared.map((segment) => ({
      baseName: segment.baseName,
      segmentKey: segment.segmentKey,
      month: segment.month,
      dates: segment.dates,
      reportYear: segment.reportYear,
      reportKw: segment.reportKw,
      isCarryOverToNextYear: segment.isCarryOverToNextYear,
      payload: segment.payloadWrapper.payload
    }))
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };
  if (process.env.EXPORT_WORKER_TOKEN?.trim()) {
    headers.Authorization = `Bearer ${process.env.EXPORT_WORKER_TOKEN.trim()}`;
  }

  const res = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    cache: "no-store"
  });

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text };
    }
  }
  if (!res.ok) {
    const message =
      typeof data === "object" && data && "error" in data && typeof (data as { error?: unknown }).error === "string"
        ? (data as { error: string }).error
        : `Export worker failed (${res.status})`;
    throw new Error(message);
  }

  const results =
    typeof data === "object" && data && "reports" in data && Array.isArray((data as { reports?: unknown }).reports)
      ? ((data as { reports: WorkerSegmentResult[] }).reports as WorkerSegmentResult[])
      : null;
  if (!results) {
    throw new Error("Export worker returned an invalid response.");
  }

  return results;
}

async function exportViaWorker(prepared: PreparedSegment[], format: ExportFormat): Promise<FinalReport[]> {
  const workerResults = await callExportWorker(prepared, format);
  const userId = await getCurrentUserId();

  const byBaseName = new Map(prepared.map((segment) => [segment.baseName, segment]));
  const finalReportsByBaseName = new Map<string, FinalReport>();

  for (const workerReport of workerResults) {
    const segment = byBaseName.get(workerReport.baseName);
    if (!segment) {
      throw new Error(`Worker returned unknown segment '${workerReport.baseName}'.`);
    }

    const xlsxBytes = Buffer.from(workerReport.xlsxBase64, "base64");
    const xlsxUrl = await uploadWorkerFileToStorage({
      userId,
      baseName: segment.baseName,
      ext: "xlsx",
      bytes: xlsxBytes
    });

    let pdfUrl: string | undefined;
    if (workerReport.pdfBase64) {
      pdfUrl = await uploadWorkerFileToStorage({
        userId,
        baseName: segment.baseName,
        ext: "pdf",
        bytes: Buffer.from(workerReport.pdfBase64, "base64")
      });
    }

    finalReportsByBaseName.set(segment.baseName, {
      segmentKey: segment.segmentKey,
      month: segment.month,
      dates: segment.dates,
      reportYear: segment.reportYear,
      reportKw: segment.reportKw,
      isCarryOverToNextYear: segment.isCarryOverToNextYear,
      xlsxUrl,
      xlsxFilename: `${segment.baseName}.xlsx`,
      pdfUrl,
      warnings: workerReport.warnings ?? [],
      rowsWritten: workerReport.rowsWritten,
      rowsTruncated: workerReport.rowsTruncated
    });
  }

  return prepared
    .map((segment) => finalReportsByBaseName.get(segment.baseName))
    .filter((report): report is FinalReport => Boolean(report));
}

async function exportViaJs(prepared: PreparedSegment[]): Promise<FinalReport[]> {
  const template = await loadTemplateBytes();
  const reports: FinalReport[] = [];

  for (const segment of prepared) {
    const payload = segment.payloadWrapper.payload;
    const jsResult = await exportXlsxJs(template.bytes, {
      kw: payload.kw,
      reportEnd: payload.reportEnd,
      reportStartDe: payload.reportStartDe,
      reportEndDe: payload.reportEndDe,
      allWeekDates: payload.allWeekDates,
      segmentDates: payload.segmentDates,
      profile: payload.profile,
      rows: payload.rows,
      carData: payload.carData
    });

    const xlsxBase64 = jsResult.buffer.toString("base64");
    const xlsxFilename = `${segment.baseName}.xlsx`;

    let xlsxUrl = "";
    if (isSupabaseStorageEnabled()) {
      try {
        const userId = await getCurrentUserId();
        xlsxUrl = await uploadWorkerFileToStorage({
          userId,
          baseName: segment.baseName,
          ext: "xlsx",
          bytes: jsResult.buffer
        });
      } catch {
        // Storage upload failed — fall back to base64 download
      }
    }

    reports.push({
      segmentKey: segment.segmentKey,
      month: segment.month,
      dates: segment.dates,
      reportYear: segment.reportYear,
      reportKw: segment.reportKw,
      isCarryOverToNextYear: segment.isCarryOverToNextYear,
      xlsxUrl,
      xlsxBase64,
      xlsxFilename,
      warnings: jsResult.warnings,
      rowsWritten: jsResult.rowsWritten,
      rowsTruncated: jsResult.rowsTruncated
    });
  }

  return reports;
}

export async function exportWeekReports(opts: {
  year: number;
  kw: number;
  format: ExportFormat;
}) {
  const { year, kw, format } = opts;
  const { allWeekDates, isMonthSplit, prepared } = await buildPreparedSegments(year, kw);

  let reports: FinalReport[];
  if (hasExternalExportWorker()) {
    reports = await exportViaWorker(prepared, format);
  } else if (isLocalExportBackendAvailable()) {
    reports = await exportLocal(prepared, format);
  } else {
    reports = await exportViaJs(prepared);
  }

  return {
    year,
    kw,
    weekDates: allWeekDates,
    isMonthSplit,
    reports
  };
}
