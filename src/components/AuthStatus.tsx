"use client";

import { signOut, useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export function AuthStatus({ onNavigate }: { onNavigate?: () => void } = {}) {
  const { data } = useSession();
  const t = useTranslations("nav");

  // Joueur connecté
  if (data?.user?.playerId) {
    return (
      <div className="auth-status">
        <Link href="/account" className="ghost" onClick={onNavigate}>{t("account")}</Link>
        <button className="ghost" onClick={() => { onNavigate?.(); signOut({ callbackUrl: "/" }); }}>{t("logout")}</button>
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
