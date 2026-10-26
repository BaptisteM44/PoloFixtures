"use client";

/**
 * Récap d'un tournoi terminé, à droite du podium : « Partage ton résultat »
 * (participant·e : son équipe) ou « Partager le podium » (les autres).
 * L'image est affichée tout de suite en vignette ; un clic l'ouvre en grand,
 * le PNG est préparé dès l'ouverture pour que « Partager » soit immédiat
 * (sur iPhone, le partage doit suivre le clic de près, sinon il est refusé).
 * Rien n'est envoyé tant qu'on ne clique pas.
 */

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  PodiumStoryCanvas, capturePodiumStory, shareOrDownload, podiumFileName,
  type PodiumStoryData,
} from "./PodiumStory";

type Props = PodiumStoryData & {
  myTeamId: string | null;
  defaultTeamId: string;
};

const STORY_W = 360, STORY_H = 640;

export function RecapSharePanel(props: Props) {
  const { teams, myTeamId, defaultTeamId, tournamentName } = props;
  const t = useTranslations("podium_share");
  const [open, setOpen] = useState(false);
  const [teamId, setTeamId] = useState(defaultTeamId);
  const [fit, setFit] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [canShareFiles, setCanShareFiles] = useState(false);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [thumbW, setThumbW] = useState(168);
  const storyRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLButtonElement>(null);

  const mine = myTeamId ? teams.find((tm) => tm.id === myTeamId) : null;
  const featured = teams.find((tm) => tm.id === teamId) ?? teams[0];

  useEffect(() => {
    if (!open) return;
    // L'image (360×640) est réduite pour tenir dans l'écran ; la capture, elle, reste en taille réelle.
    const resize = () => setFit(Math.min(1, (window.innerHeight - 240) / STORY_H, (window.innerWidth - 48) / STORY_W));
    resize();
    window.addEventListener("resize", resize);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    try {
      setCanShareFiles(!!navigator.canShare?.({ files: [new File([""], "x.png", { type: "image/png" })] }));
    } catch { setCanShareFiles(false); }
    return () => { window.removeEventListener("resize", resize); window.removeEventListener("keydown", onKey); };
  }, [open]);

  // Vignette : largeur de la colonne (200 px sur ordinateur, plafonnée sur mobile)
  useEffect(() => {
    const el = thumbRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setThumbW(Math.min(300, el.clientWidth)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // PNG préparé à l'ouverture et à chaque changement d'équipe
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setBlob(null); setError(null);
    const timer = window.setTimeout(async () => {
      if (!storyRef.current) return;
      try {
        const b = await capturePodiumStory(storyRef.current);
        if (!cancelled) setBlob(b);
      } catch (e) {
        console.error("[podium share]", e);
        if (!cancelled) setError(t("error"));
      }
    }, 400); // laisse les photos des cartes se charger
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [open, teamId, t]);

  async function run(forceDownload: boolean) {
    if (!storyRef.current) return;
    setBusy(true); setError(null);
    try {
      const png = blob ?? await capturePodiumStory(storyRef.current);
      await shareOrDownload(png, podiumFileName(tournamentName, featured.name), tournamentName, forceDownload);
    } catch (e) {
      if ((e as Error).name !== "AbortError") { console.error("[podium share]", e); setError(t("error")); }
    } finally { setBusy(false); }
  }

  async function copyLink() {
    const url = `${window.location.origin}${window.location.pathname}?tab=recap`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch { window.prompt(t("btn_copy"), url); }
  }

  if (!featured) return null;

  return (
    <>
      <div className="panel recap-share-panel">
        <h3 className="recap-section__title">{mine ? t("panel_title_mine") : t("panel_title")}</h3>
        {/* L'image, tout de suite : un clic l'ouvre en grand */}
        <button ref={thumbRef} type="button" className="recap-share-thumb" aria-label={t("btn_open")}
          onClick={() => { setTeamId(defaultTeamId); setOpen(true); }}>
          <div style={{ width: thumbW, height: (thumbW * STORY_H) / STORY_W, overflow: "hidden", borderRadius: 10 }}>
            <div style={{ width: STORY_W, height: STORY_H, transform: `scale(${thumbW / STORY_W})`, transformOrigin: "top left", pointerEvents: "none" }}>
              <PodiumStoryCanvas {...props} featuredId={defaultTeamId} />
            </div>
          </div>
        </button>
        {mine?.rank && <p className="recap-share-panel__text">{t("panel_text_mine", { rank: mine.rank })}</p>}
        <button type="button" className="primary" onClick={() => { setTeamId(defaultTeamId); setOpen(true); }}>
          {t("btn_open")}
        </button>
      </div>

      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal recap-share-modal" role="dialog" aria-modal="true" aria-label={t("modal_title")} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{t("modal_title")}</h3>
              <button type="button" className="modal-close" onClick={() => setOpen(false)} aria-label={t("close")}>✕</button>
            </div>
            <div className="modal-body recap-share-modal__body">
              {teams.length > 1 && (
                <label className="recap-share-modal__label">
                  {t("team_label")}
                  <select className="form-input" value={featured.id} onChange={(e) => setTeamId(e.target.value)}>
                    {teams.map((tm) => (
                      <option key={tm.id} value={tm.id}>{tm.rank ? `${t("rank", { rank: tm.rank })} — ` : ""}{tm.name}</option>
                    ))}
                  </select>
                </label>
              )}
              {/* Aperçu réduit pour tenir dans l'écran (pas capturé) */}
              <div className="recap-share-modal__frame" style={{ width: STORY_W * fit, height: STORY_H * fit }}>
                <div style={{ width: STORY_W, height: STORY_H, transform: `scale(${fit})`, transformOrigin: "top left" }}>
                  <PodiumStoryCanvas {...props} featuredId={featured.id} />
                </div>
              </div>
              {error && <p className="recap-share-modal__error">{error}</p>}
            </div>
            {/* Copie en taille réelle, sans aucun parent mis à l'échelle : c'est elle
                qu'on capture (capturer l'aperçu réduit décalait l'image exportée).
                Invisible (opacité sur le parent seulement) mais dans l'écran pour
                que les photos se chargent. */}
            <div aria-hidden style={{ position: "fixed", left: 0, top: 0, opacity: 0, pointerEvents: "none", zIndex: -1 }}>
              <PodiumStoryCanvas ref={storyRef} {...props} featuredId={featured.id} />
            </div>
            <div className="modal-footer recap-share-modal__footer">
              <button type="button" className="ghost" onClick={copyLink} disabled={busy}>
                {copied ? `✓ ${t("copied")}` : `🔗 ${t("btn_copy")}`}
              </button>
              <button type="button" className={canShareFiles ? "" : "primary"} onClick={() => run(true)} disabled={busy}>
                {busy || (!blob && !error) ? t("preparing") : `⬇ ${t("btn_download")}`}
              </button>
              {canShareFiles && (
                <button type="button" className="primary" onClick={() => run(false)} disabled={busy || !blob}>
                  📤 {t("btn_share")}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
