"use client";

import Link from "next/link";
import { Fragment, useRef, useState, useEffect, useCallback } from "react";

export type TabItem = {
  label: string;
  value: string;
  href: string;
  /** Variante « groupée » : groupe d'usage (un séparateur est tracé entre deux groupes) */
  group?: string;
  /** Compteur affiché en petite pastille (équipes, agents libres…) */
  count?: number;
  /** Point rouge pulsé (Live pendant le tournoi) */
  live?: boolean;
};

// « 🔴 Live » → « Live » : la variante groupée n'utilise pas d'émojis
const stripEmoji = (s: string) => s.replace(/^[\p{Extended_Pictographic}\uFE0F\u200D\s]+/u, "");

export function Tabs({
  items,
  active,
  rightSlot,
  variant = "default",
}: {
  items: TabItem[];
  active: string;
  rightSlot?: React.ReactNode;
  /** « grouped » : groupes séparés, compteurs, onglet actif plein (page tournoi) */
  variant?: "default" | "grouped";
}) {
  const grouped = variant === "grouped";
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  // Détecte s'il reste des onglets à faire défiler à gauche/droite, pour
  // afficher les indices visuels (fondus + chevron). Sans ça, l'utilisateur ne
  // sait pas que la barre défile quand il y a beaucoup d'onglets.
  const update = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    setCanLeft(el.scrollLeft > 2);
    setCanRight(el.scrollLeft < maxScroll - 2);
  }, []);

  useEffect(() => {
    update();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [update, items.length]);

  // Amène l'onglet actif dans la vue au montage (utile si c'est le dernier).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const activeEl = el.querySelector<HTMLElement>(".tab.active");
    activeEl?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [active]);

  return (
    <div className={`tabs-bar${grouped ? " tabs-bar--grouped" : ""}`}>
      <div className={`tabs-scroll${canLeft ? " can-scroll-left" : ""}${canRight ? " can-scroll-right" : ""}`}>
        <div className="tabs" ref={scrollRef}>
          {items.map((tab, i) => (
            <Fragment key={tab.value}>
              {grouped && i > 0 && tab.group !== items[i - 1].group && <span className="tab-sep" aria-hidden />}
              <Link href={tab.href} scroll={false} className={`tab ${active === tab.value ? "active" : ""}${tab.live ? " tab--live" : ""}`}>
                {tab.live && <span className="tab-live-dot" aria-hidden />}
                {grouped ? stripEmoji(tab.label) : tab.label}
                {tab.count != null && <span className="tab-count">{tab.count}</span>}
              </Link>
            </Fragment>
          ))}
        </div>
        <span className="tabs-scroll-hint" aria-hidden>›</span>
      </div>
      {rightSlot && <div className="tabs-right-slot">{rightSlot}</div>}
    </div>
  );
}
