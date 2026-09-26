"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { PhotoViewer } from "@/components/PhotoViewer";
import type { GalleryPhase, GalleryPhoto } from "@/lib/tournament-photos";

type GalleryState = {
  phase: GalleryPhase;
  opensAt: string;
  endsAt: string;
  closesAt: string;
  timezone: string | null;
  perPlayer: number;
  loggedIn: boolean;
  participant: boolean;
  canAdd: boolean;
  remaining: number;
  moderator: boolean;
  photos: GalleryPhoto[];
  mine: GalleryPhoto[];
  pending: GalleryPhoto[];
  pinned: boolean;
};

/**
 * Onglet « Galerie » d'un tournoi : 5 photos par personne, visibles tout de
 * suite, ajoutables du 1er jour à 7 jours après la fin. Les participants et
 * l'orga publient directement ; une personne extérieure propose ses photos et
 * l'orga les valide ici même (encart « À valider »).
 */
export function TournamentGallery({
  tournamentId, tournamentName, viewerId, isAdmin,
}: {
  tournamentId: string;
  tournamentName: string;
  viewerId: string | null;
  isAdmin: boolean;
}) {
  const t = useTranslations("photos");
  const locale = useLocale();
  const [state, setState] = useState<GalleryState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [viewer, setViewer] = useState<{ photos: GalleryPhoto[]; start: number; pending?: boolean } | null>(null);
  const [moderating, setModerating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/tournaments/${tournamentId}/photos`, { cache: "no-store" });
    if (res.ok) setState(await res.json());
  }, [tournamentId]);
  useEffect(() => { load(); }, [load]);

  const fmt = (iso: string) => new Intl.DateTimeFormat(locale, {
    weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
    timeZone: state?.timezone || undefined,
  }).format(new Date(iso));
  const fmtDay = (iso: string) => new Intl.DateTimeFormat(locale, {
    day: "numeric", month: "long", timeZone: state?.timezone || undefined,
  }).format(new Date(iso));

  /** Envoie UNE photo ; renvoie un message d'erreur, ou null si tout va bien. */
  const uploadOne = async (file: File): Promise<string | null> => {
    const form = new FormData();
    form.append("file", file);
    form.append("folder", "tournament-photos");
    const up = await fetch("/api/upload", { method: "POST", body: form });
    if (!up.ok) return up.status === 413 ? t("err_too_big") : up.status === 415 ? t("err_not_image") : t("error");
    const { path } = await up.json();
    const res = await fetch(`/api/tournaments/${tournamentId}/photos`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imagePath: path }),
    });
    if (res.ok) return null;
    const code = res.headers.get("content-type")?.includes("json") ? (await res.json()).error : null;
    return code === "no_shots_left" ? t("err_no_shots") : code === "closed" ? t("err_closed") : t("error");
  };

  /** Photos prises sur le moment ou importées, plusieurs d'un coup (dans la limite des crédits). */
  const addPhotos = async (files: File[]) => {
    if (!state || files.length === 0) return;
    const batch = files.slice(0, state.remaining);
    setBusy(true);
    setError(null);
    setNotice(null);
    let sent = 0;
    try {
      for (let i = 0; i < batch.length; i++) {
        setProgress({ done: i + 1, total: batch.length });
        const err = await uploadOne(batch[i]);
        if (err) { setError(err); break; }
        sent++;
      }
      if (files.length > batch.length) setNotice(t("too_many", { count: batch.length }));
      else if (sent > 0 && !state.participant) setNotice(t("proposed_notice", { count: sent }));
      await load();
    } finally {
      setBusy(false);
      setProgress(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const removeMine = async (id: string) => {
    if (!confirm(t("confirm_delete_mine"))) return;
    await fetch(`/api/tournament-photos/${id}`, { method: "DELETE" });
    load();
  };

  const moderate = async (photoIds: string[], approve: boolean) => {
    if (!approve && !confirm(t(photoIds.length > 1 ? "confirm_reject_all" : "confirm_reject"))) return;
    setModerating(true);
    await fetch(`/api/tournaments/${tournamentId}/photos/moderate`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ photoIds, approve }),
    });
    setModerating(false);
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
  const authors = new Set(state.photos.map((p) => p.author.id)).size;

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
          <p>
            {t("before", { opens: fmt(state.opensAt) })}
            {state.participant && <><br /><strong>✅ {t("participant_before", { count: state.perPlayer })}</strong></>}
          </p>
        </div>
      )}

      {/* Validation des photos proposées (orga / admin) */}
      {state.moderator && state.pending.length > 0 && (
        <div className="roll__pending">
          <div className="roll__pending-head">
            <strong>⏳ {t("pending_title", { count: state.pending.length })}</strong>
            {state.pending.length > 1 && (
              <span style={{ display: "flex", gap: 6 }}>
                <button type="button" className="primary" disabled={moderating} onClick={() => moderate(state.pending.map((p) => p.id), true)}>
                  ✓ {t("approve_all")}
                </button>
                <button type="button" className="ghost" disabled={moderating} onClick={() => moderate(state.pending.map((p) => p.id), false)}>
                  {t("reject_all")}
                </button>
              </span>
            )}
          </div>
          <p className="meta" style={{ margin: 0 }}>{t("pending_hint")}</p>
          <div className="roll__grid">
            {state.pending.map((p, i) => (
              <div key={p.id} className="roll__cell roll__cell--pending">
                <button type="button" className="roll__cell-open" onClick={() => setViewer({ photos: state.pending, start: i, pending: true })} aria-label={p.author.name}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.imagePath} alt="" loading="lazy" />
                </button>
                <span className="roll__cell-author">{p.author.name}</span>
                <span className="roll__cell-actions">
                  <button type="button" disabled={moderating} onClick={() => moderate([p.id], true)} aria-label={t("approve")}>✓</button>
                  <button type="button" disabled={moderating} onClick={() => moderate([p.id], false)} aria-label={t("reject")}>✕</button>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ajouter mes photos (galerie ouverte) */}
      {state.phase === "open" && (
        <div className="roll__camera">
          {!state.loggedIn ? (
            <p className="roll__camera-text">{t("login_to_add")}</p>
          ) : (
            <>
              <div className="roll__shots" aria-label={t("shots_left", { count: state.remaining })}>
                {Array.from({ length: state.perPlayer }, (_, i) => (
                  <span key={i} className={`roll__shot${i < state.perPlayer - state.remaining ? " is-used" : ""}`} />
                ))}
              </div>
              <p className="roll__camera-text">{t("shots_left", { count: state.remaining })}</p>
              {state.remaining > 0 && (
                // Sans « capture » : le téléphone propose l'appareil photo OU la
                // galerie ; « multiple » permet d'en importer plusieurs d'un coup.
                <label className={`primary roll__shoot${busy ? " is-busy" : ""}`}>
                  {busy
                    ? (progress && progress.total > 1 ? t("uploading_n", progress) : t("developing"))
                    : `📷 ${state.participant ? t("shoot", { count: state.remaining }) : t("propose", { count: state.remaining })}`}
                  <input ref={inputRef} type="file" accept="image/*" multiple disabled={busy}
                    onChange={(e) => addPhotos(Array.from(e.target.files ?? []))} />
                </label>
              )}
              {state.remaining > 0 && !busy && (
                <p className="meta roll__hint">{state.participant ? t("shoot_hint") : t("propose_hint")}</p>
              )}
              {notice && <p className="roll__notice">{notice}</p>}
              {error && <p className="roll__error">{error}</p>}
              <p className="meta roll__hint">{t("open_until", { day: fmtDay(state.closesAt) })}</p>
            </>
          )}
        </div>
      )}

      {/* Mes photos (dont celles en attente de validation) */}
      {state.mine.length > 0 && (
        <div>
          <p className="meta roll__mine-title">{t("mine_title")}</p>
          <div className="roll__mine">
            {state.mine.map((p) => (
              <div key={p.id} className={`roll__thumb${p.pending ? " is-pending" : ""}`} title={p.pending ? t("pending_badge") : undefined}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.imagePath} alt="" />
                {p.pending && <span className="roll__thumb-badge">⏳</span>}
                <button type="button" onClick={() => removeMine(p.id)} aria-label={t("delete")}>✕</button>
              </div>
            ))}
          </div>
          {state.mine.some((p) => p.pending) && <p className="meta roll__hint">⏳ {t("pending_mine_hint")}</p>}
        </div>
      )}

      {/* La galerie */}
      {state.phase !== "before" && (
        <>
          <div className="roll__gallery-head">
            {state.photos.length > 0 && <p className="meta" style={{ margin: 0 }}>{t("gallery_count", { count: state.photos.length, authors })}</p>}
            {isAdmin && state.photos.length > 0 && (
              <button type="button" className="ghost roll__pin" onClick={togglePin}>★ {state.pinned ? t("unpin") : t("pin")}</button>
            )}
          </div>
          {state.photos.length === 0 ? (
            <p className="meta">{state.phase === "open" ? t("empty_open") : t("empty")}</p>
          ) : (
            <div className="roll__grid">
              {state.photos.map((p, i) => (
                <button key={p.id} type="button" className="roll__cell" onClick={() => setViewer({ photos: state.photos, start: i })}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.imagePath} alt="" loading="lazy" />
                  <span className="roll__cell-author">{p.author.name}</span>
                </button>
              ))}
            </div>
          )}
          {state.phase === "closed" && <p className="meta roll__hint">{t("closed_since", { day: fmtDay(state.closesAt) })}</p>}
        </>
      )}

      {viewer && (
        <PhotoViewer
          photos={viewer.photos}
          start={viewer.start}
          title={tournamentName}
          viewerId={viewerId}
          isAdmin={isAdmin}
          canModerate={state.moderator}
          reportable={!viewer.pending}
          onClose={() => setViewer(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}
