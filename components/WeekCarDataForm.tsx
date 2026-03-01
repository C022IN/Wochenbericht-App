"use client";

import { startTransition, useState } from "react";
import type { WeekCarData } from "@/lib/types";

type Props = {
  year: number;
  kw: number;
  initialCarData: WeekCarData;
  defaultKennzeichen: string; // from profile
};

export function WeekCarDataForm({ year, kw, initialCarData, defaultKennzeichen }: Props) {
  const [data, setData] = useState<WeekCarData>(initialCarData);
  const [kennzeichen, setKennzeichen] = useState(defaultKennzeichen);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");

  async function save() {
    setStatus("saving");
    setError("");
    try {
      // Save profile kennzeichen
      const profileRes = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kennzeichen })
      });
      if (!profileRes.ok) {
        const d = await profileRes.json().catch(() => ({}));
        throw new Error(d.error || "Profil speichern fehlgeschlagen");
      }

      // Save week car data
      const weekRes = await fetch(`/api/week-data/${year}/${kw}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      const weekJson = await weekRes.json().catch(() => ({}));
      if (!weekRes.ok) throw new Error(weekJson.error || "Fahrzeugdaten speichern fehlgeschlagen");

      startTransition(() => {
        setData(weekJson.carData ?? data);
        setStatus("saved");
      });
      window.setTimeout(() => setStatus("idle"), 1200);
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "Fehler beim Speichern");
    }
  }

  return (
    <section className="card" aria-labelledby="car-heading">
      <div className="toolbar spread">
        <h2 id="car-heading">Fahrzeugdaten</h2>
        <div className="toolbar">
          {status === "saved" ? <span className="pill ok">Gespeichert</span> : null}
          {status === "saving" ? <span className="pill">Speichern...</span> : null}
          {status === "error" ? <span className="pill err">Fehler</span> : null}
          <button className="btn primary" type="button" onClick={save} disabled={status === "saving"}>
            Speichern
          </button>
        </div>
      </div>

      <div className="field-grid" style={{ marginTop: "0.75rem" }}>
        <label>
          <span className="label-title">KFZ-Kennzeichen (Standard)</span>
          <input
            placeholder="z.B. LIF-B123"
            value={kennzeichen}
            onChange={(e) => setKennzeichen(e.target.value)}
          />
        </label>
        <label>
          <span className="label-title">KFZ-Kennzeichen 2 (wahlweise)</span>
          <input
            placeholder="Zweites Fahrzeug"
            value={data.kennzeichen2}
            onChange={(e) => setData((d) => ({ ...d, kennzeichen2: e.target.value }))}
          />
        </label>
        <label>
          <span className="label-title">Kilometerstand (km)</span>
          <input
            type="number"
            placeholder="z.B. 123456"
            value={data.kmStand}
            onChange={(e) => setData((d) => ({ ...d, kmStand: e.target.value }))}
          />
        </label>
        <label>
          <span className="label-title">Gefahrene km (Woche)</span>
          <input
            type="number"
            placeholder="z.B. 350"
            value={data.kmGefahren}
            onChange={(e) => setData((d) => ({ ...d, kmGefahren: e.target.value }))}
          />
        </label>
      </div>

      {error ? <p className="status-text" style={{ color: "var(--danger)" }}>{error}</p> : null}
    </section>
  );
}
