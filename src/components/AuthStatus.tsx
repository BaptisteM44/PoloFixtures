"use client";

import { signOut, useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useRef, useState, useEffect, useCallback } from "react";
import Image from "next/image";

function getInitials(name?: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name[0].toUpperCase();
}

export function AuthStatus({ onNavigate, inDrawer }: { onNavigate?: () => void; inDrawer?: boolean } = {}) {
  const { data } = useSession();
  const t = useTranslations("nav");
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const closeDropdown = useCallback(() => {
    setClosing(true);
    closeTimerRef.current = setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, 150);
  }, []);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        closeDropdown();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open, closeDropdown]);

  useEffect(() => () => { if (closeTimerRef.current) clearTimeout(closeTimerRef.current); }, []);

  // Joueur connecté → drawer inline ou avatar dropdown
  if ((data?.user as any)?.playerId) {
    const user = data!.user!;
    const initials = getInitials(user.name);

    // Mode drawer : afficher les liens directement sans dropdown
    if (inDrawer) {
      return (
        <div className="nav-drawer__links" style={{ borderTop: "1px solid var(--border-light)", paddingTop: 8, marginTop: 8 }}>
          <Link href="/account" onClick={onNavigate}>{t("account")}</Link>
          <Link href="/my-tournaments" onClick={onNavigate}>{t("my_tournaments")}</Link>
          <Link href="/my-teams" onClick={onNavigate}>{t("my_teams")}</Link>
          <Link href="/settings/notifications" onClick={onNavigate}>{t("settings")}</Link>
          <button onClick={() => { onNavigate?.(); signOut({ callbackUrl: "/" }); }}>{t("logout")}</button>
        </div>
      );
    }

    return (
      <div className="avatar-wrapper" ref={wrapperRef}>
        <button
          className="avatar-btn"
          onClick={() => { if (open) closeDropdown(); else setOpen(true); }}
          aria-label="Menu utilisateur"
          aria-expanded={open}
        >
          {user.image ? (
            <Image
              src={user.image}
              alt={user.name ?? "avatar"}
              width={36}
              height={36}
              style={{ borderRadius: "50%", objectFit: "cover" }}
            />
          ) : (
            <span>{initials}</span>
          )}
        </button>

        {open && (
          <div className={`avatar-dropdown${closing ? " avatar-dropdown--closing" : ""}`}>
            <Link
              href="/account"
              onClick={() => { closeDropdown(); onNavigate?.(); }}
            >
              {t("account")}
            </Link>
            <Link
              href="/my-tournaments"
              onClick={() => { closeDropdown(); onNavigate?.(); }}
            >
              {t("my_tournaments")}
            </Link>
            <Link
              href="/my-teams"
              onClick={() => { closeDropdown(); onNavigate?.(); }}
            >
              {t("my_teams")}
            </Link>
            <Link
              href="/settings/notifications"
              onClick={() => { closeDropdown(); onNavigate?.(); }}
            >
              {t("settings")}
            </Link>
            <hr />
            <button
              onClick={() => {
                closeDropdown();
                onNavigate?.();
                signOut({ callbackUrl: "/" });
              }}
            >
              {t("logout")}
            </button>
          </div>
        )}
      </div>
    );
  }

  // Admin connecté (via code)
  if (data?.user?.role) {
    return (
      <div className="auth-status">
        <span className="pill">{data.user.role}</span>
        <button className="ghost" onClick={() => { onNavigate?.(); signOut({ callbackUrl: "/" }); }}>{t("logout")}</button>
      </div>
    );
  }

  // Non connecté
  return (
    <div className="auth-status">
      <Link href="/register" className="ghost" onClick={onNavigate}>{t("register")}</Link>
      <Link href="/login" className="primary" style={{ fontSize: 13 }} onClick={onNavigate}>{t("login")}</Link>
    </div>
  );
}
