"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

/**
 * Pastille « messages » du header : rend la messagerie visible (beaucoup ne savaient
 * pas qu'elle existait), avec le nombre de messages non lus.
 */
export function MessagesButton() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/direct-conversations/unread", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : { unread: 0 }))
        .then((j) => { if (alive) setUnread(Number(j.unread) || 0); })
        .catch(() => {});
    load();
    const id = setInterval(load, 30_000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => { alive = false; clearInterval(id); window.removeEventListener("focus", onFocus); };
  }, [pathname]);

  const label = unread > 0 ? `${t("messages")} (${unread})` : t("messages");
  return (
    <Link href="/messages" className="header-icon-btn" aria-label={label} title={label} style={{ position: "relative" }}>
      {/* Bulle de discussion ronde + « … » (tracé Lucide), au trait comme les autres pastilles */}
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
        <path d="M8 12h.01M12 12h.01M16 12h.01" strokeWidth="3" />
      </svg>
      {unread > 0 && <span className="header-icon-badge">{unread > 9 ? "9+" : unread}</span>}
    </Link>
  );
}
