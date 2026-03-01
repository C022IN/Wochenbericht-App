"use client";

import Link from "next/link";
import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { EMPTY_DAILY_LINE, type DailyEntry, type DailyLineType } from "@/lib/types";

type DayContext = {
  weekYear: number;
  weekKw: number;
};

function parseDecimalInput(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

function autoPauseHoursFromGross(hours: number | null) {
  if (hours == null) return null;
  if (hours > 9.5) return 0.75;
  if (hours > 6) return 0.5;
  return 0;
}

function inferPauseFromNetHours(netHours: number | null) {
  if (netHours == null) return null;
  for (const pause of [0, 0.5, 0.75]) {
    const gross = netHours + pause;
    if (autoPauseHoursFromGross(gross) === pause) return pause;
  }
  return null;
}

function snapTimeToQuarter(value: string) {
  if (!value) return value;

  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return value;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return value;
  }

  const totalMinutes = hours * 60 + minutes;
  const snappedMinutes = Math.min(23 * 60 + 45, Math.round(totalMinutes / 15) * 15);
  const snappedHours = Math.floor(snappedMinutes / 60);
  const snappedRemainder = snappedMinutes % 60;

  return `${String(snappedHours).padStart(2, "0")}:${String(snappedRemainder).padStart(2, "0")}`;
}

function pausePlaceholderForLine(line: DailyEntry["lines"][number]) {
  if (line.pauseOverride.trim()) return "leer = auto";

  const netHours = parseDecimalInput(line.dayHoursOverride);
  const inferredPause = inferPauseFromNetHours(netHours);
  if (inferredPause == null) return "leer = auto";
  if (inferredPause <= 0) return "auto: 0";
  return `auto: ${String(inferredPause).replace(".", ",")}`;
}

function makeLineId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `line_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function createBlankLine() {
  return { ...EMPTY_DAILY_LINE(), id: makeLineId() };
}

function normalizeEntry(date: string, initial: DailyEntry | null, defaults: { proj: string; arbeit: string }): DailyEntry {
  if (!initial) {
    return {
      date,
      arbeitsstaetteProjekte: defaults.proj,
      artDerArbeit: defaults.arbeit,
      lines: [createBlankLine()],
      updatedAt: new Date().toISOString()
    };
  }

  const lines = initial.lines.length
    ? initial.lines.map((line) => {
        const normalizedLineType: DailyLineType = line.lineType === "baustelle" ? "baustelle" : "arbeitszeit";
        return {
          ...EMPTY_DAILY_LINE(),
          ...line,
          id: line.id || makeLineId(),
          lineType: normalizedLineType
        };
      })
    : [createBlankLine()];

  return { ...initial, date, lines };
}

export function DailyEntryForm({
  date,
  initialEntry,
  defaults,
  weekContext
}: {
  date: string;
  initialEntry: DailyEntry | null;
  defaults: { proj: string; arbeit: string };
  weekContext: DayContext;
}) {
  const [entry, setEntry] = useState(() => normalizeEntry(date, initialEntry, defaults));
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");
  const firstRunRef = useRef(true);
  const latestPayload = useMemo(() => JSON.stringify(entry), [entry]);

  useEffect(() => {
    if (firstRunRef.current) {
      firstRunRef.current = false;
      return;
    }

    const timeout = window.setTimeout(async () => {
      setSaveState("saving");
      setError("");
      try {
        const res = await fetch(`/api/entries/${encodeURIComponent(date)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: latestPayload
        });
        let data: { error?: string } | null = null;
        try {
          data = (await res.json()) as { error?: string };
        } catch {
          data = null;
        }
        if (!res.ok) throw new Error(data?.error || "Autospeichern fehlgeschlagen");

        startTransition(() => {
          setSaveState("saved");
        });
        window.setTimeout(() => setSaveState("idle"), 1200);
      } catch (e) {
        setSaveState("error");
        const message = e instanceof Error ? e.message : "Autospeichern fehlgeschlagen";
        setError(message === "Failed to fetch" ? "Autospeichern fehlgeschlagen (Server nicht erreichbar)" : message);
      }
    }, 650);

    return () => window.clearTimeout(timeout);
  }, [date, latestPayload]);

  function updateLine(index: number, patch: Partial<(typeof entry.lines)[number]>) {
    const normalizedPatch = { ...patch };
    if (typeof normalizedPatch.beginn === "string") {
      normalizedPatch.beginn = snapTimeToQuarter(normalizedPatch.beginn);
    }
    if (typeof normalizedPatch.ende === "string") {
      normalizedPatch.ende = snapTimeToQuarter(normalizedPatch.ende);
    }
    if (typeof normalizedPatch.dayHoursOverride === "string" && normalizedPatch.dayHoursOverride.trim().toLowerCase() === "x") {
      normalizedPatch.dayHoursOverride = "x";
    }

    setEntry((prev) => ({
      ...prev,
      lines: prev.lines.map((line, i) => (i === index ? { ...line, ...normalizedPatch } : line))
    }));
  }

  function addLine() {
    setEntry((prev) => ({
      ...prev,
      lines: [...prev.lines, { ...createBlankLine(), lineType: "baustelle" }]
    }));
  }

  function removeLine(index: number) {
    setEntry((prev) => ({
      ...prev,
      lines: prev.lines.length <= 1 ? [createBlankLine()] : prev.lines.filter((_, i) => i !== index)
    }));
  }

  function setLineType(index: number, lineType: DailyLineType) {
    if (lineType === "baustelle") {
      updateLine(index, {
        lineType,
        beginn: "",
        ende: "",
        pauseOverride: ""
      });
      return;
    }

    updateLine(index, { lineType });
  }

  return (
    <section className="grid" style={{ gap: "1rem" }}>
      <section className="card">
        <div className="toolbar spread">
          <div>
            <h2 style={{ marginBottom: "0.35rem" }}>Eintrag {date}</h2>
            <div className="small">
              <Link href={`/week/${weekContext.weekYear}/${weekContext.weekKw}`}>KW {weekContext.weekKw}</Link>
            </div>
          </div>
          <div className="toolbar">
            {saveState === "saving" ? <span className="pill">Speichern...</span> : null}
            {saveState === "saved" ? <span className="pill ok">Gespeichert</span> : null}
            {saveState === "error" ? <span className="pill err">Fehler</span> : null}
          </div>
        </div>

        <div className="field-grid" style={{ marginTop: "0.8rem" }}>
          <label>
            <span className="label-title">Arbeitsstätte / Projekte</span>
            <input
              value={entry.arbeitsstaetteProjekte}
              onChange={(e) => setEntry((prev) => ({ ...prev, arbeitsstaetteProjekte: e.target.value }))}
            />
          </label>
          <label>
            <span className="label-title">Art der Arbeit</span>
            <input
              value={entry.artDerArbeit}
              onChange={(e) => setEntry((prev) => ({ ...prev, artDerArbeit: e.target.value }))}
            />
          </label>
        </div>

        <div className="toolbar" style={{ marginTop: "0.75rem" }}>
          <button className="btn primary" type="button" onClick={addLine}>
            Zeile
          </button>
        </div>

        {error ? <p className="status-text" style={{ color: "var(--danger)" }}>{error}</p> : null}
      </section>

      <section className="card">
        <h3>Arbeitszeilen</h3>
        <div className="line-list">
          {entry.lines.map((line, index) => (
            <article className="line-card" key={line.id || index}>
              <header>
                <h4>Zeile {index + 1}</h4>
                <button className="btn" type="button" onClick={() => removeLine(index)}>
                  Entfernen
                </button>
              </header>

              <div className="line-grid">
                <label className="span-4">
                  <span className="label-title">Arbeitsstelle / Ort</span>
                  <input
                    value={line.siteNameOrt}
                    onChange={(e) => updateLine(index, { siteNameOrt: e.target.value })}
                    placeholder="Baustelle / Ort"
                  />
                </label>
                <label className="span-2">
                  <span className="label-title">Zeilentyp</span>
                  <select
                    value={line.lineType || "arbeitszeit"}
                    onChange={(e) => setLineType(index, e.target.value as DailyLineType)}
                  >
                    <option value="arbeitszeit">Arbeitszeit-Zeile</option>
                    <option value="baustelle">Baustelle-Zeile</option>
                  </select>
                </label>

                {line.lineType !== "baustelle" ? (
                  <>
                    <label>
                      <span className="label-title">Beginn</span>
                      <input
                        type="time"
                        step={900}
                        value={line.beginn}
                        onChange={(e) => updateLine(index, { beginn: e.target.value })}
                      />
                    </label>
                    <label>
                      <span className="label-title">Ende</span>
                      <input
                        type="time"
                        step={900}
                        value={line.ende}
                        onChange={(e) => updateLine(index, { ende: e.target.value })}
                      />
                    </label>
                    <label>
                      <span className="label-title">Pause (h)</span>
                      <input
                        value={line.pauseOverride}
                        onChange={(e) => updateLine(index, { pauseOverride: e.target.value })}
                        placeholder={pausePlaceholderForLine(line)}
                      />
                    </label>
                  </>
                ) : null}
                <label>
                  <span className="label-title">Tag (x / Std)</span>
                  <input
                    value={line.dayHoursOverride}
                    onChange={(e) => updateLine(index, { dayHoursOverride: e.target.value })}
                    placeholder="x / 0,5 / 1,0"
                  />
                </label>
                <label>
                  <span className="label-title">Lohnart</span>
                  <select value={line.lohnType} onChange={(e) => updateLine(index, { lohnType: e.target.value })}>
                    <option value="">-</option>
                    <option value="S">S</option>
                    <option value="L">L</option>
                    <option value="K">K</option>
                    <option value="U">U</option>
                    <option value="F">F</option>
                    <option value="UB">UB</option>
                  </select>
                </label>

                <label>
                  <span className="label-title">Auslöse</span>
                  <select value={line.ausloese} onChange={(e) => updateLine(index, { ausloese: e.target.value })}>
                    <option value="">-</option>
                    <option value="NA">NA</option>
                    <option value="FA">FA</option>
                  </select>
                </label>
                <label>
                  <span className="label-title">Zulage</span>
                  <input value={line.zulage} onChange={(e) => updateLine(index, { zulage: e.target.value })} />
                </label>
                <label className="span-2">
                  <span className="label-title">Projektnummer</span>
                  <input value={line.projektnummer} onChange={(e) => updateLine(index, { projektnummer: e.target.value })} />
                </label>
                <label className="span-2">
                  <span className="label-title">Kabelschacht</span>
                  <input
                    value={line.kabelschachtInfo}
                    onChange={(e) => updateLine(index, { kabelschachtInfo: e.target.value })}
                  />
                </label>
                <label>
                  <span className="label-title">SM-Nr.</span>
                  <input value={line.smNr} onChange={(e) => updateLine(index, { smNr: e.target.value })} />
                </label>
                <label className="span-3">
                  <span className="label-title">Bauleiter</span>
                  <input value={line.bauleiter} onChange={(e) => updateLine(index, { bauleiter: e.target.value })} />
                </label>
                <label className="span-3">
                  <span className="label-title">Kollege / allein</span>
                  <input
                    value={line.arbeitskollege}
                    onChange={(e) => updateLine(index, { arbeitskollege: e.target.value })}
                  />
                </label>
              </div>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}
