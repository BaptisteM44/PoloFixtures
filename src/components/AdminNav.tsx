"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/admin", label: "Vue d'ensemble" },
  { href: "/admin/players", label: "Joueurs" },
  { href: "/admin/clubs", label: "Clubs" },
  { href: "/admin/countries", label: "Pays" },
  { href: "/admin/settings", label: "Codes d'accès" }
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <div className="admin-nav">
      {links.map((l) => (
        <Link key={l.href} href={l.href} className={pathname === l.href ? "primary" : "ghost"} style={{ fontSize: 12 }}>
          {l.label}
        </Link>
      ))}
    </div>
  );
}
