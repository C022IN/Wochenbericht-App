"use client";

import { startTransition, useState } from "react";
import { useTranslations } from "next-intl";
import { formatDeDate } from "@/lib/calendar";

type ExportReport = {
  segmentKey: string;
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

type ExportResponse = {
  error?: string;
  isMonthSplit?: boolean;
  reports?: ExportReport[];
};

function downloadBase64(base64: string, filename: string) {
  const cleaned = base64.replace(/\s+/g, "");
  const chunkSize = 16_384;
  const chunks: Uint8Array[] = [];
  let totalLength = 0;

  for (let offset = 0; offset < cleaned.length; offset += chunkSize) {
    const slice = cleaned.slice(offset, offset + chunkSize);
    const byteChars = atob(slice);
    const bytes = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
    chunks.push(bytes);
    totalLength += bytes.length;
  }

  const bytes = new Uint8Array(totalLength);
  let writeOffset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, writeOffset);
    writeOffset += chunk.length;
  }

  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function ExportPanel({ year, kw }: { year: number; kw: number }) {
  const t = useTranslations("export");
  const [loading, setLoading] = useState<"" | "xlsx" | "pdf" | "both">("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<ExportResponse | null>(null);
  const exportsDisabled = process.env.NEXT_PUBLIC_DISABLE_EXPORTS === "1";
  const pdfDisabled = process.env.NEXT_PUBLIC_DISABLE_PDF_EXPORT === "1";

  async function runExport(format: "xlsx" | "pdf" | "both") {
    if (exportsDisabled) {
      setError(t("disabledEnv"));
      return;
    }
    if (pdfDisabled && (format === "pdf" || format === "both")) {
      setError(t("pdfDisabledEnv"));
      return;
    }
    setLoading(format);
    setError("");
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, kw, format })
      });
      const data = (await res.json()) as ExportResponse;
      if (!res.ok) throw new Error(data.error || t("exportFailed"));
      startTransition(() => setResult(data));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("exportFailed"));
    } finally {
      setLoading("");
    }
  }

  return (
    <section className="card" aria-labelledby="export-heading">
      <div className="toolbar spread">
        <h2 id="export-heading">{t("title")}</h2>
        <div className="toolbar">
          <button
            type="button"
            className="btn"
            onClick={() => runExport("xlsx")}
            disabled={Boolean(loading) || exportsDisabled}
          >
            {loading === "xlsx" ? t("creating") : t("excel")}
          </button>
          {!pdfDisabled ? (
            <button type="button" className="btn" onClick={() => runExport("pdf")} disabled={Boolean(loading) || exportsDisabled}>
              {loading === "pdf" ? t("creating") : t("pdf")}
            </button>
          ) : null}
          {!pdfDisabled ? (
            <button
              type="button"
              className="btn secondary"
              onClick={() => runExport("both")}
              disabled={Boolean(loading) || exportsDisabled}
            >
              {loading === "both" ? t("creating") : t("both")}
            </button>
          ) : null}
        </div>
      </div>

      {exportsDisabled ? (
        <div className="muted-box">{t("disabledShort")}</div>
      ) : null}
      {!exportsDisabled && pdfDisabled ? (
        <div className="muted-box">{t("pdfDisabledShort")}</div>
      ) : null}

      {error ? <p className="status-text" style={{ color: "var(--danger)" }}>{error}</p> : null}

      {result?.reports?.length ? (
        <div className="export-results">
          {result.isMonthSplit ? <span className="pill warn">{t("filesCount", { count: 2 })}</span> : null}

          {result.reports.map((report) => (
            <div className="export-item" key={`${report.segmentKey}-${report.dates.join(",")}`}>
              <div className="toolbar spread">
                <strong>
                  {t("reportWeek", { kw: String(report.reportKw).padStart(2, "0"), year: report.reportYear })}
                </strong>
                <span className="small">
                  {formatDeDate(report.dates[0])}
                  {report.dates.length > 1 ? ` - ${formatDeDate(report.dates[report.dates.length - 1])}` : ""}
                </span>
              </div>

              <div className="toolbar">
                {report.xlsxUrl ? (
                  <a className="btn primary" href={report.xlsxUrl} download={report.xlsxFilename}>
                    {t("excel")}
                  </a>
                ) : report.xlsxBase64 ? (
                  <button
                    type="button"
                    className="btn primary"
                    onClick={() => downloadBase64(report.xlsxBase64!, report.xlsxFilename ?? `wochenbericht_KW${String(report.reportKw).padStart(2, "0")}.xlsx`)}
                  >
                    {t("excel")}
                  </button>
                ) : null}
                {report.pdfUrl ? (
                  <a className="btn" href={report.pdfUrl}>
                    {t("pdf")}
                  </a>
                ) : null}
              </div>

              {report.rowsTruncated ? (
                <div className="small">{t("rowsNotExported", { count: report.rowsTruncated })}</div>
              ) : null}

              {report.warnings?.length ? (
                <div className="muted-box">
                  {report.warnings.map((w) => (
                    <div key={w}>{w}</div>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
