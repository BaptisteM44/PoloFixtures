"use client";

import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { AuthStatus } from "@/components/AuthStatus";
import { NotificationBell } from "@/components/NotificationBell";

export function Header() {
  const { data: session } = useSession();
  const t = useTranslations();
  const role = session?.user?.role;
  const isAdmin = role === "ADMIN";
  const hasPlayer = !!(session?.user as any)?.playerId;

  return (
    <header className="site-header">
      <div className="brand">
        <Link href="/">
          <span className="brand-dot" />
          {t("header.brand_name")}
        </Link>
        <span className="tag">{t("header.brand_tag")}</span>
      </div>
      <nav className="nav">
        <Link href="/tournaments">{t("nav.tournaments")}</Link>
        <Link href="/calendar">{t("nav.calendar")}</Link>
        {hasPlayer && <Link href="/my-tournaments">{t("nav.my_tournaments")}</Link>}
        {hasPlayer && <Link href="/my-teams">{t("nav.my_teams")}</Link>}
        {isAdmin && <Link href="/admin">{t("nav.admin")}</Link>}
      </nav>
      <div className="header-actions" style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {hasPlayer && <NotificationBell />}
        <AuthStatus />
      </div>
    </header>
  );
}
