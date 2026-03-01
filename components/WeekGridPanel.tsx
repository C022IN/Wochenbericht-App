"use client";

import { useState } from "react";
import Link from "next/link";

export type WeekDisplayItem = {
  year: number;
  kw: number;
  displayKw: number;
  displayYear: number;
  isCarryOverToNextYear: boolean;
  isCurrentWeek: boolean;
  isMonthSplit: boolean;
  splitLabel: string;
  first: string; // formatted DE date
  last: string;  // formatted DE date
  filledDays: number;
  pct: number;
};

export function WeekGridPanel({ items, currentIdx }: { items: WeekDisplayItem[]; currentIdx: number }) {
  const [expanded, setExpanded] = useState(false);

  const start = Math.max(0, currentIdx - 1);
  const end = Math.min(items.length - 1, currentIdx + 1);
  const visible = expanded ? items : items.slice(start, end + 1);

  return (
    <div>
      <div className="week-grid" style={{ marginTop: "0.8rem" }}>
        {visible.map((item) => (
          <Link
            key={`${item.year}-${item.kw}`}
            id={item.isCurrentWeek ? "current-week" : undefined}
            className={`week-card${item.isCurrentWeek ? " current-week" : ""}`}
            href={`/week/${item.year}/${item.kw}`}
          >
            <div className="toolbar spread">
              <strong>
                KW {String(item.displayKw).padStart(2, "0")}
                {item.isCarryOverToNextYear ? ` (${item.displayYear})` : ""}
              </strong>
              {item.isMonthSplit ? (
                <span className="pill warn">Geteilt</span>
              ) : (
                <span className="pill ok">{item.filledDays}/7</span>
              )}
            </div>

            <div className="small">{item.splitLabel}</div>

            <div className="week-meta">
              <span>{item.first}</span>
              <span>{item.last}</span>
            </div>

            <div className="progress" aria-label={`Fortschritt KW ${item.displayKw}`}>
              <span style={{ width: `${item.pct}%` }} />
            </div>
          </Link>
        ))}
      </div>

      <div className="toolbar" style={{ marginTop: "0.75rem" }}>
        {expanded ? (
          <button className="btn" type="button" onClick={() => setExpanded(false)}>
            Minimieren
          </button>
        ) : (
          <>
            <button className="btn" type="button" onClick={() => setExpanded(true)}>
              Alle Wochen anzeigen
            </button>
            {currentIdx > 0 ? (
              <span className="small" style={{ color: "var(--muted)" }}>
                KW 01 – KW {String(items[start].displayKw).padStart(2, "0")} ausgeblendet
              </span>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
