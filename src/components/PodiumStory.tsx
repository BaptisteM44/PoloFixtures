"use client";

/**
 * Image « podium » à partager en story (1080×1920) à la fin d'un tournoi.
 * Rendue en DOM à 360×640 puis capturée ×3 (modern-screenshot), comme les
 * cartes : les champions en vraies cartes joueur, 2e et 3e en pastilles photo,
 * et l'adresse du site bien visible pour ramener du monde.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { domToBlob } from "modern-screenshot";
import { PlayerCollectibleCard } from "./PlayerCollectibleCard";
import { fetchViaProxy } from "./ShareCardButton";

export type PodiumPlayer = React.ComponentProps<typeof PlayerCollectibleCard> & { id: string };
export type PodiumTeam = { name: string; color: string | null; players: PodiumPlayer[] };

type Props = {
  tournamentName: string;
  place: string;      // « Lille, France »
  dates: string;      // « 8 – 9 nov. 2026 »
  teamCount: number;
  first: PodiumTeam | null;
  second: PodiumTeam | null;
  third: PodiumTeam | null;
  /** Chemin public des résultats, ex. « /fr/tournament/lille-2026?tab=recap » */
  resultsPath: string;
};

const CARD_W = 340, CARD_H = 520;

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

export function PodiumStory(props: Props) {
  const { tournamentName, place, dates, teamCount, first, second, third, resultsPath } = props;
  const storyRef = useRef<HTMLDivElement>(null);
  const [host, setHost] = useState("poloperator.app");
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setHost(window.location.host.replace(/^www\./, "")); }, []);

  const champions = first?.players ?? [];
  // Cartes en éventail : taille selon le nombre de joueurs de l'équipe gagnante
  const scale = champions.length >= 4 ? 0.27 : champions.length === 3 ? 0.31 : 0.38;

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
      const file = new File([blob], `${tournamentName.replace(/\s+/g, "-")}-podium.png`, { type: "image/png" });
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

  return (
    <div className="pds-wrap">
      <div className="pds-col">
        <span className="pds-caption">Rendu en direct (DOM)</span>
        <div ref={storyRef} className="pds">
          <div className="pds-head">
            <span className="pds-kicker">🏆 Podium</span>
            <h2 className="pds-title">{tournamentName}</h2>
            <span className="pds-meta">{place} · {dates} · {teamCount} équipes</span>
          </div>

          {first && (
            <div className="pds-first" style={{ ["--team" as string]: first.color ?? "var(--yellow, #fffc8a)" }}>
              <div className="pds-rank pds-rank--1">1</div>
              <div className="pds-cards" style={{ height: CARD_H * scale + 16 }}>
                {champions.map((p, i) => {
                  const mid = (champions.length - 1) / 2;
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
              <div className="pds-team pds-team--first">{first.name}</div>
            </div>
          )}

          <div className="pds-others">
            {[{ team: second, rank: 2 }, { team: third, rank: 3 }].map(({ team, rank }) => team && (
              <div key={rank} className="pds-row">
                <div className={`pds-rank pds-rank--${rank}`}>{rank}</div>
                <div className="pds-row__body">
                  <span className="pds-team">{team.name}</span>
                  <div className="pds-avatars">
                    {team.players.map((p) => <Avatar key={p.id} p={p} />)}
                    <span className="pds-names">{team.players.map((p) => p.name.split(" ")[0]).join(" · ")}</span>
                  </div>
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
  position: relative; width: 360px; height: 640px; flex-shrink: 0; overflow: hidden;
  background: #fcfbf5; color: #1a1a1a;
  border: 2.5px solid #1a1a1a; border-radius: 18px;
  display: flex; flex-direction: column; padding: 22px 20px 16px; gap: 14px;
  font-family: var(--font-body), sans-serif;
}
.pds-head { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 6px; }
.pds-kicker {
  font-family: var(--font-display), sans-serif; font-size: 11px; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase;
  background: var(--yellow, #fffc8a); border: 2px solid #1a1a1a; border-radius: 6px; padding: 3px 10px;
}
.pds-title {
  margin: 0; font-family: var(--font-display), sans-serif; font-weight: 900; text-transform: uppercase;
  font-size: 24px; line-height: 1.05; letter-spacing: 0.02em; text-wrap: balance;
}
.pds-meta { font-size: 11px; font-weight: 600; color: #666660; }

.pds-first {
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  background: #fff; border: 2.5px solid #1a1a1a; border-radius: 14px; box-shadow: 4px 4px 0 #1a1a1a;
  padding: 12px 10px 12px; position: relative;
}
.pds-first::before {
  content: ""; position: absolute; inset: 0 0 auto 0; height: 6px; border-radius: 12px 12px 0 0; background: var(--team);
}
.pds-cards { display: flex; justify-content: center; align-items: flex-start; padding-top: 6px; }
.pds-card { position: relative; flex-shrink: 0; margin: 0 -6px; pointer-events: none; }
.pds-team { font-family: var(--font-display), sans-serif; font-weight: 800; font-size: 14px; text-transform: uppercase; letter-spacing: 0.03em; }
.pds-team--first { font-size: 18px; }

.pds-rank {
  width: 30px; height: 30px; flex-shrink: 0; border: 2px solid #1a1a1a; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  font-family: var(--font-display), sans-serif; font-weight: 900; font-size: 16px; box-shadow: 2px 2px 0 #1a1a1a;
}
.pds-rank--1 { position: absolute; top: -12px; left: -12px; background: var(--yellow, #fffc8a); }
.pds-rank--2 { background: var(--teal, #60c9cf); }
.pds-rank--3 { background: var(--pink, #ffa2af); }

.pds-others { display: flex; flex-direction: column; gap: 8px; }
.pds-row {
  display: flex; align-items: center; gap: 10px;
  background: #fff; border: 2px solid #1a1a1a; border-radius: 10px; padding: 8px 10px;
}
.pds-row__body { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.pds-avatars { display: flex; align-items: center; gap: 4px; min-width: 0; }
.pds-avatar {
  width: 24px; height: 24px; border-radius: 50%; object-fit: cover; border: 1.5px solid #1a1a1a; background: #f0efea; flex-shrink: 0;
}
.pds-avatar--empty { display: inline-flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 800; }
.pds-names { font-size: 10.5px; color: #666660; margin-left: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.pds-foot {
  margin-top: auto; display: flex; flex-direction: column; align-items: center; gap: 4px;
  border-top: 2px dashed #d0cfc9; padding-top: 10px;
}
.pds-logo { display: flex; align-items: center; gap: 6px; font-family: var(--font-display), sans-serif; font-size: 16px; font-weight: 800; }
.pds-logo__dot { width: 11px; height: 11px; border-radius: 50%; border: 3px solid #1a1a1a; }
.pds-url { font-size: 11px; color: #1a1a1a; }

.pds-preview { width: 360px; height: 640px; border-radius: 18px; border: 1px solid var(--border-light); background: var(--surface-2); }
.pds-preview--empty { display: flex; align-items: center; justify-content: center; text-align: center; padding: 24px; font-size: 13px; color: var(--text-muted); }
`;
