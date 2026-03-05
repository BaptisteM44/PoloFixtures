"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

type Notification = {
  id: string;
  type: string;
  payload: Record<string, string>;
  read: boolean;
  createdAt: string;
};

function notifLabel(n: Notification): { title: string; sub: string; href: string } {
  const p = n.payload;
  switch (n.type) {
    case "SQUAD_INVITE":
      return { title: `Invitation à rejoindre ${p.squadName}`, sub: `De : ${p.invitedByName}`, href: "/notifications" };
    case "SQUAD_INVITE_ACCEPTED":
      return { title: `${p.playerName} a rejoint ${p.squadName}`, sub: "", href: `/my-teams/${p.squadId}` };
    case "SQUAD_INVITE_DECLINED":
      return { title: `${p.playerName} a refusé l'invitation`, sub: `Équipe : ${p.squadName}`, href: `/my-teams/${p.squadId}` };
    case "SQUAD_ROLE_CHANGED":
      return { title: `Tu es maintenant capitaine`, sub: `Équipe : ${p.squadName ?? ""}`, href: `/my-teams/${p.squadId}` };
    case "DIRECT_MESSAGE_REQUEST":
      return { title: `Nouveau message de ${p.senderName}`, sub: p.preview ?? "", href: "/messages" };
    case "DIRECT_MESSAGE_RECEIVED":
      return { title: `${p.senderName} t'a répondu`, sub: p.preview ?? "", href: "/messages" };
    case "TEAM_REGISTERED":
      return { title: `Équipe inscrite : ${p.teamName}`, sub: p.tournamentName ?? "", href: `/tournament/${p.tournamentId}?tab=inscription` };
    case "TEAM_SELECTED":
      return { title: `🎉 ${p.teamName} est IN !`, sub: `Tirée au sort — ${p.tournamentName}`, href: `/tournament/${p.tournamentId}?tab=inscription` };
    case "TEAM_WAITLISTED":
      return { title: `⏳ ${p.teamName} — Liste d'attente #${p.rank}`, sub: p.tournamentName ?? "", href: `/tournament/${p.tournamentId}?tab=inscription` };
    case "BADGE_UNLOCKED":
      return { title: `Badge débloqué : ${p.badgeName}`, sub: "Consulte ton profil", href: "/account" };
    case "TEAM_MESSAGE_RECEIVED":
      return { title: `Nouveau message dans ${p.teamName}`, sub: p.preview ?? "", href: "/my-tournaments" };
    default:
      return { title: "Notification", sub: "", href: "/notifications" };
  }
}

export function NotificationBell() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleOpen = async () => {
    setOpen((v) => !v);
    if (!open && unread > 0) {
      await fetch("/api/notifications", { method: "POST" });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    }
  };

  const handleClick = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={handleOpen}
        style={{
          position: "relative", background: "none", border: "2px solid var(--border)",
          borderRadius: 8, padding: "5px 10px", cursor: "pointer",
          fontSize: 16, color: "var(--text)", display: "flex", alignItems: "center",
        }}
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
        <div style={{
          position: "absolute", top: "calc(100% + 8px)", right: 0,
          width: 320, background: "var(--surface)", border: "2px solid var(--border)",
          borderRadius: "var(--radius)", boxShadow: "var(--shadow-lg)",
          zIndex: 1000, overflow: "hidden",
        }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border-light)" }}>
            <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 13 }}>Notifications</span>
          </div>
          {notifications.length === 0 ? (
            <p style={{ padding: 16, textAlign: "center", color: "var(--text-muted)", fontSize: 13, margin: 0 }}>Aucune notification</p>
          ) : (
            <div style={{ maxHeight: 360, overflowY: "auto" }}>
              {notifications.slice(0, 10).map((n) => {
                const { title, sub, href } = notifLabel(n);
                return (
                  <button
                    key={n.id}
                    onClick={() => handleClick(href)}
                    style={{
                      display: "block", width: "100%", textAlign: "left",
                      padding: "12px 16px", border: "none", background: n.read ? "transparent" : "color-mix(in srgb, var(--teal) 6%, var(--surface))",
                      borderBottom: "1px solid var(--border-light)", cursor: "pointer",
                    }}
                  >
                    <p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: n.read ? 400 : 700 }}>{title}</p>
                    {sub && <p style={{ margin: 0, fontSize: 11, color: "var(--text-muted)" }}>{sub}</p>}
                    <p style={{ margin: "2px 0 0", fontSize: 10, color: "var(--text-muted)" }}>
                      {new Date(n.createdAt).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </button>
                );
              })}
            </div>
          )}

          {/* Invitations en attente — actions directes */}
          {notifications.filter((n) => n.type === "SQUAD_INVITE" && !n.read).length > 0 && (
            <div style={{ padding: "10px 16px", borderTop: "1px solid var(--border-light)", background: "var(--surface-2)" }}>
              <p style={{ fontSize: 11, fontWeight: 700, margin: "0 0 8px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Invitations en attente</p>
              {notifications
                .filter((n) => n.type === "SQUAD_INVITE")
                .map((n) => (
                  <div key={n.id} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                    <span style={{ flex: 1, fontSize: 12 }}>{n.payload.squadName}</span>
                    <button className="primary" style={{ fontSize: 11, padding: "3px 10px" }} onClick={async () => {
                      await fetch(`/api/invitations/${n.payload.invitationId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "accept" }) });
                      setOpen(false);
                      fetchNotifs();
                      router.push(`/my-teams/${n.payload.squadId}`);
                    }}>Accepter</button>
                    <button className="ghost" style={{ fontSize: 11, padding: "3px 10px" }} onClick={async () => {
                      await fetch(`/api/invitations/${n.payload.invitationId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "decline" }) });
                      fetchNotifs();
                      setOpen(false);
                    }}>Refuser</button>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
