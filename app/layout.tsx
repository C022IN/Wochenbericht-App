import type { Metadata } from "next";
import "./globals.css";
import { getCurrentUser, isSupabaseAuthEnabled } from "@/lib/auth";
import { LogoutButton } from "@/components/LogoutButton";

function capitalizeNamePart(value: string) {
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function formatDisplayNameFromEmail(email?: string | null) {
  if (!email) return null;

  const localPart = email.trim().split("@", 1)[0]?.split("+", 1)[0]?.trim() ?? "";
  if (!localPart) return null;

  const dotParts = localPart
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean);

  if (!dotParts.length) return null;

  const toWords = (value: string) =>
    value
      .split(/[-_]+/g)
      .map((part) => part.trim())
      .filter(Boolean)
      .map(capitalizeNamePart);

  if (dotParts.length === 1) {
    const singleName = toWords(dotParts[0]).join(" ").trim();
    return singleName || null;
  }

  const firstNames = toWords(dotParts.slice(0, -1).join("-"));
  const lastName = toWords(dotParts[dotParts.length - 1]);
  const fullName = [...firstNames, ...lastName].join(" ").trim();

  return fullName || null;
}

export const metadata: Metadata = {
  title: "Wochenbericht App",
  description: "Realtime Wochenbericht entry and template-based Excel/PDF export"
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const authEnabled = isSupabaseAuthEnabled();
  const user = authEnabled ? await getCurrentUser() : null;
  const userLabel = formatDisplayNameFromEmail(user?.email) || user?.id || "";

  return (
    <html lang="de">
      <body>
        {authEnabled && user ? (
          <div className="shell" style={{ paddingTop: "0.75rem", paddingBottom: 0 }}>
            <div className="toolbar spread card" style={{ padding: "0.6rem 0.8rem" }}>
              <div className="small" style={{ overflowWrap: "anywhere" }}>
                {userLabel}
              </div>
              <LogoutButton />
            </div>
          </div>
        ) : null}
        {children}
      </body>
    </html>
  );
}
