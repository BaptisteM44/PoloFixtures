"use client";

// usePathname de next-intl : chemin SANS préfixe de langue, comparable aux href
// (celui de next/navigation renvoie /fr/admin… et aucun onglet n'était actif).
import { Link, usePathname } from "@/i18n/navigation";
import { useTranslations } from "next-intl";

export function AdminNav() {
  const t = useTranslations("admin");
  const pathname = usePathname();

  const links = [
    { href: "/admin", label: t("nav_overview") },
    { href: "/admin/players", label: t("nav_players") },
    { href: "/admin/clubs", label: t("nav_clubs") },
    { href: "/admin/countries", label: t("nav_countries") },
    { href: "/admin/settings", label: t("nav_access_codes") },
    { href: "/admin/polls", label: `📊 ${t("nav_polls")}` },
    { href: "/admin/stories", label: `📸 ${t("nav_stories")}` },
    { href: "/admin/whbpc", label: "WHBPC" },
  ];

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
