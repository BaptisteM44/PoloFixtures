"use client";

/**
 * Image « résultat » à partager en story (1080×1920) à la fin d'un tournoi.
 * Rendue en DOM à 360×640 puis capturée ×3 (modern-screenshot), comme les
 * cartes. Une équipe au choix (la sienne, même 7e) est mise en avant en vraies
 * cartes joueur à sa place sur le podium (ou en dessous si elle n'y est pas),
 * et l'adresse du site est bien visible pour ramener du monde.
 */

import { forwardRef, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { domToBlob } from "modern-screenshot";
import { PlayerCollectibleCard } from "./PlayerCollectibleCard";
import { fetchViaProxy } from "./ShareCardButton";

export type PodiumPlayer = React.ComponentProps<typeof PlayerCollectibleCard> & { id: string };
export type PodiumTeam = { id: string; name: string; color: string | null; rank: number | null; players: PodiumPlayer[] };

export type PodiumStoryData = {
  tournamentName: string;
  place: string;      // « Lille, France »
  dates: string;      // « 17–18 oct. 2026 »
  teamCount: number;
  teams: PodiumTeam[];
  /** Équipes 1re, 2e, 3e (ids) */
  podiumIds: string[];
};

const CARD_W = 340, CARD_H = 520;
const RANK_BG: Record<number, string> = { 1: "var(--yellow, #fffc8a)", 2: "var(--teal, #60c9cf)", 3: "var(--pink, #ffa2af)" };

function cardProps({ id: _id, ...rest }: PodiumPlayer) {
  return rest;
}

function initials(name: string) {
  return name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

function Avatar({ p }: { p: PodiumPlayer }) {
  return p.photoPath
    // eslint-disable-next-line @next/next/no-img-element
    ? <img className="pds-avatar" src={p.photoPath} alt={p.name} />
    : <span className="pds-avatar pds-avatar--empty">{initials(p.name)}</span>;
}

/** PNG 1080×1920 de l'image (photos relues via le proxy, comme les cartes). */
export function capturePodiumStory(el: HTMLElement) {
  return domToBlob(el, { scale: 3, fetchFn: fetchViaProxy, timeout: 20000, backgroundColor: "#fcfbf5" });
}

/** Partage natif (mobile : story, WhatsApp…) ou téléchargement (ordinateur). */
export async function shareOrDownload(blob: Blob, fileName: string, title: string, forceDownload = false) {
  const file = new File([blob], fileName, { type: "image/png" });
  if (!forceDownload && navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title });
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = fileName;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const podiumFileName = (tournamentName: string, teamName: string) =>
  `${tournamentName}-${teamName}`.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") + ".png";

/** L'image elle-même (360×640), équipe `featuredId` mise en avant. */
export const PodiumStoryCanvas = forwardRef<HTMLDivElement, PodiumStoryData & { featuredId: string }>(function PodiumStoryCanvas(
  { tournamentName, place, dates, teamCount, teams, podiumIds, featuredId },
  ref,
) {
  const t = useTranslations("podium_share");
  const [host, setHost] = useState("poloperator.com");
  useEffect(() => { setHost(window.location.host.replace(/^www\./, "")); }, []);

  const featured = teams.find((tm) => tm.id === featuredId) ?? teams[0];
  if (!featured) return null;
  const podium = podiumIds.map((id) => teams.find((tm) => tm.id === id)).filter((tm): tm is PodiumTeam => !!tm);
  const players = featured.players;
  // Cartes en éventail : taille selon le nombre de joueurs de l'équipe
  const scale = players.length >= 4 ? 0.25 : players.length === 3 ? 0.29 : 0.34;
  // Bande du haut : couleur du rang sur le podium (comme les pastilles 1-2-3),
  // sinon couleur de l'équipe, sinon pas de bande.
  const bandColor = (featured.rank && RANK_BG[featured.rank]) || featured.color || "transparent";

  // L'équipe mise en avant, en vraies cartes
  const featuredBlock = (
    <div className="pds-featured" style={{ ["--team" as string]: bandColor }}>
      <div className="pds-featured__rank">
        <span className="pds-bigrank" style={{ background: (featured.rank && RANK_BG[featured.rank]) || "#fff" }}>
          {featured.rank ? t("rank", { rank: featured.rank }) : "★"}
        </span>
        <span className="pds-outof">
          {featured.rank ? t("out_of", { count: teamCount }) : t("teams", { count: teamCount })}
        </span>
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
  );

  return (
    <div ref={ref} className="pds">
      <div className="pds-head">
        <span className="pds-kicker"><span>🏆</span><span>{t("kicker")}</span></span>
        <h2 className="pds-title">{tournamentName}</h2>
        <span className="pds-meta">{place} · {dates}</span>
      </div>

      {/* Le podium dans l'ordre 1-2-3 ; si l'équipe choisie y est, elle
          prend SA place en grand (pas de ligne en double). Hors podium,
          elle s'affiche en dessous. */}
      <div className="pds-others">
        {podium.map((team, i) => team.id === featured.id ? (
          <div key={team.id}>{featuredBlock}</div>
        ) : (
          <div key={team.id} className="pds-row">
            <div className="pds-rank" style={{ background: RANK_BG[i + 1] }}>{i + 1}</div>
            <span className="pds-team pds-row__name">{team.name}</span>
            <div className="pds-avatars">
              {team.players.map((p) => <Avatar key={p.id} p={p} />)}
            </div>
          </div>
        ))}
        {!podium.some((tm) => tm.id === featured.id) && featuredBlock}
      </div>

      <div className="pds-foot">
        <span className="pds-logo"><span className="pds-logo__dot" />Poloperator</span>
        <span className="pds-url">{t("footer")} <strong>{host}</strong></span>
      </div>
      {/* CSS injecté tel quel : en texte, le serveur échappe certains caractères
          (guillemets, ">") et le navigateur non → erreur d'hydratation. */}
      <style dangerouslySetInnerHTML={{ __html: PODIUM_CSS }} />
    </div>
  );
});

/** Page de démo : rendu DOM + PNG exporté côte à côte, équipe au choix. */
export function PodiumStory(props: PodiumStoryData & { defaultTeamId: string; resultsPath: string }) {
  const { teams, defaultTeamId, resultsPath, tournamentName } = props;
  const t = useTranslations("podium_share");
  const storyRef = useRef<HTMLDivElement>(null);
  const [teamId, setTeamId] = useState(defaultTeamId);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const featured = teams.find((tm) => tm.id === teamId) ?? teams[0];

  async function run(fn: (blob: Blob) => Promise<void> | void) {
    if (!storyRef.current) return;
    setBusy(true); setError(null);
    try {
      await fn(await capturePodiumStory(storyRef.current));
    } catch (e) {
      if ((e as Error).name !== "AbortError") { console.error(e); setError(t("error")); }
    } finally { setBusy(false); }
  }

  return (
    <div className="pds-wrap">
      <div className="pds-col">
        <span className="pds-caption">Rendu en direct (DOM)</span>
        <PodiumStoryCanvas ref={storyRef} {...props} featuredId={featured.id} />
      </div>

      <div className="pds-col">
        <label className="pds-caption" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {t("team_label")}
          <select className="form-input" value={featured.id} onChange={(e) => { setTeamId(e.target.value); setPreview(null); }}
            style={{ textTransform: "none", letterSpacing: "normal", fontWeight: 500, minWidth: 260 }}>
            {teams.map((tm) => (
              <option key={tm.id} value={tm.id}>{tm.rank ? `${t("rank", { rank: tm.rank })} — ` : ""}{tm.name}</option>
            ))}
          </select>
        </label>
        <span className="pds-caption">Image exportée (PNG 1080×1920)</span>
        {preview
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={preview} alt="Aperçu exporté" className="pds-preview" />
          : <div className="pds-preview pds-preview--empty">Clique « Générer l&apos;image » pour voir le PNG réel (photos comprises).</div>}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" disabled={busy}
            onClick={() => run((blob) => setPreview((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(blob); }))}>
            {busy ? "…" : "Générer l'image"}
          </button>
          <button type="button" className="primary" disabled={busy}
            onClick={() => run((blob) => shareOrDownload(blob, podiumFileName(tournamentName, featured.name), tournamentName))}>
            {t("btn_share")}
          </button>
        </div>
        {error && <p style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>{error}</p>}
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>Lien des résultats : {resultsPath}</p>
      </div>
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
  /* Bande du haut peinte dans le fond même du bloc : le navigateur la découpe
     exactement dans l'arrondi intérieur de la bordure (pas de pseudo-élément
     à caler). Pas d'overflow: hidden : les cartes passent PAR-DESSUS les bords. */
  background: linear-gradient(var(--team) 0 7px, #fff 7px);
  border: 2.5px solid #1a1a1a; border-radius: 14px; box-shadow: 4px 4px 0 #1a1a1a;
  padding: 14px 10px 10px;
}
.pds-featured__rank { align-self: stretch; display: flex; align-items: center; gap: 8px; padding-top: 4px; }
.pds-bigrank {
  display: inline-flex; align-items: center; justify-content: center; min-width: 44px; height: 32px; padding: 0 8px; white-space: nowrap;
  border: 2px solid #1a1a1a; border-radius: 8px; box-shadow: 2px 2px 0 #1a1a1a;
  font-family: var(--font-display), sans-serif; font-weight: 900; font-size: 18px; line-height: 1;
}
.pds-outof { font-size: 11px; font-weight: 700; color: #666660; white-space: nowrap; }
.pds-cards { position: relative; z-index: 1; display: flex; justify-content: center; align-items: flex-start; }
.pds-card { position: relative; flex-shrink: 0; margin: 0 -4px; pointer-events: none; }
.pds-team { font-family: var(--font-display), sans-serif; font-weight: 800; font-size: 13px; text-transform: uppercase; letter-spacing: 0.03em; }
.pds-team--featured { font-size: 17px; text-align: center; max-width: 100%; overflow-wrap: anywhere; }

.pds-others { display: flex; flex-direction: column; gap: 6px; }
.pds-row {
  display: flex; align-items: center; gap: 8px;
  background: #fff; border: 2px solid #1a1a1a; border-radius: 10px; padding: 6px 8px;
}
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
