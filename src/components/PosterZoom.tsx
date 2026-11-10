"use client";

/**
 * Affiche du tournoi : vignette dans l'en-tête ; au clic, elle grandit en
 * douceur depuis sa place jusqu'au centre de l'écran (animation « FLIP » avec
 * l'API d'animation du navigateur, pas de librairie), et y retourne à la
 * fermeture (clic n'importe où ou Échap). Sans animation si l'appareil
 * demande de réduire les mouvements.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";
const DURATION = 480;

export function PosterZoom({ src, alt, openLabel, closeLabel }: { src: string; alt: string; openLabel: string; closeLabel: string }) {
  const thumbRef = useRef<HTMLImageElement>(null);
  const bigRef = useRef<HTMLImageElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const closing = useRef(false);

  const reduceMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Transformation qui ramène la grande image exactement sur la vignette
  const fromThumb = () => {
    const thumb = thumbRef.current?.getBoundingClientRect();
    const big = bigRef.current?.getBoundingClientRect();
    if (!thumb || !big || !big.width) return null;
    const dx = thumb.left + thumb.width / 2 - (big.left + big.width / 2);
    const dy = thumb.top + thumb.height / 2 - (big.top + big.height / 2);
    return `translate(${dx}px, ${dy}px) scale(${thumb.width / big.width}, ${thumb.height / big.height})`;
  };

  // Ouverture : la grande image part de la vignette et grandit jusqu'au centre
  useLayoutEffect(() => {
    if (!open) return;
    const big = bigRef.current;
    const run = () => {
      const from = fromThumb();
      if (!big || !from || reduceMotion()) return;
      big.animate([{ transform: from, borderRadius: "10px" }, { transform: "none", borderRadius: "14px" }], { duration: DURATION, easing: EASE });
      backdropRef.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: DURATION * 0.8, easing: "ease-out" });
    };
    if (big?.complete) run();
    else big?.addEventListener("load", run, { once: true });
  }, [open]);

  const close = useCallback(() => {
    if (closing.current) return;
    const big = bigRef.current;
    const from = fromThumb();
    if (!big || !from || reduceMotion()) { setOpen(false); return; }
    closing.current = true;
    backdropRef.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: DURATION * 0.8, easing: "ease-in", fill: "forwards" });
    const anim = big.animate([{ transform: "none", borderRadius: "14px" }, { transform: from, borderRadius: "10px" }], { duration: DURATION * 0.85, easing: EASE, fill: "forwards" });
    anim.onfinish = () => { closing.current = false; setOpen(false); };
  }, []);

  // Échap pour fermer + pas de défilement de la page derrière
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open, close]);

  return (
    <>
      <button type="button" className="poster-zoom__thumb" onClick={() => setOpen(true)} aria-label={openLabel} title={openLabel}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img ref={thumbRef} src={src} alt={alt} style={{ visibility: open ? "hidden" : "visible" }} />
      </button>
      {open && (
        <div className="poster-zoom__overlay" role="dialog" aria-modal="true" aria-label={alt} onClick={close}>
          <div ref={backdropRef} className="poster-zoom__backdrop" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img ref={bigRef} src={src} alt={alt} className="poster-zoom__big" />
          {/* Croix dessinée (SVG) : parfaitement centrée, quelle que soit la police */}
          <button type="button" className="poster-zoom__close" onClick={close} aria-label={closeLabel}>
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>
          </button>
        </div>
      )}
    </>
  );
}
