"use client";

import { useState, useTransition } from "react";
import ReactMarkdown from "react-markdown";
import { PokemonCard } from "@/components/PokemonCard";

type Team = { id: string; name: string } | null;

type Player = {
  id: string;
  name: string;
  teamName: string;
  country: string;
  city?: string | null;
  photoPath?: string | null;
  badges?: string[];
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
  const [isPending, startTransition] = useTransition();

  const [recapText, setRecapText]         = useState(tournament.recapText ?? "");
  const [podiumNote, setPodiumNote]       = useState(tournament.podiumNote ?? "");
  const [bannerCredit, setBannerCredit]   = useState(tournament.bannerCredit ?? "");
  const [recapAnecdote, setRecapAnecdote] = useState(tournament.recapAnecdote ?? "");
  const [mvpPlayerId, setMvpPlayerId]     = useState(tournament.mvpPlayerId ?? "");
  const [mvpTitle, setMvpTitle]           = useState(tournament.mvpTitle ?? "");
  const [editingMvpTitle, setEditingMvpTitle] = useState(false);
  const [mvpTitleDraft, setMvpTitleDraft] = useState(tournament.mvpTitle ?? "");

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

  const mvpPlayer = players.find((p) => p.id === mvpPlayerId) ?? null;

  // Podium order: 2nd left, 1st center (elevated), 3rd right
  const podiumSlots = [
    { place: "second" as const, medal: "🥈", rank: "#2", team: podium.second, height: 80 },
    { place: "first"  as const, medal: "🥇", rank: "#1", team: podium.first,  height: 110 },
    { place: "third"  as const, medal: "🥉", rank: "#3", team: podium.third,  height: 60 },
  ];

  return (
    <div className="recap-layout">

      {/* ═══ COLONNE GAUCHE : Podium + MVP ═══ */}
      <div className="recap-left">

        {/* Podium */}
        <div className="panel recap-podium-panel">
          <h3 className="recap-section__title">Podium</h3>

          {!podium.first && !podium.second ? (
            <p className="meta" style={{ textAlign: "center", padding: "24px 0" }}>Résultats non disponibles</p>
          ) : (
            <div className="recap-podium-stage">
              {podiumSlots.map(({ place, medal, rank, team, height }) => (
                <div key={place} className={`recap-stage-slot recap-stage-slot--${place}`}>
                  <div className="recap-stage-card">
                    <span className="recap-stage-medal">{medal}</span>
                    <strong className="recap-stage-team">{team?.name ?? "—"}</strong>
                  </div>
                  <div className="recap-stage-block" style={{ height }} />
                  <span className="recap-stage-rank">{rank}</span>
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
                    placeholder="Mention spéciale, remarque…"
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
                    {podiumNote || (isOrga && <span style={{ opacity: 0.4 }}>Ajouter une mention spéciale…</span>)}
                  </p>
                  {isOrga && (
                    <button className="ghost recap-edit-btn" onClick={() => setEditingNote(true)}>✎</button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Joueur·euse du tournoi */}
        <div className="panel" style={{ marginTop: 16 }}>
          {/* Intitulé */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            {editingMvpTitle ? (
              <>
                <input
                  type="text"
                  value={mvpTitleDraft}
                  onChange={(e) => setMvpTitleDraft(e.target.value)}
                  placeholder="Ex: MVP, Meilleur gardien…"
                  autoFocus
                  style={{ fontSize: 15, fontWeight: 700, flex: 1, fontFamily: "var(--font-display)" }}
                />
                <button className="primary" style={{ fontSize: 11, padding: "3px 10px" }}
                  onClick={() => {
                    setMvpTitle(mvpTitleDraft);
                    setEditingMvpTitle(false);
                    save({ mvpTitle: mvpTitleDraft || null });
                  }}
                  disabled={isPending}
                >OK</button>
                <button className="ghost" style={{ fontSize: 11, padding: "3px 10px" }}
                  onClick={() => { setEditingMvpTitle(false); setMvpTitleDraft(mvpTitle); }}
                >✕</button>
              </>
            ) : (
              <>
                <h3 className="recap-section__title" style={{ margin: 0, borderBottom: "none", paddingBottom: 0, flex: 1 }}>
                  ⭐ {mvpTitle || "Joueur·euse du tournoi"}
                </h3>
                {isOrga && (
                  <button className="ghost recap-edit-btn"
                    onClick={() => { setMvpTitleDraft(mvpTitle); setEditingMvpTitle(true); }}
                  >✎</button>
                )}
              </>
            )}
          </div>
          <div style={{ borderBottom: "2px solid var(--border)", marginBottom: 16 }} />

          {/* Sélecteur orga */}
          {isOrga && (
            <div style={{ marginBottom: mvpPlayer ? 16 : 0 }}>
              <select
                value={mvpPlayerId}
                onChange={(e) => {
                  setMvpPlayerId(e.target.value);
                  save({ mvpPlayerId: e.target.value || null });
                }}
                style={{ width: "100%", fontSize: 14, padding: "6px 10px" }}
                disabled={isPending}
              >
                <option value="">— Aucun sélectionné —</option>
                {players.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} ({p.teamName})</option>
                ))}
              </select>
            </div>
          )}

          {/* Carte Pokémon du MVP */}
          {mvpPlayer ? (
            <div className="recap-mvp-card-wrap">
              <PokemonCard
                name={mvpPlayer.name}
                country={mvpPlayer.country}
                city={mvpPlayer.city}
                photoPath={mvpPlayer.photoPath}
                badges={mvpPlayer.badges ?? []}
                startYear={mvpPlayer.startYear}
                hand={mvpPlayer.hand}
                gender={mvpPlayer.gender ?? undefined}
                showGender={mvpPlayer.showGender}
                metalBorder="gold"
              />
              <p className="meta" style={{ textAlign: "center", marginTop: 8, fontSize: 12 }}>
                {mvpPlayer.teamName}
              </p>
            </div>
          ) : !isOrga ? (
            <p className="meta" style={{ textAlign: "center", padding: "12px 0" }}>—</p>
          ) : null}
        </div>

      </div>

      {/* ═══ COLONNE DROITE : Affiche + Anecdote + Résumé ═══ */}
      <div className="recap-right">

        {/* Affiche */}
        {tournament.bannerPath && (
          <div className="panel recap-banner-panel">
            <img
              src={tournament.bannerPath}
              alt={tournament.name}
              className="recap-banner-img"
            />
            <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-muted)", textAlign: "right" }}>
              {editingCredit ? (
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="text"
                    value={bannerCredit}
                    onChange={(e) => setBannerCredit(e.target.value)}
                    placeholder="Crédit photo (ex: @pseudo)"
                    style={{ fontSize: 12, flex: 1 }}
                    autoFocus
                  />
                  <button className="primary" style={{ fontSize: 11, padding: "3px 8px" }}
                    onClick={() => { setEditingCredit(false); save({ bannerCredit }); }}
                    disabled={isPending}
                  >OK</button>
                  <button className="ghost" style={{ fontSize: 11, padding: "3px 8px" }}
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
                    <button className="ghost recap-edit-btn" style={{ marginLeft: 6 }} onClick={() => setEditingCredit(true)}>✎</button>
                  )}
                </span>
              ) : isOrga ? (
                <button className="ghost recap-edit-btn" onClick={() => setEditingCredit(true)}>+ Crédit photo</button>
              ) : null}
            </div>
          </div>
        )}

        {/* Anecdote / Remerciement */}
        <div className="panel" style={{ marginTop: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 className="recap-section__title" style={{ margin: 0 }}>Anecdote / Remerciement</h3>
            {isOrga && !editingAnecdote && (
              <button className="ghost recap-edit-btn" onClick={() => setEditingAnecdote(true)}>✎</button>
            )}
          </div>
          {editingAnecdote ? (
            <div>
              <textarea
                value={recapAnecdote}
                onChange={(e) => setRecapAnecdote(e.target.value)}
                placeholder="Ajouter une anecdote, un remerciement…"
                rows={4}
                autoFocus
                style={{ width: "100%", fontSize: 14, resize: "vertical", fontFamily: "monospace" }}
              />
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button className="primary" style={{ fontSize: 13, padding: "6px 16px" }}
                  onClick={() => { setEditingAnecdote(false); save({ recapAnecdote }); }}
                  disabled={isPending}
                >Enregistrer</button>
                <button className="ghost" style={{ fontSize: 13, padding: "6px 16px" }}
                  onClick={() => setEditingAnecdote(false)}
                >Annuler</button>
              </div>
            </div>
          ) : recapAnecdote ? (
            <div className="recap-text">
              <ReactMarkdown>{recapAnecdote}</ReactMarkdown>
            </div>
          ) : isOrga ? (
            <button className="ghost" style={{ width: "100%", padding: "20px 0", fontSize: 13, color: "var(--text-muted)" }}
              onClick={() => setEditingAnecdote(true)}
            >+ Ajouter une anecdote ou un remerciement</button>
          ) : null}
        </div>

        {/* Résumé du tournoi */}
        <div className="panel" style={{ marginTop: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 className="recap-section__title" style={{ margin: 0 }}>Résumé du tournoi</h3>
            {isOrga && !editingText && (
              <button className="ghost recap-edit-btn" onClick={() => setEditingText(true)}>✎</button>
            )}
          </div>
          {editingText ? (
            <div>
              <textarea
                value={recapText}
                onChange={(e) => setRecapText(e.target.value)}
                placeholder="Rédigez un résumé du tournoi (markdown supporté)…"
                rows={10}
                autoFocus
                style={{ width: "100%", fontSize: 14, resize: "vertical", fontFamily: "monospace" }}
              />
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button className="primary" style={{ fontSize: 13, padding: "6px 16px" }}
                  onClick={() => { setEditingText(false); save({ recapText }); }}
                  disabled={isPending}
                >Enregistrer</button>
                <button className="ghost" style={{ fontSize: 13, padding: "6px 16px" }}
                  onClick={() => setEditingText(false)}
                >Annuler</button>
              </div>
            </div>
          ) : recapText ? (
            <div className="recap-text">
              <ReactMarkdown>{recapText}</ReactMarkdown>
            </div>
          ) : isOrga ? (
            <button className="ghost" style={{ width: "100%", padding: "20px 0", fontSize: 13, color: "var(--text-muted)" }}
              onClick={() => setEditingText(true)}
            >+ Rédiger un résumé du tournoi</button>
          ) : null}
        </div>

      </div>
    </div>
  );
}
