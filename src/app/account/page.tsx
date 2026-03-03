"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PokemonCard } from "@/components/PokemonCard";
import { COUNTRIES } from "@/lib/countries";
import { BadgeShowcase } from "@/components/BadgeShowcase";

type Player = {
  id: string;
  slug: string | null;
  name: string;
  country: string;
  city: string | null;
  bio: string | null;
  photoPath: string | null;
  clubLogoPath: string | null;
  emblemPosition: string | null;
  teamLogoPath: string | null;
  teamLogoPosition: string | null;
  startYear: number | null;
  hand: string | null;
  gender: "MALE" | "FEMALE" | "NON_BINARY" | "PREFER_NOT_SAY" | null;
  showGender: boolean;
  diets: string[];
  badges: string[];
  pinnedBadges: string[];
  status: string;
};


export default function AccountPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [player, setPlayer] = useState<Player | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: "", city: "", country: "", bio: "", startYear: "", hand: "", gender: "" as "" | "MALE" | "FEMALE" | "NON_BINARY" | "PREFER_NOT_SAY", showGender: false, diets: [] as string[] });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) {
        setSaveMsg("Erreur lors de l'upload");
        return;
      }
      const { path } = await res.json();
      await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoPath: path })
      });
      await fetchPlayer();
      setSaveMsg("Photo mise à jour !");
      setTimeout(() => setSaveMsg(null), 3000);
    } catch {
      setSaveMsg("Erreur lors de l'upload");
    } finally {
      setUploading(false);
    }
  };

  const fetchPlayer = useCallback(async () => {
    const res = await fetch("/api/account/profile");
    if (res.ok) {
      const data = await res.json();
      setPlayer(data);
      setForm({
        name: data.name, city: data.city ?? "", country: data.country, bio: data.bio ?? "",
        startYear: data.startYear ? String(data.startYear) : "",
        hand: data.hand ?? "",
        gender: data.gender ?? "",
        showGender: data.showGender ?? false,
        diets: data.diets ?? []
      });
    }
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") { router.push("/login"); return; }
    if (status === "authenticated" && !session.user.playerId) { router.push("/"); return; }
    if (status === "authenticated") fetchPlayer();
  }, [status, session, router, fetchPlayer]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/account/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        startYear: form.startYear ? parseInt(form.startYear) : null,
        hand: form.hand || null,
        gender: form.gender || null,
        diets: form.diets
      })
    });
    if (res.ok) {
      await fetchPlayer();
      setEditing(false);
      setSaveMsg("Profil mis à jour !");
      setTimeout(() => setSaveMsg(null), 3000);
    }
    setSaving(false);
  };

  if (status === "loading" || !player) {
    return <div className="player-profile"><p>Chargement…</p></div>;
  }

  return (
    <div className="page">
      <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 64, alignItems: "start", minHeight: "100vh" }}>

        {/* Pokemon card + photo upload */}
        <div style={{ position: "sticky", top: 88, alignSelf: "start" }}>
          <PokemonCard
            name={player.name}
            country={player.country}
            city={player.city}
            photoPath={player.photoPath}
            clubLogoPath={player.clubLogoPath}
            emblemPosition={(player.emblemPosition as "top-left" | "top-right" | "bottom-left" | "bottom-right") ?? "top-right"}
            teamLogoPath={player.teamLogoPath}
            teamLogoPosition={(player.teamLogoPosition as "top-left" | "top-right" | "bottom-left" | "bottom-right") ?? "bottom-right"}
            badges={player.badges}
            pinnedBadges={player.pinnedBadges}
            startYear={player.startYear}
            hand={player.hand}
            gender={player.gender}
            showGender={player.showGender}
          />
          <div style={{ marginTop: 12, textAlign: "center" }}>
            <label style={{ cursor: "pointer", display: "inline-block" }}>
              <span className="ghost" style={{ fontSize: 12, display: "inline-block", cursor: "pointer" }}>
                {uploading ? "Upload en cours…" : "📷 Changer la photo"}
              </span>
              <input
                type="file"
                accept="image/*"
                onChange={handlePhotoUpload}
                disabled={uploading}
                style={{ display: "none" }}
              />
            </label>
          </div>
        </div>

        {/* Right column */}
        <div style={{ display: "grid", gap: 24 }}>

          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <h1 style={{ marginBottom: 4 }}>{player.name}</h1>
              <p style={{ color: "var(--text-muted)", fontSize: 14, margin: 0 }}>
                {player.city ? `${player.city}, ` : ""}{player.country}
              </p>
              {player.bio && <p style={{ marginTop: 8, fontSize: 14, lineHeight: 1.6 }}>{player.bio}</p>}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="ghost" onClick={() => setEditing(!editing)}>
                {editing ? "Annuler" : "Modifier"}
              </button>
              <button className="ghost" onClick={() => signOut({ callbackUrl: "/" })}>Déconnexion</button>
            </div>
          </div>

          {saveMsg && (
            <div style={{ background: "var(--teal)", border: "2px solid var(--border)", borderRadius: 8, padding: "10px 16px", fontWeight: 700, fontSize: 14 }}>
              ✓ {saveMsg}
            </div>
          )}

          {/* Edit form */}
          {editing && (
            <form className="panel" onSubmit={save} style={{ display: "grid", gap: 14 }}>
              <h3 style={{ margin: 0 }}>Modifier mon profil</h3>
              <div className="form-grid">
                <label className="field-row">
                  Nom
                  <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
                </label>
                <label className="field-row">
                  Ville
                  <input value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} placeholder="Paris" />
                </label>
              </div>
              <label className="field-row">
                Pays
                <select value={form.country} onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}>
                  {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
                </select>
              </label>
              <label className="field-row">
                Bio <span style={{ color: "var(--text-muted)", fontSize: 12 }}>(max 500 car.)</span>
                <textarea
                  value={form.bio}
                  onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
                  placeholder="Présente-toi…"
                  style={{ resize: "vertical" }}
                />
              </label>
              <div className="form-grid">
                <label className="field-row">
                  Année de début
                  <input
                    type="number" min={1990} max={2100}
                    value={form.startYear}
                    onChange={(e) => setForm((f) => ({ ...f, startYear: e.target.value }))}
                    placeholder="2015"
                  />
                </label>
                <label className="field-row">
                  Main dominante
                  <select value={form.hand} onChange={(e) => setForm((f) => ({ ...f, hand: e.target.value }))}>
                    <option value="">Non précisé</option>
                    <option value="RIGHT">Droitier·e</option>
                    <option value="LEFT">Gaucher·e</option>
                  </select>
                </label>
              </div>
              <div className="form-grid">
                <label className="field-row">
                  Genre <span style={{ color: "var(--text-muted)", fontSize: 12 }}>(optionnel)</span>
                  <select value={form.gender} onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value as typeof f.gender }))}>
                    <option value="">Non précisé</option>
                    <option value="MALE">Homme</option>
                    <option value="FEMALE">Femme</option>
                    <option value="NON_BINARY">Non-binaire</option>
                    <option value="PREFER_NOT_SAY">Préfère ne pas préciser</option>
                  </select>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontWeight: 600, fontSize: 14, paddingTop: 22 }}>
                  <input
                    type="checkbox"
                    checked={form.showGender}
                    onChange={(e) => setForm((f) => ({ ...f, showGender: e.target.checked }))}
                    style={{ width: 16, height: 16 }}
                  />
                  Afficher sur ma carte
                </label>
              </div>
              <div className="field-row">
                Régime alimentaire <span style={{ color: "var(--text-muted)", fontSize: 12 }}>(pour les repas en tournoi — cumulable)</span>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 6 }}>
                  {(["OMNIVORE", "VEGETARIAN", "VEGAN", "GLUTEN_FREE"] as const).map((d) => {
                    const labels: Record<string, string> = { OMNIVORE: "Omnivore", VEGETARIAN: "Végétarien·ne", VEGAN: "Vegan", GLUTEN_FREE: "Sans gluten" };
                    const checked = form.diets.includes(d);
                    return (
                      <label key={d} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => setForm((f) => ({
                            ...f,
                            diets: checked ? f.diets.filter((x) => x !== d) : [...f.diets, d],
                          }))}
                          style={{ width: 14, height: 14 }}
                        />
                        {labels[d]}
                      </label>
                    );
                  })}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="primary" type="submit" disabled={saving}>
                  {saving ? "Sauvegarde…" : "Sauvegarder"}
                </button>
                <button className="ghost" type="button" onClick={() => setEditing(false)}>Annuler</button>
              </div>
            </form>
          )}

          {/* Badges & Emblème */}
          <div className="panel">
            <h3 style={{ marginBottom: 16 }}>Badges & Emblème</h3>

            {/* Club logo upload */}
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Logo de club <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>(en plus du drapeau)</span></p>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {player.clubLogoPath && (
                  <img src={player.clubLogoPath} alt="Club" style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover", border: "2px solid var(--border)" }} />
                )}
                <label style={{ cursor: "pointer", display: "inline-block" }}>
                  <span className="ghost" style={{ fontSize: 12, display: "inline-block", cursor: "pointer" }}>
                    {player.clubLogoPath ? "🔄 Changer le logo" : "⬆️ Ajouter un logo"}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const fd = new FormData();
                      fd.append("file", file);
                      const res = await fetch("/api/upload", { method: "POST", body: fd });
                      if (!res.ok) return;
                      const { path } = await res.json();
                      await fetch("/api/account/profile", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ clubLogoPath: path }),
                      });
                      await fetchPlayer();
                    }}
                  />
                </label>
                {player.clubLogoPath && (
                  <button
                    className="ghost"
                    style={{ fontSize: 11, color: "var(--danger)" }}
                    onClick={async () => {
                      await fetch("/api/account/profile", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ clubLogoPath: null }),
                      });
                      await fetchPlayer();
                    }}
                  >
                    Supprimer
                  </button>
                )}
              </div>
            </div>

            {/* Logo position picker */}
            {player.clubLogoPath && (
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Position du logo <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>(le drapeau reste en haut à gauche)</span></p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {(["top-right", "bottom-left", "bottom-right"] as const).map((pos) => {
                    const current = player.emblemPosition && player.emblemPosition !== "top-left" ? player.emblemPosition : "top-right";
                    return (
                      <button
                        key={pos}
                        className={current === pos ? "primary" : "ghost"}
                        style={{ fontSize: 11, padding: "6px 12px" }}
                        onClick={async () => {
                          await fetch("/api/account/profile", {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ emblemPosition: pos }),
                          });
                          await fetchPlayer();
                        }}
                      >
                        {pos === "top-right" ? "↗ Haut-droite" : pos === "bottom-left" ? "↙ Bas-gauche" : "↘ Bas-droite"}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Team logo upload ── */}
            <div style={{ marginBottom: 16, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
              <p style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Logo d'équipe <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>(optionnel, en plus du logo de club)</span></p>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {player.teamLogoPath && (
                  <img src={player.teamLogoPath} alt="Team" style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover", border: "2px solid var(--border)" }} />
                )}
                <label style={{ cursor: "pointer", display: "inline-block" }}>
                  <span className="ghost" style={{ fontSize: 12, display: "inline-block", cursor: "pointer" }}>
                    {player.teamLogoPath ? "🔄 Changer le logo" : "⬆️ Ajouter un logo d'équipe"}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const fd = new FormData();
                      fd.append("file", file);
                      const res = await fetch("/api/upload", { method: "POST", body: fd });
                      if (!res.ok) return;
                      const { path } = await res.json();
                      await fetch("/api/account/profile", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ teamLogoPath: path }),
                      });
                      await fetchPlayer();
                    }}
                  />
                </label>
                {player.teamLogoPath && (
                  <button
                    className="ghost"
                    style={{ fontSize: 11, color: "var(--danger)" }}
                    onClick={async () => {
                      await fetch("/api/account/profile", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ teamLogoPath: null }),
                      });
                      await fetchPlayer();
                    }}
                  >
                    Supprimer
                  </button>
                )}
              </div>
            </div>

            {/* Team logo position picker */}
            {player.teamLogoPath && (
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Position du logo d'équipe <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>(ne peut pas être sur le même coin que le logo de club)</span></p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {(["top-right", "bottom-left", "bottom-right"] as const).map((pos) => {
                    const clubPos = player.emblemPosition && player.emblemPosition !== "top-left" ? player.emblemPosition : "top-right";
                    const currentTeam = player.teamLogoPosition ?? "bottom-right";
                    const isBlocked = pos === clubPos;
                    return (
                      <button
                        key={pos}
                        disabled={isBlocked}
                        className={currentTeam === pos ? "primary" : "ghost"}
                        style={{ fontSize: 11, padding: "6px 12px", opacity: isBlocked ? 0.35 : 1 }}
                        onClick={async () => {
                          if (isBlocked) return;
                          await fetch("/api/account/profile", {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ teamLogoPosition: pos }),
                          });
                          await fetchPlayer();
                        }}
                      >
                        {pos === "top-right" ? "↗ Haut-droite" : pos === "bottom-left" ? "↙ Bas-gauche" : "↘ Bas-droite"}
                        {isBlocked && " 🔒"}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Badge list with catalogue + pin toggles */}

            <div style={{ borderTop: "2px solid var(--border)", paddingTop: 16 }}>
              <BadgeShowcase
                earnedBadges={player.badges}
                pinnedBadges={player.pinnedBadges}
                onTogglePin={async (badgeId) => {
                  const isPinned = player.pinnedBadges.includes(badgeId);
                  const next = isPinned
                    ? player.pinnedBadges.filter((x) => x !== badgeId)
                    : [...player.pinnedBadges, badgeId];
                  await fetch("/api/account/profile", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ pinnedBadges: next }),
                  });
                  await fetchPlayer();
                }}
              />
            </div>
          </div>

          {/* Player card link */}
          <div style={{ textAlign: "center", paddingTop: 8 }}>
            <Link className="ghost" href={`/player/${player.slug ?? player.id}`} target="_blank">
              Voir ma page publique ↗
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
