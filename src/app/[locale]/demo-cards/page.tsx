"use client";

import { useState } from "react";

/* ── Fake match data — 4 joueurs par equipe + 2 arbitres ── */
const DEMO_MATCHES = [
  {
    id: "m1", num: 1, status: "LIVE" as const, time: "10:30", court: "Court 1",
    phase: "Swiss R2",
    teamA: "Velocipolorators", teamB: "Les Daltons",
    scoreA: 3, scoreB: 2,
    playersA: ["Alex Dupont", "Sam Vidal", "Jo Muller", "Lea Roux"],
    playersB: ["Max Leroy", "Nico Petit", "Zoe Martin", "Hugo Blanc"],
    referee: "Oscar Odier", coReferee: "Clara Nunes",
  },
  {
    id: "m2", num: 2, status: "SCHEDULED" as const, time: "11:00", court: "Court 2",
    phase: "Swiss R2",
    teamA: "Tokyo Drift", teamB: "Fixie Riders",
    scoreA: 0, scoreB: 0,
    playersA: ["Yuki Tanaka", "Hiro Sato", "Aiko Mori", "Ken Yamada"],
    playersB: ["Lena Wolff", "Mika Berg", "Elias Kern", "Finn Scholz"],
    referee: "Baptiste M.", coReferee: "Priya Dev",
  },
  {
    id: "m3", num: 5, status: "FINISHED" as const, time: "09:00", court: "Court 1",
    phase: "Swiss R1",
    teamA: "Crank Yankers", teamB: "Spoke & Mirrors",
    scoreA: 5, scoreB: 2,
    playersA: ["Priya Dev", "Ethan Marsh", "Jin Park", "Tomás Vargas"],
    playersB: ["Clara Nunes", "Tomasz Krol", "Ines Silva", "Ravi Patel"],
    referee: "Lena Wolff", coReferee: "Sam Vidal",
  },
];

type DemoMatch = typeof DEMO_MATCHES[0];

/* ═══════════════════════════════════════════════════════════════════
   Variante A : Card actuelle + bouton ghost "Compo" pour deplier
   ═══════════════════════════════════════════════════════════════════ */
function CardA({ match }: { match: DemoMatch }) {
  const [open, setOpen] = useState(false);
  const cls = match.status.toLowerCase();
  const winA = match.status === "FINISHED" && match.scoreA > match.scoreB;
  const winB = match.status === "FINISHED" && match.scoreB > match.scoreA;
  const isLive = match.status === "LIVE";

  return (
    <div>
      <div className={`match-card match-card--${cls}`}>
        <div className="match-card__corner match-card__corner--tl">
          <span className="match-card__number">{match.num}</span>
          <span className="pill">{isLive ? "Sur court" : match.status === "FINISHED" ? "Termine" : "Suivant"}</span>
        </div>
        <div className="match-card__corner match-card__corner--tr">
          <span>{isLive ? "07:42" : match.time}</span>
        </div>
        <div className="match-card__center">
          <div className={`match-card__team${winA ? " match-winner" : ""}`}>{match.teamA}</div>
          <div className="match-card__score">
            <span>{match.scoreA}</span>
            <span style={{ opacity: 0.4, fontSize: 14 }}>&ndash;</span>
            <span>{match.scoreB}</span>
          </div>
          <div className={`match-card__team${winB ? " match-winner" : ""}`}>{match.teamB}</div>
          {match.referee && <div className="match-card__referees"><span>🏁 {match.referee}{match.coReferee ? ` · ${match.coReferee}` : ""}</span></div>}
        </div>
        <div className="match-card__corner match-card__corner--bl">
          <span className="pill">{match.phase}</span>
        </div>
        <div className={`match-card__corner match-card__corner--br match-card__status--${cls}`}>
          {isLive ? <><span className="match-card__live-label">Live</span><span className="match-card__live-dot"/></> : <span>{match.status === "FINISHED" ? "\u2713" : "\u2014"}</span>}
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "center", marginTop: 6 }}>
        <button
          className="ghost"
          type="button"
          onClick={() => setOpen(!open)}
          style={{ padding: "4px 14px", fontSize: 11 }}
        >
          {open ? "\u25be Compo" : "\u25b8 Compo"}
        </button>
      </div>
      {open && (
        <div className="dmc-compo-panel">
          <div className="dmc-compo-panel__side">
            <strong>{match.teamA}</strong>
            {match.playersA.map(n => <span key={n}>{n}</span>)}
          </div>
          <div className="dmc-compo-panel__side" style={{ textAlign: "right" }}>
            <strong>{match.teamB}</strong>
            {match.playersB.map(n => <span key={n}>{n}</span>)}
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Variante B : Layout repense — horizontal, equipes face a face
   Score gros au centre, joueurs toujours visibles
   ═══════════════════════════════════════════════════════════════════ */
function CardB({ match }: { match: DemoMatch }) {
  const cls = match.status.toLowerCase();
  const winA = match.status === "FINISHED" && match.scoreA > match.scoreB;
  const winB = match.status === "FINISHED" && match.scoreB > match.scoreA;
  const isLive = match.status === "LIVE";

  return (
    <div className={`dmc-v2 dmc-v2--${cls}`}>
      <div className="dmc-v2__bar">
        <span>#{match.num} &middot; {match.phase} &middot; {match.court}</span>
        <span className={isLive ? "dmc-v2__live" : ""}>{isLive ? "07:42" : match.time}</span>
      </div>
      <div className="dmc-v2__body">
        <div className={`dmc-v2__team${winA ? " dmc-v2__team--win" : ""}`}>
          <span className="dmc-v2__name">{match.teamA}</span>
          <span className="dmc-v2__roster">{match.playersA.join(" \u00b7 ")}</span>
        </div>
        <div className="dmc-v2__score">
          {match.scoreA} <span className="dmc-v2__dash">&ndash;</span> {match.scoreB}
        </div>
        <div className={`dmc-v2__team dmc-v2__team--right${winB ? " dmc-v2__team--win" : ""}`}>
          <span className="dmc-v2__name">{match.teamB}</span>
          <span className="dmc-v2__roster">{match.playersB.join(" \u00b7 ")}</span>
        </div>
      </div>
      {match.referee && <div className="dmc-v2__ref">🏁 {match.referee}{match.coReferee ? ` · ${match.coReferee}` : ""}</div>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Variante C : Card verticale compacte — chaque equipe = une bande
   ═══════════════════════════════════════════════════════════════════ */
function CardC({ match }: { match: DemoMatch }) {
  const cls = match.status.toLowerCase();
  const winA = match.status === "FINISHED" && match.scoreA > match.scoreB;
  const winB = match.status === "FINISHED" && match.scoreB > match.scoreA;
  const isLive = match.status === "LIVE";

  return (
    <div className={`dmc-v3 dmc-v3--${cls}`}>
      <div className="dmc-v3__header">
        <span className="dmc-v3__num">{match.num}</span>
        <span>{match.phase} &middot; {match.court}</span>
        <span className={isLive ? "dmc-v3__live" : ""}>{isLive ? "07:42" : match.time}</span>
      </div>
      <div className={`dmc-v3__row${winA ? " dmc-v3__row--win" : ""}`}>
        <div className="dmc-v3__info">
          <span className="dmc-v3__name">{match.teamA}</span>
          <span className="dmc-v3__roster">{match.playersA.join(", ")}</span>
        </div>
        <span className="dmc-v3__sc">{match.scoreA}</span>
      </div>
      <div className={`dmc-v3__row${winB ? " dmc-v3__row--win" : ""}`}>
        <div className="dmc-v3__info">
          <span className="dmc-v3__name">{match.teamB}</span>
          <span className="dmc-v3__roster">{match.playersB.join(", ")}</span>
        </div>
        <span className="dmc-v3__sc">{match.scoreB}</span>
      </div>
      {match.referee && <div className="dmc-v3__footer">🏁 {match.referee}{match.coReferee ? ` · ${match.coReferee}` : ""}</div>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Variante D : Card actuelle + joueurs en filigrane en bas
   ═══════════════════════════════════════════════════════════════════ */
function CardD({ match }: { match: DemoMatch }) {
  const cls = match.status.toLowerCase();
  const winA = match.status === "FINISHED" && match.scoreA > match.scoreB;
  const winB = match.status === "FINISHED" && match.scoreB > match.scoreA;
  const isLive = match.status === "LIVE";

  return (
    <div className={`match-card match-card--${cls}`}>
      <div className="match-card__corner match-card__corner--tl">
        <span className="match-card__number">{match.num}</span>
        <span className="pill">{isLive ? "Sur court" : match.status === "FINISHED" ? "Termine" : "Suivant"}</span>
      </div>
      <div className="match-card__corner match-card__corner--tr">
        <span>{isLive ? "07:42" : match.time}</span>
      </div>
      <div className="match-card__center">
        <div className={`match-card__team${winA ? " match-winner" : ""}`}>
          {match.teamA}
          <div className="dmc-players-sub">{match.playersA.join(" \u00b7 ")}</div>
        </div>
        <div className="match-card__score">
          <span>{match.scoreA}</span>
          <span style={{ opacity: 0.4, fontSize: 14 }}>&ndash;</span>
          <span>{match.scoreB}</span>
        </div>
        <div className={`match-card__team${winB ? " match-winner" : ""}`}>
          {match.teamB}
          <div className="dmc-players-sub">{match.playersB.join(" \u00b7 ")}</div>
        </div>
        {match.referee && <div className="match-card__referees"><span>🏁 {match.referee}{match.coReferee ? ` · ${match.coReferee}` : ""}</span></div>}
      </div>
      <div className="match-card__corner match-card__corner--bl">
        <span className="pill">{match.phase}</span>
      </div>
      <div className={`match-card__corner match-card__corner--br match-card__status--${cls}`}>
        {isLive ? <><span className="match-card__live-label">Live</span><span className="match-card__live-dot"/></> : <span>{match.status === "FINISHED" ? "\u2713" : "\u2014"}</span>}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Variante E : Card cliquable — clic = voile overlay avec compos
   Pas de bouton visible, toute la card est interactive
   ═══════════════════════════════════════════════════════════════════ */
function CardE({ match }: { match: DemoMatch }) {
  const [open, setOpen] = useState(false);
  const cls = match.status.toLowerCase();
  const winA = match.status === "FINISHED" && match.scoreA > match.scoreB;
  const winB = match.status === "FINISHED" && match.scoreB > match.scoreA;
  const isLive = match.status === "LIVE";

  return (
    <div className="dmc-v5">
      <div className={`match-card match-card--${cls}`}>
        <div className="match-card__corner match-card__corner--tl">
          <span className="match-card__number">{match.num}</span>
          <span className="pill">{isLive ? "Sur court" : match.status === "FINISHED" ? "Termine" : "Suivant"}</span>
        </div>
        <div className="match-card__corner match-card__corner--tr">
          <span>{isLive ? "07:42" : match.time}</span>
        </div>
        <div className="match-card__center">
          <div className={`match-card__team${winA ? " match-winner" : ""}`}>{match.teamA}</div>
          <div className="match-card__score">
            <span>{match.scoreA}</span>
            <span style={{ opacity: 0.4, fontSize: 14 }}>&ndash;</span>
            <span>{match.scoreB}</span>
          </div>
          <div className={`match-card__team${winB ? " match-winner" : ""}`}>{match.teamB}</div>
          {match.referee && <div className="match-card__referees"><span>🏁 {match.referee}{match.coReferee ? ` · ${match.coReferee}` : ""}</span></div>}
        </div>
        <button className="dmc-v5__fab" type="button" onClick={() => setOpen(true)}>
          {/* Maillet flat SVG */}
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="6" y1="18" x2="16" y2="4"/>
            <rect x="13" y="1" width="8" height="4" rx="1.5" transform="rotate(20 17 3)" fill="currentColor" stroke="none"/>
          </svg>
        </button>
        <div className="match-card__corner match-card__corner--bl">
          <span className="pill">{match.phase}</span>
        </div>
        <div className={`match-card__corner match-card__corner--br match-card__status--${cls}`}>
          {isLive ? <><span className="match-card__live-label">Live</span><span className="match-card__live-dot"/></> : <span>{match.status === "FINISHED" ? "\u2713" : "\u2014"}</span>}
        </div>
      </div>
      {open && (
        <div className="dmc-v5__overlay" onClick={() => setOpen(false)}>
          <button className="dmc-v5__close" type="button" onClick={(e) => { e.stopPropagation(); setOpen(false); }}>&times;</button>
          <div className="dmc-v5__overlay-side" style={{ alignItems: "flex-start", textAlign: "left" }}>
            <strong>{match.teamA}</strong>
            <span>{match.playersA.join(" · ")}</span>
          </div>
          <div className="dmc-v5__overlay-side" style={{ alignItems: "flex-end", textAlign: "right" }}>
            <strong>{match.teamB}</strong>
            <span>{match.playersB.join(" · ")}</span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Variante E2 : overlay split — chaque côté a sa couleur ── */
function CardE2({ match }: { match: DemoMatch }) {
  const [open, setOpen] = useState(false);
  const cls = match.status.toLowerCase();
  const winA = match.status === "FINISHED" && match.scoreA > match.scoreB;
  const winB = match.status === "FINISHED" && match.scoreB > match.scoreA;
  const isLive = match.status === "LIVE";

  return (
    <div className="dmc-v5">
      <div className={`match-card match-card--${cls}`}>
        <div className="match-card__corner match-card__corner--tl">
          <span className="match-card__number">{match.num}</span>
          <span className="pill">{isLive ? "Sur court" : match.status === "FINISHED" ? "Termine" : "Suivant"}</span>
        </div>
        <div className="match-card__corner match-card__corner--tr">
          <span>{isLive ? "07:42" : match.time}</span>
        </div>
        <div className="match-card__center">
          <div className={`match-card__team${winA ? " match-winner" : ""}`}>{match.teamA}</div>
          <div className="match-card__score">
            <span>{match.scoreA}</span>
            <span style={{ opacity: 0.4, fontSize: 14 }}>&ndash;</span>
            <span>{match.scoreB}</span>
          </div>
          <div className={`match-card__team${winB ? " match-winner" : ""}`}>{match.teamB}</div>
          {match.referee && <div className="match-card__referees"><span>🏁 {match.referee}{match.coReferee ? ` · ${match.coReferee}` : ""}</span></div>}
        </div>
        <button className="dmc-v5__fab" type="button" onClick={() => setOpen(true)}>
          {/* 3 silhouettes lineup */}
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <circle cx="7" cy="6" r="2.5"/>
            <path d="M3.5 17v-1.5a3.5 3.5 0 0 1 7 0V17"/>
            <circle cx="17" cy="6" r="2.5"/>
            <path d="M13.5 17v-1.5a3.5 3.5 0 0 1 7 0V17"/>
            <circle cx="12" cy="4" r="2" opacity="0.4"/>
            <path d="M9 15v-1a3 3 0 0 1 6 0v1" opacity="0.4"/>
          </svg>
        </button>
        <div className="match-card__corner match-card__corner--bl">
          <span className="pill">{match.phase}</span>
        </div>
        <div className={`match-card__corner match-card__corner--br match-card__status--${cls}`}>
          {isLive ? <><span className="match-card__live-label">Live</span><span className="match-card__live-dot"/></> : <span>{match.status === "FINISHED" ? "\u2713" : "\u2014"}</span>}
        </div>
      </div>
      {open && (
        <div className="dmc-v5__overlay dmc-v5__overlay--split" onClick={() => setOpen(false)}>
          <button className="dmc-v5__close" type="button" onClick={(e) => { e.stopPropagation(); setOpen(false); }}>&times;</button>
          <div className="dmc-v5__split-half dmc-v5__split-half--left">
            <strong>{match.teamA}</strong>
            {match.playersA.map(n => <span key={n}>{n}</span>)}
          </div>
          <div className="dmc-v5__split-half dmc-v5__split-half--right">
            <strong>{match.teamB}</strong>
            {match.playersB.map(n => <span key={n}>{n}</span>)}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Variante E3 : overlay card retournée — même forme, contenu différent ── */
function CardE3({ match }: { match: DemoMatch }) {
  const [open, setOpen] = useState(false);
  const cls = match.status.toLowerCase();
  const winA = match.status === "FINISHED" && match.scoreA > match.scoreB;
  const winB = match.status === "FINISHED" && match.scoreB > match.scoreA;
  const isLive = match.status === "LIVE";

  return (
    <div className="dmc-v5">
      <div className={`match-card match-card--${cls}`}>
        <div className="match-card__corner match-card__corner--tl">
          <span className="match-card__number">{match.num}</span>
          <span className="pill">{isLive ? "Sur court" : match.status === "FINISHED" ? "Termine" : "Suivant"}</span>
        </div>
        <div className="match-card__corner match-card__corner--tr">
          <span>{isLive ? "07:42" : match.time}</span>
        </div>
        <div className="match-card__center">
          <div className={`match-card__team${winA ? " match-winner" : ""}`}>{match.teamA}</div>
          <div className="match-card__score">
            <span>{match.scoreA}</span>
            <span style={{ opacity: 0.4, fontSize: 14 }}>&ndash;</span>
            <span>{match.scoreB}</span>
          </div>
          <div className={`match-card__team${winB ? " match-winner" : ""}`}>{match.teamB}</div>
          {match.referee && <div className="match-card__referees"><span>🏁 {match.referee}{match.coReferee ? ` · ${match.coReferee}` : ""}</span></div>}
        </div>
        <button className="dmc-v5__fab" type="button" onClick={() => setOpen(true)}>
          {/* 3 points */}
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 24" width="22" height="18" fill="currentColor">
            <circle cx="5" cy="12" r="2.5"/>
            <circle cx="15" cy="12" r="2.5"/>
            <circle cx="25" cy="12" r="2.5"/>
          </svg>
        </button>
        <div className="match-card__corner match-card__corner--bl">
          <span className="pill">{match.phase}</span>
        </div>
        <div className={`match-card__corner match-card__corner--br match-card__status--${cls}`}>
          {isLive ? <><span className="match-card__live-label">Live</span><span className="match-card__live-dot"/></> : <span>{match.status === "FINISHED" ? "\u2713" : "\u2014"}</span>}
        </div>
      </div>
      {open && (
        <div className="dmc-v5__overlay dmc-v5__overlay--card" onClick={() => setOpen(false)}>
          <button className="dmc-v5__close" type="button" onClick={(e) => { e.stopPropagation(); setOpen(false); }}>&times;</button>
          <div className="dmc-v5__card-team">
            <strong className="dmc-v5__card-name dmc-v5__card-name--left">{match.teamA}</strong>
            <div className="dmc-v5__card-players">{match.playersA.join(" · ")}</div>
          </div>
          <div className="dmc-v5__card-vs">VS</div>
          <div className="dmc-v5__card-team">
            <strong className="dmc-v5__card-name dmc-v5__card-name--right">{match.teamB}</strong>
            <div className="dmc-v5__card-players">{match.playersB.join(" · ")}</div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */

export default function DemoCardsPage() {
  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh" }}>
      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "40px 20px" }}>

        <div style={{ textAlign: "center", paddingTop: 16, paddingBottom: 40 }}>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 32, fontWeight: 900, letterSpacing: "0.06em", marginBottom: 8 }}>
            MATCH CARDS
          </h1>
          <p style={{ color: "var(--text-muted)", maxWidth: 500, margin: "0 auto", fontSize: 14, lineHeight: 1.7 }}>
            7 variantes pour afficher les compositions dans le planning.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 48 }}>

          {/* A */}
          <div>
            <h3 style={{ fontFamily: "var(--font-display)", fontSize: 13, marginBottom: 6, textAlign: "center", letterSpacing: "0.1em", textTransform: "uppercase" }}>
              A &mdash; Bouton &laquo; Compo &raquo;
            </h3>
            <p style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center", marginBottom: 14, lineHeight: 1.5 }}>
              Card intacte. Bouton ghost en dessous pour deplier.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {DEMO_MATCHES.map(m => <CardA key={m.id} match={m} />)}
            </div>
          </div>

          {/* B */}
          <div>
            <h3 style={{ fontFamily: "var(--font-display)", fontSize: 13, marginBottom: 6, textAlign: "center", letterSpacing: "0.1em", textTransform: "uppercase" }}>
              B &mdash; Face a face
            </h3>
            <p style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center", marginBottom: 14, lineHeight: 1.5 }}>
              Nouveau layout horizontal. Joueurs toujours visibles.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {DEMO_MATCHES.map(m => <CardB key={m.id} match={m} />)}
            </div>
          </div>

          {/* C */}
          <div>
            <h3 style={{ fontFamily: "var(--font-display)", fontSize: 13, marginBottom: 6, textAlign: "center", letterSpacing: "0.1em", textTransform: "uppercase" }}>
              C &mdash; Bandes
            </h3>
            <p style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center", marginBottom: 14, lineHeight: 1.5 }}>
              Chaque equipe sur sa bande. Score a droite.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {DEMO_MATCHES.map(m => <CardC key={m.id} match={m} />)}
            </div>
          </div>

          {/* D */}
          <div>
            <h3 style={{ fontFamily: "var(--font-display)", fontSize: 13, marginBottom: 6, textAlign: "center", letterSpacing: "0.1em", textTransform: "uppercase" }}>
              D &mdash; Sous le nom
            </h3>
            <p style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center", marginBottom: 14, lineHeight: 1.5 }}>
              Card actuelle avec joueurs en petit sous chaque equipe.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {DEMO_MATCHES.map(m => <CardD key={m.id} match={m} />)}
            </div>
          </div>

          {/* E1 — pixel art */}
          <div>
            <h3 style={{ fontFamily: "var(--font-display)", fontSize: 13, marginBottom: 6, textAlign: "center", letterSpacing: "0.1em", textTransform: "uppercase" }}>
              E1 &mdash; Maillet
            </h3>
            <p style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center", marginBottom: 14, lineHeight: 1.5 }}>
              Icone maillet flat. Overlay gauche/droite.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {DEMO_MATCHES.map(m => <CardE key={m.id} match={m} />)}
            </div>
          </div>

          {/* E2 — split */}
          <div>
            <h3 style={{ fontFamily: "var(--font-display)", fontSize: 13, marginBottom: 6, textAlign: "center", letterSpacing: "0.1em", textTransform: "uppercase" }}>
              E2 &mdash; 3 silhouettes
            </h3>
            <p style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center", marginBottom: 14, lineHeight: 1.5 }}>
              Icone groupe. Overlay split bicolore.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {DEMO_MATCHES.map(m => <CardE2 key={m.id} match={m} />)}
            </div>
          </div>

          {/* E3 — card retournée */}
          <div>
            <h3 style={{ fontFamily: "var(--font-display)", fontSize: 13, marginBottom: 6, textAlign: "center", letterSpacing: "0.1em", textTransform: "uppercase" }}>
              E3 &mdash; Pixel art equipe
            </h3>
            <p style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center", marginBottom: 14, lineHeight: 1.5 }}>
              3 joueurs + velo pixel art. Overlay VS central.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {DEMO_MATCHES.map(m => <CardE3 key={m.id} match={m} />)}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
