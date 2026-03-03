"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PokemonCard } from "./PokemonCard";

type Member = {
  id: string;
  playerId: string;
  name: string;
  slug: string | null;
  photoPath: string | null;
  country: string | null;
  city: string | null;
  role: "CAPTAIN" | "MEMBER";
  joinedAt: string;
  badges: string[];
  pinnedBadges: string[];
  startYear: number | null;
  hand: string | null;
  gender: "MALE" | "FEMALE" | "NON_BINARY" | "PREFER_NOT_SAY" | null;
  showGender: boolean;
  clubLogoPath: string | null;
  emblemPosition: string | null;
};

type PendingInvitation = {
  id: string;
  invitedPlayer: { id: string; name: string; photoPath: string | null; country: string | null; city: string | null };
  invitedBy: { id: string; name: string };
  createdAt: string;
};

type Message = {
  id: string;
  content: string;
  createdAt: string;
  author: { id: string; name: string; photoPath: string | null };
};

type Squad = {
  id: string;
  name: string;
  color: string | null;
  logoPath: string | null;
  bio: string | null;
};

type PlayerResult = { id: string; name: string; country: string | null; city: string | null; photoPath: string | null; slug: string | null };

type Props = {
  squad: Squad;
  members: Member[];
  pendingInvitations: PendingInvitation[];
  messages: Message[];
  currentPlayerId: string;
  isCaptain: boolean;
};

function Avatar({ name, photoPath, size = 36 }: { name: string; photoPath: string | null; size?: number }) {
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: "var(--surface-2)", border: "2px solid var(--border)", overflow: "hidden", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.38, fontWeight: 700, color: "var(--text-muted)" }}>
      {photoPath ? <img src={photoPath} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : name[0]?.toUpperCase()}
    </div>
  );
}

export function SquadDashboard({ squad, members: initialMembers, pendingInvitations: initialInvitations, messages: initialMessages, currentPlayerId, isCaptain: initialIsCaptain }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<"membres" | "chat" | "invitations">("membres");
  const [members, setMembers] = useState(initialMembers);
  const [pendingInvitations, setPendingInvitations] = useState(initialInvitations);
  const [messages, setMessages] = useState(initialMessages);
  const [isCaptain, setIsCaptain] = useState(initialIsCaptain);

  // Invite search
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<PlayerResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Chat
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Edit squad
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(squad.name);
  const [editColor, setEditColor] = useState(squad.color ?? "#22d3ee");
  const [editBio, setEditBio] = useState(squad.bio ?? "");
  const [editSaving, setEditSaving] = useState(false);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activeTab]);

  // Player search debounce
  useEffect(() => {
    if (searchRef.current) clearTimeout(searchRef.current);
    if (searchQ.trim().length < 2) { setSearchResults([]); return; }
    setSearchLoading(true);
    searchRef.current = setTimeout(async () => {
      const res = await fetch(`/api/players?search=${encodeURIComponent(searchQ)}`);
      if (res.ok) {
        const data = await res.json();
        // Exclure les membres déjà dans l'équipe et les invitations en attente
        const memberIds = new Set(members.map((m) => m.playerId));
        const invitedIds = new Set(pendingInvitations.map((inv) => inv.invitedPlayer.id));
        setSearchResults((data.players ?? data).filter((p: PlayerResult) => !memberIds.has(p.id) && !invitedIds.has(p.id)));
      }
      setSearchLoading(false);
    }, 300);
  }, [searchQ, members, pendingInvitations]);

  const handleInvite = async (playerId: string) => {
    const res = await fetch(`/api/squads/${squad.id}/invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId }),
    });
    if (res.ok) {
      const inv = await res.json();
      const player = searchResults.find((p) => p.id === playerId);
      if (player) {
        setPendingInvitations((prev) => [...prev, {
          id: inv.id,
          invitedPlayer: { id: player.id, name: player.name, photoPath: player.photoPath, country: player.country, city: player.city },
          invitedBy: { id: currentPlayerId, name: "Vous" },
          createdAt: new Date().toISOString(),
        }]);
        setSearchResults((prev) => prev.filter((p) => p.id !== playerId));
      }
      setSearchQ("");
    }
  };

  const handleRoleChange = async (playerId: string, role: "CAPTAIN" | "MEMBER") => {
    const res = await fetch(`/api/squads/${squad.id}/members`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId, role }),
    });
    if (res.ok) {
      if (role === "CAPTAIN") {
        setMembers((prev) => prev.map((m) => ({
          ...m,
          role: m.playerId === playerId ? "CAPTAIN" : m.playerId === currentPlayerId ? "MEMBER" : m.role,
        })));
        setIsCaptain(false);
      }
    }
  };

  const handleKick = async (targetPlayerId: string) => {
    if (!confirm("Exclure ce membre ?")) return;
    const res = await fetch(`/api/squads/${squad.id}/members`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId: targetPlayerId }),
    });
    if (res.ok) {
      setMembers((prev) => prev.filter((m) => m.playerId !== targetPlayerId));
    }
  };

  const handleLeave = async () => {
    const res = await fetch(`/api/squads/${squad.id}/members`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId: currentPlayerId }),
    });
    if (res.ok) {
      startTransition(() => router.push("/my-teams"));
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? "Erreur");
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Supprimer définitivement "${squad.name}" ? Cette action est irréversible.`)) return;
    const res = await fetch(`/api/squads/${squad.id}`, { method: "DELETE" });
    if (res.ok) {
      startTransition(() => router.push("/my-teams"));
    }
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim()) return;
    setChatSending(true);
    const res = await fetch(`/api/squads/${squad.id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: chatInput.trim() }),
    });
    if (res.ok) {
      const msg = await res.json();
      setMessages((prev) => [...prev, msg]);
      setChatInput("");
    }
    setChatSending(false);
  };

  const handleSaveEdit = async () => {
    setEditSaving(true);
    const res = await fetch(`/api/squads/${squad.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName.trim(), color: editColor, bio: editBio.trim() || null }),
    });
    if (res.ok) {
      setEditing(false);
      startTransition(() => router.refresh());
    }
    setEditSaving(false);
  };

  const tabs: { key: typeof activeTab; label: string }[] = [
    { key: "membres", label: `Membres (${members.length})` },
    { key: "chat", label: `Chat (${messages.length})` },
    { key: "invitations", label: `Invitations${pendingInvitations.length > 0 ? ` (${pendingInvitations.length})` : ""}` },
  ];

  return (
    <div>
      {/* Header squad */}
      <div className="panel" style={{ marginBottom: 20 }}>
        {editing ? (
          <div style={{ display: "grid", gap: 12 }}>
            <label className="field-row">
              Nom
              <input value={editName} onChange={(e) => setEditName(e.target.value)} maxLength={60} />
            </label>
            <label className="field-row">
              Couleur
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input type="color" value={editColor} onChange={(e) => setEditColor(e.target.value)} style={{ width: 40, height: 34, padding: 2, border: "2px solid var(--border)", borderRadius: 6 }} />
                <span className="meta">{editColor}</span>
              </div>
            </label>
            <label className="field-row">
              Description
              <textarea value={editBio} onChange={(e) => setEditBio(e.target.value)} rows={3} maxLength={500} style={{ resize: "vertical", fontFamily: "inherit", fontSize: 13 }} />
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="primary" onClick={handleSaveEdit} disabled={editSaving}>{editSaving ? "Sauvegarde…" : "Sauvegarder"}</button>
              <button className="ghost" onClick={() => setEditing(false)}>Annuler</button>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ width: 56, height: 56, borderRadius: "50%", background: squad.color ?? "var(--teal)", border: "2px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, flexShrink: 0 }}>
              {squad.logoPath ? <img src={squad.logoPath} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} /> : "🏑"}
            </div>
            <div style={{ flex: 1 }}>
              <h2 style={{ margin: "0 0 4px", fontFamily: "var(--font-display)" }}>{squad.name}</h2>
              {squad.bio && <p className="meta" style={{ margin: 0 }}>{squad.bio}</p>}
            </div>
            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              {isCaptain && (
                <>
                  <button className="ghost" style={{ fontSize: 12 }} onClick={() => setActiveTab("invitations")}>👥 Inviter</button>
                  <button className="ghost" style={{ fontSize: 12 }} onClick={() => setEditing(true)}>✏️ Modifier</button>
                  <button className="ghost" style={{ fontSize: 12, borderColor: "var(--pink)", color: "var(--pink)" }} onClick={handleDelete}>Supprimer</button>
                </>
              )}
              {!isCaptain && (
                <button className="ghost" style={{ fontSize: 12, color: "var(--text-muted)" }} onClick={handleLeave}>Quitter</button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: "2px solid var(--border)", paddingBottom: 0 }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            style={{
              padding: "8px 16px", fontSize: 13, fontWeight: 700, fontFamily: "var(--font-display)",
              border: "none", background: "none", cursor: "pointer",
              borderBottom: activeTab === t.key ? "2px solid var(--teal)" : "2px solid transparent",
              color: activeTab === t.key ? "var(--teal)" : "var(--text-muted)",
              marginBottom: -2,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* MEMBRES */}
      {activeTab === "membres" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 20, alignItems: "start" }}>
          <div style={{ display: "grid", gap: 20 }}>

            {/* ── PokemonCard banner ── */}
            <div style={{ display: "flex", gap: 16, overflowX: "auto", paddingBottom: 8 }}>
              {members.map((m) => (
                <div key={m.id} style={{ flexShrink: 0 }}>
                  {m.slug ? (
                    <Link href={`/player/${m.slug}`} style={{ textDecoration: "none" }}>
                      <PokemonCard
                        name={m.name}
                        country={m.country ?? ""}
                        city={m.city}
                        photoPath={m.photoPath}
                        clubLogoPath={m.clubLogoPath}
                        emblemPosition={(m.emblemPosition as "top-left" | "top-right" | "bottom-left" | "bottom-right") ?? "top-left"}
                        badges={m.badges}
                        pinnedBadges={m.pinnedBadges}
                        startYear={m.startYear}
                        hand={m.hand}
                        gender={m.gender ?? undefined}
                        showGender={m.showGender}
                      />
                    </Link>
                  ) : (
                    <PokemonCard
                      name={m.name}
                      country={m.country ?? ""}
                      city={m.city}
                      photoPath={m.photoPath}
                      clubLogoPath={m.clubLogoPath}
                      emblemPosition={(m.emblemPosition as "top-left" | "top-right" | "bottom-left" | "bottom-right") ?? "top-left"}
                      badges={m.badges}
                      pinnedBadges={m.pinnedBadges}
                      startYear={m.startYear}
                      hand={m.hand}
                      gender={m.gender ?? undefined}
                      showGender={m.showGender}
                    />
                  )}
                </div>
              ))}
            </div>

            {/* ── Member list ── */}
            <div style={{ display: "grid", gap: 10 }}>
            {members.map((m) => (
              <div key={m.id} className="panel" style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px" }}>
                <Avatar name={m.name} photoPath={m.photoPath} size={42} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {m.slug ? (
                      <Link href={`/player/${m.slug}`} style={{ fontWeight: 700, color: "var(--text)", textDecoration: "none", fontFamily: "var(--font-display)" }}>{m.name}</Link>
                    ) : (
                      <strong style={{ fontFamily: "var(--font-display)" }}>{m.name}</strong>
                    )}
                    {m.role === "CAPTAIN" && (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: "var(--yellow)", border: "1.5px solid var(--border)" }}>CAP</span>
                    )}
                    {m.playerId === currentPlayerId && (
                      <span style={{ fontSize: 10, color: "var(--text-muted)" }}>(moi)</span>
                    )}
                  </div>
                  {(m.city || m.country) && <p className="meta" style={{ margin: "2px 0 0" }}>{[m.city, m.country].filter(Boolean).join(", ")}</p>}
                </div>
                {isCaptain && m.playerId !== currentPlayerId && (
                  <div style={{ display: "flex", gap: 6 }}>
                    {m.role === "MEMBER" && (
                      <button className="ghost" style={{ fontSize: 11, padding: "4px 10px" }} onClick={() => handleRoleChange(m.playerId, "CAPTAIN")}>
                        → Cap
                      </button>
                    )}
                    <button className="ghost" style={{ fontSize: 11, padding: "4px 10px", color: "var(--pink)", borderColor: "var(--pink)" }} onClick={() => handleKick(m.playerId)}>
                      Exclure
                    </button>
                  </div>
                )}
                {!isCaptain && m.playerId === currentPlayerId && (
                  <button className="ghost" style={{ fontSize: 11, padding: "4px 10px", color: "var(--text-muted)" }} onClick={handleLeave}>
                    Quitter
                  </button>
                )}
              </div>
            ))}
            </div>{/* end member list */}
          </div>{/* end left column */}

          {/* Invite panel */}
          <div className="panel" style={{ position: "sticky", top: 80 }}>
            <h4 style={{ margin: "0 0 12px" }}>Inviter un joueur</h4>
            <input
              placeholder="Rechercher par nom…"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              style={{ marginBottom: 10 }}
            />
            {searchLoading && <p className="meta" style={{ fontSize: 12 }}>Recherche…</p>}
            {searchResults.length > 0 && (
              <div style={{ display: "grid", gap: 8 }}>
                {searchResults.slice(0, 6).map((p) => (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", border: "1.5px solid var(--border)", borderRadius: 8 }}>
                    <Avatar name={p.name} photoPath={p.photoPath} size={32} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontWeight: 600, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</p>
                      {(p.city || p.country) && <p className="meta" style={{ margin: 0, fontSize: 11 }}>{[p.city, p.country].filter(Boolean).join(", ")}</p>}
                    </div>
                    <button className="primary" style={{ fontSize: 11, padding: "4px 10px" }} onClick={() => handleInvite(p.id)}>
                      Inviter
                    </button>
                  </div>
                ))}
              </div>
            )}
            {searchQ.trim().length >= 2 && !searchLoading && searchResults.length === 0 && (
              <p className="meta" style={{ fontSize: 12 }}>Aucun résultat.</p>
            )}
          </div>
        </div>
      )}

      {/* CHAT */}
      {activeTab === "chat" && (
        <div className="panel" style={{ display: "flex", flexDirection: "column", height: 520 }}>
          <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, padding: "4px 0" }}>
            {messages.length === 0 && (
              <p className="meta" style={{ textAlign: "center", margin: "auto" }}>Pas encore de message. Soyez les premiers !</p>
            )}
            {messages.map((msg) => {
              const isMe = msg.author.id === currentPlayerId;
              return (
                <div key={msg.id} style={{ display: "flex", gap: 10, flexDirection: isMe ? "row-reverse" : "row", alignItems: "flex-end" }}>
                  <Avatar name={msg.author.name} photoPath={msg.author.photoPath} size={28} />
                  <div style={{ maxWidth: "70%" }}>
                    {!isMe && <p style={{ margin: "0 0 2px", fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>{msg.author.name}</p>}
                    <div style={{
                      padding: "8px 12px", borderRadius: isMe ? "12px 12px 4px 12px" : "12px 12px 12px 4px",
                      background: isMe ? "var(--teal)" : "var(--surface-2)",
                      border: "1.5px solid var(--border)",
                      fontSize: 13, lineHeight: 1.5,
                      color: isMe ? "var(--border)" : "var(--text)",
                    }}>
                      {msg.content}
                    </div>
                    <p style={{ margin: "2px 0 0", fontSize: 10, color: "var(--text-muted)", textAlign: isMe ? "right" : "left" }}>
                      {new Date(msg.createdAt).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
          <div style={{ borderTop: "1.5px solid var(--border-light)", paddingTop: 12, display: "flex", gap: 8 }}>
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Écris un message…"
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
              style={{ flex: 1 }}
            />
            <button className="primary" onClick={handleSendMessage} disabled={chatSending || !chatInput.trim()}>
              {chatSending ? "…" : "Envoyer"}
            </button>
          </div>
        </div>
      )}

      {/* INVITATIONS */}
      {activeTab === "invitations" && (
        <div style={{ display: "grid", gap: 12 }}>
          {pendingInvitations.length === 0 ? (
            <div className="panel" style={{ textAlign: "center", padding: 32 }}>
              <p className="meta">Aucune invitation en attente.</p>
              <p className="meta" style={{ fontSize: 12 }}>Invite des joueurs depuis l&apos;onglet Membres.</p>
            </div>
          ) : (
            pendingInvitations.map((inv) => (
              <div key={inv.id} className="panel" style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px" }}>
                <Avatar name={inv.invitedPlayer.name} photoPath={inv.invitedPlayer.photoPath} size={42} />
                <div style={{ flex: 1 }}>
                  <strong style={{ fontFamily: "var(--font-display)" }}>{inv.invitedPlayer.name}</strong>
                  {(inv.invitedPlayer.city || inv.invitedPlayer.country) && (
                    <p className="meta" style={{ margin: "2px 0 0" }}>{[inv.invitedPlayer.city, inv.invitedPlayer.country].filter(Boolean).join(", ")}</p>
                  )}
                  <p className="meta" style={{ margin: "2px 0 0", fontSize: 11 }}>Invité·e par {inv.invitedBy.name} · {new Date(inv.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</p>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 4, background: "color-mix(in srgb, var(--yellow) 20%, var(--surface))", border: "1.5px solid var(--yellow)" }}>
                  En attente
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
