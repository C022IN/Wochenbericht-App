import Link from "next/link";
import { getTranslations } from "next-intl/server";

export default async function NotFound() {
  const t = await getTranslations("notFound");

  return (
    <main className="shell">
      <section className="card">
        <h1>{t("title")}</h1>
        <p className="small">{t("hint")}</p>
        <div className="toolbar" style={{ marginTop: "0.75rem" }}>
          <Link className="btn primary" href="/">
            {t("toOverview")}
          </Link>
        </div>
      </section>
    </main>
  );
}
