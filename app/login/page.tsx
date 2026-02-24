import { LoginForm } from "@/components/LoginForm";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

function readNext(searchParams?: PageProps["searchParams"]) {
  const raw = searchParams?.next;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

export default async function LoginPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  const nextPath = readNext(searchParams);
  if (user) {
    redirect(nextPath || "/");
  }

  return (
    <main className="shell">
      <LoginForm nextPath={nextPath} />
    </main>
  );
}
