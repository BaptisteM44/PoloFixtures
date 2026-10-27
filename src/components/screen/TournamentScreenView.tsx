"use client";

/**
 * Écran de salle (TV) : scoreboard géant d'un terrain, ou diaporama du
 * tournoi (terrains, classements, prochains matchs, tableau, sponsors…).
 *
 * Direct : scores et chrono arrivent par SSE comme pour l'overlay stream, et
 * le chrono est calé sur l'heure du serveur (pas sur l'horloge de l'ordi
 * branché à la TV, souvent décalée). Les réglages de l'orga (diapos, pause,
 * diapo figée, annonce) s'appliquent aussi en direct.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { QRCodeSVG } from "qrcode.react";
import { BracketView } from "@/components/BracketView";
import { autoSlides, parseSlideKey, type ScreenConfig, type SlideKey } from "@/lib/screen-slides";
import type { ScreenData, ScreenMatch, ScreenStage } from "@/lib/screen-data";

type T = ReturnType<typeof useTranslations>;

// ─── Chrono ──────────────────────────────────────────────────────────────────

/** Secondes jouées d'après les événements START / PAUSE / END (cf. overlay), à l'heure serveur. */
function matchClock(m: ScreenMatch, nowServer: number): { sec: number; running: boolean } {
  let sec = 0, lastStartSec = 0, lastStartAt = 0, running = false;
  for (const e of m.events) {
    const at = new Date(e.createdAt).getTime();
    if (e.type === "START") { lastStartSec = e.matchClockSec; lastStartAt = at; running = true; }
    else if (e.type === "PAUSE" || e.type === "END") { sec = e.matchClockSec; running = false; }
  }
  if (running && lastStartAt > 0) sec = lastStartSec + Math.max(0, Math.floor((nowServer - lastStartAt) / 1000));
  return { sec, running };
}

const fmt = (s: number) => `${String(Math.floor(Math.max(0, s) / 60)).padStart(2, "0")}:${String(Math.floor(Math.max(0, s)) % 60).padStart(2, "0")}`;

/** Côtés inversés (événements SWAP_SIDES en nombre impair) : l'écran suit le terrain. */
const swapped = (m: ScreenMatch) => m.events.filter((e) => e.type === "SWAP_SIDES").length % 2 === 1;

/** Match à afficher sur un terrain : celui en cours, sinon le prochain. */
function courtMatch(matches: ScreenMatch[], court: number): { match: ScreenMatch | null; live: boolean } {
  const name = `Court ${court}`;
  const live = matches.find((m) => m.status === "LIVE" && m.courtName === name);
  if (live) return { match: live, live: true };
  const next = matches.find((m) => m.status === "SCHEDULED" && m.courtName === name);
  return { match: next ?? null, live: false };
}

// ─── Composant principal ─────────────────────────────────────────────────────

export function TournamentScreenView({ initial, screenSlug }: { initial: ScreenData; screenSlug: string }) {
  const t = useTranslations("screen");
  const [data, setData] = useState<ScreenData>(initial);
  const [offset, setOffset] = useState(() => initial.serverTime - Date.now());
  const [now, setNow] = useState(() => Date.now() + offset);
  const tid = initial.tournament.id;

  const config: ScreenConfig = useMemo(
    () => data.screens.find((s) => s.slug === screenSlug) ?? data.screens.find((s) => s.slug === "diaporama")!,
    [data.screens, screenSlug],
  );

  // Rafraîchit tout (classements, tableaux…) — debounce après un événement de match.
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refetch = useCallback(async () => {
    const t0 = Date.now();
    const res = await fetch(`/api/tournaments/${tid}/screen`, { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return;
    const next = (await res.json()) as ScreenData;
    // Décalage d'horloge : heure serveur au milieu de l'aller-retour.
    setOffset(next.serverTime - (t0 + Date.now()) / 2);
    setData(next);
  }, [tid]);
  const scheduleRefetch = useCallback(() => {
    if (refetchTimer.current) clearTimeout(refetchTimer.current);
    refetchTimer.current = setTimeout(refetch, 2500);
  }, [refetch]);

  // Horloge (1 s) + filet de sécurité : rechargement complet toutes les minutes.
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now() + offset), 1000);
    return () => clearInterval(tick);
  }, [offset]);
  useEffect(() => {
    const safety = setInterval(refetch, 60_000);
    return () => clearInterval(safety);
  }, [refetch]);

  // Direct (SSE) : scores / événements tout de suite, le reste après un court délai.
  useEffect(() => {
    let es: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    const connect = () => {
      es = new EventSource(`/api/sse?tournamentId=${tid}`);
      es.addEventListener("match", (ev) => {
        const payload = JSON.parse((ev as MessageEvent).data);
        if (payload?.type === "new_matches") { scheduleRefetch(); return; }
        const upd = payload?.data?.match ?? payload?.data;
        const evt = payload?.data?.event;
        if (upd?.id) {
          setData((d) => ({
            ...d,
            matches: d.matches.map((m) => {
              if (m.id !== upd.id) return m;
              const events = evt ? [...m.events.filter((e) => e.id !== evt.id), { ...evt, createdAt: String(evt.createdAt) }] : m.events;
              return { ...m, ...pick(upd), events };
            }),
          }));
        }
        scheduleRefetch();
      });
      es.addEventListener("screen", (ev) => {
        const payload = JSON.parse((ev as MessageEvent).data);
        if (payload?.type === "screen_update" && payload.screen) {
          setData((d) => ({ ...d, screens: [payload.screen, ...d.screens.filter((s) => s.slug !== payload.slug)] }));
        } else if (payload?.type === "screen_deleted") {
          refetch();
        }
      });
      // Coupure réseau : on se reconnecte et on recharge tout (rien de manqué).
      es.onerror = () => {
        es?.close();
        retry = setTimeout(() => { connect(); refetch(); }, 3000);
      };
    };
    connect();
    return () => { es?.close(); if (retry) clearTimeout(retry); };
  }, [tid, refetch, scheduleRefetch]);

  // L'écran ne doit jamais se mettre en veille.
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const request = async () => {
      try { lock = await (navigator as unknown as { wakeLock?: { request: (k: string) => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request("screen") ?? null; } catch { /* refusé */ }
    };
    request();
    const onVis = () => { if (document.visibilityState === "visible") request(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { document.removeEventListener("visibilitychange", onVis); lock?.release().catch(() => {}); };
  }, []);

  // Curseur et bouton plein écran masqués après 3 s sans bouger la souris.
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    let timer = setTimeout(() => setIdle(true), 3000);
    const wake = () => { setIdle(false); clearTimeout(timer); timer = setTimeout(() => setIdle(true), 3000); };
    window.addEventListener("mousemove", wake);
    window.addEventListener("touchstart", wake);
    return () => { clearTimeout(timer); window.removeEventListener("mousemove", wake); window.removeEventListener("touchstart", wake); };
  }, []);

  // ── Diaporama ──
  const keys: SlideKey[] = useMemo(() => {
    if (config.mode === "court") return [`court:${config.court}`];
    const list = config.slides ? config.slides.map((s) => s.key) : autoSlides(data.context);
    return list.filter((k) => hasContent(k, data));
  }, [config, data]);
  const secondsOf = (k: SlideKey) => config.slides?.find((s) => s.key === k)?.seconds ?? config.slideSeconds;

  const [index, setIndex] = useState(0);
  // Pause locale : sur la TV elle-même (espace, clic sur ⏸), sans toucher aux autres écrans.
  const [localPause, setLocalPause] = useState(false);
  const pinned = config.pinnedSlide && hasContent(config.pinnedSlide, data) ? config.pinnedSlide : null;
  const current = pinned ?? keys[index % Math.max(1, keys.length)] ?? (config.mode === "court" ? `court:${config.court}` : "qr");
  const canRotate = !pinned && keys.length > 1;
  const paused = config.paused || localPause;
  const rotating = canRotate && !paused;
  const step = useCallback((dir: 1 | -1) => setIndex((i) => (i + dir + keys.length) % Math.max(1, keys.length)), [keys.length]);

  // Clavier (télécommande / clavier de l'ordi branché) : espace = pause, ← → = diapo.
  useEffect(() => {
    if (!canRotate) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "k" || e.key === "MediaPlayPause") { e.preventDefault(); setLocalPause((p) => !p); }
      else if (e.key === "ArrowRight" || e.key === "MediaTrackNext") step(1);
      else if (e.key === "ArrowLeft" || e.key === "MediaTrackPrevious") step(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canRotate, step]);
  const currentSeconds = secondsOf(current);
  useEffect(() => {
    if (!rotating) return;
    const timer = setTimeout(() => setIndex((i) => (i + 1) % keys.length), currentSeconds * 1000);
    return () => clearTimeout(timer);
  }, [rotating, index, keys.length, currentSeconds]);

  return (
    <div className={`tscreen tscreen--${config.theme}${idle ? " is-idle" : ""}`}>
      <Slide slideKey={current} data={data} now={now} t={t} clockPosition={config.clockPosition} />

      {config.announcement && (
        <div className="tscreen__announce" role="status">📣 {config.announcement}</div>
      )}

      {rotating && (
        <div className="tscreen__progress" key={`${current}-${index}`} style={{ animationDuration: `${currentSeconds}s` }} />
      )}

      {canRotate && paused && <div className="tscreen__paused">⏸ {t("paused_badge")}</div>}

      <div className="tscreen__controls">
        {canRotate && (
          <>
            <button type="button" onClick={() => step(-1)} aria-label={t("prev")}>⏮</button>
            <button type="button" onClick={() => setLocalPause((p) => !p)} disabled={config.paused} title={config.paused ? t("paused_by_orga") : undefined}>
              {paused ? `▶ ${t("play")}` : `⏸ ${t("pause")}`}
            </button>
            <button type="button" onClick={() => step(1)} aria-label={t("next")}>⏭</button>
          </>
        )}
        <button
          type="button"
          onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {})}
        >
          ⛶ {t("fullscreen")}
        </button>
      </div>
    </div>
  );
}

/** Champs d'un match qu'une mise à jour SSE peut changer. */
function pick(u: Record<string, unknown>): Partial<ScreenMatch> {
  const out: Record<string, unknown> = {};
  for (const k of ["status", "scoreA", "scoreB", "goldenGoal", "courtName", "teamAId", "teamBId", "winnerTeamId"]) if (k in u) out[k] = u[k];
  return out as Partial<ScreenMatch>;
}

/** Une diapo a-t-elle quelque chose à montrer ? (les vides sont sautées) */
function hasContent(key: SlideKey, d: ScreenData): boolean {
  const p = parseSlideKey(key);
  if (!p) return false;
  switch (p.kind) {
    case "court": return p.court <= Math.max(1, d.tournament.courtsCount);
    case "courts": return d.tournament.courtsCount > 1;
    case "upcoming": return d.matches.some((m) => m.status === "SCHEDULED" || m.status === "LIVE");
    case "referees": return d.matches.some((m) => (m.status === "SCHEDULED" || m.status === "LIVE") && !!m.referee);
    case "results": return d.matches.some((m) => m.status === "FINISHED" && !!m.teamBId);
    case "sponsors": return d.sponsors.length > 0;
    case "qr": return true;
    case "standings": {
      const s = d.stages.find((x) => x.order === p.stageOrder);
      const g = s?.groups.find((x) => x.key === p.group) ?? (p.group === null ? s?.groups[0] : undefined);
      // Un groupe pas encore lancé (sessions séquentielles) n'a rien à montrer.
      return !!g && g.rows.length > 0 && d.matches.some((m) => m.stageId === s!.id && (g.key === null || m.groupKey === g.key));
    }
    case "bracket": {
      const s = d.stages.find((x) => x.order === p.stageOrder);
      return !!s && d.matches.some((m) => m.stageId === s.id);
    }
  }
}

// ─── Diapos ──────────────────────────────────────────────────────────────────

function Slide({ slideKey, data, now, t, clockPosition }: { slideKey: SlideKey; data: ScreenData; now: number; t: T; clockPosition: "top" | "bottom" }) {
  const p = parseSlideKey(slideKey);
  if (!p) return null;
  switch (p.kind) {
    case "court": return <CourtSlide court={p.court} data={data} now={now} t={t} clockPosition={clockPosition} />;
    case "courts": return <CourtsSlide data={data} now={now} t={t} />;
    case "standings": return <StandingsSlide stageOrder={p.stageOrder} group={p.group} data={data} t={t} />;
    case "bracket": return <BracketSlide stageOrder={p.stageOrder} data={data} t={t} />;
    case "upcoming": return <UpcomingSlide data={data} now={now} t={t} />;
    case "referees": return <RefereesSlide data={data} t={t} />;
    case "results": return <ResultsSlide data={data} t={t} />;
    case "sponsors": return <SponsorsSlide data={data} t={t} />;
    case "qr": return <QrSlide data={data} t={t} />;
  }
}

function stageLabel(m: ScreenMatch, stages: ScreenStage[], t: T): string {
  const s = stages.find((x) => x.id === m.stageId);
  const parts = [s?.name, m.groupKey ? t("group", { group: m.groupKey }) : null, s && ["RR", "SWISS", "CROSS_POOL"].includes(s.type) ? t("round", { n: m.roundIndex }) : null];
  return parts.filter(Boolean).join(" · ");
}

function SlideHeader({ title, data }: { title: string; data: ScreenData }) {
  return (
    <header className="tscreen__head">
      <span className="tscreen__brand">{data.tournament.name}</span>
      <span className="tscreen__title">{title}</span>
    </header>
  );
}

/** Scoreboard géant d'un terrain : équipe à gauche / à droite, score dessous, chrono au centre. */
function CourtSlide({ court, data, now, t, clockPosition }: { court: number; data: ScreenData; now: number; t: T; clockPosition: "top" | "bottom" }) {
  const { match, live } = courtMatch(data.matches, court);
  const label = t("court_n", { n: court });

  if (!match) {
    return (
      <div className="tscreen__court tscreen__court--empty">
        <div className="tscreen__court-label">{label}</div>
        <div className="tscreen__idle">{data.tournament.name}</div>
        <div className="tscreen__idle-sub">{t("court_free")}</div>
      </div>
    );
  }

  const sw = swapped(match);
  const left = sw ? match.teamB : match.teamA;
  const right = sw ? match.teamA : match.teamB;
  const scoreL = sw ? match.scoreB : match.scoreA;
  const scoreR = sw ? match.scoreA : match.scoreB;
  const { sec, running } = matchClock(match, now);
  const total = data.tournament.gameDurationMin * 60;
  const overtime = live && sec >= total;
  const clockText = !live ? startsIn(match, now, data, t) : overtime || match.goldenGoal ? t("golden_goal") : fmt(total - sec);

  const clock = (
    <div className={`tscreen__clock${live && !running ? " is-paused" : ""}${overtime || match.goldenGoal ? " is-golden" : ""}`}>
      {!live && <small>{t("next_match")}</small>}
      {clockText}
    </div>
  );

  return (
    <div className={`tscreen__court tscreen__court--clock-${clockPosition}`}>
      <div className="tscreen__court-label">{label}{stageLabel(match, data.stages, t) ? ` · ${stageLabel(match, data.stages, t)}` : ""}</div>
      {match.referee && <div className="tscreen__court-ref">🟨 {t("referee", { name: match.referee })}</div>}
      {clockPosition === "top" && clock}
      <div className="tscreen__sides">
        <div className="tscreen__side">
          <div className="tscreen__team">{left?.name ?? t("tbd")}</div>
          <div className="tscreen__score">{live ? scoreL : "–"}</div>
        </div>
        <div className="tscreen__divider" />
        <div className="tscreen__side">
          <div className="tscreen__team">{right?.name ?? t("tbd")}</div>
          <div className="tscreen__score">{live ? scoreR : "–"}</div>
        </div>
      </div>
      {clockPosition === "bottom" && clock}
    </div>
  );
}

function startsIn(m: ScreenMatch, now: number, data: ScreenData, t: T): string {
  const mins = Math.round((new Date(m.startAt).getTime() - now) / 60000);
  if (mins <= 0) return t("soon");
  if (mins < 60) return t("in_minutes", { n: mins });
  // « À 14:30 » : sans le « À », l'heure se confond avec un chrono.
  return t("at_time", { time: hhmm(m.startAt, data) });
}

const hhmm = (iso: string, data: ScreenData) =>
  new Intl.DateTimeFormat("fr", { hour: "2-digit", minute: "2-digit", timeZone: data.tournament.timezone ?? undefined }).format(new Date(iso));

/** Tous les terrains d'un coup d'œil. */
function CourtsSlide({ data, now, t }: { data: ScreenData; now: number; t: T }) {
  const n = data.tournament.courtsCount;
  return (
    <div className="tscreen__page">
      <SlideHeader title={t("courts_title")} data={data} />
      <div className={`tscreen__mosaic tscreen__mosaic--${Math.min(n, 4)}`}>
        {Array.from({ length: n }, (_, i) => {
          const { match, live } = courtMatch(data.matches, i + 1);
          const total = data.tournament.gameDurationMin * 60;
          const clk = match && live ? matchClock(match, now) : null;
          const sw = match ? swapped(match) : false;
          return (
            <div key={i} className={`tscreen__tile${live ? " is-live" : ""}`}>
              <div className="tscreen__tile-head">
                <span>{t("court_n", { n: i + 1 })}</span>
                <span className="tscreen__tile-clock">
                  {!match ? "" : live ? (clk!.sec >= total || match.goldenGoal ? t("golden_goal") : fmt(total - clk!.sec)) : startsIn(match, now, data, t)}
                </span>
              </div>
              {match ? (
                <div className="tscreen__tile-body">
                  <div className="tscreen__tile-row"><span>{(sw ? match.teamB : match.teamA)?.name ?? t("tbd")}</span><strong>{live ? (sw ? match.scoreB : match.scoreA) : ""}</strong></div>
                  <div className="tscreen__tile-row"><span>{(sw ? match.teamA : match.teamB)?.name ?? t("tbd")}</span><strong>{live ? (sw ? match.scoreA : match.scoreB) : ""}</strong></div>
                  {!live && <div className="tscreen__tile-next">{t("next_match")}</div>}
                  {match.referee && <div className="tscreen__tile-next">🟨 {match.referee}</div>}
                </div>
              ) : (
                <div className="tscreen__tile-body tscreen__tile-free">{t("court_free")}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StandingsSlide({ stageOrder, group, data, t }: { stageOrder: number; group: string | null; data: ScreenData; t: T }) {
  const stage = data.stages.find((s) => s.order === stageOrder);
  const g = stage?.groups.find((x) => x.key === group) ?? stage?.groups[0];
  if (!stage || !g) return null;
  const names = teamNames(data);
  const rows = g.rows;
  return (
    <div className="tscreen__page">
      <SlideHeader title={`${stage.name}${g.key ? ` · ${t("group", { group: g.key })}` : ""}`} data={data} />
      <table className={`tscreen__table${rows.length > 10 ? " is-dense" : ""}`}>
        <thead>
          <tr>
            <th>#</th><th className="is-team">{t("col_team")}</th><th>{t("col_played")}</th><th>{t("col_wdl")}</th><th>{t("col_diff")}</th><th>{t("col_points")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.teamId}>
              <td>{r.rank}</td>
              <td className="is-team">{names.get(r.teamId) ?? "?"}</td>
              <td>{r.played}</td>
              <td>{r.wins}-{r.draws}-{r.losses}</td>
              <td>{r.goalDiff > 0 ? `+${r.goalDiff}` : r.goalDiff}</td>
              <td className="is-points">{r.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UpcomingSlide({ data, now, t }: { data: ScreenData; now: number; t: T }) {
  const list = data.matches.filter((m) => m.status === "SCHEDULED" || m.status === "LIVE").slice(0, 6);
  return (
    <div className="tscreen__page">
      <SlideHeader title={t("upcoming_title")} data={data} />
      <ul className="tscreen__list">
        {list.map((m) => (
          <li key={m.id} className={m.status === "LIVE" ? "is-live" : ""}>
            <span className="tscreen__list-time">{m.status === "LIVE" ? t("live") : hhmm(m.startAt, data)}</span>
            <span className="tscreen__list-court">{m.courtName.replace(/^Court /, t("court_short"))}</span>
            <span className="tscreen__list-match">{m.teamA?.name ?? t("tbd")} <em>{t("vs")}</em> {m.teamB?.name ?? t("tbd")}</span>
            <span className="tscreen__list-meta">
              {stageLabel(m, data.stages, t)}
              {m.referee && <span className="tscreen__list-ref"> · 🟨 {t("referee", { name: m.referee })}</span>}
            </span>
          </li>
        ))}
      </ul>
      {list.length > 0 && list[0].status !== "LIVE" && <p className="tscreen__foot">{startsIn(list[0], now, data, t)}</p>}
    </div>
  );
}

/** Prochains arbitrages : l'équipe arbitre en grand, pour que chacun sache quand y aller. */
function RefereesSlide({ data, t }: { data: ScreenData; t: T }) {
  const list = data.matches.filter((m) => (m.status === "SCHEDULED" || m.status === "LIVE") && m.referee).slice(0, 6);
  return (
    <div className="tscreen__page">
      <SlideHeader title={t("referees_title")} data={data} />
      <ul className="tscreen__list">
        {list.map((m) => (
          <li key={m.id} className={m.status === "LIVE" ? "is-live" : ""}>
            <span className="tscreen__list-time">{m.status === "LIVE" ? t("live") : hhmm(m.startAt, data)}</span>
            <span className="tscreen__list-court">{m.courtName.replace(/^Court /, t("court_short"))}</span>
            <span className="tscreen__list-match">🟨 {m.referee}</span>
            <span className="tscreen__list-meta">{m.teamA?.name ?? t("tbd")} {t("vs")} {m.teamB?.name ?? t("tbd")} · {stageLabel(m, data.stages, t)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ResultsSlide({ data, t }: { data: ScreenData; t: T }) {
  const list = data.matches.filter((m) => m.status === "FINISHED" && m.teamBId).slice(-6).reverse();
  return (
    <div className="tscreen__page">
      <SlideHeader title={t("results_title")} data={data} />
      <ul className="tscreen__list">
        {list.map((m) => (
          <li key={m.id}>
            <span className={`tscreen__list-team${m.winnerTeamId === m.teamAId ? " is-win" : ""}`}>{m.teamA?.name ?? "?"}</span>
            <span className="tscreen__list-score">{m.scoreA} – {m.scoreB}</span>
            <span className={`tscreen__list-team is-right${m.winnerTeamId === m.teamBId ? " is-win" : ""}`}>{m.teamB?.name ?? "?"}</span>
            <span className="tscreen__list-meta">{stageLabel(m, data.stages, t)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Tableau (SE/DE) mis à l'échelle de l'écran ; placement = liste des matchs. */
function BracketSlide({ stageOrder, data, t }: { stageOrder: number; data: ScreenData; t: T }) {
  const stage = data.stages.find((s) => s.order === stageOrder);
  const matches = data.matches.filter((m) => m.stageId === stage?.id);
  const boxRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  // Remonte le tableau quand un résultat change (il garde sinon ses données initiales).
  const version = matches.map((m) => `${m.status}${m.scoreA}${m.scoreB}${m.teamAId ?? ""}${m.teamBId ?? ""}`).join("|");
  useEffect(() => {
    const fit = () => {
      const box = boxRef.current, inner = innerRef.current;
      if (!box || !inner) return;
      const w = inner.scrollWidth, h = inner.scrollHeight;
      if (!w || !h) return;
      setScale(Math.min(box.clientWidth / w, box.clientHeight / h, 2.2));
    };
    fit();
    const ro = new ResizeObserver(fit);
    if (boxRef.current) ro.observe(boxRef.current);
    const late = setTimeout(fit, 300);
    return () => { ro.disconnect(); clearTimeout(late); };
  }, [version]);
  if (!stage) return null;

  if (stage.type === "PLACEMENT") {
    return (
      <div className="tscreen__page">
        <SlideHeader title={stage.name} data={data} />
        <ul className="tscreen__list">
          {matches.map((m) => (
            <li key={m.id}>
              <span className="tscreen__list-team">{m.teamA?.name ?? t("tbd")}</span>
              <span className="tscreen__list-score">{m.status === "SCHEDULED" ? t("vs") : `${m.scoreA} – ${m.scoreB}`}</span>
              <span className="tscreen__list-team is-right">{m.teamB?.name ?? t("tbd")}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const teams = stage.entries.map((e) => ({ id: e.teamId, name: teamNames(data).get(e.teamId) ?? "?", bracketNumber: e.slot }));
  return (
    <div className="tscreen__page">
      <SlideHeader title={stage.name} data={data} />
      <div className="tscreen__bracket" ref={boxRef}>
        <div ref={innerRef} className="tscreen__bracket-inner" style={{ transform: `scale(${scale})` }}>
          <BracketView key={version} matches={matches as never} tournamentId={data.tournament.id} teams={teams} isOrganizer={false} isLive={false} />
        </div>
      </div>
    </div>
  );
}

function SponsorsSlide({ data, t }: { data: ScreenData; t: T }) {
  return (
    <div className="tscreen__page">
      <SlideHeader title={t("sponsors_title")} data={data} />
      <div className="tscreen__sponsors">
        {data.sponsors.map((s) => (
          <div key={s.id} className="tscreen__sponsor">
            {s.logoPath ? <img src={s.logoPath} alt={s.name} /> : <span>{s.name}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function QrSlide({ data, t }: { data: ScreenData; t: T }) {
  const locale = useLocale();
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const url = `${origin}/tournament/${data.tournament.slug}`;
  return (
    <div className="tscreen__page tscreen__qr">
      <div className="tscreen__qr-code">{origin && <QRCodeSVG value={url} size={512} level="M" bgColor="#ffffff" fgColor="#111111" />}</div>
      <div>
        <div className="tscreen__qr-title">{t("qr_title")}</div>
        <div className="tscreen__qr-sub">{t("qr_sub")}</div>
        <div className="tscreen__qr-url">{origin.replace(/^https?:\/\//, "")}/{locale}/tournament/{data.tournament.slug}</div>
      </div>
    </div>
  );
}

const teamNames = (d: ScreenData) => new Map(d.teams.map((x) => [x.id, x.name]));
