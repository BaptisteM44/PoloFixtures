"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { PhotoViewer } from "@/components/PhotoViewer";
import type { HomeCamera, HomeRoll } from "@/lib/tournament-photos";

const SEEN_KEY = "roll_photos_seen";

function readSeen(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || "[]")); } catch { return new Set(); }
}
function writeSeen(seen: Set<string>) {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-1000))); } catch { /* navigation privée */ }
}

/**
 * Bandeau façon stories en haut de la home : d'abord l'appareil photo des
 * tournois où je joue en ce moment (raccourci vers l'onglet Pellicule), puis
 * les pellicules révélées récemment (★ = épinglée à la une). Un clic ouvre la
 * pellicule en mode story.
 */
export function HomeRollsBar({
  rolls, cameras, viewerId, isAdmin,
}: {
  rolls: HomeRoll[];
  cameras: HomeCamera[];
  viewerId: string | null;
  isAdmin: boolean;
}) {
  const t = useTranslations("photos");
  const router = useRouter();
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => { setSeen(readSeen()); }, []);
  const markSeen = useCallback((id: string) => {
    setSeen((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev); next.add(id); writeSeen(next); return next;
    });
  }, []);

  if (rolls.length === 0 && cameras.length === 0) return null;
  const openRoll = open !== null ? rolls[open] : null;
  const firstUnseen = (r: HomeRoll) => Math.max(0, r.photos.findIndex((p) => !seen.has(p.id)));

  return (
    <section className="stories-bar" aria-label={t("home_aria")}>
      <div className="stories-bar__scroller">
        {cameras.map((c) => (
          <Link key={c.tournamentId} href={`/tournament/${c.tournamentSlug ?? c.tournamentId}?tab=photos`} className="story-bubble" title={c.tournamentName}>
            <span className="story-bubble__ring story-bubble__ring--add">
              <span className="story-bubble__img story-bubble__img--add" aria-hidden>📷</span>
              <span className="story-bubble__badge">{c.remaining}</span>
            </span>
            <span className="story-bubble__label">{c.tournamentName}</span>
          </Link>
        ))}
        {rolls.map((r, i) => {
          const allSeen = r.photos.every((p) => seen.has(p.id));
          return (
            <button key={r.tournamentId} type="button" className="story-bubble" onClick={() => setOpen(i)} title={r.tournamentName}>
              <span className={`story-bubble__ring${r.pinned ? " story-bubble__ring--highlight" : ""}${allSeen ? " story-bubble__ring--seen" : ""}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="story-bubble__img" src={r.photos[0]?.imagePath} alt="" loading="lazy" />
              </span>
              <span className="story-bubble__label">
                {r.pinned && <span aria-hidden>★ </span>}{r.tournamentName}
              </span>
            </button>
          );
        })}
      </div>

      {openRoll && (
        <PhotoViewer
          key={openRoll.tournamentId}
          photos={openRoll.photos}
          start={firstUnseen(openRoll)}
          title={openRoll.tournamentName}
          link={{ href: `/tournament/${openRoll.tournamentSlug ?? openRoll.tournamentId}?tab=photos`, label: openRoll.tournamentName }}
          autoplay
          viewerId={viewerId}
          isAdmin={isAdmin}
          onSeen={markSeen}
          onClose={() => setOpen(null)}
          onChanged={() => router.refresh()}
        />
      )}
    </section>
  );
}
