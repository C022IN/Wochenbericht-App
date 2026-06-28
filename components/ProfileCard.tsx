"use client";

import { startTransition, useState } from "react";
import { useTranslations } from "next-intl";
import type { UserProfile } from "@/lib/types";

export function ProfileCard({ initialProfile }: { initialProfile: UserProfile }) {
  const t = useTranslations("profile");
  const tc = useTranslations("common");
  const [profile, setProfile] = useState(initialProfile);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");

  async function save() {
    setStatus("saving");
    setError("");
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("saveFailed"));

      startTransition(() => {
        setProfile(data.profile);
        setStatus("saved");
      });
      window.setTimeout(() => setStatus("idle"), 1200);
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : t("saveFailed"));
    }
  }

  return (
    <section className="card" aria-labelledby="profile-heading">
      <div className="toolbar spread">
        <h2 id="profile-heading">{t("title")}</h2>
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
          <span className="label-title">{t("name")}</span>
          <input value={profile.name} onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))} />
        </label>
        <label>
          <span className="label-title">{t("vorname")}</span>
          <input value={profile.vorname} onChange={(e) => setProfile((p) => ({ ...p, vorname: e.target.value }))} />
        </label>
        <label>
          <span className="label-title">{t("defaultWorkplace")}</span>
          <input
            value={profile.defaultArbeitsstaetteProjekte}
            onChange={(e) => setProfile((p) => ({ ...p, defaultArbeitsstaetteProjekte: e.target.value }))}
          />
        </label>
        <label>
          <span className="label-title">{t("defaultTypeOfWork")}</span>
          <input
            value={profile.defaultArtDerArbeit}
            onChange={(e) => setProfile((p) => ({ ...p, defaultArtDerArbeit: e.target.value }))}
          />
        </label>
        <label>
          <span className="label-title">{t("defaultPlate")}</span>
          <input
            placeholder={t("platePlaceholder")}
            value={profile.kennzeichen}
            onChange={(e) => setProfile((p) => ({ ...p, kennzeichen: e.target.value }))}
          />
        </label>
      </div>

      {error ? <p className="status-text" style={{ color: "var(--danger)" }}>{error}</p> : null}
    </section>
  );
}
