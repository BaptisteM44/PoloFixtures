"use client";

import { useState, useEffect } from "react";
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
  const [menuOpen, setMenuOpen] = useState(false);

  // Fermer le menu sur changement de route
  useEffect(() => {
    setMenuOpen(false);
  }, []);

  // Bloquer le scroll body quand le menu est ouvert
  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [menuOpen]);

  return (
    <header className="site-header">
      <div className="brand">
        <Link href="/" onClick={() => setMenuOpen(false)}>
          <span className="brand-dot" />
          {t("header.brand_name")}
        </Link>
        <span className="tag">{t("header.brand_tag")}</span>
      </div>

      {/* Navigation desktop */}
      <nav className="nav nav--desktop">
        <Link href="/tournaments">{t("nav.tournaments")}</Link>
        <Link href="/calendar">{t("nav.calendar")}</Link>
        <Link href="/about">{t("nav.about")}</Link>
        {hasPlayer && <Link href="/my-tournaments">{t("nav.my_tournaments")}</Link>}
        {hasPlayer && <Link href="/my-teams">{t("nav.my_teams")}</Link>}
        {isAdmin && <Link href="/admin">{t("nav.admin")}</Link>}
      </nav>

      {/* Actions desktop */}
      <div className="header-actions header-actions--desktop">
        {hasPlayer && <NotificationBell />}
        <AuthStatus />
      </div>

      {/* Burger button (mobile only) */}
      <button
        className="burger-btn"
        aria-label={menuOpen ? "Fermer le menu" : "Ouvrir le menu"}
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((v) => !v)}
      >
        <span className={`burger-icon${menuOpen ? " burger-icon--open" : ""}`}>
          <span /><span /><span />
        </span>
      </button>

      {/* Overlay + drawer mobile */}
      {menuOpen && (
        <div className="nav-overlay" onClick={() => setMenuOpen(false)}>
          <nav className="nav-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="nav-drawer__header">
              <span className="brand" style={{ fontSize: 16 }}>
                <span className="brand-dot" />
                {t("header.brand_name")}
              </span>
              <button className="nav-drawer__close" onClick={() => setMenuOpen(false)}>✕</button>
            </div>
            <div className="nav-drawer__links">
              <Link href="/tournaments" onClick={() => setMenuOpen(false)}>{t("nav.tournaments")}</Link>
              <Link href="/calendar" onClick={() => setMenuOpen(false)}>{t("nav.calendar")}</Link>
              <Link href="/about" onClick={() => setMenuOpen(false)}>{t("nav.about")}</Link>
              {hasPlayer && <Link href="/my-tournaments" onClick={() => setMenuOpen(false)}>{t("nav.my_tournaments")}</Link>}
              {hasPlayer && <Link href="/my-teams" onClick={() => setMenuOpen(false)}>{t("nav.my_teams")}</Link>}
              {isAdmin && <Link href="/admin" onClick={() => setMenuOpen(false)}>{t("nav.admin")}</Link>}
            </div>
            <div className="nav-drawer__footer">
              {hasPlayer && <NotificationBell />}
              <AuthStatus />
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
