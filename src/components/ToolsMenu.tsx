"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

/** Nombre de sondages ouverts qui me concernent et que je n'ai pas votés. */
export function usePendingPolls(enabled: boolean): number {
  const pathname = usePathname();
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!enabled) { setCount(0); return; }
    let cancelled = false;
    fetch("/api/polls/pending", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { count: 0 }))
      .then((d) => { if (!cancelled) setCount(Number(d.count) || 0); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [enabled, pathname]); // recompte après un vote / changement de page
  return count;
}

export function PendingBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return <span className="nav-badge">{count > 9 ? "9+" : count}</span>;
}

type ToolLink = { href: string; label: string; badge?: number };

export function useToolLinks(hasPlayer: boolean, pendingPolls: number): ToolLink[] {
  const t = useTranslations("nav");
  return [
    { href: "/polls", label: `📊 ${t("polls")}`, badge: pendingPolls },
    { href: "/labs", label: "🧪 Labs" },
    { href: "/overlay", label: `📺 ${t("overlay")}` },
    ...(hasPlayer ? [{ href: "/sandbox", label: `🛠️ ${t("sandbox")}` }] : []),
  ];
}

/** Menu déroulant « Outils » (desktop). */
export function ToolsMenu({ links, pending }: { links: ToolLink[]; pending: number }) {
  const t = useTranslations("nav");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <div className="nav-tools" ref={ref}>
      <button
        type="button"
        className="nav-tools__btn"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {t("tools")} <PendingBadge count={pending} /> <span aria-hidden style={{ fontSize: 9 }}>▾</span>
      </button>
      {open && (
        <div className="nav-tools__menu" role="menu">
          {links.map((l) => (
            <Link key={l.href} href={l.href} role="menuitem">
              {l.label} <PendingBadge count={l.badge ?? 0} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
