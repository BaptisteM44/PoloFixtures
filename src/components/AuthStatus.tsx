"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";

export function AuthStatus() {
  const { data } = useSession();

  // Joueur connecté
  if (data?.user?.playerId) {
    return (
      <div className="auth-status">
        <Link href="/tournament/new" className="ghost" style={{ fontSize: 12 }}>+ Tournoi</Link>
        <Link href="/account" className="ghost">Mon compte</Link>
        <button className="ghost" onClick={() => signOut({ callbackUrl: "/" })}>Déco</button>
      </div>
    );
  }

  // Admin connecté (via code)
  if (data?.user?.role) {
    return (
      <div className="auth-status">
        <span className="pill">{data.user.role}</span>
        <button className="ghost" onClick={() => signOut({ callbackUrl: "/" })}>Déco</button>
      </div>
    );
  }

  // Non connecté
  return (
    <div className="auth-status">
      <Link href="/register" className="ghost">S&apos;inscrire</Link>
      <Link href="/login" className="primary" style={{ fontSize: 13 }}>Se connecter</Link>
    </div>
  );
}
