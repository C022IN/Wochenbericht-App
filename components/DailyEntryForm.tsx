"use client";

import Link from "next/link";
import { startTransition, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useTranslations } from "next-intl";
import { EMPTY_DAILY_LINE, type DailyEntry, type DailyLineType } from "@/lib/types";

type EntryT = ReturnType<typeof useTranslations>;

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

function pausePlaceholderForLine(line: DailyEntry["lines"][number], t: EntryT) {
  if (line.pauseOverride.trim()) return t("pauseAutoEmpty");

  const netHours = parseDecimalInput(line.dayHoursOverride);
  const inferredPause = inferPauseFromNetHours(netHours);
  if (inferredPause == null) return t("pauseAutoEmpty");
  if (inferredPause <= 0) return t("pauseAutoZero");
  return t("pauseAutoValue", { value: String(inferredPause).replace(".", ",") });
}

const KNOWN_PROJEKTNUMMERN: { code: string; label: string }[] = [
  { code: "P.0923220.1.01", label: "PTI 21/25 NEU" },
  { code: "P.0659633.1.01", label: "PTI 21/25 alt" },
  { code: "P.0923209.1.01", label: "PTI 13/14 NEU" },
  { code: "P.0653304.1.01", label: "PTI 13/14 alt" },
  { code: "G.014182.806.00", label: "Intern / Besprechung" },
  { code: "G.014182.796.00", label: "Schulung" },
  { code: "G.014182.801.00", label: "Jahresauftakt" },
  { code: "G.014182.811.01", label: "Werkzeugwartung" },
  { code: "G.014182.827.00", label: "Feiertag" },
  { code: "G.014182.838.00", label: "Krank" },
  { code: "G.014182.840.00", label: "Urlaub" },
];

const SITE_PROJ_RULES: { keywords: string[]; code: string }[] = [
  { keywords: ["urlaub"], code: "G.014182.840.00" },
  { keywords: ["krank"], code: "G.014182.838.00" },
  { keywords: ["feiertag", "fronleichnam", "weihnacht", "neujahr", "ostern", "pfingst", "maifeiertag", "tag der deutschen"], code: "G.014182.827.00" },
  { keywords: ["besprechung", "meeting", "toolbox", "jahresauftakt"], code: "G.014182.806.00" },
  { keywords: ["schulung", "ztv"], code: "G.014182.796.00" },
  { keywords: ["werkzeug"], code: "G.014182.811.01" },
];

const LOHN_PROJ_MAP: Record<string, string> = {
  U: "G.014182.840.00",
  F: "G.014182.827.00",
  K: "G.014182.838.00",
};

function suggestProjektnummer(siteNameOrt: string, lohnType: string): string {
  if (LOHN_PROJ_MAP[lohnType]) return LOHN_PROJ_MAP[lohnType];
  const lower = siteNameOrt.trim().toLowerCase();
  if (!lower) return "";
  for (const rule of SITE_PROJ_RULES) {
    if (rule.keywords.some((kw) => lower.includes(kw))) return rule.code;
  }
  return "P.0923220.1.01";
}

const CUSTOM_SENTINEL = "__custom__";

const BAULEITER_LIST = ["Martin Pohl", "Peter Singer"];

const TEAM_KOLLEGEN = [
  "Alekseev Alik",
  "Anjeo Collin Ambani",
  "Auer Andreas",
  "Aumuller Stefan Lorenz",
  "Bayer Thomas",
  "Berger Maurice",
  "Bohme Siegfried",
  "Brauer Beatrix",
  "Buchwald Laura",
  "Dauer Katja",
  "Hartmann Michael",
  "Hoffmann Albin",
  "Imhof Nicole",
  "Jutersonke Ronny",
  "Kerling Stefan",
  "Kickuth Joster",
  "Kickuth Thorsten",
  "Kindermann Henry",
  "Kindermann Maik",
  "Kolesov Wladimir",
  "Kruger Ronny",
  "Menzke Helmut",
  "Nikol Peter",
  "Pieper Marcus",
  "Pohl Martin",
  "Reichenbach Ronny",
  "Rinderlin Barbara",
  "Rosner Sebastian",
  "Rothel Markus",
  "Sauer Michael",
  "Schmitt Beate",
  "Schmitz Dennis",
  "Schrempf Volker",
  "Seidel Christian",
  "Seidel Fabian",
  "Singer Peter",
  "Sommer Christian",
  "Sontea Constantin",
  "Stark Hannes",
  "Tremel Frank",
  "Varga Gabriel",
  "Wagner Sergej",
  "Walther Sven",
  "Wirth Thomas",
];

function ProjektnummerField({ value, onChange, t }: { value: string; onChange: (v: string) => void; t: EntryT }) {
  const isKnown = KNOWN_PROJEKTNUMMERN.some((p) => p.code === value);
  const [customMode, setCustomMode] = useState(() => value !== "" && !KNOWN_PROJEKTNUMMERN.some((p) => p.code === value));

  const selectValue = customMode ? CUSTOM_SENTINEL : value;

  function handleSelectChange(e: ChangeEvent<HTMLSelectElement>) {
    const v = e.target.value;
    if (v === CUSTOM_SENTINEL) {
      setCustomMode(true);
      onChange("");
    } else {
      setCustomMode(false);
      onChange(v);
    }
  }

  // If parent resets value to a known code (e.g. line init), exit custom mode
  if (!customMode && !isKnown && value !== "") {
    setCustomMode(true);
  }
  if (customMode && isKnown) {
    setCustomMode(false);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
      <select value={selectValue} onChange={handleSelectChange}>
        <option value="">{t("projNone")}</option>
        {KNOWN_PROJEKTNUMMERN.map((p) => (
          <option key={p.code} value={p.code}>
            {p.label} — {p.code}
          </option>
        ))}
        <option value={CUSTOM_SENTINEL}>{t("projOther")}</option>
      </select>
      {customMode && (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t("projOtherPlaceholder")}
        />
      )}
    </div>
  );
}

function SimpleDropdownField({
  value,
  onChange,
  options,
  placeholder,
  noneLabel,
  t,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  noneLabel?: string;
  t: EntryT;
}) {
  const resolvedNoneLabel = noneLabel ?? t("projNone");
  const isKnown = options.includes(value);
  const [customMode, setCustomMode] = useState(() => value !== "" && !options.includes(value));

  const selectValue = customMode ? CUSTOM_SENTINEL : value;

  if (!customMode && !isKnown && value !== "") setCustomMode(true);
  if (customMode && isKnown) setCustomMode(false);

  function handleSelectChange(e: ChangeEvent<HTMLSelectElement>) {
    const v = e.target.value;
    if (v === CUSTOM_SENTINEL) {
      setCustomMode(true);
      onChange("");
    } else {
      setCustomMode(false);
      onChange(v);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
      <select value={selectValue} onChange={handleSelectChange}>
        <option value="">{resolvedNoneLabel}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
        <option value={CUSTOM_SENTINEL}>{t("dropdownOther")}</option>
      </select>
      {customMode && (
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      )}
    </div>
  );
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
  const t = useTranslations("entry");
  const tc = useTranslations("common");
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
        if (!res.ok) throw new Error(data?.error || t("saveError"));

        startTransition(() => {
          setSaveState("saved");
        });
        window.setTimeout(() => setSaveState("idle"), 1200);
      } catch (e) {
        setSaveState("error");
        const message = e instanceof Error ? e.message : t("saveError");
        setError(message === "Failed to fetch" ? t("saveErrorUnreachable") : message);
      }
    }, 650);

    return () => window.clearTimeout(timeout);
  }, [date, latestPayload, t]);

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

    setEntry((prev) => {
      const currentLine = prev.lines[index];
      // Auto-fill projektnummer when lohnType changes and projektnummer is still empty
      if (typeof normalizedPatch.lohnType === "string" && !currentLine.projektnummer && !normalizedPatch.projektnummer) {
        const suggested = suggestProjektnummer(currentLine.siteNameOrt, normalizedPatch.lohnType);
        if (suggested) normalizedPatch.projektnummer = suggested;
      }
      return {
        ...prev,
        lines: prev.lines.map((line, i) => (i === index ? { ...line, ...normalizedPatch } : line))
      };
    });
  }

  function autoFillProjOnSiteBlur(index: number, siteNameOrt: string) {
    setEntry((prev) => {
      const line = prev.lines[index];
      if (line.projektnummer) return prev;
      const suggested = suggestProjektnummer(siteNameOrt, line.lohnType);
      if (!suggested) return prev;
      return {
        ...prev,
        lines: prev.lines.map((l, i) => (i === index ? { ...l, projektnummer: suggested } : l))
      };
    });
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
            <h2 style={{ marginBottom: "0.35rem" }}>{t("entryTitle", { date })}</h2>
            <div className="small">
              <Link href={`/week/${weekContext.weekYear}/${weekContext.weekKw}`}>{t("weekShort", { kw: weekContext.weekKw })}</Link>
            </div>
          </div>
          <div className="toolbar">
            {saveState === "saving" ? <span className="pill">{tc("saving")}</span> : null}
            {saveState === "saved" ? <span className="pill ok">{tc("saved")}</span> : null}
            {saveState === "error" ? <span className="pill err">{tc("error")}</span> : null}
          </div>
        </div>

        <div className="field-grid" style={{ marginTop: "0.8rem" }}>
          <label>
            <span className="label-title">{t("workplaceProjects")}</span>
            <input
              value={entry.arbeitsstaetteProjekte}
              onChange={(e) => setEntry((prev) => ({ ...prev, arbeitsstaetteProjekte: e.target.value }))}
            />
          </label>
          <label>
            <span className="label-title">{t("typeOfWork")}</span>
            <input
              value={entry.artDerArbeit}
              onChange={(e) => setEntry((prev) => ({ ...prev, artDerArbeit: e.target.value }))}
            />
          </label>
        </div>

        <div className="toolbar" style={{ marginTop: "0.75rem" }}>
          <button className="btn primary" type="button" onClick={addLine}>
            {t("addRow")}
          </button>
        </div>

        {error ? <p className="status-text" style={{ color: "var(--danger)" }}>{error}</p> : null}
      </section>

      <section className="card">
        <h3>{t("workRows")}</h3>
        <div className="line-list">
          {entry.lines.map((line, index) => (
            <article className="line-card" key={line.id || index}>
              <header>
                <h4>{t("row", { n: index + 1 })}</h4>
                <button className="btn" type="button" onClick={() => removeLine(index)}>
                  {t("remove")}
                </button>
              </header>

              <div className="line-grid">
                <label className="span-4">
                  <span className="label-title">{t("siteLocation")}</span>
                  <input
                    value={line.siteNameOrt}
                    onChange={(e) => updateLine(index, { siteNameOrt: e.target.value })}
                    onBlur={(e) => autoFillProjOnSiteBlur(index, e.target.value)}
                    placeholder={t("sitePlaceholder")}
                  />
                </label>
                <label className="span-2">
                  <span className="label-title">{t("rowType")}</span>
                  <select
                    value={line.lineType || "arbeitszeit"}
                    onChange={(e) => setLineType(index, e.target.value as DailyLineType)}
                  >
                    <option value="arbeitszeit">{t("rowTypeWork")}</option>
                    <option value="baustelle">{t("rowTypeSite")}</option>
                  </select>
                </label>

                {line.lineType !== "baustelle" ? (
                  <>
                    <label>
                      <span className="label-title">{t("start")}</span>
                      <input
                        type="time"
                        step={900}
                        value={line.beginn}
                        onChange={(e) => updateLine(index, { beginn: e.target.value })}
                      />
                    </label>
                    <label>
                      <span className="label-title">{t("end")}</span>
                      <input
                        type="time"
                        step={900}
                        value={line.ende}
                        onChange={(e) => updateLine(index, { ende: e.target.value })}
                      />
                    </label>
                    <label>
                      <span className="label-title">{t("pause")}</span>
                      <input
                        value={line.pauseOverride}
                        onChange={(e) => updateLine(index, { pauseOverride: e.target.value })}
                        placeholder={pausePlaceholderForLine(line, t)}
                      />
                    </label>
                    <label>
                      <span className="label-title">{t("fahrzeit")}</span>
                      <input
                        value={line.fahrzeit}
                        onChange={(e) => updateLine(index, { fahrzeit: e.target.value })}
                        placeholder={t("fahrzeitPlaceholder")}
                      />
                    </label>
                  </>
                ) : null}
                <label>
                  <span className="label-title">{t("dayHours")}</span>
                  <input
                    value={line.dayHoursOverride}
                    onChange={(e) => updateLine(index, { dayHoursOverride: e.target.value })}
                    placeholder={t("dayHoursPlaceholder")}
                  />
                </label>
                <label>
                  <span className="label-title">{t("wageType")}</span>
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
                  <span className="label-title">{t("allowance")}</span>
                  <select value={line.ausloese} onChange={(e) => updateLine(index, { ausloese: e.target.value })}>
                    <option value="">-</option>
                    <option value="NA">NA</option>
                    <option value="FA">FA</option>
                  </select>
                </label>
                <label>
                  <span className="label-title">{t("bonus")}</span>
                  <input value={line.zulage} onChange={(e) => updateLine(index, { zulage: e.target.value })} />
                </label>
                <label className="span-2">
                  <span className="label-title">{t("projectNumber")}</span>
                  <ProjektnummerField
                    value={line.projektnummer}
                    onChange={(v) => updateLine(index, { projektnummer: v })}
                    t={t}
                  />
                </label>
                <label className="span-2">
                  <span className="label-title">{t("cableShaft")}</span>
                  <input
                    value={line.kabelschachtInfo}
                    onChange={(e) => updateLine(index, { kabelschachtInfo: e.target.value })}
                  />
                </label>
                <label>
                  <span className="label-title">{t("smNr")}</span>
                  <input value={line.smNr} onChange={(e) => updateLine(index, { smNr: e.target.value })} />
                </label>
                <label className="span-3">
                  <span className="label-title">{t("siteManager")}</span>
                  <SimpleDropdownField
                    value={line.bauleiter}
                    onChange={(v) => updateLine(index, { bauleiter: v })}
                    options={BAULEITER_LIST}
                    placeholder={t("namePlaceholder")}
                    t={t}
                  />
                </label>
                <label className="span-3">
                  <span className="label-title">{t("colleague")}</span>
                  <SimpleDropdownField
                    value={line.arbeitskollege}
                    onChange={(v) => updateLine(index, { arbeitskollege: v })}
                    options={["allein", ...TEAM_KOLLEGEN]}
                    placeholder={t("namePlaceholder")}
                    noneLabel={t("colleagueNone")}
                    t={t}
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
