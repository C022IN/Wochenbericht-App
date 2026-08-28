"use client";

// Last-resort fallback if the root layout itself fails to render (it replaces the whole
// document, so it can't use the app shell or i18n provider). Kept minimal and bilingual.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="de">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "2rem", lineHeight: 1.5 }}>
        <h1 style={{ fontSize: "1.25rem" }}>Vorübergehend nicht erreichbar</h1>
        <p>Die App ist gerade nicht erreichbar (evtl. startet die Datenbank neu). Bitte erneut versuchen.</p>
        <p style={{ color: "#666" }}>Temporarily unavailable — the database may be waking up. Please try again.</p>
        <button
          type="button"
          onClick={() => reset()}
          style={{ marginTop: "1rem", padding: "0.5rem 1rem", cursor: "pointer" }}
        >
          Neu laden / Retry
        </button>
      </body>
    </html>
  );
}
