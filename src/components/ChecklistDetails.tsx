"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";

/**
 * Wrapper <details> pour la checklist du dashboard orga : ouverte par défaut
 * sur grand écran (toujours visible, cf. CSS .edit-checklist-wrapper summary
 * display:none), repliée par défaut sur tablette et mobile où elle prend toute
 * la place à l'écran et cache le reste du dashboard.
 */
export function ChecklistDetails({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const t = useTranslations("checklist");

  useEffect(() => {
    if (ref.current) {
      ref.current.open = window.matchMedia("(min-width: 1101px)").matches;
    }
  }, []);

  return (
    <details className="edit-checklist-wrapper" ref={ref}>
      <summary>☑️ {t("title")}</summary>
      {children}
    </details>
  );
}
