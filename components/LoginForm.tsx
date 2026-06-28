"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

export function LoginForm({ nextPath = "/" }: { nextPath?: string }) {
  const t = useTranslations("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: email, password })
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || t("loginFailed"));

      window.location.href = nextPath || "/";
    } catch (e) {
      setError(e instanceof Error ? e.message : t("loginFailed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card" style={{ maxWidth: 460, margin: "8vh auto 0", width: "100%" }}>
      <div className="toolbar spread">
        <h2>{t("title")}</h2>
        <span className="pill">{t("badge")}</span>
      </div>

      <div className="field-grid" style={{ marginTop: "0.75rem" }}>
        <label className="span-2">
          <span className="label-title">{t("emailOrUsername")}</span>
          <input
            type="text"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("emailPlaceholder")}
          />
        </label>
        <label className="span-2">
          <span className="label-title">{t("password")}</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
      </div>

      <div className="toolbar" style={{ marginTop: "0.9rem" }}>
        <button className="btn primary" type="button" onClick={submit} disabled={loading || !email || !password}>
          {loading ? t("pleaseWait") : t("signIn")}
        </button>
      </div>

      <p className="small" style={{ marginTop: "0.6rem" }}>
        {t("usernameHint")}
      </p>
      {error ? <p className="status-text" style={{ color: "var(--danger)" }}>{error}</p> : null}
    </section>
  );
}
