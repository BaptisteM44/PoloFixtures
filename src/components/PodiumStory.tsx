"use client";

/**
 * Image « podium » à partager en story (1080×1920) à la fin d'un tournoi.
 * Rendue en DOM à 360×640 puis capturée ×3 (modern-screenshot), comme les
 * cartes. On met en avant UNE équipe au choix (la sienne, même 7e) en vraies
 * cartes joueur, avec son rang, puis le podium en dessous — et l'adresse du
 * site bien visible pour ramener du monde.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { domToBlob } from "modern-screenshot";
import { PlayerCollectibleCard } from "./PlayerCollectibleCard";
import { fetchViaProxy } from "./ShareCardButton";

export type PodiumPlayer = React.ComponentProps<typeof PlayerCollectibleCard> & { id: string };
export type PodiumTeam = { id: string; name: string; color: string | null; rank: number | null; players: PodiumPlayer[] };

type Props = {
  tournamentName: string;
  place: string;      // « Lille, France »
  dates: string;      // « 8 – 9 nov. 2026 »
  teamCount: number;
  teams: PodiumTeam[];
  /** Équipes 1re, 2e, 3e (ids) */
  podiumIds: string[];
  /** Équipe mise en avant au départ (celle du joueur connecté, sinon la gagnante) */
  defaultTeamId: string;
  /** Chemin public des résultats, ex. « /fr/tournament/lille-2026?tab=recap » */
  resultsPath: string;
};

const CARD_W = 340, CARD_H = 520;
const RANK_BG: Record<number, string> = { 1: "var(--yellow, #fffc8a)", 2: "var(--teal, #60c9cf)", 3: "var(--pink, #ffa2af)" };

function cardProps({ id: _id, ...rest }: PodiumPlayer) {
  return rest;
}

function initials(name: string) {
  return name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

const ordinal = (n: number) => (n === 1 ? "1er" : `${n}e`);

function Avatar({ p }: { p: PodiumPlayer }) {
  return p.photoPath
    // eslint-disable-next-line @next/next/no-img-element
    ? <img className="pds-avatar" src={p.photoPath} alt={p.name} />
    : <span className="pds-avatar pds-avatar--empty">{initials(p.name)}</span>;
}

export function PodiumStory(props: Props) {
  const { tournamentName, place, dates, teamCount, teams, podiumIds, defaultTeamId, resultsPath } = props;
  const storyRef = useRef<HTMLDivElement>(null);
  const [host, setHost] = useState("poloperator.app");
  const [teamId, setTeamId] = useState(defaultTeamId);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setHost(window.location.host.replace(/^www\./, "")); }, []);

  const featured = teams.find((t) => t.id === teamId) ?? teams[0];
  const podium = podiumIds.map((id) => teams.find((t) => t.id === id)).filter((t): t is PodiumTeam => !!t);
  const players = featured?.players ?? [];
  // Cartes en éventail : taille selon le nombre de joueurs de l'équipe
  const scale = players.length >= 4 ? 0.25 : players.length === 3 ? 0.29 : 0.34;

  const capture = useCallback(async () => {
    if (!storyRef.current) return null;
    return domToBlob(storyRef.current, { scale: 3, fetchFn: fetchViaProxy, timeout: 20000, backgroundColor: "#fcfbf5" });
  }, []);

  async function handlePreview() {
    setBusy(true); setError(null);
    try {
      const blob = await capture();
      if (!blob) throw new Error("capture vide");
      setPreview((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(blob); });
    } catch (e) {
      console.error(e); setError("La capture a échoué (voir console).");
    } finally { setBusy(false); }
  }

  async function handleShare() {
    setBusy(true); setError(null);
    try {
      const blob = await capture();
      if (!blob) throw new Error("capture vide");
      const file = new File([blob], `${tournamentName.replace(/\s+/g, "-")}-${featured.name.replace(/\s+/g, "-")}.png`, { type: "image/png" });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: tournamentName });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = file.name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") { console.error(e); setError("Le partage a échoué (voir console)."); }
    } finally { setBusy(false); }
  }

  if (!featured) return null;

  return (
    <div className="pds-wrap">
      <div className="pds-col">
        <span className="pds-caption">Rendu en direct (DOM)</span>
        <div ref={storyRef} className="pds">
          <div className="pds-head">
            <span className="pds-kicker"><span>🏆</span><span>Résultats</span></span>
            <h2 className="pds-title">{tournamentName}</h2>
            <span className="pds-meta">{place} · {dates}</span>
          </div>

          {/* L'équipe mise en avant, en vraies cartes */}
          <div className="pds-featured" style={{ ["--team" as string]: featured.color ?? "var(--yellow, #fffc8a)" }}>
            <div className="pds-featured__rank">
              <span className="pds-bigrank" style={{ background: (featured.rank && RANK_BG[featured.rank]) || "#fff" }}>
                {featured.rank ? ordinal(featured.rank) : "★"}
              </span>
              <span className="pds-outof">{featured.rank ? `sur ${teamCount} équipes` : `${teamCount} équipes`}</span>
            </div>
            <div className="pds-cards" style={{ height: CARD_H * scale + 12 }}>
              {players.map((p, i) => {
                const mid = (players.length - 1) / 2;
                return (
                  <div key={p.id} className="pds-card" style={{
                    width: CARD_W * scale, height: CARD_H * scale,
                    transform: `rotate(${(i - mid) * 6}deg) translateY(${Math.abs(i - mid) * 6}px)`,
                    zIndex: 10 - Math.abs(i - mid),
                  }}>
                    <div style={{ width: CARD_W, height: CARD_H, transform: `scale(${scale})`, transformOrigin: "top left" }}>
                      <PlayerCollectibleCard {...cardProps(p)} />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="pds-team pds-team--featured">{featured.name}</div>
          </div>

          {/* Le podium */}
          <div className="pds-others">
            {podium.map((team, i) => (
              <div key={team.id} className={`pds-row${team.id === featured.id ? " pds-row--me" : ""}`}>
                <div className="pds-rank" style={{ background: RANK_BG[i + 1] }}>{i + 1}</div>
                <span className="pds-team pds-row__name">{team.name}</span>
                <div className="pds-avatars">
                  {team.players.map((p) => <Avatar key={p.id} p={p} />)}
                </div>
              </div>
            ))}
          </div>

          <div className="pds-foot">
            <span className="pds-logo"><span className="pds-logo__dot" />Poloperator</span>
            <span className="pds-url">Résultats complets sur <strong>{host}</strong></span>
          </div>
        </div>
      </div>

      <div className="pds-col">
        <label className="pds-caption" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          Équipe mise en avant
          <select className="form-input" value={featured.id} onChange={(e) => { setTeamId(e.target.value); setPreview(null); }}
            style={{ textTransform: "none", letterSpacing: "normal", fontWeight: 500, minWidth: 260 }}>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>{t.rank ? `${ordinal(t.rank)} — ` : ""}{t.name}</option>
            ))}
          </select>
        </label>
        <span className="pds-caption">Image exportée (PNG 1080×1920)</span>
        {preview
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={preview} alt="Aperçu exporté" className="pds-preview" />
          : <div className="pds-preview pds-preview--empty">Clique « Générer l&apos;image » pour voir le PNG réel (photos comprises).</div>}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={handlePreview} disabled={busy}>{busy ? "…" : "Générer l'image"}</button>
          <button type="button" className="primary" onClick={handleShare} disabled={busy}>Partager / télécharger</button>
        </div>
        {error && <p style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>{error}</p>}
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>Lien des résultats : {resultsPath}</p>
      </div>

      <style>{PODIUM_CSS}</style>
    </div>
  );
}

const PODIUM_CSS = `
.pds-wrap { display: flex; gap: 32px; flex-wrap: wrap; justify-content: center; align-items: flex-start; }
.pds-col { display: flex; flex-direction: column; gap: 10px; align-items: flex-start; }
.pds-caption { font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-muted); }

.pds {
  position: relative; width: 360px; height: 640px; flex-shrink: 0; overflow: hidden; box-sizing: border-box;
  background: #fcfbf5; color: #1a1a1a;
  border: 2.5px solid #1a1a1a; border-radius: 18px;
  display: flex; flex-direction: column; padding: 20px 18px 14px; gap: 12px;
  font-family: var(--font-body), sans-serif;
}
.pds-head { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 6px; }
/* Pastille : en ligne, jamais de retour à la ligne (la capture élargissait le
   texte et « PODIUM » sortait du cadre) */
.pds-kicker {
  display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; line-height: 1;
  font-family: var(--font-display), sans-serif; font-size: 11px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase;
  background: var(--yellow, #fffc8a); border: 2px solid #1a1a1a; border-radius: 6px; padding: 5px 10px;
}
.pds-title {
  margin: 0; max-width: 100%; font-family: var(--font-display), sans-serif; font-weight: 900; text-transform: uppercase;
  font-size: 24px; line-height: 1.05; letter-spacing: 0.02em; text-wrap: balance; overflow-wrap: anywhere;
}
.pds-meta { max-width: 100%; font-size: 11px; font-weight: 600; color: #666660; text-wrap: balance; }

.pds-featured {
  position: relative; display: flex; flex-direction: column; align-items: center; gap: 6px;
  background: #fff; border: 2.5px solid #1a1a1a; border-radius: 14px; box-shadow: 4px 4px 0 #1a1a1a;
  padding: 10px 10px 10px; overflow: hidden;
}
.pds-featured::before { content: ""; position: absolute; inset: 0 0 auto 0; height: 6px; background: var(--team); }
.pds-featured__rank { align-self: stretch; display: flex; align-items: center; gap: 8px; padding-top: 4px; }
.pds-bigrank {
  display: inline-flex; align-items: center; justify-content: center; min-width: 44px; height: 32px; padding: 0 8px; white-space: nowrap;
  border: 2px solid #1a1a1a; border-radius: 8px; box-shadow: 2px 2px 0 #1a1a1a;
  font-family: var(--font-display), sans-serif; font-weight: 900; font-size: 18px; line-height: 1;
}
.pds-outof { font-size: 11px; font-weight: 700; color: #666660; white-space: nowrap; }
.pds-cards { display: flex; justify-content: center; align-items: flex-start; }
.pds-card { position: relative; flex-shrink: 0; margin: 0 -6px; pointer-events: none; }
.pds-team { font-family: var(--font-display), sans-serif; font-weight: 800; font-size: 13px; text-transform: uppercase; letter-spacing: 0.03em; }
.pds-team--featured { font-size: 17px; text-align: center; max-width: 100%; overflow-wrap: anywhere; }

.pds-others { display: flex; flex-direction: column; gap: 6px; }
.pds-row {
  display: flex; align-items: center; gap: 8px;
  background: #fff; border: 2px solid #1a1a1a; border-radius: 10px; padding: 6px 8px;
}
.pds-row--me { box-shadow: 3px 3px 0 #1a1a1a; background: #fffde0; }
.pds-row__name { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pds-rank {
  width: 26px; height: 26px; flex-shrink: 0; border: 2px solid #1a1a1a; border-radius: 7px;
  display: flex; align-items: center; justify-content: center;
  font-family: var(--font-display), sans-serif; font-weight: 900; font-size: 14px; line-height: 1;
}
.pds-avatars { display: flex; align-items: center; flex-shrink: 0; }
.pds-avatar {
  width: 24px; height: 24px; border-radius: 50%; object-fit: cover; border: 1.5px solid #1a1a1a; background: #f0efea; flex-shrink: 0;
  margin-left: -6px;
}
.pds-avatar:first-child { margin-left: 0; }
.pds-avatar--empty { display: inline-flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 800; }

.pds-foot {
  margin-top: auto; display: flex; flex-direction: column; align-items: center; gap: 4px;
  border-top: 2px dashed #d0cfc9; padding-top: 10px;
}
.pds-logo { display: flex; align-items: center; gap: 6px; font-family: var(--font-display), sans-serif; font-size: 16px; font-weight: 800; white-space: nowrap; }
.pds-logo__dot { width: 11px; height: 11px; border-radius: 50%; border: 3px solid #1a1a1a; box-sizing: border-box; }
.pds-url { font-size: 11px; color: #1a1a1a; white-space: nowrap; }

.pds-preview { width: 360px; height: 640px; border-radius: 18px; border: 1px solid var(--border-light); background: var(--surface-2); }
.pds-preview--empty { display: flex; align-items: center; justify-content: center; text-align: center; padding: 24px; font-size: 13px; color: var(--text-muted); box-sizing: border-box; }
`;
