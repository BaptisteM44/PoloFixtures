import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { Tabs } from "@/components/Tabs";
import { ScheduleBoard } from "@/components/ScheduleBoard";
import { PoolTables } from "@/components/PoolTables";
import { BracketView } from "@/components/BracketView";
import { PokemonCard } from "@/components/PokemonCard";
import { toYoutubeEmbed } from "@/lib/youtube";
import { computePlayerBadges, computeTeamBadges } from "@/lib/achievements";
import { auth } from "@/lib/auth";
import { FreeAgentForm } from "@/components/FreeAgentForm";
import { FreeAgentList } from "@/components/FreeAgentList";
import { RegisterTeamForm } from "@/components/RegisterTeamForm";
import { computeStandings } from "@/lib/standings";
import { deleteFreeAgentAction, toggleTeamSelectedAction, drawTeamsAction, toggleTeamGuaranteedAction, drawOneTeamAction, drawOneWaitlistAction } from "./edit/actions";
import { SelectionManager } from "@/components/SelectionManager";
import { TournamentChat } from "@/components/TournamentChat";
import { TelegramWidget } from "@/components/TelegramWidget";
import { LiveMatchTile } from "@/components/LiveMatchTile";
import { OrgaNoteEditor } from "@/components/OrgaNoteEditor";
import { HeroCountdown } from "@/components/HeroCountdown";

function summarizeCities(players: { player: { city: string | null } }[]): string {
  const counts = new Map<string, number>();
  for (const tp of players) {
    const city = tp.player.city || "—";
    counts.set(city, (counts.get(city) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([city, n]) => (n > 1 ? `${city} (${n})` : city))
    .join(", ");
}

export default async function TournamentPage({
  params,
  searchParams
}: {
  params: { id: string };
  searchParams: { tab?: string; view?: string };
}) {
  const tab = searchParams.tab ?? "info";
  const view = searchParams.view ?? "cards";
  const tournament = await prisma.tournament.findUnique({
    where: { id: params.id },
    include: {
      sponsors: true,
      teams: {
        include: {
          players: { include: { player: true } }
        }
      },
      pools: {
        include: {
          teams: { include: { team: true } }
        }
      },
      matches: {
        include: { teamA: true, teamB: true, events: true },
        orderBy: { startAt: "asc" }
      },
      freeAgents: true,
      coOrganizers: { include: { player: { select: { id: true, name: true } } } }
    }
  });

  const t = await getTranslations("tournament");
  const r = await getTranslations("registration");
  const tm = await getTranslations("team");
  const fa = await getTranslations("free_agent");

  if (!tournament) return <div>{t("not_found")}</div>;

  const session = await auth();
  const role = session?.user?.role;
  const currentPlayerId = session?.user?.playerId ?? null;
  const currentPlayerName = session?.user?.name ?? null;
  const canEdit =
    role === "ADMIN" ||
    (role === "ORGA" && session?.user?.tournamentId === tournament.id) ||
    (!!currentPlayerId && currentPlayerId === tournament.creatorId) ||
    tournament.coOrganizers.some((co) => co.playerId === currentPlayerId);
  const isOrga = canEdit;

  // Bouton arbitrage : REF (global ou lié à ce tournoi), orga, admin, co-organisateur
  const canRef =
    canEdit ||
    (role === "REF" && (!session?.user?.tournamentId || session.user.tournamentId === tournament.id)) ||
    tournament.coOrganizers.some((co) => co.playerId === currentPlayerId);

  const swissMatches = tournament.matches.filter((m) => m.phase === "SWISS");
  const hasSwiss = swissMatches.length > 0 || tournament.saturdayFormat === "SWISS";

  const dateStart = new Date(tournament.dateStart).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  const dateEnd = new Date(tournament.dateEnd).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });

  const hasCommunity = tournament.freeAgents.length > 0 || tournament.chatMode !== "DISABLED";
  const youtubeEmbed = toYoutubeEmbed(tournament.streamYoutubeUrl);

  const tabs = [
    { label: t("tab_info"), value: "info", href: `/tournament/${params.id}?tab=info` },
    { label: t("tab_registration"), value: "inscription", href: `/tournament/${params.id}?tab=inscription` },
    { label: t("tab_schedule"), value: "schedule", href: `/tournament/${params.id}?tab=schedule` },
    { label: t("tab_pools"), value: "pools", href: `/tournament/${params.id}?tab=pools` },
    ...(hasSwiss ? [{ label: t("tab_swiss"), value: "swiss", href: `/tournament/${params.id}?tab=swiss` }] : []),
    { label: t("tab_bracket"), value: "bracket", href: `/tournament/${params.id}?tab=bracket` },
    { label: t("tab_teams", { count: tournament.teams.length }), value: "equipes", href: `/tournament/${params.id}?tab=equipes` },
    ...(youtubeEmbed || tournament.chatMode !== "DISABLED" ? [{ label: t("tab_live"), value: "live", href: `/tournament/${params.id}?tab=live` }] : []),
    ...(hasCommunity ? [{ label: `${t("tab_free_agent")}${tournament.freeAgents.length > 0 ? ` (${tournament.freeAgents.length})` : ""}`, value: "communaute", href: `/tournament/${params.id}?tab=communaute` }] : []),
  ];

  const allEvents = tournament.matches.flatMap((m) => m.events);

  const now = new Date();
  const registrationOpen =
    (!tournament.registrationStart || now >= new Date(tournament.registrationStart)) &&
    (!tournament.registrationEnd || now <= new Date(tournament.registrationEnd));
  const registrationClosed = !!tournament.registrationEnd && now > new Date(tournament.registrationEnd);

  const deleteFreeAgent = async (id: string) => {
    "use server";
    return await deleteFreeAgentAction(id, tournament.id);
  };

  const toggleTeamSelected = async (teamId: string, tId: string, selected: boolean) => {
    "use server";
    return await toggleTeamSelectedAction(teamId, tId, selected);
  };

  const drawTeams = async (tId: string, count: number) => {
    "use server";
    return await drawTeamsAction(tId, count);
  };

  const guaranteeTeam = async (teamId: string, tId: string, guaranteed: boolean) => {
    "use server";
    return await toggleTeamGuaranteedAction(teamId, tId, guaranteed);
  };

  const drawOneTeam = async (tId: string, candidateIds: string[]) => {
    "use server";
    return await drawOneTeamAction(tId, candidateIds);
  };

  const drawOneWaitlist = async (tId: string, candidateIds: string[]) => {
    "use server";
    return await drawOneWaitlistAction(tId, candidateIds);
  };

  // Info tab: tiles content
  const hasLogistique = !!(
    tournament.venueName || tournament.venueAddress ||
    tournament.fridayWelcomeName || tournament.fridayWelcomeAddress ||
    tournament.saturdayEventName || tournament.saturdayEventAddress ||
    tournament.saturdayEveningName || tournament.saturdayEveningAddress ||
    tournament.accommodationAvailable ||
    tournament.otherNotes || tournament.registrationStart || tournament.registrationEnd
  );
  const meals = (tournament.meals as { day: number; breakfast: boolean; lunch: boolean; dinner: boolean }[] | null) ?? [];
  const hasMeals = meals.some((m) => m.breakfast || m.lunch || m.dinner);
  const faq = (tournament.faq as { question: string; answer: string }[] | null) ?? [];

  return (
    <div className="tournament-page">
      {/* ── Barre retour dashboard + bouton arbitrage ── */}
      {(canEdit || canRef) && (
        <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          {canEdit && (
            <Link href={`/tournament/${params.id}/edit`} style={{ fontSize: 13, color: "var(--text-muted)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}>
              {t("back_dashboard")}
            </Link>
          )}
          {canRef && (
            <Link
              href={`/tournament/${params.id}/referee`}
              className="primary"
              style={{ fontSize: 13, padding: "6px 16px", display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              {t("btn_referee")}
            </Link>
          )}
        </div>
      )}

      {/* ── HERO ── */}
      <section className="tournament-hero">
        <div className="tournament-hero__main">
          <h1>{tournament.name}</h1>
          <div className="tournament-hero__dates">
            📅 {dateStart} — {dateEnd}
          </div>
          <p style={{ color: "var(--text-muted)", margin: "4px 0 8px", fontSize: 14 }}>
            {tournament.city}, {tournament.country} · {tournament.format} · {tournament.courtsCount === 1 ? t("courts_count_one", { count: tournament.courtsCount }) : t("courts_count_other", { count: tournament.courtsCount })}
          </p>
          <HeroCountdown
            dateStart={tournament.dateStart.toISOString()}
            dateEnd={tournament.dateEnd.toISOString()}
            registrationEnd={tournament.registrationEnd?.toISOString() ?? null}
            teamCount={tournament.teams.length}
            maxTeams={tournament.maxTeams}
          />
        </div>

        <div className="tournament-hero__sponsors">
          {tournament.sponsors.length > 0 ? (
            <>
              <span className="tournament-hero__sponsors-title">{t("sponsors_title")}</span>
              <div className="sponsors-strip">
                {tournament.sponsors.map((sponsor) =>
                  sponsor.logoPath ? (
                    <a key={sponsor.id} href={sponsor.url ?? "#"} target="_blank" rel="noopener noreferrer" className="sponsor-logo-link">
                      <img src={sponsor.logoPath} alt={sponsor.name} className="sponsor-logo" />
                    </a>
                  ) : (
                    <span key={sponsor.id} className="sponsor-name-badge">{sponsor.name}</span>
                  )
                )}
              </div>
            </>
          ) : canEdit ? (
            <div className="sponsors-empty">
              <span>🤝</span>
              <Link href={`/tournament/${params.id}/edit`} style={{ color: "var(--teal)" }}>
                {t("sponsors_add")}
              </Link>
            </div>
          ) : null}
        </div>
      </section>

      <Tabs
        items={tabs}
        active={tab}
        rightSlot={canEdit ? (
          <Link className="ghost" href={`/tournament/${params.id}/edit`} style={{ fontSize: 12, padding: "5px 14px", marginBottom: 2 }}>
            {t("btn_edit")}
          </Link>
        ) : undefined}
      />

      {/* ── INFO TAB — 12-column flexible grid ── */}
      {tab === "info" && (
        <div className="info-layout">

          {/* ── LEFT COLUMN (span 6) — Lieux, FAQ, Live ── */}
          <div className="info-tile col-span-6">

            {hasLogistique && (
              <div className="panel">
                <h3 style={{ marginBottom: 14 }}>{t("section_logistics")}</h3>

                <div className="logistics-grid">
                  {(tournament.venueName || tournament.venueAddress) && (
                    <div className="logistics-section">
                      <h4>{t("venue_court")}</h4>
                      <p style={{ fontWeight: 600, margin: "4px 0" }}>{tournament.venueName}</p>
                      {tournament.venueAddress && <p style={{ margin: "2px 0", fontSize: 13 }}>{tournament.venueAddress}</p>}
                      {tournament.venueMapsUrl && (
                        <a href={tournament.venueMapsUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13 }}>{t("venue_maps")}</a>
                      )}
                    </div>
                  )}
                  {(tournament.fridayWelcomeName || tournament.fridayWelcomeAddress) && (
                    <div className="logistics-section">
                      <h4>{t("venue_friday")}</h4>
                      <p style={{ fontWeight: 600, margin: "4px 0" }}>{tournament.fridayWelcomeName}</p>
                      {tournament.fridayWelcomeAddress && <p style={{ margin: "2px 0", fontSize: 13 }}>{tournament.fridayWelcomeAddress}</p>}
                      {tournament.fridayWelcomeMapsUrl && (
                        <a href={tournament.fridayWelcomeMapsUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13 }}>{t("venue_maps")}</a>
                      )}
                    </div>
                  )}
                  {(tournament.saturdayEveningName || tournament.saturdayEveningAddress) && (
                    <div className="logistics-section">
                      <h4>{t("venue_saturday_evening")}</h4>
                      <p style={{ fontWeight: 600, margin: "4px 0" }}>{tournament.saturdayEveningName}</p>
                      {tournament.saturdayEveningAddress && <p style={{ margin: "2px 0", fontSize: 13 }}>{tournament.saturdayEveningAddress}</p>}
                      {tournament.saturdayEveningMapsUrl && (
                        <a href={tournament.saturdayEveningMapsUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13 }}>{t("venue_maps")}</a>
                      )}
                    </div>
                  )}
                </div>

                {tournament.accommodationAvailable && (
                  <div style={{ marginTop: 14, paddingTop: 10, borderTop: "1px solid var(--border-light)" }}>
                    <span className="logistics-badge logistics-badge--teal">{t("accommodation_available")}</span>
                    {tournament.accommodationType && (
                      <p style={{ margin: "6px 0 0", fontSize: 13 }}>{tournament.accommodationType}</p>
                    )}
                    {tournament.accommodationCapacity && (
                      <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--text-muted)" }}>{t("accommodation_places", { count: tournament.accommodationCapacity })}</p>
                    )}
                  </div>
                )}

                {hasMeals && (
                  <div style={{ marginTop: 14, paddingTop: 10, borderTop: "1px solid var(--border-light)" }}>
                    <p style={{ fontFamily: "var(--font-display)", fontSize: 12, fontWeight: 700, marginBottom: 8 }}>{t("meals_title")}</p>
                    <div style={{ display: "grid", gap: 4 }}>
                      {meals.filter((m) => m.breakfast || m.lunch || m.dinner).map((m) => {
                        const d = new Date(tournament.dateStart);
                        d.setDate(d.getDate() + m.day - 1);
                        const label = d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "short" });
                        const parts = [];
                        if (m.breakfast) parts.push(t("meal_breakfast_short"));
                        if (m.lunch) parts.push(t("meal_lunch_short"));
                        if (m.dinner) parts.push(t("meal_dinner_short"));
                        return (
                          <div key={m.day} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
                            <span style={{ fontWeight: 600, minWidth: 140, textTransform: "capitalize" }}>{label}</span>
                            <span style={{ color: "var(--text-muted)" }}>{parts.join(" · ")}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {(tournament.registrationStart || tournament.registrationEnd) && (
                  <p style={{ marginTop: 12, fontSize: 13, paddingTop: 10, borderTop: "1px solid var(--border-light)" }}>
                    <strong>{t("registration_period")}</strong>{" "}
                    {tournament.registrationStart
                      ? new Date(tournament.registrationStart).toLocaleString("fr-FR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })
                      : "?"}{" "}
                    — {tournament.registrationEnd
                      ? new Date(tournament.registrationEnd).toLocaleString("fr-FR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })
                      : "?"}
                  </p>
                )}

                <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  {tournament.contactEmail && (
                    <a href={`mailto:${tournament.contactEmail}`} className="ghost" style={{ fontSize: 14 }}>
                      {t("btn_contact_organizers")}
                    </a>
                  )}
                  {registrationClosed ? (
                    <span className="primary" style={{ fontSize: 14, opacity: 0.45, cursor: "not-allowed", pointerEvents: "none" }}>
                      {t("reg_closed_title")}
                    </span>
                  ) : (
                    <Link href={`/tournament/${params.id}?tab=inscription`} className="primary" style={{ fontSize: 14 }}>
                      {t("btn_register_cta")}
                    </Link>
                  )}
                </div>
              </div>
            )}

            {tournament.kitList && (
              <div className="panel">
                <h3 style={{ marginBottom: 10 }}>{t("section_kit")}</h3>
                <p style={{ fontSize: 13, whiteSpace: "pre-line", margin: 0, color: "var(--text-muted)" }}>{tournament.kitList}</p>
              </div>
            )}

            {tournament.additionalInfo && (
              <div className="panel">
                <h3 style={{ marginBottom: 10 }}>{t("section_info")}</h3>
                <p style={{ fontSize: 13, whiteSpace: "pre-line", margin: 0 }}>{tournament.additionalInfo}</p>
              </div>
            )}

            {faq.length > 0 && (
              <div className="panel">
                <h3 style={{ marginBottom: 14 }}>{t("section_faq")}</h3>
                <div style={{ display: "grid", gap: 12 }}>
                  {faq.map((item, i) => (
                    <div key={i}>
                      <p style={{ fontWeight: 700, fontSize: 14, margin: "0 0 4px" }}>{item.question}</p>
                      <p style={{ fontSize: 13, margin: 0, color: "var(--text-muted)", whiteSpace: "pre-line" }}>{item.answer}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tournament.freeAgents.length > 0 && (
              <div className="panel">
                <h3 style={{ marginBottom: 4 }}>
                  {t("tab_free_agent")}{" "}
                  <span style={{ fontSize: 13, fontWeight: 400, color: "var(--text-muted)" }}>
                    ({tournament.freeAgents.length})
                  </span>
                </h3>
                <p className="meta" style={{ marginBottom: 14 }}>
                  {t("info_free_agents_desc")}
                </p>
                <FreeAgentList
                  agents={tournament.freeAgents}
                  canDelete={false}
                  title=""
                  publicView
                />
              </div>
            )}

            {tournament.matches.length > 0 && (
              <div className="panel">
                <LiveMatchTile
                  tournamentId={tournament.id}
                  initialMatches={tournament.matches}
                />
              </div>
            )}
          </div>

          {/* ── RIGHT COLUMN (span 6) — Affiche, Liens, Telegram, Stream ── */}
          <div className="info-tile col-span-6">

            {/* Affiche + Telegram side by side */}
            <div className="info-inner-grid">
              {/* Affiche */}
              <div>
                {tournament.bannerPath && (
                  <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
                    <img src={tournament.bannerPath} alt={`Affiche ${tournament.name}`} style={{ width: "100%", display: "block", borderRadius: "var(--radius)" }} />
                  </div>
                )}
              </div>

              {/* Telegram */}
              <div>
                {(tournament as { telegramUrl?: string | null }).telegramUrl && (
                  <TelegramWidget telegramUrl={(tournament as { telegramUrl?: string | null }).telegramUrl!} />
                )}
              </div>
            </div>

            {/* Stream — full width of right column */}
            {youtubeEmbed && (
              <div className="panel">
                <h3 style={{ marginBottom: 10 }}>{t("section_stream")}</h3>
                <iframe
                  src={youtubeEmbed}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  title="Stream"
                  style={{ width: "100%", aspectRatio: "16/9", height: "auto", borderRadius: "var(--radius)", border: "2px solid var(--border)", display: "block" }}
                />
              </div>
            )}
          </div>

        </div>
      )}

      {tab === "inscription" && (
        <div>
          <div className="inscription-grid">
            {/* Inscrire mon équipe */}
            <div className="panel">
              <h3>{r("section_title")}</h3>
              {!tournament.approved ? (
                <p className="meta">{t("not_approved")}</p>
              ) : registrationOpen ? (
                <>
                  <p className="meta" style={{ marginBottom: 16 }}>
                    {tournament.teams.length === 1 ? r("reg_open_teams_one", { count: tournament.teams.length }) : r("reg_open_teams_other", { count: tournament.teams.length })}
                    {tournament.teams.length > tournament.maxTeams
                      ? ` · ${tournament.teams.length - tournament.maxTeams} ${t("teams_on_waitlist")}`
                      : ` · ${tournament.maxTeams - tournament.teams.length === 1 ? t("teams_spots_available_one", { count: tournament.maxTeams - tournament.teams.length }) : t("teams_spots_available_other", { count: tournament.maxTeams - tournament.teams.length })}`}
                  </p>
                  <RegisterTeamForm tournamentId={tournament.id} format={tournament.format} currentPlayerId={currentPlayerId} accommodationAvailable={tournament.accommodationAvailable} />
                </>
              ) : (
                <div style={{ textAlign: "center", padding: "24px 0" }}>
                  <p style={{ fontWeight: 700, fontFamily: "var(--font-display)", margin: 0 }}>
                    {t("reg_closed_title")}
                    {tournament.registrationEnd && ` — clôturées le ${new Date(tournament.registrationEnd).toLocaleString("fr-FR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}`}
                  </p>
                  {tournament.registrationStart && now < new Date(tournament.registrationStart) && (
                    <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--text-muted)" }}>
                      {t("reg_opens_on", { date: new Date(tournament.registrationStart).toLocaleString("fr-FR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }) })}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Renvoi vers Zone free agent */}
            <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 12, justifyContent: "center", textAlign: "center" }}>
              <div style={{ fontSize: 32 }}>🤝</div>
              <h3 style={{ margin: 0 }}>{r("no_team_title")}</h3>
              <p className="meta" style={{ margin: 0 }}>
                {r("no_team_desc")}
              </p>
              {tournament.freeAgents.length > 0 && (
                <p className="meta" style={{ margin: 0, fontWeight: 700 }}>
                  {tournament.freeAgents.length === 1 ? r("free_agents_one", { count: tournament.freeAgents.length }) : r("free_agents_other", { count: tournament.freeAgents.length })}
                </p>
              )}
              <Link href={`/tournament/${params.id}?tab=communaute`} className="ghost" style={{ fontSize: 13 }}>
                {r("btn_view_free_agent")}
              </Link>
            </div>
          </div>

          {/* Sélection orga — visible après clôture */}
          {isOrga && registrationClosed && tournament.teams.length > 0 && (
            <div className="panel" style={{ marginTop: 24 }}>
              <SelectionManager
                teams={tournament.teams.map((t) => ({
                  id: t.id,
                  name: t.name,
                  seed: t.seed,
                  city: t.city,
                  country: t.country,
                  selected: t.selected,
                  guaranteed: t.guaranteed,
                  waitlistPosition: t.waitlistPosition,
                }))}
                maxTeams={tournament.maxTeams}
                tournamentId={tournament.id}
                toggleAction={toggleTeamSelected}
                drawAction={drawTeams}
                guaranteeAction={guaranteeTeam}
                drawOneAction={drawOneTeam}
                drawOneWaitlistAction={drawOneWaitlist}
              />
            </div>
          )}
        </div>
      )}

      {tab === "schedule" && (
        <ScheduleBoard tournamentId={tournament.id} initialMatches={tournament.matches} teams={tournament.teams} />
      )}

      {tab === "pools" && (
        <PoolTables pools={tournament.pools} matches={tournament.matches} tournamentId={tournament.id} />
      )}

      {tab === "bracket" && (
        <BracketView matches={tournament.matches.filter((m) => m.phase === "BRACKET")} tournamentId={tournament.id} />
      )}

      {tab === "swiss" && (
        <div style={{ padding: "24px 0" }}>
          {swissMatches.length === 0 ? (
            <div className="panel" style={{ textAlign: "center", padding: 48 }}>
              <p className="meta">{t("swiss_empty")}</p>
            </div>
          ) : (() => {
            const standings = computeStandings(tournament.teams, swissMatches);
            const maxRound = Math.max(...swissMatches.map((m) => m.roundIndex));
            return (
              <>
                {/* Round summaries */}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24 }}>
                  {Array.from({ length: maxRound }, (_, i) => i + 1).map((r) => {
                    const rMatches = swissMatches.filter((m) => m.roundIndex === r);
                    const done = rMatches.filter((m) => m.status === "FINISHED").length;
                    return (
                      <span
                        key={r}
                        style={{
                          fontFamily: "var(--font-display)",
                          fontSize: 12,
                          padding: "4px 12px",
                          borderRadius: 20,
                          background: done === rMatches.length ? "var(--teal)" : "var(--gray)",
                          border: "1.5px solid var(--border)",
                          fontWeight: 700
                        }}
                      >
                        {t("swiss_round_header", { n: r, done, total: rMatches.length })}
                      </span>
                    );
                  })}
                </div>

                {/* Standings table */}
                <div className="panel">
                  <h3 style={{ marginBottom: 16 }}>{t("swiss_standings_title")}</h3>
                  <table className="swiss-standings">
                    <thead>
                      <tr>
                        <th>{t("swiss_col_rank")}</th>
                        <th>{t("swiss_col_team")}</th>
                        <th>{t("swiss_col_pts")}</th>
                        <th>{t("swiss_col_played")}</th>
                        <th>{t("swiss_col_wins")}</th>
                        <th>{t("swiss_col_draws")}</th>
                        <th>{t("swiss_col_losses")}</th>
                        <th>{t("swiss_col_diff")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {standings.map((row, i) => (
                        <tr key={row.teamId}>
                          <td className="swiss-standing-rank">{i + 1}</td>
                          <td style={{ fontWeight: 600 }}>{row.name}</td>
                          <td style={{ fontFamily: "var(--font-display)", fontWeight: 900 }}>{row.points}</td>
                          <td>{row.played}</td>
                          <td style={{ color: "var(--success)" }}>{row.wins}</td>
                          <td style={{ color: "var(--text-muted)" }}>{row.draws}</td>
                          <td style={{ color: "var(--danger)" }}>{row.losses}</td>
                          <td style={{ color: row.goalDiff >= 0 ? "var(--success)" : "var(--danger)" }}>
                            {row.goalDiff >= 0 ? "+" : ""}{row.goalDiff}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            );
          })()}
        </div>
      )}

      {tab === "equipes" && (() => {
        const sortedTeams = [...tournament.teams].sort((a, b) => a.seed - b.seed);
        const selected = sortedTeams.filter((t) => t.selected);
        const waitlist = sortedTeams.filter((t) => !t.selected);
        const hasWaitlist = waitlist.length > 0;

        if (tournament.teams.length === 0) {
          return (
            <div className="panel" style={{ textAlign: "center", padding: 48, marginTop: 16 }}>
              <p className="meta">{t("empty_no_teams")}</p>
            </div>
          );
        }

        return (
          <div>
            {/* Toggle view */}
            <div style={{ display: "flex", gap: 8, marginBottom: 20, alignItems: "center" }}>
              <Link
                href={`/tournament/${params.id}?tab=equipes&view=cards`}
                className={view === "cards" ? "primary" : "ghost"}
                style={{ fontSize: 12, padding: "5px 14px" }}
              >
                {t("view_cards")}
              </Link>
              <Link
                href={`/tournament/${params.id}?tab=equipes&view=list`}
                className={view === "list" ? "primary" : "ghost"}
                style={{ fontSize: 12, padding: "5px 14px" }}
              >
                {t("view_list")}
              </Link>
              <span className="meta" style={{ marginLeft: 8 }}>
                {selected.length === 1 ? t("teams_retained_count_one", { count: selected.length }) : t("teams_retained_count_other", { count: selected.length })}
                {hasWaitlist && t("teams_waitlist_suffix", { count: waitlist.length })}
              </span>
            </div>

            {view === "list" ? (
              /* ---- VUE LISTE ---- */
              <div className="teams-list-view">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>{t("teams_col_team")}</th>
                      <th>{t("teams_col_cities")}</th>
                      <th>{t("teams_col_players")}</th>
                      {hasWaitlist && <th>{t("teams_col_status")}</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {selected.map((team) => (
                      <tr key={team.id}>
                        <td style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>#{team.seed}</td>
                        <td style={{ fontWeight: 600 }}>{team.name}</td>
                        <td className="meta">{summarizeCities(team.players)}</td>
                        <td>
                          {team.players.map((tp, i) => (
                            <span key={tp.player.id}>
                              {i > 0 && ", "}
                              {(tp.player as { slug?: string | null }).slug ? (
                                <Link href={`/player/${(tp.player as { slug?: string | null }).slug}`} style={{ color: "var(--teal)", textDecoration: "none", fontWeight: 500 }}>
                                  {tp.player.name}
                                </Link>
                              ) : (
                                tp.player.name
                              )}
                            </span>
                          ))}
                        </td>
                        {hasWaitlist && <td><span style={{ color: "var(--teal)", fontWeight: 700, fontSize: 11, fontFamily: "var(--font-display)" }}>{t("badge_retained")}</span></td>}
                      </tr>
                    ))}
                    {hasWaitlist && (
                      <>
                        <tr className="teams-divider-row">
                          <td colSpan={5} className="teams-divider">{t("waitlist_divider", { count: waitlist.length })}</td>
                        </tr>
                        {waitlist.map((team) => (
                          <tr key={team.id} className="team-row--waitlist">
                            <td style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>#{team.seed}</td>
                            <td style={{ fontWeight: 600 }}>{team.name}</td>
                            <td className="meta">{summarizeCities(team.players)}</td>
                            <td>
                              {team.players.map((tp, i) => (
                                <span key={tp.player.id}>
                                  {i > 0 && ", "}
                                  {(tp.player as { slug?: string | null }).slug ? (
                                    <Link href={`/player/${(tp.player as { slug?: string | null }).slug}`} style={{ color: "var(--teal)", textDecoration: "none", fontWeight: 500 }}>
                                      {tp.player.name}
                                    </Link>
                                  ) : (
                                    tp.player.name
                                  )}
                                </span>
                              ))}
                            </td>
                            <td><span style={{ color: "var(--text-muted)", fontWeight: 700, fontSize: 11, fontFamily: "var(--font-display)" }}>{t("badge_waiting")}</span></td>
                          </tr>
                        ))}
                      </>
                    )}
                  </tbody>
                </table>

              {/* Récap orga — régimes, logement, notes par équipe */}
              {isOrga && (() => {
                const dietLabels: Record<string, string> = { OMNIVORE: tm("diet_omnivore"), VEGETARIAN: tm("diet_vegetarian"), VEGAN: tm("diet_vegan"), GLUTEN_FREE: tm("diet_gluten_free") };
                const dietCounts = new Map<string, number>();
                let nonPrecise = 0;
                let totalAccommodation = 0;
                for (const team of selected) {
                  for (const tp of team.players) {
                    const diets = (tp.player as { diets?: string[] }).diets ?? [];
                    if (diets.length === 0) nonPrecise++;
                    else for (const d of diets) dietCounts.set(d, (dietCounts.get(d) ?? 0) + 1);
                    if ((tp as { needsAccommodation?: boolean }).needsAccommodation) totalAccommodation++;
                  }
                }
                const totalPlayers = selected.reduce((s, t) => s + t.players.length, 0);
                if (totalPlayers === 0) return null;
                return (
                  <div style={{ marginTop: 20, display: "grid", gap: 12 }}>
                    {/* Totaux */}
                    <div style={{ padding: "12px 16px", background: "var(--surface-2)", border: "1.5px solid var(--border)", borderRadius: 8, fontSize: 13, display: "flex", flexWrap: "wrap", gap: "8px 20px", alignItems: "center" }}>
                      <span style={{ fontWeight: 700 }}>{t("orga_recap_title")}</span>
                      {[...dietCounts.entries()].map(([d, n]) => (
                        <span key={d}>{dietLabels[d] ?? d} <strong>{n}</strong></span>
                      ))}
                      {nonPrecise > 0 && <span style={{ color: "var(--text-muted)" }}>{t("diet_not_specified")} <strong>{nonPrecise}</strong></span>}
                      <span style={{ color: "var(--text-muted)" }}>/ {totalPlayers} {t("orga_players")}</span>
                      {tournament.accommodationAvailable && (
                        <span style={{ marginLeft: 8, padding: "2px 10px", background: "color-mix(in srgb, var(--teal) 15%, var(--surface))", borderRadius: 6, fontWeight: 700 }}>
                          🏠 {t("orga_accommodation_total", { count: totalAccommodation })}
                        </span>
                      )}
                    </div>

                    {/* Détail par équipe */}
                    {sortedTeams.map((team) => {
                      const hasInfo = team.players.some((tp) =>
                        (tp.player as { diets?: string[] }).diets?.length ||
                        (tp as { needsAccommodation?: boolean }).needsAccommodation
                      );
                      const hasNotes = (team as { registrationNote?: string | null }).registrationNote || (team as { orgaNote?: string | null }).orgaNote;
                      if (!hasInfo && !hasNotes) return null;
                      return (
                        <div key={team.id} style={{ padding: "12px 16px", background: "var(--surface-2)", border: "1.5px solid var(--border)", borderRadius: 8, fontSize: 13 }}>
                          <div style={{ fontWeight: 700, fontFamily: "var(--font-display)", marginBottom: 8 }}>#{team.seed} {team.name}</div>
                          {/* Joueurs : régime + logement */}
                          <div style={{ display: "grid", gap: 4, marginBottom: hasNotes ? 10 : 0 }}>
                            {team.players.map((tp) => {
                              const diets = (tp.player as { diets?: string[] }).diets ?? [];
                              const accom = (tp as { needsAccommodation?: boolean }).needsAccommodation;
                              if (!diets.length && !accom) return null;
                              return (
                                <div key={tp.player.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <span style={{ minWidth: 120, fontWeight: 500 }}>{tp.player.name}</span>
                                  {diets.length > 0
                                    ? diets.map((d) => (
                                        <span key={d} style={{ fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 4, background: "var(--yellow)", color: "var(--text)", border: "1.5px solid var(--border)" }}>
                                          {dietLabels[d] ?? d}
                                        </span>
                                      ))
                                    : <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{t("diet_not_specified")}</span>
                                  }
                                  {accom && (
                                    <span style={{ fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 4, background: "color-mix(in srgb, var(--teal) 20%, var(--surface))", border: "1.5px solid var(--teal)" }}>
                                      🏠 {t("orga_needs_accommodation")}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                          {/* Note d'inscription (team → orga) */}
                          {(team as { registrationNote?: string | null }).registrationNote && (
                            <div style={{ marginTop: 8, padding: "8px 12px", background: "color-mix(in srgb, var(--yellow) 12%, var(--surface))", borderRadius: 6, borderLeft: "3px solid var(--yellow)" }}>
                              <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", marginRight: 8 }}>{t("orga_registration_note")}</span>
                              <span>{(team as { registrationNote?: string | null }).registrationNote}</span>
                            </div>
                          )}
                          {/* Note orga (orga → orga) */}
                          <OrgaNoteEditor teamId={team.id} initialNote={(team as { orgaNote?: string | null }).orgaNote ?? ""} label={t("orga_note_label")} placeholder={t("orga_note_placeholder")} />
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
              </div>
            ) : (
              /* ---- VUE CARTES ---- */
              <div style={{ display: "grid", gap: 32 }}>
                {selected.map((team) => {
                  const teamBadges = computeTeamBadges(team.id, tournament.matches);
                  return (
                    <div key={team.id}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                        <span style={{ fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 700, background: "var(--border)", padding: "3px 8px", borderRadius: 4 }}>#{team.seed}</span>
                        <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 20 }}>{team.name}</h3>
                        {(team.city || team.country) && <span className="meta">{team.city ? `${team.city}, ` : ""}{team.country}</span>}
                        {teamBadges.map((badge) => <span key={badge} className="badge">{badge}</span>)}
                      </div>
                      <div className="team-cards-row">
                        {team.players.map((tp) => {
                          const extraBadges = computePlayerBadges(tp.player.id, allEvents);
                          const playerSlug = (tp.player as { slug?: string | null }).slug;
                          const card = (
                            <PokemonCard
                              key={tp.player.id}
                              name={tp.player.name}
                              country={tp.player.country}
                              city={tp.player.city}
                              photoPath={tp.player.photoPath}
                              badges={[...tp.player.badges, ...extraBadges]}
                              startYear={tp.player.startYear}
                              hand={tp.player.hand}
                              gender={tp.player.gender ?? undefined}
                              showGender={tp.player.showGender}
                            />
                          );
                          return playerSlug ? (
                            <Link key={tp.player.id} href={`/player/${playerSlug}`} style={{ textDecoration: "none", display: "contents" }}>
                              {card}
                            </Link>
                          ) : card;
                        })}
                      </div>
                    </div>
                  );
                })}

                {hasWaitlist && (
                  <>
                    <div className="teams-divider">{t("waitlist_divider", { count: waitlist.length })}</div>
                    {waitlist.map((team) => {
                      const teamBadges = computeTeamBadges(team.id, tournament.matches);
                      return (
                        <div key={team.id} className="team-section--waitlist">
                          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                            <span style={{ fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 700, background: "var(--border)", padding: "3px 8px", borderRadius: 4 }}>#{team.seed}</span>
                            <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 20 }}>{team.name}</h3>
                            {(team.city || team.country) && <span className="meta">{team.city ? `${team.city}, ` : ""}{team.country}</span>}
                            {teamBadges.map((badge) => <span key={badge} className="badge">{badge}</span>)}
                            <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-display)", fontWeight: 700 }}>{t("badge_waitlist")}</span>
                          </div>
                          <div className="team-cards-row">
                            {team.players.map((tp) => {
                              const extraBadges = computePlayerBadges(tp.player.id, allEvents);
                              const playerSlug = (tp.player as { slug?: string | null }).slug;
                              const card = (
                                <PokemonCard
                                  key={tp.player.id}
                                  name={tp.player.name}
                                  country={tp.player.country}
                                  city={tp.player.city}
                                  photoPath={tp.player.photoPath}
                                  badges={[...tp.player.badges, ...extraBadges]}
                                  startYear={tp.player.startYear}
                                  hand={tp.player.hand}
                                  gender={tp.player.gender ?? undefined}
                                  showGender={tp.player.showGender}
                                />
                              );
                              return playerSlug ? (
                                <Link key={tp.player.id} href={`/player/${playerSlug}`} style={{ textDecoration: "none", display: "contents" }}>
                                  {card}
                                </Link>
                              ) : card;
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* ── ONGLET LIVE ── */}
      {tab === "live" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Stream en grand — pleine largeur */}
          {youtubeEmbed ? (
            <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
              <iframe
                src={youtubeEmbed}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                title="Stream live"
                style={{ width: "100%", aspectRatio: "16/9", height: "auto", display: "block", border: "none" }}
              />
            </div>
          ) : (
            <div className="panel" style={{ textAlign: "center", padding: "32px 0" }}>
              <p className="meta">{t("stream_empty")}</p>
              {canEdit && (
                <Link href={`/tournament/${params.id}/edit`} className="ghost" style={{ fontSize: 13, marginTop: 10, display: "inline-block" }}>
                  {t("stream_add")}
                </Link>
              )}
            </div>
          )}

          {/* Scores live + Chat — 2 colonnes */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "start" }}>
            {/* Scores live */}
            <div className="panel">
              <LiveMatchTile
                tournamentId={tournament.id}
                initialMatches={tournament.matches}
              />
            </div>

            {/* Chat */}
            {tournament.chatMode !== "DISABLED" ? (
              <div className="panel" style={{ minHeight: 400 }}>
                <TournamentChat
                  tournamentId={tournament.id}
                  chatMode={tournament.chatMode}
                  currentPlayerId={currentPlayerId}
                  currentPlayerName={currentPlayerName}
                  isOrga={isOrga}
                  creatorId={tournament.creatorId}
                  fullPage
                />
              </div>
            ) : (
              <div className="panel" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 200 }}>
                <p className="meta" style={{ textAlign: "center" }}>{t("chat_disabled")}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── ONGLET ZONE FREE AGENT ── */}
      {tab === "communaute" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "start" }}>
          {/* Free agents publics */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="panel">
              <h3 style={{ marginBottom: 4 }}>{t("tab_free_agent")}</h3>
              <p className="meta" style={{ marginBottom: 16 }}>
                {t("communaute_free_agents_desc")}
              </p>

              {registrationOpen && (
                <div style={{ marginBottom: 20, paddingBottom: 16, borderBottom: "1px solid var(--border-light)" }}>
                  <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>{t("communaute_looking")}</p>
                  <FreeAgentForm tournamentId={tournament.id} />
                </div>
              )}

              {tournament.freeAgents.length === 0 ? (
                <p className="meta">{fa("empty")}</p>
              ) : (
                <FreeAgentList
                  agents={tournament.freeAgents}
                  canDelete={isOrga}
                  deleteAction={deleteFreeAgent}
                  title=""
                  publicView
                />
              )}
            </div>
          </div>

          {/* Chat */}
          {tournament.chatMode !== "DISABLED" ? (
            <div className="panel" style={{ minHeight: 400 }}>
              <TournamentChat
                tournamentId={tournament.id}
                chatMode={tournament.chatMode}
                currentPlayerId={currentPlayerId}
                currentPlayerName={currentPlayerName}
                isOrga={isOrga}
                creatorId={tournament.creatorId}
                fullPage
              />
            </div>
          ) : (
            <div className="panel" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 200 }}>
              <p className="meta" style={{ textAlign: "center" }}>{t("chat_disabled")}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
