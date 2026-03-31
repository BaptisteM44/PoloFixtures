"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { AuthStatus } from "@/components/AuthStatus";
import { NotificationBell } from "@/components/NotificationBell";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

export function Header() {
  const { data: session } = useSession();
  const t = useTranslations();
  const role = session?.user?.role;
  const isAdmin = role === "ADMIN";
  const hasPlayer = !!(session?.user as any)?.playerId;
  const isSuspended = (session?.user as any)?.playerStatus === "REJECTED";
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
    <>
    {isSuspended && (
      <div style={{ background: "var(--pink)", color: "#fff", textAlign: "center", padding: "10px 16px", fontSize: 13, fontWeight: 700, fontFamily: "var(--font-display)", letterSpacing: "0.02em" }}>
        {t("nav.account_suspended")}
        {(session?.user as any)?.suspendedReason && (
          <span style={{ fontWeight: 400, marginLeft: 8 }}>{t("nav.reason_prefix")}{(session?.user as any).suspendedReason}</span>
        )}
      </div>
    )}
    <header className="site-header">
      <div className="brand">
        <Link href="/" onClick={() => setMenuOpen(false)}>
          <span className="brand-dot" />
          {t("header.brand_name")}
        </Link>
        <span className="tag">BETA</span>
      </div>

      {/* Navigation desktop */}
      <nav className="nav nav--desktop">
        <Link href="/tournaments">{t("nav.tournaments")}</Link>
        <Link href="/calendar">{t("nav.calendar")}</Link>
        <Link href="/clubs">{t("nav.clubs")}</Link>
        <Link href="/about">{t("nav.about")}</Link>
        {isAdmin && <Link href="/admin">{t("nav.admin")}</Link>}
      </nav>

      {/* Actions desktop */}
      <div className="header-actions header-actions--desktop">
        <LanguageSwitcher />
        {hasPlayer && <NotificationBell />}
        <AuthStatus />
      </div>

      {/* Zone mobile : cloche + burger */}
      <div className="header-mobile-actions">
        {hasPlayer && <NotificationBell />}
        <button
          className="burger-btn"
          aria-label={menuOpen ? t("nav.close_menu") : t("nav.open_menu")}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          <span className={`burger-icon${menuOpen ? " burger-icon--open" : ""}`}>
            <span /><span /><span />
          </span>
        </button>
      </div>

      {/* Overlay + drawer mobile */}
      {menuOpen && (
        <div className="nav-overlay" onClick={() => setMenuOpen(false)}>
          <nav className="nav-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="nav-drawer__header">
              <span className="brand" style={{ fontSize: 16 }}>
                <span className="brand-dot" />
                {t("header.brand_name")}
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <LanguageSwitcher drawerAlign="left" />
                <button className="nav-drawer__close" onClick={() => setMenuOpen(false)}>✕</button>
              </div>
            </div>
            <div className="nav-drawer__links">
              <Link href="/tournaments" onClick={() => setMenuOpen(false)}>{t("nav.tournaments")}</Link>
              <Link href="/calendar" onClick={() => setMenuOpen(false)}>{t("nav.calendar")}</Link>
              <Link href="/clubs" onClick={() => setMenuOpen(false)}>{t("nav.clubs")}</Link>
              <Link href="/about" onClick={() => setMenuOpen(false)}>{t("nav.about")}</Link>
              {isAdmin && <Link href="/admin" onClick={() => setMenuOpen(false)}>{t("nav.admin")}</Link>}
            </div>
            <div className="nav-drawer__footer">
              <AuthStatus onNavigate={() => setMenuOpen(false)} inDrawer />
            </div>
          </nav>
        </div>
      )}
    </header>
    </>
  );
}
