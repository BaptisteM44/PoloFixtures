/**
 * Home connectée en tuiles (bento) — voir docs/home-bento/BRIEF.md.
 * Rangée du haut, à la hauteur de la carte joueur (340×520, taille réelle) :
 *  prochain tournoi avec mes tournois suivants dessous · entraînement +
 *  inscriptions ouvertes (empilés) · carte joueur.
 * Puis une grille 12 colonnes : communauté + nouveaux joueurs (empilés) ·
 *  carte du monde.
 * Composant serveur : seuls le but animé, la carte joueur, la tuile
 * entraînement et la carte du monde sont des composants client.
 */

import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { formatLabel } from "@/lib/format-label";
import type { WhbpcCardData } from "@/components/WhbpcCard";
import { GoalShot } from "@/components/GoalShot";
import { BentoPlayerCard } from "@/components/BentoPlayerCard";
import { TrainingBentoTile, type TrainingTileData } from "@/components/NextTrainingCard";

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

/** Un tournoi où je suis inscrit — une seule entrée par tournoi, avec son statut. */
export type BentoMyTournament = {
  id: string;
  slug: string | null;
  name: string;
  city: string;
  country: string;
  dateStart: Date;
  dateEnd: Date;
  format: string;
  maxTeams: number;
  teamCount: number;
  bannerPath: string | null;
  /** Liste d'équipes pas encore validée par l'orga (selectionLocked = false). */
  awaitingDraw: boolean;
  teamName: string | null;
};

export type BentoOpenTournament = {
  id: string;
  slug: string | null;
  name: string;
  city: string;
  country: string;
  dateStart: Date;
  maxTeams: number;
  teamCount: number;
};

export type BentoRecentPlayer = { id: string; slug: string | null; name: string; photoPath: string | null; city: string | null; country: string };

const AVATAR_COLORS = ["var(--teal)", "var(--pink)", "var(--yellow)", "var(--purple)", "var(--orange)"];
const DAY_MS = 86_400_000;

const tourHref = (t: { id: string; slug: string | null }) => `/tournament/${t.slug ?? t.id}`;

// Dates de tournoi = jours (minuit UTC) : formatées en UTC, sinon la veille s'affiche à l'ouest de Greenwich.
function dateBox(d: Date, locale: string) {
  return {
    day: String(d.getUTCDate()),
    month: d.toLocaleDateString(locale, { month: "short", timeZone: "UTC" }).replace(".", ""),
  };
}

function dateRange(ds: Date, de: Date, locale: string) {
  const day: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", timeZone: "UTC" };
  const full: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" };
  if (ds.toISOString().slice(0, 10) === de.toISOString().slice(0, 10)) return ds.toLocaleDateString(locale, full);
  const sameMonth = ds.getUTCMonth() === de.getUTCMonth() && ds.getUTCFullYear() === de.getUTCFullYear();
  return `${ds.toLocaleDateString(locale, sameMonth ? day : full)} – ${de.toLocaleDateString(locale, full)}`;
}

/** Jours avant le début (0 = aujourd'hui) et tournoi en cours (jusqu'à la fin du dernier jour). */
export function countdown(t: { dateStart: Date; dateEnd: Date }, now = Date.now()) {
  const start = t.dateStart.getTime();
  return {
    days: Math.max(0, Math.ceil((start - now) / DAY_MS)),
    ongoing: now >= start && now < t.dateEnd.getTime() + DAY_MS,
  };
}

function DateBox({ d, locale, highlight, small }: { d: Date; locale: string; highlight?: boolean; small?: boolean }) {
  const b = dateBox(d, locale);
  return (
    <span className={`bento-date${highlight ? " bento-date--hl" : ""}${small ? " bento-date--sm" : ""}`}>
      <span className="bento-date__day">{b.day}</span>
      <span className="bento-date__month">{b.month}</span>
    </span>
  );
}

const Icon = {
  trophy: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" /></svg>,
  bike: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="6" cy="16" r="4" /><circle cx="18" cy="16" r="4" /><path d="M6 16l4-8h5l3 8M10 8l3 8h-7M14 5h3" /></svg>,
  calendar: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>,
  people: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="9" cy="8" r="3.5" /><path d="M2 20c0-3.5 3-6 7-6s7 2.5 7 6M16 4.5a3.5 3.5 0 0 1 0 7M22 20c0-3-2-5.2-5-5.8" /></svg>,
  newPlayer: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="10" cy="8" r="3.5" /><path d="M3 20c0-3.5 3-6 7-6s7 2.5 7 6M19 8v6M16 11h6" /></svg>,
  pin: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12z" /><circle cx="12" cy="9" r="2.5" /></svg>,
  plus: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>,
};

export async function HomeBento({
  me, upcoming, training, open, community, recentPlayers, summary, mapSlot, locale,
}: {
  me: HeroPlayer;
  /** Mes tournois à venir / en cours, triés par date, sans doublon. */
  upcoming: BentoMyTournament[];
  training: TrainingTileData | null;
  open: BentoOpenTournament[];
  community: { players: number; countries: number; tournaments: number; byContinent: { code: string; count: number }[] };
  recentPlayers: BentoRecentPlayer[];
  summary: { tournaments: number; trainings: number };
  /** Tuile carte du monde (TournamentMapClient variant="bento"), absente si la carte est désactivée. */
  mapSlot: React.ReactNode;
  locale: string;
}) {
  const t = await getTranslations("home");
  const tc = await getTranslations("common");
  const firstName = me.name.split(/\s+/)[0];
  const now = Date.now();

  const today = new Date().toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" });
  const next = upcoming[0] ?? null;
  // Les suivants, sous le prochain tournoi : trois lignes tiennent dans la hauteur de la carte joueur
  const later = upcoming.slice(1, 4);
  const cd = next ? countdown(next, now) : null;
  // Barres = part de chaque continent dans le total (pas relative au plus gros, sinon il est toujours plein)
  const continentTotal = Math.max(1, community.byContinent.reduce((sum, c) => sum + c.count, 0));

  const statusPill = (tour: BentoMyTournament) => {
    if (countdown(tour, now).ongoing) return <span className="bento-pill bento-pill--live">{t("hero_ongoing")}</span>;
    if (tour.awaitingDraw) return <span className="bento-pill bento-pill--muted">{t("bento_status_draw")}</span>;
    return <span className="bento-pill bento-pill--ok">{t("bento_status_registered")}</span>;
  };

  return (
    <section className="home-bento">
      {/* ── Salutation + actions ── */}
      <div className="home-bento__greet">
        <div>
          <p className="home-bento__date">{today}</p>
          <div className="home-bento__hello">
            <h1>{t("hero_hello", { name: firstName })}</h1>
            <GoalShot />
          </div>
          <p className="home-bento__summary">{t("bento_summary", summary)}</p>
        </div>
        <div className="home-bento__actions">
          <Link className="ghost" href="/my-tournaments">{t("bento_my_tournaments")}</Link>
          <Link className="primary" href="/tournament/new">{Icon.plus}{t("hero_create")}</Link>
        </div>
      </div>

      {/* Rangée du haut, calée sur la hauteur de la carte joueur (340×520, taille réelle) */}
      <div className="home-bento-top">
        {/* 1 · Prochain tournoi + les suivants */}
        <section className="bento-tile bento-next" aria-labelledby="bento-next-title">
          <div className="bento-tile__head">
            <p className="bento-label">{Icon.trophy}{t("bento_next_label")}</p>
            {next && (
              <div className="bento-next__head-actions">
                <Link className="bento-icon-link" href="/calendar" aria-label={t("bento_calendar")} title={t("bento_calendar")}>{Icon.calendar}</Link>
                {statusPill(next)}
              </div>
            )}
          </div>
          {next && cd ? (
            <>
              <div className="bento-next__inner">
                <div className="bento-next__main">
                  <div className="bento-next__top">
                    <Link href={tourHref(next)} className="bento-next__count">
                      {cd.ongoing || cd.days === 0 ? (
                        <span className="bento-next__now">{cd.ongoing ? t("hero_ongoing") : t("hero_today")}</span>
                      ) : (
                        <>
                          <span className="bento-next__num">{cd.days}</span>
                          <span className="bento-next__unit">{t("bento_days_word", { count: cd.days })}<br />{t("bento_before_kickoff")}</span>
                        </>
                      )}
                    </Link>
                    <div>
                      <h2 id="bento-next-title" className="bento-next__name"><Link href={tourHref(next)}>{next.name}</Link></h2>
                      <p className="bento-next__meta">{Icon.pin}{next.city}, {next.country} · {dateRange(next.dateStart, next.dateEnd, locale)}</p>
                    </div>
                  </div>
                </div>
                {next.bannerPath && (
                  <Link href={tourHref(next)} className="bento-next__poster" tabIndex={-1} aria-hidden>
                    <Image src={next.bannerPath} alt="" fill sizes="132px" style={{ objectFit: "cover" }} />
                  </Link>
                )}
              </div>
              <div className="bento-next__facts">
                <div className="bento-fact bento-fact--hl">
                  <p className="bento-fact__k">{t("bento_format")}</p>
                  <p className="bento-fact__v">{formatLabel(next.format, tc("format_abc_hat"))}</p>
                </div>
                <div className="bento-fact">
                  <p className="bento-fact__k">{t("bento_teams")}</p>
                  <p className="bento-fact__v">{next.teamCount} / {next.maxTeams}</p>
                </div>
                <div className="bento-fact">
                  <p className="bento-fact__k">{t("bento_your_team")}</p>
                  <p className="bento-fact__v">{next.teamName ?? t("bento_draw_pending")}</p>
                </div>
              </div>

              {/* Ensuite : mes tournois suivants, avec leur statut */}
              <div className="bento-next__later">
                <div className="bento-tile__head">
                  <p className="bento-label bento-label--sub">{t("bento_then")}</p>
                  <Link className="bento-more" href="/my-tournaments">{tc("see_all")}</Link>
                </div>
                {later.length > 0 ? (
                  <div className="bento-rows">
                    {later.map((tour) => {
                      const c = countdown(tour, now);
                      return (
                        <Link key={tour.id} className="bento-row bento-row--sm" href={tourHref(tour)}>
                          <DateBox d={tour.dateStart} locale={locale} small />
                          <span className="bento-row__main">
                            <span className="bento-row__title">{tour.name}</span>
                            <span className="bento-row__meta">
                              {tour.city}, {tour.country} · {c.ongoing ? t("hero_ongoing") : c.days === 0 ? t("hero_today") : t("hero_days_until", { count: c.days })}
                            </span>
                          </span>
                          {statusPill(tour)}
                        </Link>
                      );
                    })}
                  </div>
                ) : (
                  <p className="bento-tile__muted">{t("bento_then_empty")}</p>
                )}
              </div>
            </>
          ) : (
            <div className="bento-empty">
              <p>{t("hero_no_upcoming")}</p>
              <Link className="primary" href="/tournaments">{t("hero_browse")}</Link>
            </div>
          )}
        </section>

        {/* 2 + 3 · Entraînement et Inscriptions ouvertes, empilés */}
        <div className="bento-side">
          <section className="bento-tile bento-train">
            <p className="bento-label">{Icon.bike}{t("hero_training_default")}</p>
            {training ? (
              <TrainingBentoTile s={training} />
            ) : (
              <div className="bento-empty">
                <p>{t("bento_no_training")}</p>
                <Link className="ghost" href="/clubs">{t("bento_find_club")}</Link>
              </div>
            )}
          </section>

          {/* Colonne étroite : la ligne entière mène à l'onglet inscription, pas de bouton à part */}
          <section className="bento-tile bento-open">
            <div className="bento-tile__head">
              <p className="bento-label"><span className="bento-dot" aria-hidden />{t("bento_open")}</p>
              <Link className="bento-more" href="/tournaments">{tc("see_all")}</Link>
            </div>
            {open.length > 0 ? (
              <div className="bento-rows">
                {open.slice(0, 2).map((o) => (
                  <Link key={o.id} className="bento-row bento-row--sm" href={`${tourHref(o)}?tab=inscription`}>
                    <DateBox d={o.dateStart} locale={locale} small />
                    <span className="bento-row__main">
                      <span className="bento-row__title">{o.name}</span>
                      <span className="bento-row__meta">{o.city}, {o.country} · {o.teamCount}/{o.maxTeams}</span>
                      <span className="bento-bar" role="img" aria-label={t("bento_teams_aria", { count: o.teamCount, max: o.maxTeams })}>
                        <span style={{ width: `${Math.min(100, (o.teamCount / Math.max(1, o.maxTeams)) * 100)}%` }} />
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="bento-tile__muted">{t("bento_open_empty")}</p>
            )}
          </section>
        </div>

        {/* 4 · Carte joueur, taille réelle comme ailleurs sur le site */}
        <section className="bento-card" aria-label={t("bento_card_label")}>
          <BentoPlayerCard me={me} />
        </section>
      </div>

      {/* Communauté + nouveaux joueurs empilés à gauche, carte du monde à droite */}
      <div className="home-bento-grid">
        <div className="bento-left">
          {/* 5 · La communauté */}
          <section className="bento-tile bento-stats">
            <p className="bento-label">{Icon.people}{t("bento_community")}</p>
            <div className="bento-stats__big">
              <span className="bento-stats__num">{community.players}</span>
              <span>{t("bento_community_line", { countries: community.countries, tournaments: community.tournaments })}</span>
            </div>
            <div className="bento-stats__bars">
              {community.byContinent.map((c) => (
                <Link key={c.code} href={`/tournaments?continent=${c.code}`} className="bento-stats__row">
                  <span>{t(`continent_${c.code.toLowerCase()}` as never)}</span>
                  <span className="bento-bar"><span style={{ width: `${(c.count / continentTotal) * 100}%` }} /></span>
                  <span className="bento-stats__count">{c.count}</span>
                </Link>
              ))}
            </div>
          </section>

          {/* 6 · Nouveaux·elles joueur·euses : grille de 4 par ligne, 8 au plus */}
          {recentPlayers.length > 0 && (
            <section className="bento-tile bento-new">
              <p className="bento-label">{Icon.newPlayer}{t("section_recent_players")}</p>
              <div className="bento-new__grid">
                {recentPlayers.slice(0, 8).map((p, i) => (
                  <Link key={p.id} href={`/player/${p.slug ?? p.id}`} className="bento-new__item">
                    <span className="bento-new__av" style={{ background: AVATAR_COLORS[i % AVATAR_COLORS.length] }}>
                      {p.photoPath
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={p.photoPath} alt="" />
                        : p.name[0]?.toUpperCase()}
                    </span>
                    <span className="bento-new__name">{p.name}</span>
                    <span className="bento-new__city">{p.city || p.country}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* 7 · Carte du monde, à la hauteur de la colonne de gauche */}
        {mapSlot}
      </div>
    </section>
  );
}
