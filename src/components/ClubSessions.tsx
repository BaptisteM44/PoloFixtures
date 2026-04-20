"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  createSessionAction,
  deleteSessionAction,
  updateSessionAction,
  joinSessionAction,
  leaveSessionAction,
  approveSessionAttendeeAction,
  rejectSessionAttendeeAction,
  generateNextRecurringSessionAction,
  sendSessionMessageAction,
  deleteSessionMessageAction,
  cancelSessionAction,
} from "@/app/[locale]/club/[id]/actions";

type SessionMessage = {
  id: string;
  content: string;
  createdAt: string;
  player: { id: string; name: string };
};

type AttendeePlayer = {
  id: string;
  name: string;
  slug: string | null;
  country: string;
  photoPath: string | null;
  badges: string[];
  pinnedBadges: string[];
  clubLogoPath: string | null;
  emblemPosition: string | null;
  teamLogoPath: string | null;
  startYear: number | null;
  hand: string | null;
  gender: string | null;
  showGender: boolean;
};

type Attendee = {
  id: string;
  playerId: string;
  status: string;
  arrivalTime: string | null;
  minPlayers: number | null;
  player: AttendeePlayer;
};

type Venue = {
  id: string;
  name: string;
  mapLink: string | null;
  color: string | null;
};

type Session = {
  id: string;
  title: string | null;
  date: string;
  duration: number;
  venueId: string | null;
  venue: Venue | null;
  location: string | null;
  notes: string | null;
  recurring: boolean;
  recurrenceDay: number | null;
  recurrenceTime: string | null;
  color: string | null;
  status: string;
  createdBy: { id: string; name: string };
  attendees: Attendee[];
  messages: SessionMessage[];
};

// DAY_NAMES is derived from translation key "sessions_day_names" (comma-separated)

// Palette couleurs du site pour les sessions
const SITE_COLORS = [
  { value: "#ffa2af", label: "Pink" },
  { value: "#60c9cf", label: "Teal" },
  { value: "#fffc8a", label: "Yellow" },
  { value: "#c9a8f5", label: "Purple" },
  { value: "#ffb347", label: "Orange" },
  { value: "#e7e7e7", label: "Gray" },
];

const CHAT_COLORS = [
  "#e53935", "#8e24aa", "#1e88e5", "#43a047",
  "#f4511e", "#6d4c41", "#00897b", "#3949ab",
  "#d81b60", "#7cb342", "#fb8c00", "#5e35b1",
];

function hashColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  return CHAT_COLORS[Math.abs(hash) % CHAT_COLORS.length];
}

function fmtDate(d: Date) {
  return d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
}

function fmtTime(d: Date) {
  return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function addMinutes(d: Date, mins: number) {
  return new Date(d.getTime() + mins * 60000);
}

export function ClubSessions({
  clubId,
  sessions: initialSessions,
  venues,
  isMember,
  isAdmin,
  currentPlayerId,
  hasRecurring,
}: {
  clubId: string;
  sessions: Session[];
  venues: Venue[];
  isMember: boolean;
  isAdmin: boolean;
  currentPlayerId: string | null;
  hasRecurring: boolean;
}) {
  const t = useTranslations("club");
  const DAY_NAMES = t("sessions_day_names").split(",");

  const [sessions, setSessions] = useState(initialSessions);
  const [showAdd, setShowAdd] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Join modal state
  const [joiningSessionId, setJoiningSessionId] = useState<string | null>(null);
  const [joinArrival, setJoinArrival] = useState("");
  const [joinMinPlayers, setJoinMinPlayers] = useState<number | "">("");
  const [joinCondition, setJoinCondition] = useState<"always" | "min">("always");

  // Add form state
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("19:00");
  const [durationHours, setDurationHours] = useState("2");
  const [venueId, setVenueId] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [recurring, setRecurring] = useState(false);
  const [recurrenceDay, setRecurrenceDay] = useState(1);
  const [color, setColor] = useState("");

  // Edit session state
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editTime, setEditTime] = useState("19:00");
  const [editDurationHours, setEditDurationHours] = useState("2");
  const [editVenueId, setEditVenueId] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editRecurrenceDay, setEditRecurrenceDay] = useState(1);
  const [editRecurrenceTime, setEditRecurrenceTime] = useState("");
  const [editColor, setEditColor] = useState("");

  function handleCreate() {
    if (!date || !time) return;
    const dateTime = new Date(`${date}T${time}:00`).toISOString();
    startTransition(async () => {
      const res = await createSessionAction(clubId, {
        title: title.trim() || undefined,
        date: dateTime,
        duration: Math.round((parseFloat(durationHours) || 2) * 60),
        venueId: venueId || undefined,
        location: location.trim() || undefined,
        notes: notes.trim() || undefined,
        recurring,
        recurrenceDay: recurring ? recurrenceDay : undefined,
        recurrenceTime: recurring ? time : undefined,
        color: color || undefined,
      });
      if ("ok" in res) {
        setShowAdd(false);
        setTitle(""); setDate(""); setTime("19:00"); setDurationHours("2");
        setVenueId(""); setLocation(""); setNotes(""); setRecurring(false); setColor("");
        window.location.reload();
      }
    });
  }

  function handleDelete(sessionId: string) {
    if (!confirm(t("sessions_confirm_delete"))) return;
    startTransition(async () => {
      await deleteSessionAction(clubId, sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    });
  }

  function openJoinModal(sessionId: string) {
    const session = sessions.find((s) => s.id === sessionId);
    if (!session) return;
    const d = new Date(session.date);
    setJoinArrival(fmtTime(d));
    setJoinMinPlayers("");
    setJoinCondition("always");
    setJoiningSessionId(sessionId);
  }

  function handleJoinConfirm() {
    if (!joiningSessionId) return;
    startTransition(async () => {
      await joinSessionAction(clubId, joiningSessionId, {
        arrivalTime: joinArrival || undefined,
        minPlayers: joinCondition === "min" && joinMinPlayers ? Number(joinMinPlayers) : undefined,
      });
      setJoiningSessionId(null);
      window.location.reload();
    });
  }

  function handleLeave(sessionId: string) {
    startTransition(async () => {
      await leaveSessionAction(clubId, sessionId);
      window.location.reload();
    });
  }

  function handleApprove(sessionId: string, playerId: string) {
    startTransition(async () => {
      await approveSessionAttendeeAction(clubId, sessionId, playerId);
      window.location.reload();
    });
  }

  function handleReject(sessionId: string, playerId: string) {
    startTransition(async () => {
      await rejectSessionAttendeeAction(clubId, sessionId, playerId);
      window.location.reload();
    });
  }

  function handleGenerateNext() {
    startTransition(async () => {
      const res = await generateNextRecurringSessionAction(clubId);
      if ("ok" in res) window.location.reload();
    });
  }

  function handleOpenEdit(session: Session) {
    const d = new Date(session.date);
    setEditingSessionId(session.id);
    setEditTitle(session.title ?? "");
    const yr = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const dy = String(d.getDate()).padStart(2, "0");
    setEditDate(`${yr}-${mo}-${dy}`);
    setEditTime(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`);
    setEditDurationHours(String(session.duration / 60));
    setEditVenueId(session.venueId ?? "");
    setEditLocation(session.location ?? "");
    setEditNotes(session.notes ?? "");
    setEditRecurrenceDay(session.recurrenceDay ?? 1);
    setEditRecurrenceTime(session.recurrenceTime ?? "");
    setEditColor(session.color ?? "");
  }

  function handleEditSave() {
    if (!editingSessionId) return;
    startTransition(async () => {
      const res = await updateSessionAction(clubId, editingSessionId, {
        title: editTitle,
        datetime: new Date(`${editDate}T${editTime}:00`).toISOString(),
        duration: Math.round((parseFloat(editDurationHours) || 2) * 60),
        venueId: editVenueId || null,
        location: editLocation,
        notes: editNotes,
        recurrenceDay: editRecurrenceDay,
        recurrenceTime: editRecurrenceTime || undefined,
        color: editColor,
      });
      if ("ok" in res) {
        setEditingSessionId(null);
        window.location.reload();
      }
    });
  }

  function handleCancel(sessionId: string) {
    if (!confirm(t("sessions_confirm_cancel"))) return;
    startTransition(async () => {
      await cancelSessionAction(clubId, sessionId);
      window.location.reload();
    });
  }

  function handleSendMessage(sessionId: string, content: string) {
    startTransition(async () => {
      const res = await sendSessionMessageAction(clubId, sessionId, content);
      if ("ok" in res) window.location.reload();
    });
  }

  function handleDeleteMessage(sessionId: string, messageId: string) {
    startTransition(async () => {
      await deleteSessionMessageAction(clubId, messageId);
      setSessions((prev) => prev.map((s) =>
        s.id === sessionId
          ? { ...s, messages: s.messages.filter((m) => m.id !== messageId) }
          : s
      ));
    });
  }

  const now = new Date();
  const upcoming = sessions.filter((s) => new Date(s.date) >= now).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const past = sessions.filter((s) => new Date(s.date) < now).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div className="club-sessions">
      {/* Join modal */}
      {joiningSessionId && (
        <div className="session-join-modal-overlay" onClick={() => setJoiningSessionId(null)}>
          <div className="session-join-modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginBottom: 16 }}>{t("join_modal_title")}</h3>

            <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>
              {t("join_modal_arrival_label")}
            </label>
            <input
              className="form-input"
              type="time"
              value={joinArrival}
              onChange={(e) => setJoinArrival(e.target.value)}
              style={{ marginBottom: 14 }}
            />

            <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 8 }}>
              {t("join_modal_condition_label")}
            </label>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
                <input type="radio" checked={joinCondition === "always"} onChange={() => setJoinCondition("always")} />
                {t("join_modal_always")}
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
                <input type="radio" checked={joinCondition === "min"} onChange={() => setJoinCondition("min")} />
                {t("join_modal_if_min")}
                <input
                  className="form-input"
                  type="number"
                  min={2}
                  max={30}
                  value={joinMinPlayers}
                  onChange={(e) => setJoinMinPlayers(e.target.value ? Number(e.target.value) : "")}
                  disabled={joinCondition !== "min"}
                  style={{ width: 60, fontSize: 13, padding: "4px 8px" }}
                />
                {t("join_modal_players")}
              </label>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button className="primary" onClick={handleJoinConfirm} disabled={isPending}>
                {t("join_modal_confirm")}
              </button>
              <button className="ghost" onClick={() => setJoiningSessionId(null)}>
                {t("join_modal_cancel")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit session modal */}
      {editingSessionId && (
        <div className="session-join-modal-overlay" onClick={() => setEditingSessionId(null)}>
          <div className="session-join-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480, width: "100%" }}>
            <h3 style={{ marginBottom: 16 }}>{t("sessions_edit_title")}</h3>
            <div className="club-sessions__form-fields">
              <input className="form-input" placeholder={t("sessions_title_placeholder")} value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
              <div style={{ display: "flex", gap: 8 }}>
                <input className="form-input" type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} style={{ flex: 1 }} />
                <input className="form-input" type="time" value={editTime} onChange={(e) => setEditTime(e.target.value)} style={{ width: 100 }} />
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <input
                    className="form-input"
                    type="number"
                    min={0.5} max={12} step={0.5}
                    value={editDurationHours}
                    onChange={(e) => setEditDurationHours(e.target.value)}
                    style={{ width: 70 }}
                  />
                  <span style={{ fontSize: 13, color: "var(--text-muted)" }}>h</span>
                </div>
              </div>
              {venues.length > 0 && (
                <select className="form-select" value={editVenueId} onChange={(e) => setEditVenueId(e.target.value)}>
                  <option value="">{t("sessions_venue_free")}</option>
                  {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              )}
              {!editVenueId && (
                <input className="form-input" placeholder={t("sessions_location_placeholder")} value={editLocation} onChange={(e) => setEditLocation(e.target.value)} />
              )}
              <textarea className="form-input" placeholder={t("sessions_notes_placeholder")} value={editNotes} onChange={(e) => setEditNotes(e.target.value)} rows={2} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{t("sessions_color_label")}</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => setEditColor("")}
                    style={{
                      width: 28, height: 28, minWidth: 28, borderRadius: "50%", border: !editColor ? "3px solid var(--border)" : "2px solid var(--border-light)",
                      background: "var(--surface-2)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, padding: 0, flexShrink: 0,
                    }}
                    title="Aucune"
                  >✕</button>
                  {SITE_COLORS.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setEditColor(c.value)}
                      style={{
                        width: 28, height: 28, minWidth: 28, borderRadius: "50%",
                        border: editColor === c.value ? "3px solid var(--border)" : "2px solid var(--border-light)",
                        background: c.value, cursor: "pointer", padding: 0, flexShrink: 0,
                      }}
                      title={c.label}
                    />
                  ))}
                </div>
              </div>
              {(() => {
                const s = sessions.find(s => s.id === editingSessionId);
                return s?.recurring ? (
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 13 }}>{t("sessions_every")}</span>
                    <select className="form-select" value={editRecurrenceDay} onChange={(e) => setEditRecurrenceDay(Number(e.target.value))}>
                      {DAY_NAMES.map((d, i) => <option key={i} value={i}>{d}</option>)}
                    </select>
                    <input className="form-input" type="time" value={editRecurrenceTime} onChange={(e) => setEditRecurrenceTime(e.target.value)} style={{ width: 100 }} />
                  </div>
                ) : null;
              })()}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button className="primary" onClick={handleEditSave} disabled={isPending}>{t("sessions_btn_save")}</button>
              <button className="ghost" onClick={() => setEditingSessionId(null)}>{t("sessions_btn_cancel")}</button>
            </div>
          </div>
        </div>
      )}

      {/* Actions bar */}
      <div className="club-sessions__actions">
        {isMember && (
          <button className="primary" onClick={() => setShowAdd(true)} style={{ fontSize: 13 }}>
            {t("sessions_add_btn")}
          </button>
        )}
        {isAdmin && hasRecurring && (
          <button className="ghost" onClick={handleGenerateNext} disabled={isPending} style={{ fontSize: 12 }}>
            {t("sessions_generate_next")}
          </button>
        )}
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="panel club-sessions__add-form">
          <h3 style={{ marginBottom: 16 }}>{t("sessions_new_title")}</h3>
          <div className="club-sessions__form-fields">
            <input className="form-input" placeholder={t("sessions_title_placeholder")} value={title} onChange={(e) => setTitle(e.target.value)} />
            <div style={{ display: "flex", gap: 8 }}>
              <input className="form-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ flex: 1 }} />
              <input className="form-input" type="time" value={time} onChange={(e) => setTime(e.target.value)} style={{ width: 100 }} />
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <input
                  className="form-input"
                  type="number"
                  min={0.5}
                  max={12}
                  step={0.5}
                  value={durationHours}
                  onChange={(e) => setDurationHours(e.target.value)}
                  style={{ width: 70 }}
                />
                <span style={{ fontSize: 13, color: "var(--text-muted)", whiteSpace: "nowrap" }}>h</span>
              </div>
            </div>

            {venues.length > 0 && (
              <select className="form-select" value={venueId} onChange={(e) => setVenueId(e.target.value)}>
                <option value="">{t("sessions_venue_free")}</option>
                {venues.map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            )}

            {!venueId && (
              <input className="form-input" placeholder={t("sessions_location_placeholder")} value={location} onChange={(e) => setLocation(e.target.value)} />
            )}

            <textarea className="form-input" placeholder={t("sessions_notes_placeholder")} value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />

            <div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{t("sessions_color_label")}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => setColor("")}
                  style={{
                    width: 28, height: 28, minWidth: 28, borderRadius: "50%", border: !color ? "3px solid var(--border)" : "2px solid var(--border-light)",
                    background: "var(--surface-2)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, padding: 0, flexShrink: 0,
                  }}
                  title="Aucune"
                >✕</button>
                {SITE_COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setColor(c.value)}
                    style={{
                      width: 28, height: 28, minWidth: 28, borderRadius: "50%",
                      border: color === c.value ? "3px solid var(--border)" : "2px solid var(--border-light)",
                      background: c.value, cursor: "pointer", padding: 0, flexShrink: 0,
                    }}
                    title={c.label}
                  />
                ))}
              </div>
            </div>

            <label className="club-sessions__recurring-toggle">
              <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} />
              {t("sessions_recurring_label")}
            </label>

            {recurring && (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 13 }}>{t("sessions_every")}</span>
                <select className="form-select" value={recurrenceDay} onChange={(e) => setRecurrenceDay(Number(e.target.value))}>
                  {DAY_NAMES.map((d, i) => <option key={i} value={i}>{d}</option>)}
                </select>
                <span style={{ fontSize: 13 }}>{t("sessions_at_time", { time })}</span>
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button className="primary" onClick={handleCreate} disabled={isPending || !date}>{t("sessions_btn_create")}</button>
            <button className="ghost" onClick={() => setShowAdd(false)}>{t("sessions_btn_cancel")}</button>
          </div>
        </div>
      )}

      {upcoming.length > 0 && (
        <div className="club-sessions__section">
          <h3 className="club-sessions__section-title">{t("sessions_upcoming", { count: upcoming.length })}</h3>
          <div className="club-sessions__grid">
            {upcoming.map((s) => (
              <SessionCard
                key={s.id}
                session={s}
                clubId={clubId}
                isMember={isMember}
                isAdmin={isAdmin}
                currentPlayerId={currentPlayerId}
                onDelete={handleDelete}
                onJoin={openJoinModal}
                onLeave={handleLeave}
                onApprove={handleApprove}
                onReject={handleReject}
                onSendMessage={handleSendMessage}
                onDeleteMessage={handleDeleteMessage}
                onCancel={handleCancel}
                onEdit={handleOpenEdit}
                isPending={isPending}
              />
            ))}
          </div>
        </div>
      )}

      {past.length > 0 && (
        <details className="club-sessions__past-details">
          <summary className="club-sessions__past-summary">
            <span style={{ color: "var(--text-muted)", fontSize: 14, fontWeight: 600 }}>
              {t("sessions_past", { count: past.length })}
            </span>
          </summary>
          <div className="club-sessions__grid" style={{ marginTop: 12 }}>
            {past.slice(0, 6).map((s) => (
              <SessionCard
                key={s.id}
                session={s}
                clubId={clubId}
                isMember={isMember}
                isAdmin={isAdmin}
                currentPlayerId={currentPlayerId}
                onDelete={handleDelete}
                onJoin={openJoinModal}
                onLeave={handleLeave}
                onApprove={handleApprove}
                onReject={handleReject}
                onSendMessage={handleSendMessage}
                onDeleteMessage={handleDeleteMessage}
                onCancel={handleCancel}
                onEdit={handleOpenEdit}
                isPending={isPending}
                past
              />
            ))}
          </div>
        </details>
      )}

      {upcoming.length === 0 && past.length === 0 && (
        <div className="empty-state">
          <p>{t("sessions_empty")}</p>
        </div>
      )}
    </div>
  );
}

function PlayerAvatar({ player, arrivalTime, minPlayers }: {
  player: AttendeePlayer;
  arrivalTime: string | null;
  minPlayers: number | null;
}) {
  const t = useTranslations("club");
  const [showTooltip, setShowTooltip] = useState(false);
  const hasCondition = !!minPlayers;
  const label = [
    arrivalTime ? `→ ${arrivalTime}` : null,
    minPlayers ? `${t("join_modal_if_min")} ${minPlayers}` : null,
  ].filter(Boolean).join(" · ");

  return (
    <div
      className={`session-player-avatar${hasCondition ? " session-player-avatar--conditional" : ""}`}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {player.photoPath ? (
        <img src={player.photoPath} alt={player.name} />
      ) : (
        <div className="session-player-avatar__initials">
          {player.name[0]?.toUpperCase()}
        </div>
      )}
      {showTooltip && (
        <div className="session-player-avatar__tooltip">
          <strong>{player.name}</strong>
          {label && <span>{label}</span>}
        </div>
      )}
    </div>
  );
}

function SessionCard({
  session: s,
  clubId,
  isMember,
  isAdmin,
  currentPlayerId,
  onDelete,
  onJoin,
  onLeave,
  onApprove,
  onReject,
  onSendMessage,
  onDeleteMessage,
  onCancel,
  onEdit,
  isPending,
  past,
}: {
  session: Session;
  clubId: string;
  isMember: boolean;
  isAdmin: boolean;
  currentPlayerId: string | null;
  onDelete: (id: string) => void;
  onJoin: (id: string) => void;
  onLeave: (id: string) => void;
  onApprove: (sessionId: string, playerId: string) => void;
  onReject: (sessionId: string, playerId: string) => void;
  onSendMessage: (sessionId: string, content: string) => void;
  onDeleteMessage: (sessionId: string, messageId: string) => void;
  onCancel: (id: string) => void;
  onEdit: (session: Session) => void;
  isPending: boolean;
  past?: boolean;
}) {
  const t = useTranslations("club");
  const d = new Date(s.date);
  const endTime = fmtTime(addMinutes(d, s.duration));
  const confirmed = s.attendees.filter((a) => a.status === "CONFIRMED");
  const conditional = confirmed.filter((a) => !!a.minPlayers);
  const pending = s.attendees.filter((a) => a.status === "PENDING");
  const myAttendance = s.attendees.find((a) => a.playerId === currentPlayerId);
  const canDelete = currentPlayerId === s.createdBy.id || isAdmin;
  const [chatInput, setChatInput] = useState("");
  const chatScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [s.messages]);

  function handleSend() {
    if (!chatInput.trim()) return;
    onSendMessage(s.id, chatInput);
    setChatInput("");
  }

  const locationDisplay = s.venue
    ? s.venue.mapLink
      ? <a href={s.venue.mapLink} target="_blank" rel="noopener noreferrer" className="session-venue-link">📍 {s.venue.name} →</a>
      : <span>📍 {s.venue.name}</span>
    : s.location
    ? <span>📍 {s.location}</span>
    : null;

  const cardColor = s.color || s.venue?.color || null;
  return (
    <div className={`club-session-card${past ? " club-session-card--past" : ""}`} style={{ borderTop: cardColor ? `3px solid ${cardColor}` : undefined }}>
      {/* Header */}
      <div className="club-session-card__header">
        <div>
          <div className="club-session-card__date">
            {fmtDate(d)} · {fmtTime(d)} → {endTime}
          </div>
          {s.title && <div className="club-session-card__title">{s.title}</div>}
          {s.recurring && <span className="club-session-card__badge">Récurrent</span>}
          {s.status === "CANCELLED" && (
            <span className="club-session-card__badge" style={{ background: "var(--danger)", color: "#fff", marginLeft: 4 }}>
              {t("sessions_cancelled_badge")}
            </span>
          )}
        </div>
        <div className="club-session-card__meta">
          {cardColor && (
            <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: cardColor, marginRight: 4 }} />
          )}
          {locationDisplay}
        </div>
      </div>

      {s.notes && <p className="club-session-card__notes">{s.notes}</p>}

      {/* Body: attendees + chat */}
      <div className="club-session-card__body">
        {/* Left: attendees */}
        <div className="club-session-card__left">
          <div className="club-session-card__attendee-count">
            {confirmed.length !== 1 ? t("sessions_participants_plural", { count: confirmed.length }) : t("sessions_participants", { count: confirmed.length })}
            {conditional.length > 0 && (
              <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 6 }}>
                {conditional.length > 1 ? t("sessions_conditionals", { count: conditional.length }) : t("sessions_conditional", { count: conditional.length })}
              </span>
            )}
          </div>

          <div className="club-session-card__avatars">
            {confirmed.map((a) => (
              <PlayerAvatar
                key={a.id}
                player={a.player}
                arrivalTime={a.arrivalTime}
                minPlayers={a.minPlayers}
              />
            ))}
          </div>

          {/* Pending requests (admin only) */}
          {isAdmin && pending.length > 0 && (
            <div className="club-session-card__pending">
              <span style={{ fontSize: 11, fontWeight: 700, color: "#f57c00" }}>
                {pending.length > 1 ? t("sessions_requests_plural", { count: pending.length }) : t("sessions_requests", { count: pending.length })}
              </span>
              {pending.map((a) => (
                <div key={a.id} className="club-session-card__pending-row">
                  <span style={{ fontSize: 12 }}>{a.player.name}</span>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button className="primary" style={{ fontSize: 10, padding: "2px 6px" }} onClick={() => onApprove(s.id, a.playerId)} disabled={isPending}>✓</button>
                    <button className="ghost" style={{ fontSize: 10, padding: "2px 6px" }} onClick={() => onReject(s.id, a.playerId)} disabled={isPending}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          {!past && currentPlayerId && (
            <div className="club-session-card__actions">
              {!myAttendance ? (
                <button className="primary" style={{ fontSize: 12 }} onClick={() => onJoin(s.id)} disabled={isPending}>
                  {isMember ? t("sessions_join_member") : t("sessions_join_guest")}
                </button>
              ) : myAttendance.status === "PENDING" ? (
                <span style={{ fontSize: 12, color: "#f57c00", fontWeight: 600 }}>{t("sessions_pending")}</span>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span style={{ fontSize: 11, color: "var(--teal)", fontWeight: 600 }}>{t("sessions_registered")}</span>
                    {myAttendance.arrivalTime && (
                      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>→ {myAttendance.arrivalTime}</span>
                    )}
                    {myAttendance.minPlayers && (
                      <span style={{ fontSize: 11, color: "#f57c00" }}>{t("join_modal_if_min")} {myAttendance.minPlayers}</span>
                    )}
                  </div>
                  <button className="ghost" style={{ fontSize: 11 }} onClick={() => onLeave(s.id)} disabled={isPending}>
                    {t("sessions_leave")}
                  </button>
                </div>
              )}
              {canDelete && (
                <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
                  <button className="ghost" style={{ fontSize: 11 }} onClick={() => onEdit(s)} disabled={isPending}>
                    ✏️ {t("sessions_edit")}
                  </button>
                  <button className="ghost" style={{ fontSize: 11, color: "var(--text-muted)" }} onClick={() => onDelete(s.id)} disabled={isPending}>
                    {t("sessions_delete")}
                  </button>
                </div>
              )}
              {!past && isAdmin && s.status !== "CANCELLED" && (
                <button className="ghost" style={{ fontSize: 11, color: "var(--danger)" }} onClick={() => onCancel(s.id)} disabled={isPending}>
                  {t("sessions_cancel_btn")}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Right: mini chat */}
        {isMember && (
          <div className="club-session-card__chat">
            <div className="club-session-card__chat-messages" ref={chatScrollRef}>
              {s.messages.length === 0 ? (
                <p className="club-session-card__chat-empty">{t("session_chat_empty")}</p>
              ) : (
                s.messages.map((m) => {
                  const isMine = m.player.id === currentPlayerId;
                  const color = hashColor(m.player.id);
                  return (
                    <div key={m.id} className={`club-session-card__chat-msg${isMine ? " mine" : ""}`}>
                      <div className="club-session-card__chat-bubble" style={{ "--author-color": color } as React.CSSProperties}>
                        <span className="club-session-card__chat-author" style={{ color }}>{m.player.name}</span>
                        <span className="club-session-card__chat-text">{m.content}</span>
                        <span className="club-session-card__chat-time">{fmtTime(new Date(m.createdAt))}</span>
                      </div>
                      {(isMine || isAdmin) && (
                        <button
                          className="club-session-card__chat-del"
                          onClick={() => onDeleteMessage(s.id, m.id)}
                          disabled={isPending}
                          title={t("chat_delete_title")}
                        >✕</button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
            <div className="club-session-card__chat-input">
              <input
                className="form-input"
                placeholder={t("session_chat_placeholder")}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                disabled={isPending}
                style={{ fontSize: 12 }}
              />
              <button className="primary" style={{ fontSize: 12, whiteSpace: "nowrap" }} onClick={handleSend} disabled={isPending || !chatInput.trim()}>
                {t("session_chat_send")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
