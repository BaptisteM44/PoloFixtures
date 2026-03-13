"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import { Link } from "@/i18n/navigation";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { PokemonCard } from "@/components/PokemonCard";
import { COUNTRIES } from "@/lib/countries";
import { BadgeShowcase } from "@/components/BadgeShowcase";
import type { BadgeInfo } from "@/lib/badge-catalog";

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
  badgeCatalog: Record<string, BadgeInfo>;
  status: string;
};

type ClubInfo = {
  id: string;
  name: string;
  city: string;
  country: string;
  logoPath: string | null;
  approved: boolean;
};

type ClubMembership = {
  clubId: string;
  playerId: string;
  status: "MEMBER" | "PENDING_BY_PLAYER" | "PENDING_BY_MANAGER";
  club: ClubInfo;
};

type ClubResult = ClubInfo & { _count?: { members: number } };


export default function AccountPage() {
  const t = useTranslations("account");
  const { data: session, status } = useSession();
  const router = useRouter();
  const [player, setPlayer] = useState<Player | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: "", city: "", country: "", bio: "", startYear: "", hand: "", gender: "" as "" | "MALE" | "FEMALE" | "NON_BINARY" | "PREFER_NOT_SAY", showGender: false, diets: [] as string[] });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Club
  const [clubMemberships, setClubMemberships] = useState<ClubMembership[]>([]);
  const [clubSearch, setClubSearch] = useState("");
  const [clubResults, setClubResults] = useState<ClubResult[] | null>(null);
  const [clubSearching, setClubSearching] = useState(false);
  const [showCreateClub, setShowCreateClub] = useState(false);
  const [createClubForm, setCreateClubForm] = useState({ name: "", city: "", country: "" });
  const [clubCreating, setClubCreating] = useState(false);

  // Changement de mot de passe
  const [pwOpen, setPwOpen] = useState(false);
  const [pwForm, setPwForm] = useState({ current: "", next: "", confirm: "" });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Suppression de compte
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (deleteConfirm !== t("delete_confirm_word")) return;
    setDeleting(true);
    setDeleteError(null);
    const res = await fetch("/api/account/delete", { method: "DELETE" });
    if (res.ok) {
      await signOut({ callbackUrl: "/" });
    } else {
      const data = await res.json().catch(() => ({}));
      setDeleteError(data.error ?? t("delete_error"));
      setDeleting(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwForm.next !== pwForm.confirm) { setPwMsg({ ok: false, text: t("pw_mismatch") }); return; }
    setPwSaving(true); setPwMsg(null);
    const res = await fetch("/api/account/password", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: pwForm.current, newPassword: pwForm.next }),
    });
    const data = await res.json().catch(() => ({}));
    setPwSaving(false);
    if (res.ok) { setPwMsg({ ok: true, text: t("success_password") }); setPwForm({ current: "", next: "", confirm: "" }); setTimeout(() => setPwOpen(false), 1500); }
    else setPwMsg({ ok: false, text: data.error ?? t("error_wrong_password") });
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) {
        setSaveMsg(t("photo_error"));
        return;
      }
      const { path } = await res.json();
      await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoPath: path })
      });
      await fetchPlayer();
      setSaveMsg(t("photo_success"));
      setTimeout(() => setSaveMsg(null), 3000);
    } catch {
      setSaveMsg(t("photo_error"));
    } finally {
      setUploading(false);
    }
  };

  const fetchClubMemberships = useCallback(async () => {
    const res = await fetch("/api/account/clubs");
    if (res.ok) setClubMemberships(await res.json());
  }, []);

  const searchClubs = async () => {
    if (!clubSearch.trim()) return;
    setClubSearching(true);
    const res = await fetch(`/api/clubs?search=${encodeURIComponent(clubSearch)}`);
    if (res.ok) setClubResults(await res.json());
    setClubSearching(false);
  };

  const handleCreateClub = async (e: React.FormEvent) => {
    e.preventDefault();
    setClubCreating(true);
    const res = await fetch("/api/clubs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(createClubForm),
    });
    if (res.ok) {
      await fetchClubMemberships();
      setShowCreateClub(false);
      setCreateClubForm({ name: "", city: "", country: "" });
      setSaveMsg(t("club_create_success"));
      setTimeout(() => setSaveMsg(null), 4000);
    }
    setClubCreating(false);
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
    if (status === "authenticated") { fetchPlayer(); fetchClubMemberships(); }
  }, [status, session, router, fetchPlayer, fetchClubMemberships]);

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
      setSaveMsg(t("success_profile"));
      setTimeout(() => setSaveMsg(null), 3000);
    }
    setSaving(false);
  };

  if (status === "loading" || !player) {
    return <div className="player-profile"><p>{t("loading")}</p></div>;
  }

  return (
    <div className="page">
      <div className="account-layout">

        {/* Pokemon card + photo upload */}
        <div className="account-sidebar">
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
                {uploading ? t("photo_uploading") : t("photo_change")}
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
          <div className="account-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <h1 style={{ marginBottom: 4 }}>{player.name}</h1>
              <p style={{ color: "var(--text-muted)", fontSize: 14, margin: 0 }}>
                {player.city ? `${player.city}, ` : ""}{player.country}
              </p>
              {player.bio && <p style={{ marginTop: 8, fontSize: 14, lineHeight: 1.6 }}>{player.bio}</p>}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="ghost" onClick={() => setEditing(!editing)}>
                {editing ? t("btn_cancel") : t("btn_edit")}
              </button>
              <button className="ghost" onClick={() => signOut({ callbackUrl: "/" })}>{t("btn_logout")}</button>
            </div>
          </div>

          {saveMsg && (
            <div style={{ background: "var(--yellow)", border: "2px solid var(--border)", borderRadius: 8, padding: "10px 16px", fontWeight: 700, fontSize: 14 }}>
              ✓ {saveMsg}
            </div>
          )}

          {/* Edit form */}
          {editing && (
            <form className="panel" onSubmit={save} style={{ display: "grid", gap: 14 }}>
              <h3 style={{ margin: 0 }}>{t("edit_title")}</h3>
              <div className="form-grid">
                <label className="field-row">
                  {t("field_name")}
                  <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
                </label>
                <label className="field-row">
                  {t("field_city")}
                  <input value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} placeholder="Paris" />
                </label>
              </div>
              <label className="field-row">
                {t("field_country")}
                <select value={form.country} onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}>
                  {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
                </select>
              </label>
              <label className="field-row">
                {t("field_bio")} <span style={{ color: "var(--text-muted)", fontSize: 12 }}>({t("field_bio_hint")})</span>
                <textarea
                  value={form.bio}
                  onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
                  placeholder={t("field_bio_placeholder")}
                  style={{ resize: "vertical" }}
                />
              </label>
              <div className="form-grid">
                <label className="field-row">
                  {t("field_start_year")}
                  <input
                    type="number" min={1990} max={2100}
                    value={form.startYear}
                    onChange={(e) => setForm((f) => ({ ...f, startYear: e.target.value }))}
                    placeholder="2015"
                  />
                </label>
                <label className="field-row">
                  {t("field_hand")}
                  <select value={form.hand} onChange={(e) => setForm((f) => ({ ...f, hand: e.target.value }))}>
                    <option value="">{t("field_unset")}</option>
                    <option value="RIGHT">{t("field_hand_right")}</option>
                    <option value="LEFT">{t("field_hand_left")}</option>
                  </select>
                </label>
              </div>
              <div className="form-grid">
                <label className="field-row">
                  {t("field_gender")} <span style={{ color: "var(--text-muted)", fontSize: 12 }}>({t("field_gender_optional")})</span>
                  <select value={form.gender} onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value as typeof f.gender }))}>
                    <option value="">{t("field_unset")}</option>
                    <option value="MALE">{t("field_gender_male")}</option>
                    <option value="FEMALE">{t("field_gender_female")}</option>
                    <option value="NON_BINARY">{t("field_gender_nb")}</option>
                    <option value="PREFER_NOT_SAY">{t("field_gender_prefer_not")}</option>
                  </select>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontWeight: 600, fontSize: 14, paddingTop: 22 }}>
                  <input
                    type="checkbox"
                    checked={form.showGender}
                    onChange={(e) => setForm((f) => ({ ...f, showGender: e.target.checked }))}
                    style={{ width: 16, height: 16 }}
                  />
                  {t("field_gender_show")}
                </label>
              </div>
              <div className="field-row">
                {t("field_diet")} <span style={{ color: "var(--text-muted)", fontSize: 12 }}>({t("field_diet_hint")})</span>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 6 }}>
                  {(["OMNIVORE", "VEGETARIAN", "VEGAN", "GLUTEN_FREE"] as const).map((d) => {
                    const labels: Record<string, string> = { OMNIVORE: t("diet_omnivore"), VEGETARIAN: t("diet_vegetarian"), VEGAN: t("diet_vegan"), GLUTEN_FREE: t("diet_gluten_free") };
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
                  {saving ? t("btn_save_loading") : t("btn_save")}
                </button>
                <button className="ghost" type="button" onClick={() => setEditing(false)}>{t("btn_cancel")}</button>
              </div>
            </form>
          )}

          {/* Badges & Emblème */}
          <div className="panel">
            <h3 style={{ marginBottom: 16 }}>{t("section_badges")}</h3>

            {/* Section Mon Club */}
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>{t("club_section")}</p>

              {/* Clubs dont le joueur est MEMBER */}
              {clubMemberships.filter(m => m.status === "MEMBER").map(m => (
                <div key={m.clubId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
                  {m.club.logoPath
                    ? <img src={m.club.logoPath} alt={m.club.name} style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover", border: "2px solid var(--border)", flexShrink: 0 }} />
                    : <div style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--bg-muted,#eee)", border: "2px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>🏒</div>
                  }
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontWeight: 700, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.club.name}</p>
                    <p style={{ margin: 0, fontSize: 11, color: "var(--text-muted)" }}>{m.club.city}, {m.club.country}{!m.club.approved && ` · ${t("club_pending_approval")}`}</p>
                  </div>
                  {m.club.logoPath && (
                    <button
                      className={player.clubLogoPath === m.club.logoPath ? "primary" : "ghost"}
                      style={{ fontSize: 11, padding: "4px 10px" }}
                      onClick={async () => {
                        const newPath = player.clubLogoPath === m.club.logoPath ? null : m.club.logoPath;
                        await fetch("/api/account/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clubLogoPath: newPath }) });
                        await fetchPlayer();
                      }}
                    >
                      {player.clubLogoPath === m.club.logoPath ? `✓ ${t("club_logo_used")}` : t("club_use_logo")}
                    </button>
                  )}
                  <button
                    className="ghost"
                    style={{ fontSize: 11, color: "var(--danger)" }}
                    onClick={async () => {
                      await fetch(`/api/clubs/${m.clubId}/members`, { method: "DELETE" });
                      if (player.clubLogoPath === m.club.logoPath) {
                        await fetch("/api/account/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clubLogoPath: null }) });
                      }
                      await fetchClubMemberships();
                      await fetchPlayer();
                    }}
                  >{t("club_leave")}</button>
                </div>
              ))}

              {/* Demandes envoyées (PENDING_BY_PLAYER) */}
              {clubMemberships.filter(m => m.status === "PENDING_BY_PLAYER").map(m => (
                <div key={m.clubId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", color: "var(--text-muted)", fontSize: 13 }}>
                  <span>⏳</span>
                  <span style={{ flex: 1 }}>{t("club_pending_request")} · <strong style={{ color: "var(--text)" }}>{m.club.name}</strong></span>
                  <button className="ghost" style={{ fontSize: 11 }} onClick={async () => { await fetch(`/api/clubs/${m.clubId}/members`, { method: "DELETE" }); await fetchClubMemberships(); }}>{t("club_cancel_request")}</button>
                </div>
              ))}

              {/* Invitations reçues (PENDING_BY_MANAGER) */}
              {clubMemberships.filter(m => m.status === "PENDING_BY_MANAGER").map(m => (
                <div key={m.clubId} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", fontSize: 13, flexWrap: "wrap" }}>
                  <span>📩</span>
                  <span style={{ flex: 1 }}>{t("club_invitation_received")} · <strong>{m.club.name}</strong></span>
                  <button className="primary" style={{ fontSize: 11, padding: "4px 10px" }} onClick={async () => { await fetch(`/api/clubs/${m.clubId}/members`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ playerId: player.id, action: "accept" }) }); await fetchClubMemberships(); }}>{t("club_accept")}</button>
                  <button className="ghost" style={{ fontSize: 11, padding: "4px 10px" }} onClick={async () => { await fetch(`/api/clubs/${m.clubId}/members`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ playerId: player.id, action: "reject" }) }); await fetchClubMemberships(); }}>{t("club_decline")}</button>
                </div>
              ))}

              {/* Pas encore dans un club → recherche + création */}
              {clubMemberships.filter(m => m.status === "MEMBER").length === 0 && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                    <input
                      value={clubSearch}
                      onChange={(e) => setClubSearch(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && searchClubs()}
                      placeholder={t("club_search_placeholder")}
                      style={{ flex: 1, fontSize: 13 }}
                    />
                    <button className="ghost" style={{ fontSize: 12 }} onClick={searchClubs} disabled={clubSearching}>{t("club_search_btn")}</button>
                  </div>

                  {clubResults !== null && clubResults.length === 0 && (
                    <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "4px 0 8px" }}>{t("club_no_results")}</p>
                  )}

                  {clubResults && clubResults.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
                      {clubResults.map(club => {
                        const isPending = clubMemberships.some(m => m.clubId === club.id && m.status === "PENDING_BY_PLAYER");
                        return (
                          <div key={club.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 10px", border: "1px solid var(--border)", borderRadius: 8 }}>
                            {club.logoPath && <img src={club.logoPath} alt={club.name} style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ margin: 0, fontWeight: 700, fontSize: 13 }}>{club.name}</p>
                              <p style={{ margin: 0, fontSize: 11, color: "var(--text-muted)" }}>{club.city}, {club.country}</p>
                            </div>
                            <button
                              className="ghost"
                              style={{ fontSize: 11, padding: "4px 10px" }}
                              disabled={isPending}
                              onClick={async () => {
                                await fetch(`/api/clubs/${club.id}/members`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "request" }) });
                                await fetchClubMemberships();
                                setClubResults(null);
                                setClubSearch("");
                              }}
                            >{isPending ? t("club_join_sent") : t("club_join")}</button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <button className="ghost" style={{ fontSize: 12, width: "100%" }} onClick={() => setShowCreateClub(v => !v)}>
                    {showCreateClub ? "▲" : "▼"} {t("club_create_title")}
                  </button>

                  {showCreateClub && (
                    <form style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12, padding: "12px", border: "1px solid var(--border)", borderRadius: 8 }} onSubmit={handleCreateClub}>
                      <div className="form-grid">
                        <label className="field-row">
                          {t("club_create_name")}
                          <input required value={createClubForm.name} onChange={(e) => setCreateClubForm(f => ({ ...f, name: e.target.value }))} />
                        </label>
                        <label className="field-row">
                          {t("club_create_city")}
                          <input required value={createClubForm.city} onChange={(e) => setCreateClubForm(f => ({ ...f, city: e.target.value }))} />
                        </label>
                      </div>
                      <label className="field-row">
                        {t("club_create_country")}
                        <select required value={createClubForm.country} onChange={(e) => setCreateClubForm(f => ({ ...f, country: e.target.value }))}>
                          <option value="">{t("field_unset")}</option>
                          {COUNTRIES.map(c => <option key={c.code} value={c.name}>{c.name}</option>)}
                        </select>
                      </label>
                      <button type="submit" className="primary" disabled={clubCreating} style={{ fontSize: 13 }}>
                        {clubCreating ? "..." : t("club_create_btn")}
                      </button>
                    </form>
                  )}
                </div>
              )}
            </div>

            {/* Logo position picker */}
            {player.clubLogoPath && (
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>{t("logo_position")} <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>({t("logo_position_hint")})</span></p>
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
                        {pos === "top-right" ? t("pos_top_right") : pos === "bottom-left" ? t("pos_bottom_left") : t("pos_bottom_right")}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Team logo upload ── */}
            <div style={{ marginBottom: 16, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
              <p style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>{t("logo_team")} <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>({t("logo_team_hint")})</span></p>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {player.teamLogoPath && (
                  <img src={player.teamLogoPath} alt="Team" style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover", border: "2px solid var(--border)" }} />
                )}
                <label style={{ cursor: "pointer", display: "inline-block" }}>
                  <span className="ghost" style={{ fontSize: 12, display: "inline-block", cursor: "pointer" }}>
                    {player.teamLogoPath ? t("logo_change") : t("logo_add_team")}
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
                    {t("logo_delete")}
                  </button>
                )}
              </div>
            </div>

            {/* Team logo position picker */}
            {player.teamLogoPath && (
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>{t("logo_position_team")} <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>({t("logo_position_team_hint")})</span></p>
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
                        {pos === "top-right" ? t("pos_top_right") : pos === "bottom-left" ? t("pos_bottom_left") : t("pos_bottom_right")}
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
                catalog={player.badgeCatalog}
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

          {/* Changer le mot de passe */}
          <div style={{ borderTop: "2px solid var(--border)", paddingTop: 16, marginTop: 8 }}>
            <button type="button" className="ghost" style={{ fontSize: 13, width: "100%", justifyContent: "space-between" }} onClick={() => { setPwOpen((v) => !v); setPwMsg(null); }}>
              🔒 {t("pw_section")} {pwOpen ? "▲" : "▼"}
            </button>
            {pwOpen && (
              <form onSubmit={handleChangePassword} style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
                <label className="field-row">
                  {t("field_current_password")}
                  <input type="password" required value={pwForm.current} onChange={(e) => setPwForm((p) => ({ ...p, current: e.target.value }))} />
                </label>
                <label className="field-row">
                  {t("field_new_password")}
                  <input type="password" required minLength={8} value={pwForm.next} onChange={(e) => setPwForm((p) => ({ ...p, next: e.target.value }))} placeholder="8 caractères minimum" />
                </label>
                <label className="field-row">
                  {t("pw_confirm")}
                  <input type="password" required value={pwForm.confirm} onChange={(e) => setPwForm((p) => ({ ...p, confirm: e.target.value }))} />
                </label>
                {pwMsg && <p style={{ fontSize: 13, color: pwMsg.ok ? "var(--teal)" : "var(--danger)", margin: 0 }}>{pwMsg.text}</p>}
                <button type="submit" className="primary" disabled={pwSaving}>{pwSaving ? t("pw_saving") : t("pw_save")}</button>
              </form>
            )}
          </div>

          {/* Supprimer le compte */}
          <div style={{ borderTop: "2px solid var(--border)", paddingTop: 16, marginTop: 8 }}>
            <button
              type="button"
              className="ghost"
              style={{ fontSize: 13, width: "100%", justifyContent: "space-between", color: "var(--danger)" }}
              onClick={() => { setDeleteOpen((v) => !v); setDeleteConfirm(""); setDeleteError(null); }}
            >
              {t("delete_section")} {deleteOpen ? "▲" : "▼"}
            </button>
            {deleteOpen && (
              <form onSubmit={handleDeleteAccount} style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12, padding: "12px 16px", background: "rgba(var(--danger-rgb,220,38,38),0.06)", border: "1px solid var(--danger)", borderRadius: 8 }}>
                <p style={{ fontSize: 13, margin: 0, lineHeight: 1.6 }}>{t("delete_warning")}</p>
                <label className="field-row">
                  {t("delete_confirm_label", { word: t("delete_confirm_word") })}
                  <input
                    value={deleteConfirm}
                    onChange={(e) => setDeleteConfirm(e.target.value)}
                    placeholder={t("delete_confirm_word")}
                    style={{ borderColor: "var(--danger)" }}
                  />
                </label>
                {deleteError && <p style={{ fontSize: 13, color: "var(--danger)", margin: 0 }}>{deleteError}</p>}
                <button
                  type="submit"
                  className="primary"
                  disabled={deleting || deleteConfirm !== t("delete_confirm_word")}
                  style={{ background: "var(--danger)", opacity: deleteConfirm !== t("delete_confirm_word") ? 0.5 : 1 }}
                >
                  {deleting ? t("delete_deleting") : t("delete_btn")}
                </button>
              </form>
            )}
          </div>

          {/* Player card link */}
          <div style={{ textAlign: "center", paddingTop: 8 }}>
            <Link className="ghost" href={`/player/${player.slug ?? player.id}`} target="_blank">
              {t("btn_public_page")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
