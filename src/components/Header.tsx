"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { AuthStatus } from "@/components/AuthStatus";
import { NotificationBell } from "@/components/NotificationBell";

export function Header() {
  const { data: session } = useSession();
  const role = session?.user?.role;
  const isAdmin = role === "ADMIN";
  const hasPlayer = !!(session?.user as any)?.playerId;

  return (
    <header className="site-header">
      <div className="brand">
        <Link href="/">
          <span className="brand-dot" />
          Hardcourt Polo
        </Link>
        <span className="tag">Tournament Ops</span>
      </div>
      <nav className="nav">
        <Link href="/tournaments">Tournois</Link>
        <Link href="/calendar">Calendrier</Link>
        {hasPlayer && <Link href="/my-tournaments">Mes Tournois</Link>}
        {hasPlayer && <Link href="/my-teams">Mes Équipes</Link>}
        {isAdmin && <Link href="/admin">Admin</Link>}
      </nav>
      <div className="header-actions" style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {hasPlayer && <NotificationBell />}
        <AuthStatus />
      </div>
    </header>
  );
}
