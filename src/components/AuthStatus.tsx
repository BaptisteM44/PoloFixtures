"use client";

import { signOut, useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export function AuthStatus() {
  const { data } = useSession();
  const t = useTranslations("nav");

  // Joueur connecté
  if (data?.user?.playerId) {
    return (
      <div className="auth-status">
        <Link href="/tournament/new" className="ghost" style={{ fontSize: 12 }}>+ Tournoi</Link>
        <Link href="/account" className="ghost">{t("account")}</Link>
        <button className="ghost" onClick={() => signOut({ callbackUrl: "/" })}>{t("logout")}</button>
      </div>
    );
  }

  // Admin connecté (via code)
  if (data?.user?.role) {
    return (
      <div className="auth-status">
        <span className="pill">{data.user.role}</span>
        <button className="ghost" onClick={() => signOut({ callbackUrl: "/" })}>{t("logout")}</button>
      </div>
    );
  }

  // Non connecté
  return (
    <div className="auth-status">
      <Link href="/register" className="ghost">{t("register")}</Link>
      <Link href="/login" className="primary" style={{ fontSize: 13 }}>{t("login")}</Link>
    </div>
  );
}
