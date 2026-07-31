"use client";

import { useEffect, useRef } from "react";

/**
 * Wrapper <details> pour la checklist du dashboard orga : ouverte par défaut
 * sur desktop (toujours visible, cf. CSS .edit-checklist-wrapper summary
 * display:none), repliée par défaut sur mobile où elle prend toute la place
 * à l'écran et cache le reste du dashboard.
 */
export function ChecklistDetails({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.open = window.matchMedia("(min-width: 769px)").matches;
    }
  }, []);

  return (
    <details className="edit-checklist-wrapper" ref={ref}>
      <summary>Checklist</summary>
      {children}
    </details>
  );
}
