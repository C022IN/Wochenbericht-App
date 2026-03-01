"use client";

import { startTransition, useState } from "react";
import type { UserProfile } from "@/lib/types";

export function ProfileCard({ initialProfile }: { initialProfile: UserProfile }) {
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
      if (!res.ok) throw new Error(data.error || "Speichern fehlgeschlagen");

      startTransition(() => {
        setProfile(data.profile);
        setStatus("saved");
      });
      window.setTimeout(() => setStatus("idle"), 1200);
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
    }
  }

  return (
    <section className="card" aria-labelledby="profile-heading">
      <div className="toolbar spread">
        <h2 id="profile-heading">Profil</h2>
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
          <span className="label-title">Name</span>
          <input value={profile.name} onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))} />
        </label>
        <label>
          <span className="label-title">Vorname</span>
          <input value={profile.vorname} onChange={(e) => setProfile((p) => ({ ...p, vorname: e.target.value }))} />
        </label>
        <label>
          <span className="label-title">Arbeitsstätte / Projekte (Standard)</span>
          <input
            value={profile.defaultArbeitsstaetteProjekte}
            onChange={(e) => setProfile((p) => ({ ...p, defaultArbeitsstaetteProjekte: e.target.value }))}
          />
        </label>
        <label>
          <span className="label-title">Art der Arbeit (Standard)</span>
          <input
            value={profile.defaultArtDerArbeit}
            onChange={(e) => setProfile((p) => ({ ...p, defaultArtDerArbeit: e.target.value }))}
          />
        </label>
        <label>
          <span className="label-title">KFZ-Kennzeichen (Standard)</span>
          <input
            placeholder="z.B. LIF-B123"
            value={profile.kennzeichen}
            onChange={(e) => setProfile((p) => ({ ...p, kennzeichen: e.target.value }))}
          />
        </label>
      </div>

      {error ? <p className="status-text" style={{ color: "var(--danger)" }}>{error}</p> : null}
    </section>
  );
}
