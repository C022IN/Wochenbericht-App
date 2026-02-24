"use client";

export function LogoutButton() {
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    window.location.href = "/login";
  }

  return (
    <button type="button" className="btn" onClick={logout}>
      Logout
    </button>
  );
}
