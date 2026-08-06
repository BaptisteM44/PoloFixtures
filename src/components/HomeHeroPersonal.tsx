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
import { useState } from "react";
import { useTranslations } from "next-intl";
import { PlayerCollectibleCard } from "@/components/PlayerCollectibleCard";
import type { WhbpcCardData } from "@/components/WhbpcCard";

/**
 * Easter egg : au clic, un maillet de bike polo (tête perpendiculaire au
 * manche) pivote depuis son point de levier en bas à gauche, frappe la balle
 * rouge et l'envoie dans un but de hockey. Purement décoratif.
 */
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

        <style>{`
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
        `}</style>
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

export type HeroClubSession = {
  id: string;
  title: string | null;
  date: string; // ISO
  clubId: string;
  clubName: string;
  place: string | null;
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
};

export function HomeHeroPersonal({
  me,
  next,
  others,
  sessions,
  awaitingDraw,
  inviteCount,
  squadCount,
  locale,
}: {
  me: HeroPlayer;
  next: HeroNextTournament | null;
  others: HeroOtherTournament[];
  sessions: HeroClubSession[];
  awaitingDraw: HeroAwaitingDraw[];
  inviteCount: number;
  squadCount: number;
  locale: string;
}) {
  const t = useTranslations("home");
  const firstName = me.name.split(/\s+/)[0];

  const daysUntil = next
    ? Math.max(0, Math.ceil((new Date(next.dateStart).getTime() - Date.now()) / 86400000))
    : 0;

  const dateRange = next
    ? (() => {
        const ds = new Date(next.dateStart);
        const de = new Date(next.dateEnd);
        const sameMonth = ds.getMonth() === de.getMonth() && ds.getFullYear() === de.getFullYear();
        const dayFmt: Intl.DateTimeFormatOptions = { day: "numeric" };
        const fullFmt: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
        if (ds.toDateString() === de.toDateString()) return ds.toLocaleDateString(locale, fullFmt);
        return sameMonth
          ? `${ds.toLocaleDateString(locale, dayFmt)}–${de.toLocaleDateString(locale, fullFmt)}`
          : `${ds.toLocaleDateString(locale, fullFmt)} – ${de.toLocaleDateString(locale, fullFmt)}`;
      })()
    : "";

  const teammateNames = next?.teammates.map((p) => p.name.split(/\s+/)[0]).slice(0, 4) ?? [];

  return (
    <section className="hero">
      {/* ── Colonne gauche : mon actu ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
        <h1 style={{ marginBottom: 0, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span>{t("hero_hello", { name: firstName })}</span>
          <MalletShoot size={40} />
        </h1>

        {next ? (
          <div
            className="panel"
            style={{ padding: 0, overflow: "hidden", boxShadow: "var(--shadow-lg)" }}
          >
            <div style={{ display: "flex", alignItems: "stretch" }}>
              {/* Countdown */}
              <div
                style={{
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                  padding: "18px 22px", background: "var(--yellow)", borderRight: "2px solid var(--border)",
                  flexShrink: 0, minWidth: 96,
                }}
              >
                <span style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: daysUntil > 99 ? 26 : 34, lineHeight: 1, color: "var(--border)" }}>
                  {daysUntil === 0 ? "🔥" : t("hero_days_until", { count: daysUntil })}
                </span>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginTop: 6, color: "var(--border)", opacity: 0.75, textAlign: "center" }}>
                  {daysUntil === 0 ? t("hero_today") : t("hero_next_tournament")}
                </span>
              </div>

              {/* Infos tournoi */}
              <div style={{ padding: "16px 20px", minWidth: 0, flex: 1 }}>
                <Link
                  href={`/tournament/${next.slug ?? next.id}`}
                  style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 20, textDecoration: "none", color: "inherit", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                >
                  {next.name}
                </Link>
                <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 2 }}>
                  {next.city}, {next.country} · {dateRange}
                </div>

                {/* Mon équipe pour ce tournoi */}
                {next.teamName && (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
                    <div style={{ display: "flex" }}>
                      {next.teammates.slice(0, 4).map((p, i) => (
                        <div
                          key={p.id}
                          title={p.name}
                          style={{
                            width: 30, height: 30, borderRadius: "50%", overflow: "hidden",
                            border: "2px solid var(--bg)", marginLeft: i === 0 ? 0 : -9,
                            background: "var(--border)", display: "flex", alignItems: "center", justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          {p.photoPath ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.photoPath} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          ) : (
                            <span style={{ fontSize: 12, fontWeight: 800, color: "#fff" }}>{p.name[0]?.toUpperCase()}</span>
                          )}
                        </div>
                      ))}
                    </div>
                    <div style={{ fontSize: 13, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      <strong>{next.teamName}</strong>
                      {teammateNames.length > 0 && (
                        <span style={{ color: "var(--text-muted)" }}> · {t("hero_with_teammates", { names: teammateNames.join(", ") })}</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="panel" style={{ padding: "18px 20px" }}>
            <p style={{ margin: 0, fontSize: 14, color: "var(--text-muted)" }}>{t("hero_no_upcoming")}</p>
            <Link className="primary" href="/tournaments" style={{ marginTop: 12, display: "inline-flex", fontSize: 13 }}>
              {t("hero_browse")}
            </Link>
          </div>
        )}

        {/* Autres tournois à venir */}
        {others.length > 0 && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {others.slice(0, 3).map((tour) => (
              <Link
                key={tour.id}
                href={`/tournament/${tour.slug ?? tour.id}`}
                style={{
                  textDecoration: "none", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "5px 12px", borderRadius: 20, border: "2px solid var(--border)",
                  background: "var(--surface)", color: "inherit", fontWeight: 600,
                }}
              >
                <span style={{ color: "var(--teal)", fontWeight: 700 }}>
                  {new Date(tour.dateStart).toLocaleDateString(locale, { day: "numeric", month: "short" })}
                </span>
                {tour.name}
              </Link>
            ))}
          </div>
        )}

        {/* Deux mini-listes : entraînements club + en attente de tirage */}
        {(sessions.length > 0 || awaitingDraw.length > 0) && (
          <div
            className={sessions.length > 0 && awaitingDraw.length > 0 ? "hero-two-col" : undefined}
            style={{ display: "grid", gap: 16, gridTemplateColumns: sessions.length > 0 && awaitingDraw.length > 0 ? "1fr 1fr" : "1fr" }}
          >
            {/* Prochains entraînements */}
            {sessions.length > 0 && (
              <div className="panel" style={{ padding: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 10 }}>
                  🚲 {t("hero_trainings")}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {sessions.slice(0, 3).map((s) => {
                    const d = new Date(s.date);
                    return (
                      <Link key={s.id} href={`/club/${s.clubId}`} style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "inherit" }}>
                        <div style={{ minWidth: 40, textAlign: "center", flexShrink: 0 }}>
                          <div style={{ fontSize: 11, fontWeight: 800, color: "var(--teal)", fontFamily: "var(--font-display)", lineHeight: 1 }}>
                            {d.toLocaleDateString(locale, { weekday: "short" })}
                          </div>
                          <div style={{ fontSize: 15, fontWeight: 800, fontFamily: "var(--font-display)", lineHeight: 1.1 }}>{d.getDate()}</div>
                        </div>
                        <div style={{ minWidth: 0, fontSize: 12 }}>
                          <div style={{ fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })} · {s.clubName}
                          </div>
                          <div style={{ color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {s.title || s.place || t("hero_training_default")}
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}

            {/* En attente de tirage */}
            {awaitingDraw.length > 0 && (
              <div className="panel" style={{ padding: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 10 }}>
                  🎲 {t("hero_awaiting_draw")}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {awaitingDraw.slice(0, 3).map((tour) => (
                    <Link key={tour.id} href={`/tournament/${tour.slug ?? tour.id}`} style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "inherit" }}>
                      <div style={{ minWidth: 40, textAlign: "center", flexShrink: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--teal)", fontFamily: "var(--font-display)", lineHeight: 1.1 }}>
                          {new Date(tour.dateStart).toLocaleDateString(locale, { day: "numeric", month: "short" })}
                        </div>
                      </div>
                      <div style={{ minWidth: 0, fontSize: 12 }}>
                        <div style={{ fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{tour.name}</div>
                        <div style={{ color: "var(--text-muted)" }}>{tour.city}</div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Raccourcis perso */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          {inviteCount > 0 && (
            <Link
              href="/my-teams"
              className="primary"
              style={{ fontSize: 13, display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              ⏳ {t("hero_chip_invites", { count: inviteCount })}
            </Link>
          )}
          {squadCount > 0 && (
            <Link href="/my-teams" className="ghost" style={{ fontSize: 13 }}>
              👥 {t("hero_chip_squads", { count: squadCount })}
            </Link>
          )}
          <Link href="/my-tournaments" className="ghost" style={{ fontSize: 13 }}>
            🏆 {t("hero_upcoming_see_all")}
          </Link>
          <Link href="/tournament/new" className="ghost" style={{ fontSize: 13 }}>
            + {t("hero_create")}
          </Link>
        </div>
      </div>

      {/* ── Colonne droite : ma carte de collection (masquée en mobile) ──
          Pas de display inline : le masquage responsive est porté par le CSS
          (.hero-perso-card { display:none }) qu'un style inline écraserait. */}
      <div className="hero-perso-card">
        <div style={{ width: 340 * 0.92, height: 520 * 0.92 }}>
          <div style={{ transform: "scale(0.92)", transformOrigin: "top left" }}>
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
            />
          </div>
        </div>
      </div>
    </section>
  );
}
