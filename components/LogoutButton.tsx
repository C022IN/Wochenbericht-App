"use client";

import { useTranslations } from "next-intl";

export function LogoutButton() {
  const t = useTranslations("app");

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    window.location.href = "/login";
  }

  return (
    <button type="button" className="btn" onClick={logout}>
      {t("logout")}
    </button>
  );
}
