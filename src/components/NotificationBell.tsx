"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { subscribeToPush } from "./PwaManager";

type Notification = {
  id: string;
  type: string;
  payload: Record<string, string>;
  read: boolean;
  createdAt: string;
};

function useNotifLabel() {
  const t = useTranslations("notifications");

  return (n: Notification): { title: string; sub: string; href: string } => {
    const p = n.payload;
    switch (n.type) {
      case "SQUAD_INVITE":
        return { title: t("squad_invite", { squadName: p.squadName }), sub: t("squad_invite_from", { name: p.invitedByName }), href: "/my-teams" };
      case "SQUAD_INVITE_ACCEPTED":
        return { title: t("squad_invite_accepted", { name: p.playerName, squadName: p.squadName }), sub: "", href: `/my-teams/${p.squadId}` };
      case "SQUAD_INVITE_DECLINED":
        return { title: t("squad_invite_declined", { name: p.playerName }), sub: t("squad_invite_declined_sub", { squadName: p.squadName }), href: `/my-teams/${p.squadId}` };
      case "SQUAD_ROLE_CHANGED":
        return { title: t("squad_role_changed"), sub: t("squad_role_changed_sub", { squadName: p.squadName ?? "" }), href: `/my-teams/${p.squadId}` };
      case "DIRECT_MESSAGE_REQUEST":
        return { title: t("direct_message_request", { name: p.senderName }), sub: p.preview ?? "", href: "/messages" };
      case "DIRECT_MESSAGE_RECEIVED":
        return { title: t("direct_message_received", { name: p.senderName }), sub: p.preview ?? "", href: "/messages" };
      case "TEAM_REGISTERED":
        return { title: t("team_registered", { teamName: p.teamName }), sub: p.tournamentName ?? "", href: `/tournament/${p.tournamentSlug ?? p.tournamentId}?tab=inscription` };
      case "TEAM_SELECTED":
        return { title: t("team_selected", { teamName: p.teamName }), sub: t("team_selected_sub", { tournamentName: p.tournamentName ?? "" }), href: `/tournament/${p.tournamentSlug ?? p.tournamentId}?tab=inscription` };
      case "TEAM_WAITLISTED":
        return { title: t("team_waitlisted", { teamName: p.teamName, rank: p.rank }), sub: p.tournamentName ?? "", href: `/tournament/${p.tournamentSlug ?? p.tournamentId}?tab=inscription` };
      case "BADGE_UNLOCKED":
        return { title: t("badge_unlocked", { badgeName: p.badgeName }), sub: t("badge_unlocked_sub"), href: "/account" };
      case "TEAM_MESSAGE_RECEIVED":
        return { title: t("team_message", { teamName: p.teamName }), sub: p.preview ?? "", href: "/my-tournaments" };
      case "CLUB_JOIN_REQUEST":
        return { title: t("club_join_request", { name: p.playerName }), sub: t("club_join_request_sub", { clubName: p.clubName }), href: `/player/${p.playerSlug}` };
      case "CLUB_SESSION":
        return { title: p.message ?? t("club_session"), sub: "", href: p.clubId ? `/club/${p.clubId}?tab=sessions` : "/clubs" };
      case "CLUB_SESSION_JOIN":
        return { title: p.message ?? t("club_session_join"), sub: "", href: p.clubId ? `/club/${p.clubId}?tab=sessions` : "/clubs" };
      case "CLUB_ANNOUNCEMENT":
        return { title: t("club_announcement", { clubName: p.clubName }), sub: p.announcementTitle ?? "", href: p.clubId ? `/club/${p.clubId}?tab=announcements` : "/clubs" };
      case "TEAM_FEE_CONFIRMED":
        return { title: t("team_fee_confirmed", { teamName: p.teamName }), sub: p.tournamentName ?? "", href: `/tournament/${p.tournamentSlug ?? p.tournamentId}` };
      case "COMMUNITY_STATUS_CHANGED":
        return { title: p.message || t("community_reply", { itemTitle: p.itemTitle ?? "" }), sub: p.itemTitle ?? "", href: p.itemId ? `/labs?id=${p.itemId}` : "/labs" };
      case "ACCOMMODATION_ASSIGNED":
        return { title: t("accommodation_assigned", { hostName: p.hostName ?? "" }), sub: p.tournamentName ?? "", href: `/tournament/${p.tournamentSlug ?? p.tournamentId}?tab=hebergement` };
      case "ACCOMMODATION_GUEST_ADDED":
        return { title: t("accommodation_guest_added"), sub: p.tournamentName ?? "", href: `/tournament/${p.tournamentSlug ?? p.tournamentId}?tab=hebergement` };
      default:
        return { title: t("default"), sub: "", href: "/my-teams" };
    }
  };
}

export function NotificationBell() {
  const t = useTranslations("notifications");
  const notifLabel = useNotifLabel();
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const [pushState, setPushState] = useState<"unknown" | "default" | "granted" | "denied">("unknown");

  useEffect(() => {
    if ("Notification" in window) {
      setPushState(Notification.permission as any);
    }
  }, []);

  const enablePush = useCallback(async () => {
    const permission = await Notification.requestPermission();
    setPushState(permission as any);
    if (permission === "granted") {
      await subscribeToPush();
    }
  }, []);

  const unread = notifications.filter((n) => !n.read).length;

  const fetchNotifs = async () => {
    const res = await fetch("/api/notifications");
    if (res.ok) setNotifications(await res.json());
  };

  useEffect(() => {
    fetchNotifs();
    const id = setInterval(fetchNotifs, 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) closePanel();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const closePanel = () => {
    if (!open) return;
    setClosing(true);
    closeTimerRef.current = setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, 150);
  };

  const handleOpen = async () => {
    if (open) { closePanel(); return; }
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    setClosing(false);
    setOpen(true);
    if (unread > 0) {
      await fetch("/api/notifications", { method: "POST" });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    }
  };

  const handleClick = (href: string) => {
    closePanel();
    router.push(href as any);
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await fetch(`/api/notifications?id=${id}`, { method: "DELETE" });
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={handleOpen}
        className="header-icon-btn"
        style={{ position: "relative", fontSize: 16 }}
      >
        🔔
        {unread > 0 && (
          <span style={{
            position: "absolute", top: -6, right: -6,
            background: "var(--pink)", color: "#fff",
            borderRadius: "50%", width: 18, height: 18,
            fontSize: 10, fontWeight: 700,
            display: "flex", alignItems: "center", justifyContent: "center",
            border: "2px solid var(--bg)",
          }}>
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className={`notif-panel${closing ? " notif-panel--closing" : ""}`} style={{
          position: "absolute", top: "calc(100% + 8px)", right: 0,
          width: 380, maxWidth: "calc(100vw - 16px)", background: "var(--surface)", border: "2px solid var(--border)",
          borderRadius: "var(--radius)", boxShadow: "var(--shadow-lg)",
          zIndex: 1000, overflow: "hidden", transformOrigin: "top right",
        }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border-light)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 13 }}>{t("title")}</span>
            {pushState === "default" && (
              <button
                onClick={enablePush}
                style={{ fontSize: 11, padding: "3px 10px", background: "var(--teal)", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontWeight: 600 }}
              >
                {t("enable_push")}
              </button>
            )}
          </div>
          {notifications.length === 0 ? (
            <p style={{ padding: 16, textAlign: "center", color: "var(--text-muted)", fontSize: 13, margin: 0 }}>{t("empty")}</p>
          ) : (
            <div style={{ maxHeight: 420, overflowY: "auto" }}>
              {notifications.slice(0, 10).map((n) => {
                const { title, sub, href } = notifLabel(n);
                return (
                  <div
                    key={n.id}
                    style={{
                      display: "flex", alignItems: "flex-start",
                      background: n.read ? "transparent" : "color-mix(in srgb, var(--yellow) 25%, var(--surface))",
                      borderBottom: "1px solid var(--border-light)",
                    }}
                  >
                    <button
                      onClick={() => handleClick(href)}
                      style={{
                        flex: 1, textAlign: "left", padding: "12px 16px",
                        border: "none", background: "transparent", cursor: "pointer",
                      }}
                    >
                      <p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: n.read ? 400 : 700 }}>{title}</p>
                      {sub && <p style={{ margin: 0, fontSize: 11, color: "var(--text-muted)" }}>{sub}</p>}
                      <p style={{ margin: "2px 0 0", fontSize: 10, color: "var(--text-muted)" }}>
                        {new Date(n.createdAt).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </button>
                    <button
                      onClick={(e) => handleDelete(e, n.id)}
                      style={{
                        background: "none", border: "none", cursor: "pointer",
                        color: "var(--text-muted)", padding: "10px 10px 10px 0",
                        fontSize: 14, lineHeight: 1, flexShrink: 0,
                      }}
                      title="Supprimer"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Invitations en attente */}
          {notifications.filter((n) => n.type === "SQUAD_INVITE").length > 0 && (
            <div style={{ padding: "10px 16px", borderTop: "1px solid var(--border-light)", background: "var(--surface-2)" }}>
              <p style={{ fontSize: 11, fontWeight: 700, margin: "0 0 8px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{t("section_pending_invites")}</p>
              {notifications
                .filter((n) => n.type === "SQUAD_INVITE")
                .map((n) => (
                  <div key={n.id} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                    <span style={{ flex: 1, fontSize: 12 }}>{n.payload.squadName}</span>
                    <button className="primary" style={{ fontSize: 11, padding: "3px 10px" }} onClick={async () => {
                      await fetch(`/api/invitations/${n.payload.invitationId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "accept" }) });
                      await fetch(`/api/notifications?id=${n.id}`, { method: "DELETE" });
                      closePanel();
                      fetchNotifs();
                      router.push(`/my-teams/${n.payload.squadId}` as any);
                    }}>{t("btn_accept")}</button>
                    <button className="ghost" style={{ fontSize: 11, padding: "3px 10px" }} onClick={async () => {
                      await fetch(`/api/invitations/${n.payload.invitationId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "decline" }) });
                      await fetch(`/api/notifications?id=${n.id}`, { method: "DELETE" });
                      fetchNotifs();
                      closePanel();
                    }}>{t("btn_decline")}</button>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
