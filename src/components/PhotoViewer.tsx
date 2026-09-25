"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { RollPhoto } from "@/lib/tournament-photos";

const AUTOPLAY_MS = 5000;

/**
 * Visionneuse plein écran d'une pellicule. `autoplay` : défilement façon story
 * (barres de progression) ; sinon navigation manuelle (galerie). Tap tiers
 * gauche = précédente, reste = suivante, appui long = pause, clavier ← → Échap.
 */
export function PhotoViewer({
  photos, start = 0, title, link, autoplay = false, viewerId, isAdmin = false, canModerate = false,
  onSeen, onClose, onChanged,
}: {
  photos: RollPhoto[];
  start?: number;
  title: string;
  link?: { href: string; label: string };
  autoplay?: boolean;
  viewerId: string | null;
  isAdmin?: boolean;
  /** Orga du tournoi : peut retirer une photo révélée. */
  canModerate?: boolean;
  onSeen?: (id: string) => void;
  onClose: () => void;
  /** Après suppression : recharger la pellicule. */
  onChanged?: () => void;
}) {
  const t = useTranslations("photos");
  const [index, setIndex] = useState(Math.min(start, photos.length - 1));
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [restart, setRestart] = useState(0); // relance la 1re photo depuis le début
  const holdRef = useRef(false);
  // Avancement lu par la minuterie (une ref : jamais de valeur périmée).
  const progressRef = useRef(0);
  const indexRef = useRef(index);
  indexRef.current = index;

  const photo = photos[index];

  const next = useCallback(() => {
    if (indexRef.current + 1 < photos.length) setIndex(indexRef.current + 1);
    else if (autoplay) onClose();
  }, [photos.length, autoplay, onClose]);
  const prev = useCallback(() => {
    if (indexRef.current > 0) setIndex(indexRef.current - 1);
    else setRestart((r) => r + 1);
  }, []);

  // Déclarés AVANT la minuterie : la remise à zéro est vue par elle.
  useEffect(() => { progressRef.current = 0; setProgress(0); setLoaded(false); setNotice(null); }, [index]);
  useEffect(() => { progressRef.current = 0; setProgress(0); }, [restart]);
  useEffect(() => { if (photo && loaded) onSeen?.(photo.id); }, [photo, loaded, onSeen]);

  // Minuterie du mode story.
  useEffect(() => {
    if (!autoplay || !loaded || paused || notice) return;
    const startedAt = performance.now() - progressRef.current * AUTOPLAY_MS;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min((now - startedAt) / AUTOPLAY_MS, 1);
      progressRef.current = p;
      setProgress(p);
      if (p >= 1) { next(); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [autoplay, loaded, paused, notice, index, restart, next]);

  // Clavier + blocage du scroll de la page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === " " && autoplay) { e.preventDefault(); setPaused((v) => !v); }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = overflow; };
  }, [next, prev, onClose, autoplay]);

  if (!photo) return null;
  const isMine = photo.author.id === viewerId;

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button, a")) return;
    holdRef.current = false;
    const timer = setTimeout(() => { holdRef.current = true; setPaused(true); }, 220);
    const up = (ev: PointerEvent) => {
      clearTimeout(timer);
      window.removeEventListener("pointerup", up);
      if (holdRef.current) { setPaused(false); return; }
      const rect = (document.querySelector(".story-viewer__frame") as HTMLElement | null)?.getBoundingClientRect();
      if (rect && ev.clientX < rect.left + rect.width / 3) prev(); else next();
    };
    window.addEventListener("pointerup", up);
  };

  const act = async (res: Response, done: string) => {
    if (!res.ok) {
      const code = res.headers.get("content-type")?.includes("json") ? (await res.json()).error : null;
      setNotice(code === "already_reported" ? t("already_reported") : t("error"));
      return false;
    }
    setNotice(done);
    return true;
  };
  const remove = async () => {
    if (!confirm(t("confirm_delete"))) return;
    setPaused(true);
    if (await act(await fetch(`/api/tournament-photos/${photo.id}`, { method: "DELETE" }), t("deleted"))) {
      onChanged?.();
      setTimeout(onClose, 700);
    }
  };
  const report = async () => {
    if (!confirm(t("confirm_report"))) return;
    setPaused(true);
    await act(await fetch(`/api/tournament-photos/${photo.id}/report`, { method: "POST" }), t("reported"));
  };

  return (
    <div className="story-viewer" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="story-viewer__frame" onPointerDown={onPointerDown}>
        {autoplay ? (
          <div className="story-viewer__bars">
            {photos.map((p, i) => (
              <span key={p.id} className="story-viewer__bar">
                <span style={{ width: `${i < index ? 100 : i === index ? progress * 100 : 0}%` }} />
              </span>
            ))}
          </div>
        ) : (
          <div className="story-viewer__counter">{index + 1} / {photos.length}</div>
        )}

        <header className="story-viewer__head">
          <Link href={photo.author.slug ? `/player/${photo.author.slug}` : "#"} className="story-viewer__author" onClick={onClose}>
            {photo.author.photoPath
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={photo.author.photoPath} alt="" />
              : <span className="story-viewer__initial">{photo.author.name.slice(0, 1).toUpperCase()}</span>}
            <span>
              <strong>{photo.author.name}</strong>
              <small>📸 {title}</small>
            </span>
          </Link>
          <div className="story-viewer__tools">
            {autoplay && (
              <button type="button" onClick={() => setPaused((v) => !v)} aria-label={paused ? t("play") : t("pause")}>{paused ? "▶" : "❚❚"}</button>
            )}
            <button type="button" onClick={onClose} aria-label={t("close")}>✕</button>
          </div>
        </header>

        {!loaded && <div className="story-viewer__spinner" aria-hidden />}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img key={photo.id} className="story-viewer__img" src={photo.imagePath} alt="" onLoad={() => setLoaded(true)} onError={() => setLoaded(true)} draggable={false} />

        <footer className="story-viewer__foot">
          {link && <Link href={link.href} className="story-viewer__chip" onClick={onClose}>🏆 {link.label} →</Link>}
          {notice && <p className="story-viewer__notice">{notice}</p>}
          <div className="story-viewer__actions">
            {(isMine || isAdmin || canModerate) && <button type="button" onClick={remove}>🗑 {t("delete")}</button>}
            {viewerId && !isMine && <button type="button" onClick={report}>⚠ {t("report")}</button>}
          </div>
        </footer>
      </div>
    </div>
  );
}
