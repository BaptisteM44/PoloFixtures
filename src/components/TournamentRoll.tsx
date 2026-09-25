"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { PhotoViewer } from "@/components/PhotoViewer";
import type { RollPhase, RollPhoto } from "@/lib/tournament-photos";

type RollState = {
  phase: RollPhase;
  opensAt: string;
  revealAt: string;
  timezone: string | null;
  total: number;
  perPlayer: number;
  canShoot: boolean;
  remaining: number;
  mine: RollPhoto[];
  photos: RollPhoto[];
  pinned: boolean;
};

/**
 * Onglet « Pellicule » d'un tournoi : appareil jetable pendant le tournoi
 * (5 photos par participant, invisibles pour les autres), puis galerie après
 * la révélation (21h le dernier jour, heure du lieu).
 */
export function TournamentRoll({
  tournamentId, tournamentName, viewerId, isAdmin, isOrga,
}: {
  tournamentId: string;
  tournamentName: string;
  viewerId: string | null;
  isAdmin: boolean;
  isOrga: boolean;
}) {
  const t = useTranslations("photos");
  const locale = useLocale();
  const [state, setState] = useState<RollState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewer, setViewer] = useState<{ photos: RollPhoto[]; start: number } | null>(null);
  const [, setTick] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/tournaments/${tournamentId}/photos`, { cache: "no-store" });
    if (res.ok) setState(await res.json());
  }, [tournamentId]);
  useEffect(() => { load(); }, [load]);

  // Compte à rebours ; recharge au moment de la révélation.
  useEffect(() => {
    if (!state || state.phase === "revealed") return;
    const id = setInterval(() => {
      setTick((n) => n + 1);
      const target = Date.parse(state.phase === "before" ? state.opensAt : state.revealAt);
      if (Date.now() >= target) load();
    }, 30_000);
    return () => clearInterval(id);
  }, [state, load]);

  const fmt = (iso: string) => new Intl.DateTimeFormat(locale, {
    weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
    timeZone: state?.timezone || undefined,
  }).format(new Date(iso));

  const countdown = (iso: string) => {
    const mins = Math.max(0, Math.round((Date.parse(iso) - Date.now()) / 60000));
    const d = Math.floor(mins / 1440), h = Math.floor((mins % 1440) / 60), m = mins % 60;
    return d > 0 ? t("countdown_days", { d, h }) : h > 0 ? t("countdown_hours", { h, m }) : t("countdown_minutes", { m });
  };

  const shoot = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("folder", "tournament-photos");
      const up = await fetch("/api/upload", { method: "POST", body: form });
      if (!up.ok) { setError(up.status === 413 ? t("err_too_big") : up.status === 415 ? t("err_not_image") : t("error")); return; }
      const { path } = await up.json();
      const res = await fetch(`/api/tournaments/${tournamentId}/photos`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imagePath: path }),
      });
      if (!res.ok) {
        const code = res.headers.get("content-type")?.includes("json") ? (await res.json()).error : null;
        setError(code === "no_shots_left" ? t("err_no_shots") : code === "revealed" ? t("err_revealed") : code === "not_participant" ? t("err_not_participant") : t("error"));
        return;
      }
      await load();
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const removeMine = async (id: string) => {
    if (!confirm(t("confirm_delete_mine"))) return;
    await fetch(`/api/tournament-photos/${id}`, { method: "DELETE" });
    load();
  };

  const togglePin = async () => {
    if (!state) return;
    await fetch(`/api/tournaments/${tournamentId}/photos`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pinned: !state.pinned }),
    });
    load();
  };

  if (!state) return <div className="panel roll"><p className="meta">{t("loading")}</p></div>;

  return (
    <div className="panel roll">
      <div className="roll__head">
        <h2>📸 {t("title")}</h2>
        <p className="meta">{t("intro", { count: state.perPlayer })}</p>
      </div>

      {/* Avant le tournoi */}
      {state.phase === "before" && (
        <div className="roll__sealed">
          <span className="roll__sealed-icon" aria-hidden>🎞️</span>
          <p>{t("before", { opens: fmt(state.opensAt), reveal: fmt(state.revealAt) })}</p>
        </div>
      )}

      {/* Pendant : appareil (participants) + compteur (tout le monde) */}
      {state.phase === "shooting" && (
        <>
          <div className="roll__sealed">
            <span className="roll__sealed-icon" aria-hidden>🔒</span>
            <p>
              <strong>{t("sealed_count", { count: state.total })}</strong><br />
              {t("sealed_reveal", { when: fmt(state.revealAt), countdown: countdown(state.revealAt) })}
            </p>
          </div>

          {state.canShoot && (
            <div className="roll__camera">
              <div className="roll__shots" aria-label={t("shots_left", { count: state.remaining })}>
                {Array.from({ length: state.perPlayer }, (_, i) => (
                  <span key={i} className={`roll__shot${i < state.perPlayer - state.remaining ? " is-used" : ""}`} />
                ))}
              </div>
              <p className="roll__camera-text">{t("shots_left", { count: state.remaining })}</p>
              {state.remaining > 0 && (
                <label className={`primary roll__shoot${busy ? " is-busy" : ""}`}>
                  {busy ? t("developing") : `📷 ${t("shoot")}`}
                  <input ref={inputRef} type="file" accept="image/*" capture="environment" disabled={busy}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) shoot(f); }} />
                </label>
              )}
              {error && <p className="roll__error">{error}</p>}

              {state.mine.length > 0 && (
                <>
                  <p className="meta roll__mine-title">{t("mine_hint")}</p>
                  <div className="roll__mine">
                    {state.mine.map((p) => (
                      <div key={p.id} className="roll__thumb">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={p.imagePath} alt="" />
                        <button type="button" onClick={() => removeMine(p.id)} aria-label={t("delete")}>✕</button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
          {!state.canShoot && viewerId === null && <p className="meta">{t("login_to_shoot")}</p>}
        </>
      )}

      {/* Après la révélation : la galerie */}
      {state.phase === "revealed" && (
        <>
          {isAdmin && state.photos.length > 0 && (
            <button type="button" className="ghost roll__pin" onClick={togglePin}>
              ★ {state.pinned ? t("unpin") : t("pin")}
            </button>
          )}
          {state.photos.length === 0 ? (
            <p className="meta">{t("empty")}</p>
          ) : (
            <>
              <p className="meta">{t("revealed_count", { count: state.photos.length, authors: new Set(state.photos.map((p) => p.author.id)).size })}</p>
              <div className="roll__grid">
                {state.photos.map((p, i) => (
                  <button key={p.id} type="button" className="roll__cell" onClick={() => setViewer({ photos: state.photos, start: i })}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.imagePath} alt="" loading="lazy" />
                    <span className="roll__cell-author">{p.author.name}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {viewer && (
        <PhotoViewer
          photos={viewer.photos}
          start={viewer.start}
          title={tournamentName}
          viewerId={viewerId}
          isAdmin={isAdmin}
          canModerate={isOrga}
          onClose={() => setViewer(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}
