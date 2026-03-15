"use client";

import { signOut, useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useRef, useState, useEffect } from "react";
import Image from "next/image";

function getInitials(name?: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name[0].toUpperCase();
}

export function AuthStatus({ onNavigate }: { onNavigate?: () => void } = {}) {
  const { data } = useSession();
  const t = useTranslations("nav");
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Joueur connecté → avatar dropdown
  if ((data?.user as any)?.playerId) {
    const user = data!.user!;
    const initials = getInitials(user.name);

    return (
      <div className="avatar-wrapper" ref={wrapperRef}>
        <button
          className="avatar-btn"
          onClick={() => setOpen((v) => !v)}
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
          <div className="avatar-dropdown">
            <Link
              href="/my-tournaments"
              onClick={() => { setOpen(false); onNavigate?.(); }}
            >
              {t("my_tournaments")}
            </Link>
            <Link
              href="/my-teams"
              onClick={() => { setOpen(false); onNavigate?.(); }}
            >
              {t("my_teams")}
            </Link>
            <Link
              href="/settings/notifications"
              onClick={() => { setOpen(false); onNavigate?.(); }}
            >
              {t("settings")}
            </Link>
            <hr />
            <button
              onClick={() => {
                setOpen(false);
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
