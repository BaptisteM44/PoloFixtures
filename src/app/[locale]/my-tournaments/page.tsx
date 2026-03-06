"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Link } from "@/i18n/navigation";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { TeamChat } from "@/components/TeamChat";

type Teammate = {
  id: string;
  name: string;
  slug: string | null;
  photoPath: string | null;
  country: string;
  isCaptain: boolean;
};

type Tournament = {
  id: string;
  name: string;
  city: string;
  country: string;
  dateStart: string;
  dateEnd: string;
  status: string;
  bannerPath: string | null;
};

type Entry = {
  teamId: string;
  teamName: string;
  teamColor: string | null;
  isCaptain: boolean;
  tournament: Tournament;
  teammates: Teammate[];
};

type CreatedTournament = {
  id: string;
  name: string;
  city: string;
  country: string;
  dateStart: string;
  dateEnd: string;
  status: string;
  approved: boolean;
  bannerPath: string | null;
  _count: { teams: number };
};

const STATUS_CLASSES: Record<string, string> = {
  UPCOMING: "badge--upcoming",
  LIVE: "badge--live",
  COMPLETED: "badge--completed",
};

function flagEmoji(countryCode: string) {
  if (!countryCode || countryCode.length !== 2) return "";
  return String.fromCodePoint(
    ...countryCode.toUpperCase().split("").map((c) => 127397 + c.charCodeAt(0))
  );
}

function formatDateRange(start: string, end: string) {
  return `${new Date(start).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} — ${new Date(end).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}`;
}

export default function MyTournamentsPage() {
  const t = useTranslations("my_tournaments");
  const ts = useTranslations("tournaments");
  const tc = useTranslations("common");
  const { data: session, status: sessionStatus } = useSession();

  const statusLabel = (s: string) => {
    const map: Record<string, string> = {
      UPCOMING: ts("status_upcoming"),
      LIVE: ts("status_live"),
      COMPLETED: ts("status_completed"),
    };
    return map[s] ?? s;
  };
  const router = useRouter();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [created, setCreated] = useState<CreatedTournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [openChat, setOpenChat] = useState<string | null>(null);

  const playerId = (session?.user as any)?.playerId as string | null;

  useEffect(() => {
    if (sessionStatus === "unauthenticated") router.push("/login?next=/my-tournaments");
    if (sessionStatus === "authenticated" && !playerId) router.push("/");
  }, [sessionStatus, playerId, router]);

  const fetchData = useCallback(async () => {
    const res = await fetch("/api/my-tournaments");
    if (res.ok) {
      const data = await res.json();
      setEntries(data.entries ?? []);
      setCreated(data.createdTournaments ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (playerId) fetchData();
  }, [playerId, fetchData]);

  if (sessionStatus === "loading" || loading) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <p className="meta">{ts("empty_no_match")}</p>
      </div>
    );
  }

  if (!playerId) return null;

  const upcoming = entries.filter((e) => e.tournament.status === "UPCOMING");
  const live = entries.filter((e) => e.tournament.status === "LIVE");
  const completed = entries.filter((e) => e.tournament.status === "COMPLETED");

  const playerSections = [
    { title: `🔴  ${ts("status_live")}`, entries: live, collapsible: false },
    { title: `📅  ${ts("status_upcoming")}`, entries: upcoming, collapsible: false },
    { title: `✅  ${ts("status_completed")}`, entries: completed, collapsible: true },
  ].filter((s) => s.entries.length > 0);

  const createdUpcoming = created.filter((t) => t.status === "UPCOMING");
  const createdLive = created.filter((t) => t.status === "LIVE");
  const createdCompleted = created.filter((t) => t.status === "COMPLETED");

  const orgSections = [
    { title: `🔴  ${ts("status_live")}`, items: createdLive, collapsible: false },
    { title: `📅  ${ts("status_upcoming")}`, items: createdUpcoming, collapsible: false },
    { title: `✅  ${ts("status_completed")}`, items: createdCompleted, collapsible: true },
  ].filter((s) => s.items.length > 0);

  return (
    <div className="my-tournaments">
      <div className="my-tournaments__header">
        <h1>{t("page_title")}</h1>
      </div>

      {/* ── SECTION JOUEUR ── */}
      <div className="my-tournaments__role-section">
        <div className="my-tournaments__role-heading">
          <h2>🏑 {t("section_player")}</h2>
          <span className="meta">{entries.length} tournoi{entries.length !== 1 ? "s" : ""}</span>
        </div>

        {entries.length === 0 ? (
          <div className="panel" style={{ textAlign: "center", padding: 32 }}>
            <p style={{ fontSize: 15, marginBottom: 12 }}>{t("empty_player")}</p>
            <Link href="/tournaments" className="primary">{ts("page_title")} →</Link>
          </div>
        ) : (
          playerSections.map((section) => (
            section.collapsible ? (
              <details key={section.title} className="my-tournaments__section my-tournaments__section--collapsible">
                <summary className="my-tournaments__section-title my-tournaments__section-title--summary">
                  {section.title} <span className="meta">({section.entries.length})</span>
                </summary>
                <div className="my-tournaments__grid" style={{ marginTop: 12 }}>
                  {section.entries.map((entry) => {
                    const chatOpen = openChat === entry.teamId;
                    const statusCls = STATUS_CLASSES[entry.tournament.status] ?? "";
                    return (
                      <div key={entry.teamId} className="my-tournaments__card panel">
                        <div className="my-tournaments__card-header">
                          <div style={{ flex: 1 }}>
                            <Link href={`/tournament/${entry.tournament.id}`} className="my-tournaments__tournament-name">{entry.tournament.name}</Link>
                            <div className="my-tournaments__card-sub">
                              <span>{flagEmoji(entry.tournament.country)} {entry.tournament.city}, {entry.tournament.country}</span>
                              <span className="my-tournaments__card-dates">{formatDateRange(entry.tournament.dateStart, entry.tournament.dateEnd)}</span>
                            </div>
                          </div>
                          <span className={`my-tournaments__status-badge ${statusCls}`}>{statusLabel(entry.tournament.status)}</span>
                        </div>
                        <div className="my-tournaments__team" style={entry.teamColor ? { "--team-accent": entry.teamColor } as React.CSSProperties : undefined}>
                          <div className="my-tournaments__team-header">
                            <span className="my-tournaments__team-name">
                              {entry.teamColor && <span className="my-tournaments__team-dot" />}
                              {entry.teamName}
                            </span>
                            {entry.isCaptain && <span className="my-tournaments__captain-badge">{t("captain")}</span>}
                          </div>
                          <div className="my-tournaments__teammates">
                            {entry.teammates.map((tm) => (
                              <div key={tm.id} className={`my-tournaments__teammate ${tm.id === playerId ? "my-tournaments__teammate--me" : ""}`}>
                                {tm.photoPath ? (
                                  <img src={tm.photoPath} alt={tm.name} className="my-tournaments__teammate-avatar" />
                                ) : (
                                  <div className="my-tournaments__teammate-avatar my-tournaments__teammate-avatar--placeholder">{tm.name.charAt(0).toUpperCase()}</div>
                                )}
                                <div className="my-tournaments__teammate-info">
                                  {tm.slug ? (
                                    <Link href={`/player/${tm.slug}`} className="my-tournaments__teammate-name">{tm.name}</Link>
                                  ) : (
                                    <span className="my-tournaments__teammate-name">{tm.name}</span>
                                  )}
                                  <span className="my-tournaments__teammate-country">{flagEmoji(tm.country)}</span>
                                  {tm.isCaptain && <span className="my-tournaments__teammate-cap">C</span>}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                        <button className="my-tournaments__chat-toggle" onClick={() => setOpenChat(chatOpen ? null : entry.teamId)}>
                          💬 {chatOpen ? t("chat_close") : t("chat_open")}
                        </button>
                        {chatOpen && (
                          <div className="my-tournaments__chat-container">
                            <TeamChat teamId={entry.teamId} currentPlayerId={playerId} teammates={entry.teammates} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </details>
            ) : (
            <div key={section.title} className="my-tournaments__section">
              <h3 className="my-tournaments__section-title">{section.title}</h3>
              <div className="my-tournaments__grid">
                {section.entries.map((entry) => {
                  const chatOpen = openChat === entry.teamId;
                  const statusCls = STATUS_CLASSES[entry.tournament.status] ?? "";

                  return (
                    <div key={entry.teamId} className="my-tournaments__card panel">
                      <div className="my-tournaments__card-header">
                        <div style={{ flex: 1 }}>
                          <Link href={`/tournament/${entry.tournament.id}`} className="my-tournaments__tournament-name">
                            {entry.tournament.name}
                          </Link>
                          <div className="my-tournaments__card-sub">
                            <span>{flagEmoji(entry.tournament.country)} {entry.tournament.city}, {entry.tournament.country}</span>
                            <span className="my-tournaments__card-dates">{formatDateRange(entry.tournament.dateStart, entry.tournament.dateEnd)}</span>
                          </div>
                        </div>
                        <span className={`my-tournaments__status-badge ${statusCls}`}>
                          {statusLabel(entry.tournament.status)}
                        </span>
                      </div>

                      <div className="my-tournaments__team" style={entry.teamColor ? { "--team-accent": entry.teamColor } as React.CSSProperties : undefined}>
                        <div className="my-tournaments__team-header">
                          <span className="my-tournaments__team-name">
                            {entry.teamColor && <span className="my-tournaments__team-dot" />}
                            {entry.teamName}
                          </span>
                          {entry.isCaptain && <span className="my-tournaments__captain-badge">{t("captain")}</span>}
                        </div>
                        <div className="my-tournaments__teammates">
                          {entry.teammates.map((tm) => (
                            <div key={tm.id} className={`my-tournaments__teammate ${tm.id === playerId ? "my-tournaments__teammate--me" : ""}`}>
                              {tm.photoPath ? (
                                <img src={tm.photoPath} alt={tm.name} className="my-tournaments__teammate-avatar" />
                              ) : (
                                <div className="my-tournaments__teammate-avatar my-tournaments__teammate-avatar--placeholder">
                                  {tm.name.charAt(0).toUpperCase()}
                                </div>
                              )}
                              <div className="my-tournaments__teammate-info">
                                {tm.slug ? (
                                  <Link href={`/player/${tm.slug}`} className="my-tournaments__teammate-name">{tm.name}</Link>
                                ) : (
                                  <span className="my-tournaments__teammate-name">{tm.name}</span>
                                )}
                                <span className="my-tournaments__teammate-country">{flagEmoji(tm.country)}</span>
                                {tm.isCaptain && <span className="my-tournaments__teammate-cap">C</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <button
                        className="my-tournaments__chat-toggle"
                        onClick={() => setOpenChat(chatOpen ? null : entry.teamId)}
                      >
                        💬 {chatOpen ? t("chat_close") : t("chat_open")}
                      </button>

                      {chatOpen && (
                        <div className="my-tournaments__chat-container">
                          <TeamChat teamId={entry.teamId} currentPlayerId={playerId} teammates={entry.teammates} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            )
          ))
        )}
      </div>

      {/* ── SECTION ORGANISATEUR ── */}
      <div className="my-tournaments__role-section">
        <div className="my-tournaments__role-heading">
          <h2>🏗️ {t("section_organizer")}</h2>
          <span className="meta">{created.length} tournoi{created.length !== 1 ? "s" : ""}</span>
          <Link href="/tournament/new" className="ghost" style={{ fontSize: 12, marginLeft: "auto" }}>+ {t("btn_create")}</Link>
        </div>

        {created.length === 0 ? (
          <div className="panel" style={{ textAlign: "center", padding: 32 }}>
            <p style={{ fontSize: 15, marginBottom: 12 }}>{t("empty_organizer")}</p>
            <Link href="/tournament/new" className="primary">{t("btn_create")} →</Link>
          </div>
        ) : (
          orgSections.map((section) => {
            const cards = section.items.map((tour) => {
              const statusCls = STATUS_CLASSES[tour.status] ?? "";
              return (
                <div key={tour.id} className="my-tournaments__card panel">
                  <div className="my-tournaments__card-header">
                    <div style={{ flex: 1 }}>
                      <Link href={`/tournament/${tour.id}`} className="my-tournaments__tournament-name">{tour.name}</Link>
                      <div className="my-tournaments__card-sub">
                        <span>{flagEmoji(tour.country)} {tour.city}, {tour.country}</span>
                        <span className="my-tournaments__card-dates">{formatDateRange(tour.dateStart, tour.dateEnd)}</span>
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                      <span className={`my-tournaments__status-badge ${statusCls}`}>{statusLabel(tour.status)}</span>
                      {!tour.approved && (
                        <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "var(--font-display)", background: "var(--yellow)", border: "1.5px solid var(--border)", borderRadius: 4, padding: "2px 7px" }}>
                          {t("pending")}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="my-tournaments__team">
                    <span className="meta" style={{ fontSize: 13 }}>
                      {tour._count.teams} équipe{tour._count.teams !== 1 ? "s" : ""} inscrite{tour._count.teams !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <Link href={`/tournament/${tour.id}`} className="ghost" style={{ fontSize: 12 }}>{tc("see_all").replace(" →", "")} →</Link>
                    <Link href={`/tournament/${tour.id}/edit`} className="ghost" style={{ fontSize: 12 }}>✏️ {tc("edit")}</Link>
                  </div>
                </div>
              );
            });

            return section.collapsible ? (
              <details key={section.title} className="my-tournaments__section my-tournaments__section--collapsible">
                <summary className="my-tournaments__section-title my-tournaments__section-title--summary">
                  {section.title} <span className="meta">({section.items.length})</span>
                </summary>
                <div className="my-tournaments__grid" style={{ marginTop: 12 }}>{cards}</div>
              </details>
            ) : (
              <div key={section.title} className="my-tournaments__section">
                <h3 className="my-tournaments__section-title">{section.title}</h3>
                <div className="my-tournaments__grid">{cards}</div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
