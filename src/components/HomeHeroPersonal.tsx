"use client";

/**
 * Hero personnalisé de la home pour les joueurs connectés.
 * Remplace le hero marketing (inutile pour un compte existant) par :
 *  - le prochain tournoi du joueur en grand, avec countdown J-X et son équipe
 *    (avatars des coéquipiers)
 *  - des raccourcis : invitations de squad en attente, mes squads, mes tournois
 *  - sa carte joueur de collection à droite (tilt/holo au survol)
 */

import { Link } from "@/i18n/navigation";
import Image from "next/image";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { PlayerCollectibleCard } from "@/components/PlayerCollectibleCard";
import type { WhbpcCardData } from "@/components/WhbpcCard";

/**
 * Easter egg : au clic, un maillet de bike polo (tête perpendiculaire au
 * manche) pivote depuis son point de levier en bas à gauche, frappe la balle
 * rouge et l'envoie dans un but de hockey. Purement décoratif.
 */
// CSS injecté tel quel : en texte, serveur et navigateur ne l'écrivent pas pareil (erreur d'hydratation).
const MALLET_CSS = `
          .mallet-egg--go .egg-mallet { animation: egg-swing 0.42s cubic-bezier(.6,-0.4,.3,1.4) forwards; }
          .mallet-egg--go .egg-ball { animation: egg-roll 0.72s 0.22s cubic-bezier(.35,.5,.3,1) forwards; }
          .mallet-egg--go .egg-goal { animation: egg-net 0.34s 0.7s ease-out; }
          /* Pivot du maillet = main en haut-gauche (coords SVG). */
          @keyframes egg-swing {
            0%   { transform: rotate(0deg); }
            45%  { transform: rotate(-26deg); }   /* armé : la tête recule à gauche */
            75%  { transform: rotate(18deg); }    /* frappe : tête part vers la droite */
            100% { transform: rotate(4deg); }
          }
          @keyframes egg-roll {
            0%   { transform: translateX(0) scale(1); }
            88%  { transform: translateX(36px) scale(1); }
            100% { transform: translateX(36px) scale(0.9); opacity: 0.85; }
          }
          @keyframes egg-net {
            0%   { transform: scale(1); }
            45%  { transform: scale(1.08); }
            100% { transform: scale(1); }
          }
        `;

const CARD_SCALE = 1;

function MalletShoot({ size = 40 }: { size?: number }) {
  const [shooting, setShooting] = useState(false);

  const fire = () => {
    if (shooting) return;
    setShooting(true);
    window.setTimeout(() => setShooting(false), 1100);
  };

  return (
    <button
      type="button"
      onClick={fire}
      aria-label="⚡"
      style={{
        background: "none", border: "none", padding: 0, cursor: "pointer",
        lineHeight: 0, flexShrink: 0, borderRadius: 8, verticalAlign: "middle",
      }}
    >
      <svg
        width={size * 2.1}
        height={size}
        viewBox="0 0 84 40"
        fill="none"
        className={shooting ? "mallet-egg mallet-egg--go" : "mallet-egg"}
        aria-hidden
      >
        {/* But de face, façon hockey/handball : cadre en U (2 poteaux droits +
            barre du haut arrondie), filet en zigzag à l'intérieur, sol épais. */}
        <g className="egg-goal" style={{ transformOrigin: "67px 21px" }}>
          {/* Filet : zigzag simple, lisible même en petit format */}
          <polyline
            points="58,10 63,15 58,20 63,25 58,30 63,33"
            fill="none" stroke="var(--teal, #3aa)" strokeWidth="1" opacity="0.6"
          />
          <polyline
            points="68,10 73,15 68,20 73,25 68,30 73,33"
            fill="none" stroke="var(--teal, #3aa)" strokeWidth="1" opacity="0.6"
          />
          <polyline
            points="78,10 73,15 78,20 73,25 78,30 73,33"
            fill="none" stroke="var(--teal, #3aa)" strokeWidth="1" opacity="0.6"
          />
          {/* Cadre en U : poteau gauche, barre haute arrondie, poteau droit */}
          <path
            d="M56 34 L56 8 Q56 6 58 6 L76 6 Q78 6 78 8 L78 34"
            stroke="var(--border)" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"
          />
          {/* Sol / base noire épaisse sous le but */}
          <line x1="53" y1="34.5" x2="81" y2="34.5" stroke="var(--border)" strokeWidth="3.4" strokeLinecap="round" />
        </g>

        {/* Balle rouge, au sol */}
        <circle className="egg-ball" cx="30" cy="30" r="4.6" fill="var(--pink, #e5484d)" stroke="var(--border)" strokeWidth="1.8" />

        {/* Maillet : manche descend du haut-gauche vers la tête EN BAS (au sol),
            tête ⊥ (en T) prête à frapper la balle. Pivot = haut du manche (main). */}
        <g className="egg-mallet" style={{ transformOrigin: "9px 7px" }}>
          {/* Manche : (9,7) haut-gauche → (22,30) bas, angle ~+60° */}
          <line x1="9" y1="7" x2="22" y2="30" stroke="var(--border)" strokeWidth="2.8" strokeLinecap="round" />
          {/* Tête : centrée sur le bout du manche (22,30), perpendiculaire.
              Manche à +60° → tête tournée à +60-90 = -30° pour le T. */}
          <rect
            x="15.5" y="26.5" width="13" height="7" rx="3.2"
            fill="var(--yellow)" stroke="var(--border)" strokeWidth="2.2" strokeLinejoin="round"
            transform="rotate(-30 22 30)"
          />
        </g>

        <style dangerouslySetInnerHTML={{ __html: MALLET_CSS }} />
      </svg>
    </button>
  );
}

type Teammate = { id: string; name: string; photoPath: string | null };

export type HeroNextTournament = {
  id: string;
  slug: string | null;
  name: string;
  city: string;
  country: string;
  dateStart: string; // ISO
  dateEnd: string;   // ISO
  teamName: string | null;
  teammates: Teammate[];
};

export type HeroOtherTournament = {
  id: string;
  slug: string | null;
  name: string;
  city: string;
  dateStart: string; // ISO
};


export type HeroAwaitingDraw = {
  id: string;
  slug: string | null;
  name: string;
  city: string;
  dateStart: string; // ISO
};

export type HeroPlayer = {
  name: string;
  country: string;
  city: string | null;
  photoPath: string | null;
  clubLogoPath: string | null;
  clubName: string | null;
  teamLogoPath: string | null;
  badges: string[];
  pinnedBadges: string[];
  startYear: number | null;
  activeCard: string | null;
  whbpcData: (WhbpcCardData & { hand: "RIGHTIE" | "LEFTIE" }) | null;
  coachData?: { tournament: string; city: string; collectorNumber: string } | null;
};

export function HomeHeroPersonal({
  me,
  next,
  others,
  awaitingDraw,
  inviteCount,
  squadCount,
  locale,
  trainingSlot,
}: {
  me: HeroPlayer;
  next: HeroNextTournament | null;
  others: HeroOtherTournament[];
  awaitingDraw: HeroAwaitingDraw[];
  inviteCount: number;
  squadCount: number;
  locale: string;
  /** Carte « prochain entraînement », placée sous le prochain tournoi. */
  trainingSlot?: React.ReactNode;
}) {
  const t = useTranslations("home");
  const firstName = me.name.split(/\s+/)[0];

  const daysUntil = next
    ? Math.max(0, Math.ceil((new Date(next.dateStart).getTime() - Date.now()) / 86400000))
    : 0;

  // Tournoi en cours : commencé et pas encore fini (fin de journée du dernier
  // jour). On l'affiche « En cours » plutôt qu'un J-0 trompeur, et il reste
  // épinglé dans le hero le temps du tournoi.
  const isOngoing = !!next && (() => {
    const now = Date.now();
    const startedMs = new Date(next.dateStart).getTime();
    const endOfLastDay = new Date(next.dateEnd).getTime() + 86400000; // fin du jour de dateEnd
    return now >= startedMs && now < endOfLastDay;
  })();

  const dateRange = next
    ? (() => {
        const ds = new Date(next.dateStart);
        const de = new Date(next.dateEnd);
        const sameMonth = ds.getUTCMonth() === de.getUTCMonth() && ds.getUTCFullYear() === de.getUTCFullYear();
        // Dates de tournoi = jours (minuit UTC) : formatées en UTC, sinon la veille
        // s'affiche à l'ouest de Greenwich (et le serveur ≠ le navigateur).
        const dayFmt: Intl.DateTimeFormatOptions = { day: "numeric", timeZone: "UTC" };
        const fullFmt: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", timeZone: "UTC" };
        if (ds.toISOString().slice(0, 10) === de.toISOString().slice(0, 10)) return ds.toLocaleDateString(locale, fullFmt);
        return sameMonth
          ? `${ds.toLocaleDateString(locale, dayFmt)}–${de.toLocaleDateString(locale, fullFmt)}`
          : `${ds.toLocaleDateString(locale, fullFmt)} – ${de.toLocaleDateString(locale, fullFmt)}`;
      })()
    : "";

  const teammateNames = next?.teammates.map((p) => p.name.split(/\s+/)[0]).slice(0, 4) ?? [];
  const shortDate = (iso: string) => {
    const d = new Date(iso);
    return { day: String(d.getUTCDate()), month: d.toLocaleDateString(locale, { month: "short", timeZone: "UTC" }).replace(".", "") };
  };
  const nextDate = next ? shortDate(next.dateStart) : null;
  const hasAgenda = !!next || !!trainingSlot || others.length > 0 || awaitingDraw.length > 0;

  return (
    <section className="home-me">
      <div className="home-me__grid">
        {/* Colonne gauche : salutation, agenda, raccourcis — étalés sur la hauteur de la carte */}
        <div className="home-me__main">
          <header className="home-me__head">
            <h1>
              {t("hero_hello", { name: firstName })}
              <MalletShoot size={30} />
            </h1>
          </header>
          {/* ── À venir pour toi : une seule liste, une seule forme ── */}
          <div className="home-agenda">
            <p className="home-agenda__title">{t("agenda_title")}</p>
            {hasAgenda ? (
              <ul className="home-agenda__list">
                {next && nextDate && (
                  <li className="agenda-row agenda-row--next">
                    <Link href={`/tournament/${next.slug ?? next.id}`} className="agenda-row__date agenda-row__date--tournament">
                      <span className="agenda-row__day">{nextDate.day}</span>
                      <span className="agenda-row__month">{nextDate.month}</span>
                    </Link>
                    <Link href={`/tournament/${next.slug ?? next.id}`} className="agenda-row__main">
                      <span className="agenda-row__kicker">🏆 {t("hero_next_tournament")}</span>
                      <span className="agenda-row__title agenda-row__title--big">{next.name}</span>
                      <span className="agenda-row__meta">
                        📍 {next.city}, {next.country} · {dateRange}
                        {next.teamName && <> · <strong>{next.teamName}</strong>{teammateNames.length > 0 && <> {t("hero_with_teammates", { names: teammateNames.join(", ") })}</>}</>}
                      </span>
                    </Link>
                    <Link href={`/tournament/${next.slug ?? next.id}`} className="agenda-row__side">
                      <span className={`agenda-row__countdown${isOngoing || daysUntil === 0 ? " is-now" : ""}`}>
                        {isOngoing ? `🔥 ${t("hero_ongoing")}` : daysUntil === 0 ? t("hero_today") : t("hero_days_until", { count: daysUntil })}
                      </span>
                      <span className="agenda-row__chev" aria-hidden>›</span>
                    </Link>
                  </li>
                )}

                {trainingSlot}

                {others.slice(0, 2).map((tour) => {
                  const d = shortDate(tour.dateStart);
                  return (
                    <li key={tour.id} className="agenda-row agenda-row--small">
                      <Link href={`/tournament/${tour.slug ?? tour.id}`} className="agenda-row__date">
                        <span className="agenda-row__day">{d.day}</span>
                        <span className="agenda-row__month">{d.month}</span>
                      </Link>
                      <Link href={`/tournament/${tour.slug ?? tour.id}`} className="agenda-row__main">
                        <span className="agenda-row__title">{tour.name}</span>
                        <span className="agenda-row__meta">📍 {tour.city}</span>
                      </Link>
                      <Link href={`/tournament/${tour.slug ?? tour.id}`} className="agenda-row__side"><span className="agenda-row__chev" aria-hidden>›</span></Link>
                    </li>
                  );
                })}

                {awaitingDraw.slice(0, 2).map((tour) => {
                  const d = shortDate(tour.dateStart);
                  return (
                    <li key={tour.id} className="agenda-row agenda-row--small">
                      <Link href={`/tournament/${tour.slug ?? tour.id}`} className="agenda-row__date">
                        <span className="agenda-row__day">{d.day}</span>
                        <span className="agenda-row__month">{d.month}</span>
                      </Link>
                      <Link href={`/tournament/${tour.slug ?? tour.id}`} className="agenda-row__main">
                        <span className="agenda-row__title">{tour.name}</span>
                        <span className="agenda-row__meta">📍 {tour.city}</span>
                      </Link>
                      <span className="agenda-row__side"><span className="agenda-row__pill">🎲 {t("hero_awaiting_draw")}</span></span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="home-agenda__empty">
                <p>{t("hero_no_upcoming")}</p>
                <Link className="primary" href="/tournaments">{t("hero_browse")}</Link>
              </div>
            )}
          </div>

          {/* Raccourcis */}
          <nav className="home-me__actions">
            {inviteCount > 0 && (
              <Link href="/my-teams" className="home-chip home-chip--alert">⏳ {t("hero_chip_invites", { count: inviteCount })}</Link>
            )}
            {squadCount > 0 && <Link href="/my-teams" className="home-chip">👥 {t("hero_chip_squads", { count: squadCount })}</Link>}
            <Link href="/my-tournaments" className="home-chip">🏆 {t("hero_upcoming_see_all")}</Link>
            <Link href="/tournament/new" className="home-chip">＋ {t("hero_create")}</Link>
          </nav>
        </div>

      {/* ── Colonne droite : ma carte de collection (masquée en mobile) ──
          Pas de display inline : le masquage responsive est porté par le CSS
          (.hero-perso-card { display:none }) qu'un style inline écraserait. */}
      <div className="hero-perso-card">
        {/* Taille normale (340×520) : c'est elle qui donne la hauteur du bloc */}
        <div style={{ width: 340 * CARD_SCALE, height: 520 * CARD_SCALE }}>
          <div style={{ transform: `scale(${CARD_SCALE})`, transformOrigin: "top left" }}>
            <PlayerCollectibleCard
              name={me.name}
              country={me.country}
              city={me.city}
              photoPath={me.photoPath}
              clubLogoPath={me.clubLogoPath}
              clubName={me.clubName}
              teamLogoPath={me.teamLogoPath}
              badges={me.badges}
              pinnedBadges={me.pinnedBadges}
              startYear={me.startYear}
              activeCard={me.activeCard}
              whbpcData={me.whbpcData}
              coachData={me.coachData ?? null}
            />
          </div>
        </div>
      </div>
      </div>
    </section>
  );
}
