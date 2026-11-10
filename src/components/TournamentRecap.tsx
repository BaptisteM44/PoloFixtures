"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import ReactMarkdown from "react-markdown";
import { useTranslations } from "next-intl";
import { PokemonCard } from "@/components/PokemonCard";
import { postUpload } from "@/lib/upload-image";
import { RecapSharePanel } from "@/components/RecapSharePanel";

type PodiumPlayer = {
  id: string;
  name: string;
  country: string;
  city?: string | null;
  photoPath?: string | null;
  clubLogoPath?: string | null;
  clubName?: string | null;
  teamLogoPath?: string | null;
  badges?: string[];
  pinnedBadges?: string[];
  startYear?: number | null;
  hand?: string | null;
  gender?: "MALE" | "FEMALE" | "NON_BINARY" | "PREFER_NOT_SAY" | null;
  slug?: string | null;
};

type Team = { id: string; name: string; players?: PodiumPlayer[] } | null;

type Player = {
  id: string;
  name: string;
  teamName: string;
  country: string;
  city?: string | null;
  photoPath?: string | null;
  clubLogoPath?: string | null;
  clubName?: string | null;
  teamLogoPath?: string | null;
  badges?: string[];
  pinnedBadges?: string[];
  startYear?: number | null;
  hand?: string | null;
  gender?: "MALE" | "FEMALE" | "NON_BINARY" | "PREFER_NOT_SAY" | null;
  showGender?: boolean;
  slug?: string | null;
};

type Props = {
  tournament: {
    id: string;
    name: string;
    bannerPath: string | null;
    bannerCredit?: string | null;
    recapText: string | null;
    photoFinishPath: string | null;
    photoFinishCredit?: string | null;
    podiumNote: string | null;
    recapAnecdote?: string | null;
    mvpPlayerId?: string | null;
    mvpTitle?: string | null;
  };
  podium: { first: Team; second: Team; third: Team };
  players: Player[];
  isOrga: boolean;
  /** Image « résultat » à partager (à droite du podium) — absent sans podium. */
  share?: React.ComponentProps<typeof RecapSharePanel> | null;
  /** Classement final complet (tournois en étapes), placé à côté du petit mot */
  finalRanking?: React.ReactNode;
};

export function TournamentRecap({ tournament, podium, players, isOrga, share, finalRanking }: Props) {
  const t = useTranslations("recap");
  const [isPending, startTransition] = useTransition();

  const [recapText, setRecapText]         = useState(tournament.recapText ?? "");
  const [bannerCredit, setBannerCredit]   = useState(tournament.bannerCredit ?? "");
  // Un seul « petit mot » : on reprend l'ancien résumé s'il existait (champ recapText)
  const [recapAnecdote, setRecapAnecdote] = useState(
    [tournament.recapAnecdote, tournament.recapText, tournament.podiumNote].filter(Boolean).join("\n\n"),
  );
  // mvpPlayerId stocke une liste CSV d'IDs ("id1,id2,id3") pour supporter plusieurs MVPs
  const parseIds = (s: string | null | undefined) => (s ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  const [mvpPlayerIds, setMvpPlayerIds]   = useState<string[]>(parseIds(tournament.mvpPlayerId));
  const [mvpOpen, setMvpOpen]             = useState(false);
  const [mvpQuery, setMvpQuery]           = useState("");
  const [mvpTitle, setMvpTitle]           = useState(tournament.mvpTitle ?? "");
  const [editingMvpTitle, setEditingMvpTitle] = useState(false);
  const [mvpTitleDraft, setMvpTitleDraft] = useState(tournament.mvpTitle ?? "");

  const [photoFinishPath, setPhotoFinishPath]     = useState(tournament.photoFinishPath ?? "");
  const [photoFinishCredit, setPhotoFinishCredit] = useState(tournament.photoFinishCredit ?? "");
  const [editingPhotoCredit, setEditingPhotoCredit] = useState(false);
  const [uploadingPhoto, setUploadingPhoto]       = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [editingText, setEditingText]         = useState(false);
  const [editingCredit, setEditingCredit]     = useState(false);
  const [editingAnecdote, setEditingAnecdote] = useState(false);

  const api = `/api/tournaments/${tournament.id}/recap`;

  const save = (data: Record<string, string | null>) => {
    startTransition(async () => {
      await fetch(api, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    });
  };

  const mvpPlayers = mvpPlayerIds.map((id) => players.find((p) => p.id === id)).filter(Boolean) as Player[];
  // Ajoute / retire un·e MVP (plusieurs possibles) — enregistré tout de suite
  const toggleMvp = (id: string) => {
    const next = mvpPlayerIds.includes(id) ? mvpPlayerIds.filter((x) => x !== id) : [...mvpPlayerIds, id];
    setMvpPlayerIds(next);
    save({ mvpPlayerId: next.join(",") || null });
  };
  const fold = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  // Podium order: 1st top, 2nd middle, 3rd bottom — with increasing left indent
  const podiumSlots = [
    { place: "first"  as const, medal: "🥇", rank: "#1", team: podium.first  },
    { place: "second" as const, medal: "🥈", rank: "#2", team: podium.second },
    { place: "third"  as const, medal: "🥉", rank: "#3", team: podium.third  },
  ];

  // Affiche portrait (+ crédit) : à droite du podium, ou en bas à côté de l'anecdote quand l'image à partager prend sa place
  // L'affiche est dans l'en-tête du tournoi (avec son crédit) ; ici l'orga
  // garde juste de quoi renseigner / corriger le crédit photo.
  const posterCredit = tournament.bannerPath && isOrga ? (
    <div className="recap-banner-credit recap-poster-credit">
      <span className="recap-poster-credit__label">{t("poster_credit_label")}</span>
      {editingCredit ? (
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input
            type="text"
            value={bannerCredit}
            onChange={(e) => setBannerCredit(e.target.value)}
            placeholder={t("credit_placeholder")}
            style={{ fontSize: 11, flex: 1 }}
            autoFocus
          />
          <button className="primary" style={{ fontSize: 10, padding: "2px 7px" }}
            onClick={() => { setEditingCredit(false); save({ bannerCredit }); }}
            disabled={isPending}
          >OK</button>
          <button className="ghost" style={{ fontSize: 10, padding: "2px 7px" }}
            onClick={() => setEditingCredit(false)}
          >✕</button>
        </div>
      ) : bannerCredit ? (
        <span>
          📷{" "}
          {bannerCredit.startsWith("http") ? (
            <a href={bannerCredit} target="_blank" rel="noopener noreferrer">{bannerCredit}</a>
          ) : bannerCredit.startsWith("@") ? (
            <a href={`https://instagram.com/${bannerCredit.slice(1)}`} target="_blank" rel="noopener noreferrer">{bannerCredit}</a>
          ) : bannerCredit}
          {isOrga && (
            <button className="ghost recap-edit-btn" style={{ marginLeft: 4 }} onClick={() => setEditingCredit(true)}>✎</button>
          )}
        </span>
      ) : isOrga ? (
        <button className="ghost recap-edit-btn" onClick={() => setEditingCredit(true)}>{t("add_credit")}</button>
      ) : null}
    </div>
  ) : null;

  return (
    <div className="recap-layout">

      {/* ═══ LIGNE 1 : Podium (compact) + Affiche portrait ═══ */}
      <div className={`recap-top-row${share ? " recap-top-row--share" : ""}`}>
      <div className="panel recap-podium-panel">
        <h3 className="recap-section__title">Podium</h3>

        {!podium.first && !podium.second ? (
          <p className="meta" style={{ textAlign: "center", padding: "24px 0" }}>{t("no_results")}</p>
        ) : (
          <div className="recap-podium-stage">
            {podiumSlots.map(({ place, medal, team }) => (
              <div key={place} className={`recap-stage-slot recap-stage-slot--${place}`}>
                {/* Rang + nom de l'équipe, lisibles, au-dessus de ses cartes */}
                <div className="podium-head">
                  <span className="podium-head__rank">{place === "first" ? 1 : place === "second" ? 2 : 3}</span>
                  <strong className="podium-head__name">{team?.name ?? "—"}</strong>
                </div>
                <div className="recap-podium-cards">
                  {team?.players?.map((p) => (
                    <div key={p.id} className="recap-mini-card-wrap">
                      <Link href={`/player/${p.slug ?? p.id}`} style={{ textDecoration: "none" }}>
                        <PokemonCard
                          name={p.name}
                          country={p.country}
                          city={p.city}
                          photoPath={p.photoPath}
                          clubLogoPath={p.clubLogoPath}
                          clubName={p.clubName}
                          teamLogoPath={p.teamLogoPath}
                          badges={p.badges ?? []}
                          pinnedBadges={p.pinnedBadges}
                          startYear={p.startYear}
                          hand={p.hand}
                          gender={p.gender ?? undefined}
                          metalBorder={place === "first" ? "gold" : place === "second" ? "silver" : "bronze"}
                          disableScrollTilt
                        />
                      </Link>
                    </div>
                  ))}
                </div>
                {/* Marche colorée (hauteur selon le rang) avec la médaille */}
                <div className="recap-stage-step" aria-hidden>
                  <span className="recap-stage-medal">{medal}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {posterCredit}
      </div>

        {/* Colonne de droite : l'image à partager */}
        {share && (
          <div className="recap-side recap-side--share">
            <RecapSharePanel {...share} />
          </div>
        )}

      </div>{/* fin recap-top-row */}

      {/* ═══ LIGNE 2 : MVP (compact) + Photo finish (large) ═══ */}
      {/* Classement final à gauche ; MVP, photo finish et petit mot empilés à droite */}
      <div className={`recap-lower${finalRanking ? " recap-lower--ranked" : ""}`}>
        {finalRanking}
        <div className="recap-lower__stack">

        {/* MVP */}
        <div className="panel recap-mvp-panel">
          {/* Titre + bouton edit titre (orga) */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            {editingMvpTitle ? (
              <>
                <input
                  type="text"
                  value={mvpTitleDraft}
                  onChange={(e) => setMvpTitleDraft(e.target.value)}
                  placeholder={t("mvp_title_placeholder")}
                  autoFocus
                  style={{ fontSize: 14, fontWeight: 700, flex: 1, fontFamily: "var(--font-display)" }}
                />
                <button className="primary" style={{ fontSize: 11, padding: "3px 10px" }}
                  onClick={() => { setMvpTitle(mvpTitleDraft); setEditingMvpTitle(false); save({ mvpTitle: mvpTitleDraft || null }); }}
                  disabled={isPending}
                >OK</button>
                <button className="ghost" style={{ fontSize: 11, padding: "3px 10px" }}
                  onClick={() => { setEditingMvpTitle(false); setMvpTitleDraft(mvpTitle); }}
                >✕</button>
              </>
            ) : (
              <>
                <h3 className="recap-section__title" style={{ margin: 0, flex: 1 }}>
                  ⭐ {mvpTitle || t("mvp_default_title")}
                </h3>
                {isOrga && (
                  <button className="ghost recap-edit-btn"
                    onClick={() => { setMvpTitleDraft(mvpTitle); setEditingMvpTitle(true); }}
                  >✎</button>
                )}
              </>
            )}
          </div>

          {/* Orga : à quoi ça sert + bouton pour choisir (plusieurs possibles) */}
          {isOrga && !mvpOpen && (
            <div className="recap-mvp-orga">
              <p className="recap-mvp-hint">{t("mvp_hint")}</p>
              <button className="recap-mvp-toggle" onClick={() => setMvpOpen(true)}>
                {mvpPlayers.length > 0 ? `✎ ${t("mvp_edit_btn")}` : `＋ ${t("mvp_choose_btn")}`}
              </button>
            </div>
          )}

          {isOrga && mvpOpen && (() => {
            const q = fold(mvpQuery.trim());
            const byTeam = Object.entries(
              players.reduce<Record<string, Player[]>>((acc, p) => {
                if (!q || fold(p.name).includes(q) || fold(p.teamName).includes(q)) (acc[p.teamName] ??= []).push(p);
                return acc;
              }, {})
            );
            return (
              <div className="recap-mvp-selector">
                <div className="recap-mvp-selector__top">
                  <input
                    type="search"
                    className="form-input"
                    value={mvpQuery}
                    onChange={(e) => setMvpQuery(e.target.value)}
                    placeholder={t("mvp_search")}
                    autoFocus
                  />
                  <button className="primary" onClick={() => { setMvpOpen(false); setMvpQuery(""); }}>{t("mvp_done")}</button>
                </div>
                <p className="recap-mvp-selector__status">
                  {t("mvp_selected_count", { count: mvpPlayerIds.length })} · {isPending ? "…" : t("mvp_autosave")}
                </p>
                {mvpPlayers.length > 0 && (
                  <div className="recap-mvp-selector__chips">
                    {mvpPlayers.map((p) => (
                      <button key={p.id} type="button" className="recap-mvp-chip" onClick={() => toggleMvp(p.id)} disabled={isPending} title={t("mvp_remove")}>
                        ⭐ {p.name} <span aria-hidden>✕</span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="recap-mvp-selector__list">
                  {byTeam.length === 0 && <p className="meta" style={{ margin: 0, fontSize: 12 }}>{t("mvp_no_match")}</p>}
                  {byTeam.map(([teamName, teamPlayers]) => (
                    <div key={teamName} className="recap-mvp-selector__team">
                      <span className="recap-mvp-selector__team-name">{teamName}</span>
                      <div className="recap-mvp-selector__players">
                        {teamPlayers.map((p) => {
                          const checked = mvpPlayerIds.includes(p.id);
                          return (
                            <button key={p.id} type="button" aria-pressed={checked} disabled={isPending}
                              className={`recap-mvp-selector__pill${checked ? " recap-mvp-selector__pill--on" : ""}`}
                              onClick={() => toggleMvp(p.id)}>
                              {checked ? "✓ " : "+ "}{p.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Cartes Pokémon des MVPs — toujours visibles */}
          {mvpPlayers.length > 0 ? (
            <div className="recap-mvp-cards-row">
              {mvpPlayers.map((p) => (
                <div key={p.id} className="recap-mvp-mini-wrap">
                  <Link href={`/player/${p.slug ?? p.id}`} style={{ textDecoration: "none" }}>
                    <PokemonCard
                      name={p.name}
                      country={p.country}
                      city={p.city}
                      photoPath={p.photoPath}
                      clubLogoPath={p.clubLogoPath}
                      clubName={p.clubName}
                      teamLogoPath={p.teamLogoPath}
                      badges={p.badges ?? []}
                      pinnedBadges={p.pinnedBadges}
                      startYear={p.startYear}
                      hand={p.hand}
                      gender={p.gender ?? undefined}
                      showGender={p.showGender}
                      metalBorder="gold"
                      disableScrollTilt
                    />
                  </Link>
                </div>
              ))}
            </div>
          ) : !isOrga ? (
            <p className="meta" style={{ textAlign: "center", padding: "12px 0" }}>—</p>
          ) : null}
        </div>

        {/* Photo finish */}
        <div className="panel recap-photo-panel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <h3 className="recap-section__title" style={{ margin: 0 }}>📸 Photo finish</h3>
            {isOrga && photoFinishPath && (
              <label className="ghost recap-edit-btn" style={{ cursor: "pointer" }}>
                ✎
                <input type="file" accept="image/*" style={{ display: "none" }} disabled={uploadingPhoto}
                  onChange={async (e) => {
                    const f = e.target.files?.[0]; if (!f) return;
                    setUploadingPhoto(true);
                    setUploadError(null);
                    try {
                      const fd = new FormData(); fd.append("file", f); fd.append("folder", "photo-finish");
                      const res = await postUpload(fd);
                      if (!res.ok) {
                        const txt = await res.text();
                        throw new Error(txt || t("upload_failed", { status: res.status }));
                      }
                      const json = await res.json();
                      const path = json?.path;
                      if (!path) throw new Error(t("upload_invalid_response"));
                      setPhotoFinishPath(path);
                      save({ photoFinishPath: path });
                    } catch (err: any) {
                      console.error("Upload photo finish failed:", err);
                      setUploadError(err?.message ?? t("upload_generic_error"));
                    } finally {
                      setUploadingPhoto(false);
                    }
                  }}
                />
              </label>
            )}
          </div>
          {photoFinishPath ? (
            <>
              <Image
                src={photoFinishPath}
                alt="Photo finish"
                width={1200}
                height={480}
                className="recap-photo-img"
                style={{ width: "100%", height: "auto" }}
              />
              <div className="recap-banner-credit">
                {editingPhotoCredit ? (
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <input
                      type="text"
                      value={photoFinishCredit}
                      onChange={(e) => setPhotoFinishCredit(e.target.value)}
                      placeholder={t("credit_placeholder")}
                      style={{ fontSize: 11, flex: 1 }}
                      autoFocus
                    />
                    <button className="primary" style={{ fontSize: 10, padding: "2px 7px" }}
                      onClick={() => { setEditingPhotoCredit(false); save({ photoFinishCredit }); }}
                      disabled={isPending}
                    >OK</button>
                    <button className="ghost" style={{ fontSize: 10, padding: "2px 7px" }}
                      onClick={() => setEditingPhotoCredit(false)}
                    >✕</button>
                  </div>
                ) : photoFinishCredit ? (
                  <span>
                    📷{" "}
                    {photoFinishCredit.startsWith("http") ? (
                      <a href={photoFinishCredit} target="_blank" rel="noopener noreferrer">{photoFinishCredit}</a>
                    ) : photoFinishCredit.startsWith("@") ? (
                      <a href={`https://instagram.com/${photoFinishCredit.slice(1)}`} target="_blank" rel="noopener noreferrer">{photoFinishCredit}</a>
                    ) : photoFinishCredit}
                    {isOrga && (
                      <button className="ghost recap-edit-btn" style={{ marginLeft: 4 }} onClick={() => setEditingPhotoCredit(true)}>✎</button>
                    )}
                  </span>
                ) : isOrga ? (
                  <button className="ghost recap-edit-btn" onClick={() => setEditingPhotoCredit(true)}>{t("add_credit")}</button>
                ) : null}
              </div>
            </>
          ) : isOrga ? (
            <label className="recap-upload-zone">
              {uploadingPhoto ? t("uploading") : t("add_photo_finish")}
              <input type="file" accept="image/*" style={{ display: "none" }} disabled={uploadingPhoto}
                onChange={async (e) => {
                  const f = e.target.files?.[0]; if (!f) return;
                  setUploadingPhoto(true);
                  setUploadError(null);
                  try {
                    const fd = new FormData(); fd.append("file", f); fd.append("folder", "photo-finish");
                    const res = await postUpload(fd);
                    if (!res.ok) {
                      const txt = await res.text();
                      throw new Error(txt || t("upload_failed", { status: res.status }));
                    }
                    const json = await res.json();
                    const path = json?.path;
                    if (!path) throw new Error(t("upload_invalid_response"));
                    setPhotoFinishPath(path);
                    save({ photoFinishPath: path });
                  } catch (err: any) {
                    console.error("Upload photo finish failed:", err);
                    setUploadError(err?.message ?? t("upload_generic_error"));
                  } finally {
                    setUploadingPhoto(false);
                  }
                }}
              />
            </label>
              ) : null}
              {uploadError && (
                <p style={{ color: "var(--danger)", marginTop: 8, fontSize: 13 }}>{t("upload_error", { error: uploadError })}</p>
              )}
        </div>


        {/* ═══ Petit mot : même grille que MVP / photo finish ═══ */}
        {(recapAnecdote || isOrga) && (
        <div className="panel recap-notes">
          <div className="recap-note__head">
            <h3 className="recap-note__title">{t("anecdote_title")}</h3>
            {isOrga && !editingAnecdote && recapAnecdote && (
              <button className="ghost recap-edit-btn" onClick={() => setEditingAnecdote(true)}>✎</button>
            )}
          </div>
          {editingAnecdote ? (
            <div>
              <textarea
                value={recapAnecdote}
                onChange={(e) => setRecapAnecdote(e.target.value)}
                placeholder={t("anecdote_placeholder")}
                rows={4}
                autoFocus
                style={{ width: "100%", fontSize: 14, resize: "vertical", fontFamily: "monospace" }}
              />
              <div className="recap-note__actions">
                <button className="primary" style={{ fontSize: 13, padding: "6px 16px" }}
                  onClick={() => { setEditingAnecdote(false); save({ recapAnecdote, recapText: null, podiumNote: null }); }}
                  disabled={isPending}
                >{t("btn_save")}</button>
                <button className="ghost" style={{ fontSize: 13, padding: "6px 16px" }}
                  onClick={() => setEditingAnecdote(false)}
                >{t("btn_cancel")}</button>
              </div>
            </div>
          ) : recapAnecdote ? (
            <div className="recap-text">
              <ReactMarkdown>{recapAnecdote}</ReactMarkdown>
            </div>
          ) : (
            <button className="ghost recap-note__add" onClick={() => setEditingAnecdote(true)}>{t("add_anecdote")}</button>
          )}
        </div>
        )}

        </div>
      </div>
    </div>
  );
}
