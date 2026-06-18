"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { useTranslations } from "next-intl";
import { PokemonCard } from "@/components/PokemonCard";

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
};

export function TournamentRecap({ tournament, podium, players, isOrga }: Props) {
  const t = useTranslations("recap");
  const [isPending, startTransition] = useTransition();

  const [recapText, setRecapText]         = useState(tournament.recapText ?? "");
  const [podiumNote, setPodiumNote]       = useState(tournament.podiumNote ?? "");
  const [bannerCredit, setBannerCredit]   = useState(tournament.bannerCredit ?? "");
  const [recapAnecdote, setRecapAnecdote] = useState(tournament.recapAnecdote ?? "");
  // mvpPlayerId stocke une liste CSV d'IDs ("id1,id2,id3") pour supporter plusieurs MVPs
  const parseIds = (s: string | null | undefined) => (s ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  const [mvpPlayerIds, setMvpPlayerIds]   = useState<string[]>(parseIds(tournament.mvpPlayerId));
  const [mvpOpen, setMvpOpen]             = useState(false);
  const [mvpTitle, setMvpTitle]           = useState(tournament.mvpTitle ?? "");
  const [editingMvpTitle, setEditingMvpTitle] = useState(false);
  const [mvpTitleDraft, setMvpTitleDraft] = useState(tournament.mvpTitle ?? "");

  const [photoFinishPath, setPhotoFinishPath]     = useState(tournament.photoFinishPath ?? "");
  const [photoFinishCredit, setPhotoFinishCredit] = useState(tournament.photoFinishCredit ?? "");
  const [editingPhotoCredit, setEditingPhotoCredit] = useState(false);
  const [uploadingPhoto, setUploadingPhoto]       = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [editingText, setEditingText]         = useState(false);
  const [editingNote, setEditingNote]         = useState(false);
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

  // Podium order: 1st top, 2nd middle, 3rd bottom — with increasing left indent
  const podiumSlots = [
    { place: "first"  as const, medal: "🥇", rank: "#1", team: podium.first  },
    { place: "second" as const, medal: "🥈", rank: "#2", team: podium.second },
    { place: "third"  as const, medal: "🥉", rank: "#3", team: podium.third  },
  ];

  return (
    <div className="recap-layout">

      {/* ═══ LIGNE 1 : Podium (compact) + Affiche portrait ═══ */}
      <div className="recap-top-row">
      <div className="panel recap-podium-panel">
        <h3 className="recap-section__title">Podium</h3>

        {!podium.first && !podium.second ? (
          <p className="meta" style={{ textAlign: "center", padding: "24px 0" }}>{t("no_results")}</p>
        ) : (
          <div className="recap-podium-stage">
            {podiumSlots.map(({ place, medal, team }) => (
              <div key={place} className={`recap-stage-slot recap-stage-slot--${place}`}>
                {/* Cartes flottant au-dessus de la marche */}
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
                        />
                      </Link>
                    </div>
                  ))}
                </div>
                {/* Marche colorée avec le nom de l'équipe */}
                <div className="recap-stage-step">
                  <strong className="recap-stage-team">{team?.name ?? "—"}</strong>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Note podium */}
        {(podiumNote || isOrga) && (
          <div className="recap-podium-note">
            {editingNote ? (
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <textarea
                  value={podiumNote}
                  onChange={(e) => setPodiumNote(e.target.value)}
                  placeholder={t("special_mention_placeholder")}
                  rows={2}
                  autoFocus
                  style={{ flex: 1, fontSize: 13, resize: "vertical" }}
                />
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <button className="primary" style={{ fontSize: 11, padding: "4px 10px" }}
                    onClick={() => { setEditingNote(false); save({ podiumNote }); }}
                    disabled={isPending}
                  >OK</button>
                  <button className="ghost" style={{ fontSize: 11, padding: "4px 10px" }}
                    onClick={() => setEditingNote(false)}
                  >✕</button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <p className="meta" style={{ flex: 1, fontStyle: "italic", margin: 0 }}>
                  {podiumNote || (isOrga && <span style={{ opacity: 0.4 }}>{t("add_special_mention")}</span>)}
                </p>
                {isOrga && (
                  <button className="ghost recap-edit-btn" onClick={() => setEditingNote(true)}>✎</button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

        {/* Affiche portrait */}
        {tournament.bannerPath && (
          <div className="recap-banner-panel panel">
            <img src={tournament.bannerPath} alt={tournament.name} className="recap-banner-img" />
            <div className="recap-banner-credit">
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
          </div>
        )}

      </div>{/* fin recap-top-row */}

      {/* ═══ LIGNE 2 : MVP (compact) + Photo finish (large) ═══ */}
      <div className="recap-middle-row">

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

          {/* Sélecteur orga : accordéon */}
          {isOrga && (
            <div style={{ marginBottom: 12 }}>
              <button
                className="recap-mvp-toggle"
                onClick={() => setMvpOpen((o) => !o)}
              >
                {mvpOpen ? t("mvp_close_selector") : t("mvp_open_selector")}
              </button>
            </div>
          )}

          {mvpOpen && isOrga && (
            <div style={{ marginBottom: 12 }}>
              <div className="recap-mvp-selector">
                {Object.entries(
                  players.reduce<Record<string, Player[]>>((acc, p) => {
                    (acc[p.teamName] ??= []).push(p);
                    return acc;
                  }, {})
                ).map(([teamName, teamPlayers]) => (
                  <div key={teamName} className="recap-mvp-selector__team">
                    <span className="recap-mvp-selector__team-name">{teamName}</span>
                    <div className="recap-mvp-selector__players">
                      {teamPlayers.map((p) => {
                        const checked = mvpPlayerIds.includes(p.id);
                        return (
                          <label key={p.id} className={`recap-mvp-selector__pill${checked ? " recap-mvp-selector__pill--on" : ""}`}>
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={isPending}
                              onChange={() => {
                                const next = checked
                                  ? mvpPlayerIds.filter((id) => id !== p.id)
                                  : [...mvpPlayerIds, p.id];
                                setMvpPlayerIds(next);
                                save({ mvpPlayerId: next.join(",") || null });
                              }}
                            />
                            {p.name}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

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
                      const res = await fetch("/api/upload", { method: "POST", body: fd });
                      if (!res.ok) {
                        const txt = await res.text();
                        throw new Error(txt || `Upload échoué (${res.status})`);
                      }
                      const json = await res.json();
                      const path = json?.path;
                      if (!path) throw new Error("Réponse d'upload invalide");
                      setPhotoFinishPath(path);
                      save({ photoFinishPath: path });
                    } catch (err: any) {
                      console.error("Upload photo finish failed:", err);
                      setUploadError(err?.message ?? "Erreur lors de l'upload");
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
              <img src={photoFinishPath} alt="Photo finish" className="recap-photo-img" />
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
                    const res = await fetch("/api/upload", { method: "POST", body: fd });
                    if (!res.ok) {
                      const txt = await res.text();
                      throw new Error(txt || `Upload échoué (${res.status})`);
                    }
                    const json = await res.json();
                    const path = json?.path;
                    if (!path) throw new Error("Réponse d'upload invalide");
                    setPhotoFinishPath(path);
                    save({ photoFinishPath: path });
                  } catch (err: any) {
                    console.error("Upload photo finish failed:", err);
                    setUploadError(err?.message ?? "Erreur lors de l'upload");
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

      </div>

      {/* ═══ LIGNE 3 : Anecdote + Résumé full width ═══ */}
      <div className="recap-bottom-row">

        {/* Anecdote / Remerciement */}
        <div className="panel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 className="recap-section__title" style={{ margin: 0 }}>{t("anecdote_title")}</h3>
            {isOrga && !editingAnecdote && (
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
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button className="primary" style={{ fontSize: 13, padding: "6px 16px" }}
                  onClick={() => { setEditingAnecdote(false); save({ recapAnecdote }); }}
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
          ) : isOrga ? (
            <button className="ghost" style={{ width: "100%", padding: "20px 0", fontSize: 13, color: "var(--text-muted)" }}
              onClick={() => setEditingAnecdote(true)}
            >{t("add_anecdote")}</button>
          ) : null}
        </div>

        {/* Résumé du tournoi */}
        <div className="panel" style={{ marginTop: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 className="recap-section__title" style={{ margin: 0 }}>{t("summary_title")}</h3>
            {isOrga && !editingText && (
              <button className="ghost recap-edit-btn" onClick={() => setEditingText(true)}>✎</button>
            )}
          </div>
          {editingText ? (
            <div>
              <textarea
                value={recapText}
                onChange={(e) => setRecapText(e.target.value)}
                placeholder={t("summary_placeholder")}
                rows={10}
                autoFocus
                style={{ width: "100%", fontSize: 14, resize: "vertical", fontFamily: "monospace" }}
              />
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button className="primary" style={{ fontSize: 13, padding: "6px 16px" }}
                  onClick={() => { setEditingText(false); save({ recapText }); }}
                  disabled={isPending}
                >{t("btn_save")}</button>
                <button className="ghost" style={{ fontSize: 13, padding: "6px 16px" }}
                  onClick={() => setEditingText(false)}
                >{t("btn_cancel")}</button>
              </div>
            </div>
          ) : recapText ? (
            <div className="recap-text">
              <ReactMarkdown>{recapText}</ReactMarkdown>
            </div>
          ) : isOrga ? (
            <button className="ghost" style={{ width: "100%", padding: "20px 0", fontSize: 13, color: "var(--text-muted)" }}
              onClick={() => setEditingText(true)}
            >{t("add_summary")}</button>
          ) : null}
        </div>

      </div>
    </div>
  );
}
