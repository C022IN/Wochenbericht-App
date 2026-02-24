"use client";

import { startTransition, useState } from "react";
import { formatDeDate } from "@/lib/calendar";

type ExportResponse = {
  error?: string;
  isMonthSplit?: boolean;
  reports?: Array<{
    segmentKey: string;
    dates: string[];
    reportYear: number;
    reportKw: number;
    isCarryOverToNextYear: boolean;
    xlsxUrl: string;
    pdfUrl?: string;
    warnings: string[];
    rowsWritten?: number;
    rowsTruncated?: number;
  }>;
};

export function ExportPanel({ year, kw }: { year: number; kw: number }) {
  const [loading, setLoading] = useState<"" | "xlsx" | "pdf" | "both">("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<ExportResponse | null>(null);
  const exportsDisabled = process.env.NEXT_PUBLIC_DISABLE_EXPORTS === "1";
  const pdfDisabled = process.env.NEXT_PUBLIC_DISABLE_PDF_EXPORT === "1";

  async function runExport(format: "xlsx" | "pdf" | "both") {
    if (exportsDisabled) {
      setError("Export ist in dieser Deployment-Umgebung deaktiviert.");
      return;
    }
    if (pdfDisabled && (format === "pdf" || format === "both")) {
      setError("PDF Export ist in dieser Deployment-Umgebung deaktiviert.");
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
      if (!res.ok) throw new Error(data.error || "Export failed");
      startTransition(() => setResult(data));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setLoading("");
    }
  }

  return (
    <section className="card" aria-labelledby="export-heading">
      <div className="toolbar spread">
        <h2 id="export-heading">Export</h2>
        <div className="toolbar">
          <button
            type="button"
            className="btn"
            onClick={() => runExport("xlsx")}
            disabled={Boolean(loading) || exportsDisabled}
          >
            {loading === "xlsx" ? "Erstelle..." : "Excel"}
          </button>
          {!pdfDisabled ? (
            <button type="button" className="btn" onClick={() => runExport("pdf")} disabled={Boolean(loading) || exportsDisabled}>
              {loading === "pdf" ? "Erstelle..." : "PDF"}
            </button>
          ) : null}
          {!pdfDisabled ? (
            <button
              type="button"
              className="btn secondary"
              onClick={() => runExport("both")}
              disabled={Boolean(loading) || exportsDisabled}
            >
              {loading === "both" ? "Erstelle..." : "Beide"}
            </button>
          ) : null}
        </div>
      </div>

      {exportsDisabled ? (
        <div className="muted-box">Export ist deaktiviert, bis ein externer Export-Worker konfiguriert ist.</div>
      ) : null}
      {!exportsDisabled && pdfDisabled ? (
        <div className="muted-box">PDF Export ist deaktiviert. Excel bleibt verfügbar.</div>
      ) : null}

      {error ? <p className="status-text" style={{ color: "var(--danger)" }}>{error}</p> : null}

      {result?.reports?.length ? (
        <div className="export-results">
          {result.isMonthSplit ? <span className="pill warn">2 Dateien</span> : null}

          {result.reports.map((report) => (
            <div className="export-item" key={`${report.segmentKey}-${report.dates.join(",")}`}>
              <div className="toolbar spread">
                <strong>
                  KW {String(report.reportKw).padStart(2, "0")} ({report.reportYear})
                </strong>
                <span className="small">
                  {formatDeDate(report.dates[0])}
                  {report.dates.length > 1 ? ` - ${formatDeDate(report.dates[report.dates.length - 1])}` : ""}
                </span>
              </div>

              <div className="toolbar">
                <a className="btn primary" href={report.xlsxUrl}>
                  Excel
                </a>
                {report.pdfUrl ? (
                  <a className="btn" href={report.pdfUrl}>
                    PDF
                  </a>
                ) : null}
              </div>

              {report.rowsTruncated ? (
                <div className="small">{report.rowsTruncated} Zeilen nicht exportiert</div>
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
