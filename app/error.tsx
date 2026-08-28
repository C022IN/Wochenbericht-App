"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";

// Catches errors thrown while rendering a page (e.g. the database briefly unreachable
// while a paused Supabase project resumes) and offers a retry instead of a raw 500.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("errorPage");

  useEffect(() => {
    // Surface for server logs without exposing details to the user.
    console.error(error);
  }, [error]);

  return (
    <main className="shell">
      <section className="card" style={{ maxWidth: 520, margin: "8vh auto 0", width: "100%" }}>
        <h1>{t("title")}</h1>
        <p className="small">{t("hint")}</p>
        <div className="toolbar" style={{ marginTop: "0.9rem" }}>
          <button className="btn primary" type="button" onClick={() => reset()}>
            {t("retry")}
          </button>
        </div>
      </section>
    </main>
  );
}
