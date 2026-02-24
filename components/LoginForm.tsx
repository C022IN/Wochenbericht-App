"use client";

import { useState } from "react";

type Mode = "login" | "signup";

export function LoginForm({ nextPath = "/" }: { nextPath?: string }) {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function submit() {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch(mode === "login" ? "/api/auth/login" : "/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string; hasSession?: boolean };
      if (!res.ok) throw new Error(data.error || "Auth failed");

      if (mode === "signup" && data.message) {
        setMessage(data.message);
      }
      if (mode === "signup" && data.hasSession === false) {
        return;
      }

      window.location.href = nextPath || "/";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Auth failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card" style={{ maxWidth: 460, margin: "8vh auto 0", width: "100%" }}>
      <div className="toolbar spread">
        <h2>Anmeldung</h2>
        <div className="toolbar">
          <button type="button" className={`btn ${mode === "login" ? "primary" : ""}`} onClick={() => setMode("login")}>
            Login
          </button>
          <button type="button" className={`btn ${mode === "signup" ? "primary" : ""}`} onClick={() => setMode("signup")}>
            Signup
          </button>
        </div>
      </div>

      <div className="field-grid" style={{ marginTop: "0.75rem" }}>
        <label className="span-2">
          <span className="label-title">Email</span>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
          />
        </label>
        <label className="span-2">
          <span className="label-title">Passwort</span>
          <input
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
      </div>

      <div className="toolbar" style={{ marginTop: "0.9rem" }}>
        <button className="btn primary" type="button" onClick={submit} disabled={loading || !email || !password}>
          {loading ? "Bitte warten..." : mode === "login" ? "Einloggen" : "Account erstellen"}
        </button>
      </div>

      {message ? <p className="status-text" style={{ color: "var(--accent)" }}>{message}</p> : null}
      {error ? <p className="status-text" style={{ color: "var(--danger)" }}>{error}</p> : null}
    </section>
  );
}
