import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { Tabs } from "@/components/Tabs";
import { ClubMemberManager } from "@/components/ClubMemberManager";
import { ClubMembersGrid } from "@/components/ClubMembersGrid";
import { ClubSessions } from "@/components/ClubSessions";
import { ClubVenues } from "@/components/ClubVenues";
import { ClubChat } from "@/components/ClubChat";
import { ClubAdminPanel } from "@/components/ClubAdminPanel";
import { ClubEquipment } from "@/components/ClubEquipment";
import { ClubAnnouncements } from "@/components/ClubAnnouncements";
import { getTranslations, getLocale } from "next-intl/server";

export const dynamic = "force-dynamic";

export default async function ClubPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { created?: string; tab?: string };
}) {
  const session = await auth();
  const currentPlayerId = session?.user?.playerId ?? null;
  const isSiteAdmin = session?.user?.role === "ADMIN";

  const club = await prisma.club.findUnique({
    where: { id: params.id },
    include: {
      manager: { select: { id: true, name: true, slug: true } },
      members: {
        include: {
          player: {
            select: {
              id: true, name: true, slug: true, country: true, city: true,
              photoPath: true, badges: true, pinnedBadges: true,
              clubLogoPath: true, emblemPosition: true,
              teamLogoPath: true,
              startYear: true, hand: true, gender: true, showGender: true,
              activeCard: true, whbpcCard: true,
            },
          },
        },
        orderBy: { joinedAt: "asc" },
      },
      admins: {
        include: { player: { select: { id: true, name: true } } },
      },
    },
  });

  if (!club) notFound();

  const isManager = currentPlayerId === club.managerId;
  const canSee = club.approved || isManager || isSiteAdmin;
  if (!canSee) notFound();
  const isClubAdmin = isManager || club.admins.some((a) => a.playerId === currentPlayerId);
  const isMember = club.members.some((m) => m.playerId === currentPlayerId && m.status === "MEMBER");

  const t = await getTranslations("club");
  const ta = await getTranslations("admin");
  const locale = await getLocale();

  const activeMembers = club.members.filter((m) => m.status === "MEMBER");
  const membersForManager = club.members.map((m) => ({
    id: m.id,
    playerId: m.playerId,
    status: m.status as "MEMBER" | "PENDING_BY_MANAGER" | "PENDING_BY_PLAYER",
    player: { id: m.player.id, name: m.player.name, slug: m.player.slug },
  }));

  // Determine active tab
  const tab = searchParams.tab ?? "members";
  const basePath = `/club/${club.id}`;

  const tabs = [
    { label: t("tab_members"), value: "members", href: `${basePath}?tab=members` },
    { label: t("tab_sessions"), value: "sessions", href: `${basePath}?tab=sessions` },
    ...(isMember ? [{ label: t("tab_announcements"), value: "announcements", href: `${basePath}?tab=announcements` }] : []),
    ...(isMember ? [{ label: t("tab_competitions"), value: "competitions", href: `${basePath}?tab=competitions` }] : []),
    ...(isMember ? [{ label: t("tab_equipment"), value: "equipment", href: `${basePath}?tab=equipment` }] : []),
    ...(isMember ? [{ label: t("tab_chat"), value: "chat", href: `${basePath}?tab=chat` }] : []),
    ...(isClubAdmin ? [{ label: t("tab_admin"), value: "admin", href: `${basePath}?tab=admin` }] : []),
  ];

  // Fetch tab-specific data
  let sessions: any[] = [];
  let venues: any[] = [];
  let messages: any[] = [];
  let hasRecurring = false;
  let competitions: any[] = [];
  let equipmentItems: any[] = [];
  let announcements: any[] = [];

  // Toujours fetch les venues publiques pour le hero
  const publicVenues = await prisma.clubVenue.findMany({
    where: { clubId: club.id },
    select: { id: true, name: true, mapLink: true },
    orderBy: { createdAt: "asc" },
  });

  // Toujours fetch pour la bannière (membres uniquement)
  let nextSession: any = null;
  let bannerAnnouncements: any[] = [];
  if (isMember) {
    const now = new Date();
    const rawNext = await prisma.clubSession.findFirst({
      where: { clubId: club.id, date: { gte: now } },
      orderBy: { date: "asc" },
      select: { id: true, date: true, recurrenceTime: true, venue: { select: { name: true } } },
    });
    if (rawNext) nextSession = { ...rawNext, date: rawNext.date.toISOString() };

    const rawBanner = await (prisma as any).clubAnnouncement.findMany({
      where: { clubId: club.id },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: { id: true, title: true, content: true, createdAt: true },
    });
    bannerAnnouncements = rawBanner.map((a: any) => ({ ...a, createdAt: a.createdAt.toISOString() }));
  }

  if (tab === "sessions") {
    const rawSessions = await prisma.clubSession.findMany({
      where: { clubId: club.id },
      orderBy: { date: "asc" },
      include: {
        createdBy: { select: { id: true, name: true } },
        attendees: {
          include: {
            player: {
              select: {
                id: true, name: true, slug: true, country: true,
                photoPath: true, badges: true, pinnedBadges: true,
                clubLogoPath: true, emblemPosition: true, teamLogoPath: true,
                startYear: true, hand: true, gender: true, showGender: true,
              },
            },
          },
        },
        venue: { select: { id: true, name: true, mapLink: true, color: true } },
        messages: {
          orderBy: { createdAt: "asc" },
          take: 100,
          select: {
            id: true,
            content: true,
            createdAt: true,
            player: { select: { id: true, name: true } },
          },
        },
      },
    });
    sessions = rawSessions.map((s) => ({
      ...s,
      date: s.date.toISOString(),
      attendees: s.attendees.map((a) => ({
        id: a.id,
        playerId: a.playerId,
        status: a.status,
        arrivalTime: a.arrivalTime,
        minPlayers: a.minPlayers,
        player: a.player,
      })),
      messages: s.messages.map((m) => ({
        ...m,
        createdAt: m.createdAt.toISOString(),
      })),
    }));
    hasRecurring = rawSessions.some((s) => s.recurring);
    venues = await prisma.clubVenue.findMany({
      where: { clubId: club.id },
      orderBy: { createdAt: "asc" },
    });
  }

  if (tab === "competitions" && isMember) {
    const memberIds = activeMembers.map((m) => m.playerId);
    const teamPlayers = await prisma.teamPlayer.findMany({
      where: { playerId: { in: memberIds } },
      select: {
        playerId: true,
        team: {
          select: {
            id: true,
            name: true,
            tournament: {
              select: {
                id: true, slug: true, name: true, city: true, country: true,
                dateStart: true, dateEnd: true, status: true, format: true,
              },
            },
          },
        },
      },
    });
    // Map playerId → name depuis activeMembers
    const memberNameMap = new Map(activeMembers.map((m) => [m.playerId, m.player.name]));

    // Grouper par tournoi
    const tournamentMap = new Map<string, { tournament: any; teams: { name: string; players: { id: string; name: string }[] }[] }>();
    for (const tp of teamPlayers) {
      const t_ = tp.team.tournament;
      if (!tournamentMap.has(t_.id)) {
        tournamentMap.set(t_.id, { tournament: { ...t_, dateStart: t_.dateStart.toISOString(), dateEnd: t_.dateEnd.toISOString() }, teams: [] });
      }
      const entry = tournamentMap.get(t_.id)!;
      const existing = entry.teams.find((t__) => t__.name === tp.team.name);
      const playerInfo = { id: tp.playerId, name: memberNameMap.get(tp.playerId) ?? tp.playerId };
      if (existing) existing.players.push(playerInfo);
      else entry.teams.push({ name: tp.team.name, players: [playerInfo] });
    }
    competitions = Array.from(tournamentMap.values()).sort(
      (a, b) => new Date(b.tournament.dateStart).getTime() - new Date(a.tournament.dateStart).getTime()
    );
  }

  if (tab === "equipment" && isMember) {
    const raw = await prisma.clubEquipment.findMany({
      where: { clubId: club.id },
      orderBy: { createdAt: "asc" },
      include: { borrower: { select: { name: true } } },
    });
    equipmentItems = raw.map((e) => ({ ...e, borrowerName: e.borrower?.name ?? null }));
  }

  if (tab === "announcements" && isMember) {
    const rawAnnouncements = await (prisma as any).clubAnnouncement.findMany({
      where: { clubId: club.id },
      orderBy: { createdAt: "desc" },
      include: { author: { select: { id: true, name: true } } },
    });
    announcements = rawAnnouncements.map((a: any) => ({
      ...a,
      createdAt: a.createdAt.toISOString(),
    }));
  }

  if (tab === "chat" && isMember) {
    const rawMessages = await prisma.clubMessage.findMany({
      where: { clubId: club.id },
      orderBy: { createdAt: "asc" },
      take: 200,
      select: {
        id: true,
        content: true,
        createdAt: true,
        player: { select: { id: true, name: true } },
      },
    });
    messages = rawMessages.map((m) => ({
      ...m,
      createdAt: m.createdAt.toISOString(),
    }));
  }

  return (
    <div>
      {/* Bannière pendante */}
      {!club.approved && (
        <div style={{ background: "color-mix(in srgb, var(--yellow) 12%, transparent)", border: "2px solid var(--yellow)", borderRadius: "var(--radius)", padding: "12px 20px", marginBottom: 20 }}>
          ⏳ {t("pending_approval")}
          {isSiteAdmin && (
            <form action={`/api/admin/clubs/${club.id}/approve`} method="POST" style={{ display: "inline", marginLeft: 16 }}>
              <button type="submit" className="primary" style={{ fontSize: 12, padding: "4px 12px" }}>
                ✓ {ta("btn_approve")}
              </button>
            </form>
          )}
        </div>
      )}

      {searchParams.created && (
        <div style={{ background: "color-mix(in srgb, var(--teal) 12%, transparent)", border: "2px solid var(--teal)", borderRadius: "var(--radius)", padding: "12px 20px", marginBottom: 20 }}>
          {t("created_success")}
        </div>
      )}

      {/* Header du club */}
      <div className="club-hero">
        <div className="club-hero__logo">
          {club.logoPath
            ? <img src={club.logoPath} alt={club.name} />
            : <div className="club-hero__logo-placeholder">{club.name[0]?.toUpperCase()}</div>
          }
        </div>
        <div className="club-hero__info">
          <h1>{club.name}</h1>
          <p className="club-hero__location">📍 {club.city}, {club.country}</p>
          {club.description && <p style={{ marginTop: 8, fontSize: 14, color: "var(--text-muted)" }}>{club.description}</p>}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
            {club.website && (
              <a href={club.website} target="_blank" rel="noopener noreferrer" className="ghost" style={{ fontSize: 13 }}>
                 {t("website_link")}
              </a>
            )}
            {club.instagram && (
              <a
                href={club.instagram.startsWith("http") ? club.instagram : `https://instagram.com/${club.instagram.replace(/^@/, "")}`}
                target="_blank" rel="noopener noreferrer" className="ghost" style={{ fontSize: 13 }}
              >
                📸 Instagram
              </a>
            )}
          </div>
          {publicVenues.filter(v => v.mapLink).length > 0 ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
              {publicVenues.filter(v => v.mapLink).map(v => (
                <a key={v.id} href={v.mapLink!} target="_blank" rel="noopener noreferrer" className="ghost" style={{ fontSize: 13 }}>
                  🗺️ {v.name}
                </a>
              ))}
            </div>
          ) : club.trainingMapLink ? (
            <a href={club.trainingMapLink} target="_blank" rel="noopener noreferrer" className="ghost" style={{ marginTop: 8, display: "inline-flex", fontSize: 13 }}>
              🗺️ {t("training_map_link")}
            </a>
          ) : null}
          <p className="meta" style={{ marginTop: 8 }}>
            {t("manager_label")} : <Link href={`/player/${club.manager.slug ?? club.manager.id}`}>{club.manager.name}</Link>
          </p>
        </div>
        <div className="club-hero__actions">
          <Link href={`/clubs?continent=${club.continentCode}`} className="ghost">
            {t("btn_back_country", { country: club.country })}
          </Link>
          {(isMember || isSiteAdmin) && (
            <Link href={`/club/${club.id}/edit`} className="ghost" style={{ fontSize: 13 }}>
              ✏️ {t("btn_edit")}
            </Link>
          )}
        </div>
      </div>

      {/* Bannière post-its membres */}
      {isMember && (nextSession || bannerAnnouncements.length > 0) && (
        <div className="club-banner">
          {/* Post-it prochain entraînement */}
          {nextSession && (
            <Link href={`/club/${club.id}?tab=sessions`} className="club-banner__postit club-banner__postit--session">
              <span className="club-banner__postit-icon">📅</span>
              <span className="club-banner__postit-label">{t("banner_next_session")}</span>
              <span className="club-banner__postit-value">
                {new Date(nextSession.date).toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" })}
                {nextSession.recurrenceTime && ` · ${nextSession.recurrenceTime}`}
                {nextSession.venue?.name && ` — ${nextSession.venue.name}`}
              </span>
            </Link>
          )}
          {/* Post-its annonces */}
          {bannerAnnouncements.map((a: any) => (
            <Link key={a.id} href={`/club/${club.id}?tab=announcements`} className="club-banner__postit club-banner__postit--announce">
              <span className="club-banner__postit-icon">📢</span>
              <span className="club-banner__postit-label">{a.title}</span>
              <span className="club-banner__postit-value">{a.content.length > 80 ? a.content.slice(0, 80) + "…" : a.content}</span>
            </Link>
          ))}
        </div>
      )}

      {/* Tabs */}
      <Tabs items={tabs} active={tab} />

      {/* Tab content */}
      {tab === "members" && (
        <div className="club-layout">
          <div className="club-players">
            <div className="section-header" style={{ marginBottom: 16 }}>
              <div>
                <h2>{t("members_title", { count: activeMembers.length })}</h2>
              </div>
            </div>
            {activeMembers.length > 0 ? (
              <ClubMembersGrid members={activeMembers} emptyLabel={t("members_empty")} clubName={club.name} />
            ) : (
              <div className="empty-state"><p>{t("members_empty")}</p></div>
            )}
          </div>

          {currentPlayerId && (
            <div className="club-sidebar">
              <ClubMemberManager
                clubId={club.id}
                managerId={club.managerId}
                members={membersForManager}
                currentPlayerId={currentPlayerId}
                isManager={isManager}
              />
            </div>
          )}
        </div>
      )}

      {tab === "sessions" && (
        <div className="club-sessions-layout">
          <ClubVenues
            clubId={club.id}
            venues={venues}
            isAdmin={isClubAdmin}
          />
          <ClubSessions
            clubId={club.id}
            sessions={sessions}
            venues={venues}
            isMember={isMember}
            isAdmin={isClubAdmin}
            currentPlayerId={currentPlayerId}
            hasRecurring={hasRecurring}
          />
        </div>
      )}

      {tab === "competitions" && isMember && (
        <div style={{ marginTop: 24 }}>
          {competitions.length === 0 ? (
            <div className="empty-state"><p>{t("competitions_empty")}</p></div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {competitions.map(({ tournament: tr, teams }) => (
                <div key={tr.id} className="panel" style={{ padding: "16px 20px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
                    <div>
                      <Link href={`/tournament/${tr.slug ?? tr.id}`} style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 700 }}>
                        {tr.name}
                      </Link>
                      <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--text-muted)" }}>
                        📍 {tr.city}, {tr.country} · {new Date(tr.dateStart).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" })}
                      </p>
                    </div>
                    <span className={`status ${tr.status.toLowerCase()}`}>{tr.status}</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
                    {teams.map((team: any) => (
                      <div key={team.name} style={{ background: "var(--surface-2)", border: "1.5px solid var(--border-light)", borderRadius: 8, padding: "8px 12px" }}>
                        <p style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 700 }}>🚲 {team.name}</p>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px" }}>
                          {team.players.map((p: any) => (
                            <Link key={p.id} href={`/player/${p.id}`} style={{ fontSize: 12, color: "var(--accent)" }}>
                              {p.name}
                            </Link>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "announcements" && isMember && (
        <div style={{ marginTop: 24 }}>
          <ClubAnnouncements
            clubId={club.id}
            initialAnnouncements={announcements}
            isAdmin={isClubAdmin}
            currentPlayerId={currentPlayerId}
          />
        </div>
      )}

      {tab === "equipment" && isMember && (
        <ClubEquipment
          clubId={club.id}
          equipment={equipmentItems}
          members={activeMembers.map((m) => ({ playerId: m.playerId, player: { id: m.player.id, name: m.player.name } }))}
          isAdmin={isClubAdmin}
          currentPlayerId={currentPlayerId}
        />
      )}

      {tab === "chat" && isMember && (
        <ClubChat
          clubId={club.id}
          messages={messages}
          currentPlayerId={currentPlayerId}
          isAdmin={isClubAdmin}
        />
      )}

      {tab === "admin" && isClubAdmin && (
        <ClubAdminPanel
          clubId={club.id}
          managerId={club.managerId}
          admins={club.admins.map((a) => ({
            id: a.id,
            playerId: a.playerId,
            player: a.player,
          }))}
          members={activeMembers.map((m) => ({
            playerId: m.playerId,
            player: { id: m.player.id, name: m.player.name },
          }))}
          isManager={isManager}
        />
      )}
    </div>
  );
}
