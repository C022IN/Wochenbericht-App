import type { Metadata } from "next";
import "./globals.css";
import { getCurrentUser, isSupabaseAuthEnabled } from "@/lib/auth";
import { LogoutButton } from "@/components/LogoutButton";

export const metadata: Metadata = {
  title: "Wochenbericht App",
  description: "Realtime Wochenbericht entry and template-based Excel/PDF export"
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const authEnabled = isSupabaseAuthEnabled();
  const user = authEnabled ? await getCurrentUser() : null;

  return (
    <html lang="de">
      <body>
        {authEnabled && user ? (
          <div className="shell" style={{ paddingTop: "0.75rem", paddingBottom: 0 }}>
            <div className="toolbar spread card" style={{ padding: "0.6rem 0.8rem" }}>
              <div className="small" style={{ wordBreak: "break-all" }}>
                {user.email || user.id}
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
