"use client";

import { startTransition, useState } from "react";
import { useTranslations } from "next-intl";
import type { WeekCarData } from "@/lib/types";

type Props = {
  year: number;
  kw: number;
  initialCarData: WeekCarData;
  defaultKennzeichen: string; // from profile
};

export function WeekCarDataForm({ year, kw, initialCarData, defaultKennzeichen }: Props) {
  const t = useTranslations("car");
  const tc = useTranslations("common");
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
        throw new Error(d.error || t("profileSaveFailed"));
      }

      // Save week car data
      const weekRes = await fetch(`/api/week-data/${year}/${kw}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      const weekJson = await weekRes.json().catch(() => ({}));
      if (!weekRes.ok) throw new Error(weekJson.error || t("carSaveFailed"));

      startTransition(() => {
        setData(weekJson.carData ?? data);
        setStatus("saved");
      });
      window.setTimeout(() => setStatus("idle"), 1200);
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : t("saveFailedGeneric"));
    }
  }

  return (
    <section className="card" aria-labelledby="car-heading">
      <div className="toolbar spread">
        <h2 id="car-heading">{t("title")}</h2>
        <div className="toolbar">
          {status === "saved" ? <span className="pill ok">{tc("saved")}</span> : null}
          {status === "saving" ? <span className="pill">{tc("saving")}</span> : null}
          {status === "error" ? <span className="pill err">{tc("error")}</span> : null}
          <button className="btn primary" type="button" onClick={save} disabled={status === "saving"}>
            {tc("save")}
          </button>
        </div>
      </div>

      <div className="field-grid" style={{ marginTop: "0.75rem" }}>
        <label>
          <span className="label-title">{t("plate")}</span>
          <input
            placeholder={t("platePlaceholder")}
            value={kennzeichen}
            onChange={(e) => setKennzeichen(e.target.value)}
          />
        </label>
        <label>
          <span className="label-title">{t("plate2")}</span>
          <input
            placeholder={t("plate2Placeholder")}
            value={data.kennzeichen2}
            onChange={(e) => setData((d) => ({ ...d, kennzeichen2: e.target.value }))}
          />
        </label>
        <label>
          <span className="label-title">{t("kmStand")}</span>
          <input
            type="number"
            placeholder={t("kmStandPlaceholder")}
            value={data.kmStand}
            onChange={(e) => setData((d) => ({ ...d, kmStand: e.target.value }))}
          />
        </label>
        <label>
          <span className="label-title">{t("kmGefahren")}</span>
          <input
            type="number"
            placeholder={t("kmGefahrenPlaceholder")}
            value={data.kmGefahren}
            onChange={(e) => setData((d) => ({ ...d, kmGefahren: e.target.value }))}
          />
        </label>
      </div>

      {error ? <p className="status-text" style={{ color: "var(--danger)" }}>{error}</p> : null}
    </section>
  );
}
