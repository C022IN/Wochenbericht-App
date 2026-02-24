import Link from "next/link";

export default function NotFound() {
  return (
    <main className="shell">
      <section className="card">
        <h1>Seite nicht gefunden</h1>
        <p className="small">Bitte Datum oder KW prüfen.</p>
        <div className="toolbar" style={{ marginTop: "0.75rem" }}>
          <Link className="btn primary" href="/">
            Zur Übersicht
          </Link>
        </div>
      </section>
    </main>
  );
}
