"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSession, signOut } from "next-auth/react";
import { Link } from "@/i18n/navigation";
import { useRouter, usePathname } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { PokemonCard } from "@/components/PokemonCard";
import { ShareCardButton } from "@/components/ShareCardButton";
import { COUNTRIES } from "@/lib/countries";
import { fixImageOrientation } from "@/lib/fix-orientation";
import { BadgeShowcase } from "@/components/BadgeShowcase";
import { ClubPicker } from "@/components/ClubPicker";
import { ImageCropModal } from "@/components/ImageCropModal";
import { NotificationForm } from "@/components/NotificationForm";
import { MessagesClient } from "@/app/[locale]/messages/MessagesClient";
import { Tabs } from "@/components/Tabs";
import type { BadgeInfo } from "@/lib/badge-catalog";

type Squad = {
  id: string;
  name: string;
  logoPath: string | null;
};

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
  petAllergies: string | null;
  foodAllergies: string | null;
  badges: string[];
  pinnedBadges: string[];
  badgeCatalog: Record<string, BadgeInfo>;
  status: string;
  squads: { squad: Squad }[];
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

type NotifPrefs = {
  enabled: boolean;
  continents: string[];
  countries: string[];
  notifyNewTournaments: boolean;
  notifyFollowedClosing: boolean;
  notifySquadInvite: boolean;
};

type ConvSummary = {
  id: string;
  unread: number;
  other: { id: string; name: string; photoPath: string | null; slug: string | null };
  lastMessage: { content: string; createdAt: string; authorId: string } | null;
};

export default function AccountPage() {
  const t = useTranslations("account");
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const cardRef = useRef<HTMLDivElement>(null);

  const tab = searchParams.get("tab") ?? "edit";

  const [player, setPlayer] = useState<Player | null>(null);
  const [form, setForm] = useState({
    name: "", city: "", country: "", bio: "", startYear: "", hand: "",
    gender: "" as "" | "MALE" | "FEMALE" | "NON_BINARY" | "PREFER_NOT_SAY",
    showGender: false, diets: [] as string[],
    petAllergies: "" as string, foodAllergies: "" as string,
  });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);

  const [availableCities, setAvailableCities] = useState<Array<{ city: string; country: string; label: string }>>([]);
  const [clubMemberships, setClubMemberships] = useState<ClubMembership[]>([]);

  const [pwOpen, setPwOpen] = useState(false);
  const [pwForm, setPwForm] = useState({ current: "", next: "", confirm: "" });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);

  // Notif prefs (loaded lazily on settings tab)
  const [notifPrefs, setNotifPrefs] = useState<NotifPrefs | null>(null);

  // Messages
  const [conversations, setConversations] = useState<ConvSummary[]>([]);
  const [charterAccepted, setCharterAccepted] = useState(false);

  const fetchClubMemberships = useCallback(async () => {
    const res = await fetch("/api/account/clubs");
    if (res.ok) setClubMemberships(await res.json());
  }, []);

  const fetchCityClubSuggestions = useCallback(async (city?: string | null, country?: string | null) => {
    if (!city || !country) return;
    try {
      const params = new URLSearchParams({ city, country });
      await fetch(`/api/clubs/by-city?${params.toString()}`);
    } catch { /* ignore */ }
  }, []);

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
        diets: data.diets ?? [],
        petAllergies: data.petAllergies ?? "",
        foodAllergies: data.foodAllergies ?? "",
      });
    }
  }, []);

  const fetchNotifPrefs = useCallback(async () => {
    if (notifPrefs) return;
    const res = await fetch("/api/account/notification-prefs");
    if (res.ok) setNotifPrefs(await res.json());
  }, [notifPrefs]);

  const fetchConversations = useCallback(async () => {
    const res = await fetch("/api/direct-conversations");
    if (res.ok) {
      const data = await res.json();
      setConversations(data.conversations);
      setCharterAccepted(data.charterAccepted);
    }
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") { router.push("/login"); return; }
    if (status === "authenticated" && !session.user.playerId) { router.push("/"); return; }
    if (status === "authenticated") { fetchPlayer(); fetchClubMemberships(); fetchConversations(); }

    const loadCities = async () => {
      try {
        const res = await fetch("/api/clubs/cities");
        if (res.ok) setAvailableCities(await res.json());
      } catch { /* ignore */ }
    };
    loadCities();
  }, [status, session, router, fetchPlayer, fetchClubMemberships]);

  useEffect(() => {
    if (tab === "settings") fetchNotifPrefs();
  }, [tab, fetchNotifPrefs]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const oriented = await fixImageOrientation(file);
    setCropFile(oriented);
  };

  const uploadCroppedBlob = async (blob: Blob) => {
    setCropFile(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", new File([blob], "photo.webp", { type: "image/webp" }));
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) { setSaveMsg(t("photo_error")); return; }
      const { path } = await res.json();
      await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoPath: path }),
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
        diets: form.diets,
        petAllergies: form.petAllergies || null,
        foodAllergies: form.foodAllergies || null,
      }),
    });
    if (res.ok) {
      await fetchPlayer();
      setSaveMsg(t("success_profile"));
      setTimeout(() => setSaveMsg(null), 3000);
    }
    setSaving(false);
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
    if (res.ok) {
      setPwMsg({ ok: true, text: t("success_password") });
      setPwForm({ current: "", next: "", confirm: "" });
      setTimeout(() => setPwOpen(false), 1500);
    } else {
      setPwMsg({ ok: false, text: data.error ?? t("error_wrong_password") });
    }
  };

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

  if (status === "loading" || !player) {
    return <div className="page-container"><p>{t("loading")}</p></div>;
  }

  const totalUnread = conversations.reduce((sum, c) => sum + c.unread, 0);

  const tabs = [
    { label: t("tab_edit"), value: "edit", href: `${pathname}?tab=edit` },
    { label: t("tab_badges"), value: "badges", href: `${pathname}?tab=badges` },
    { label: totalUnread > 0 ? `${t("tab_messages")} (${totalUnread})` : t("tab_messages"), value: "messages", href: `${pathname}?tab=messages` },
    { label: t("tab_settings"), value: "settings", href: `${pathname}?tab=settings` },
  ];

  return (
    <div>
      {cropFile && (
        <ImageCropModal
          file={cropFile}
          onConfirm={uploadCroppedBlob}
          onCancel={() => setCropFile(null)}
        />
      )}

      <div className="account-main-layout">
        {/* ── Sidebar permanente : carte pokémon ── */}
        <div className="account-card-sidebar">
          <PokemonCard
            ref={cardRef}
            name={player.name}
            country={player.country}
            city={player.city}
            photoPath={player.photoPath}
            clubLogoPath={player.clubLogoPath}
            clubName={clubMemberships.find(m => m.status === "MEMBER")?.club?.name ?? null}
            teamLogoPath={player.teamLogoPath}
            badges={player.badges}
            pinnedBadges={player.pinnedBadges}
            startYear={player.startYear}
          />
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <ShareCardButton cardRef={cardRef} playerName={player.name} />
            <label style={{ cursor: "pointer" }}>
              <span className="ghost" style={{ fontSize: 12, display: "inline-block", cursor: "pointer" }}>
                {uploading ? "…" : " " + t("photo_change")}
              </span>
              <input type="file" accept="image/*" onChange={handlePhotoUpload} disabled={uploading} style={{ display: "none" }} />
            </label>
          </div>
        </div>

        {/* ── Colonne droite : header + tabs + contenu ── */}
        <div style={{ minWidth: 0 }}>
          {/* Header */}
          <div className="account-page-header">
            <div>
              <h1 style={{ margin: 0, fontSize: 22 }}>{player.name}</h1>
              <p style={{ color: "var(--text-muted)", fontSize: 14, margin: "2px 0 0" }}>
                {player.city ? `${player.city}, ` : ""}{player.country}
              </p>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <Link className="ghost" href={`/player/${player.slug ?? player.id}`} target="_blank" style={{ fontSize: 13 }}>
                {t("btn_public_page")}
              </Link>
              <button className="ghost" style={{ fontSize: 13 }} onClick={() => signOut({ callbackUrl: "/" })}>
                {t("btn_logout")}
              </button>
            </div>
          </div>

          {/* Onboarding */}
          {!onboardingDismissed && (!player.photoPath || clubMemberships.filter(m => m.status === "MEMBER").length === 0) && (
            <div style={{ background: "color-mix(in srgb, var(--teal) 8%, var(--surface))", border: "2px solid var(--teal)", borderRadius: 8, padding: "16px 20px", position: "relative", marginBottom: 16 }}>
              <button type="button" onClick={() => setOnboardingDismissed(true)} style={{ position: "absolute", top: 8, right: 10, background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "var(--text-muted)" }}>✕</button>
              <p style={{ margin: "0 0 6px", fontWeight: 700, fontSize: 14, fontFamily: "var(--font-display)" }}>{t("onboarding_title")}</p>
              <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--text-muted)" }}>{t("onboarding_hint")}</p>
              {!player.photoPath && (
                <label style={{ cursor: "pointer" }}>
                  <span className="primary" style={{ fontSize: 12, display: "inline-block", cursor: "pointer" }}>{t("onboarding_add_photo")}</span>
                  <input type="file" accept="image/*" onChange={handlePhotoUpload} disabled={uploading} style={{ display: "none" }} />
                </label>
              )}
            </div>
          )}

          <Tabs items={tabs} active={tab} />

          {/* ── TAB: EDIT ── */}
          {tab === "edit" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 24, marginTop: 24 }}>

            {/* Formulaire profil */}
            <form className="panel" onSubmit={save} style={{ display: "grid", gap: 14 }}>
              <h3 style={{ margin: 0 }}>{t("edit_title")}</h3>
              <div className="form-grid">
                <label className="field-row">
                  {t("field_name")}
                  <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
                </label>
                <label className="field-row">
                  {t("field_city")}
                  <input
                    list="city-list"
                    value={form.city}
                    onChange={(e) => {
                      const newCity = e.target.value;
                      setForm((f) => ({ ...f, city: newCity }));
                      if (newCity && form.country) fetchCityClubSuggestions(newCity, form.country);
                    }}
                    placeholder="Paris"
                  />
                  <datalist id="city-list">
                    {availableCities
                      .filter((c) => !form.country || c.country === form.country)
                      .map((c) => (
                        <option key={`${c.city}-${c.country}`} value={c.city} label={c.label} />
                      ))}
                  </datalist>
                </label>
              </div>
              <label className="field-row">
                {t("field_country")}
                <select
                  value={form.country}
                  onChange={(e) => {
                    const newCountry = e.target.value;
                    setForm((f) => ({ ...f, country: newCountry }));
                    if (form.city && newCountry) fetchCityClubSuggestions(form.city, newCountry);
                  }}
                >
                  {COUNTRIES.map((c) => <option key={c.code} value={c.name}>{c.name}</option>)}
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
                  {(["OMNIVORE", "VEGETARIAN", "VEGAN"] as const).map((d) => {
                    const labels: Record<string, string> = { OMNIVORE: t("diet_omnivore"), VEGETARIAN: t("diet_vegetarian"), VEGAN: t("diet_vegan") };
                    const mainDiet = form.diets.find((x) => x !== "GLUTEN_FREE") ?? null;
                    return (
                      <label key={d} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                        <input
                          type="radio"
                          name="diet-main"
                          checked={mainDiet === d}
                          onChange={() => setForm((f) => ({
                            ...f,
                            diets: f.diets.includes("GLUTEN_FREE") ? [d, "GLUTEN_FREE"] : [d],
                          }))}
                          style={{ width: 14, height: 14 }}
                        />
                        {labels[d]}
                      </label>
                    );
                  })}
                  <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13, fontWeight: 600, marginLeft: 4, borderLeft: "1px solid var(--border)", paddingLeft: 12 }}>
                    <input
                      type="checkbox"
                      checked={form.diets.includes("GLUTEN_FREE")}
                      onChange={() => setForm((f) => ({
                        ...f,
                        diets: f.diets.includes("GLUTEN_FREE")
                          ? f.diets.filter((x) => x !== "GLUTEN_FREE")
                          : [...f.diets, "GLUTEN_FREE"],
                      }))}
                      style={{ width: 14, height: 14 }}
                    />
                    {t("diet_gluten_free")}
                  </label>
                </div>
              </div>
              <div className="field-row">
                <label>{t("field_pet_allergies")}</label>
                <input
                  type="text"
                  value={form.petAllergies}
                  onChange={(e) => setForm((f) => ({ ...f, petAllergies: e.target.value }))}
                  placeholder={t("field_pet_allergies_placeholder")}
                  style={{ fontSize: 13 }}
                />
              </div>
              <div className="field-row">
                <label>{t("field_food_allergies")}</label>
                <input
                  type="text"
                  value={form.foodAllergies}
                  onChange={(e) => setForm((f) => ({ ...f, foodAllergies: e.target.value }))}
                  placeholder={t("field_food_allergies_placeholder")}
                  style={{ fontSize: 13 }}
                />
              </div>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <button className="primary" type="submit" disabled={saving}>
                  {saving ? t("btn_save_loading") : t("btn_save")}
                </button>
                {saveMsg && <span style={{ fontSize: 13, color: "var(--teal)", fontWeight: 600 }}>✓ {saveMsg}</span>}
              </div>
            </form>

            {/* Mon club */}
            <div className="panel">
              <h3 style={{ marginBottom: 16 }}>{t("club_section")}</h3>

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
                  <Link href={`/club/${m.clubId}/edit`} className="ghost" style={{ fontSize: 11, padding: "4px 10px" }}>
                    ✏️ {t("club_edit_btn")}
                  </Link>
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

              {clubMemberships.filter(m => m.status === "PENDING_BY_PLAYER").map(m => (
                <div key={m.clubId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", color: "var(--text-muted)", fontSize: 13 }}>
                  <span>⏳</span>
                  <span style={{ flex: 1 }}>{t("club_pending_request")} · <strong style={{ color: "var(--text)" }}>{m.club.name}</strong></span>
                  <button className="ghost" style={{ fontSize: 11 }} onClick={async () => { await fetch(`/api/clubs/${m.clubId}/members`, { method: "DELETE" }); await fetchClubMemberships(); }}>{t("club_cancel_request")}</button>
                </div>
              ))}

              {clubMemberships.filter(m => m.status === "PENDING_BY_MANAGER").map(m => (
                <div key={m.clubId} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", fontSize: 13, flexWrap: "wrap" }}>
                  <span>📩</span>
                  <span style={{ flex: 1 }}>{t("club_invitation_received")} · <strong>{m.club.name}</strong></span>
                  <button className="primary" style={{ fontSize: 11, padding: "4px 10px" }} onClick={async () => { await fetch(`/api/clubs/${m.clubId}/members`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ playerId: player.id, action: "accept" }) }); await fetchClubMemberships(); }}>{t("club_accept")}</button>
                  <button className="ghost" style={{ fontSize: 11, padding: "4px 10px" }} onClick={async () => { await fetch(`/api/clubs/${m.clubId}/members`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ playerId: player.id, action: "reject" }) }); await fetchClubMemberships(); }}>{t("club_decline")}</button>
                </div>
              ))}

              {clubMemberships.filter(m => m.status === "MEMBER").length === 0 && clubMemberships.filter(m => m.status === "PENDING_BY_MANAGER").length === 0 && (
                <div style={{ marginTop: 8 }}>
                  <ClubPicker
                    country={player.country}
                    onJoin={async (clubId) => {
                      await fetch("/api/clubs/by-city", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clubId }) });
                      await fetchClubMemberships();
                      await fetchPlayer();
                    }}
                    onCreate={async (data) => {
                      await fetch("/api/clubs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
                      await fetchClubMemberships();
                    }}
                  />
                </div>
              )}
            </div>

            {/* Logos */}
            <div className="panel">
              <h3 style={{ marginBottom: 16 }}>{t("logo_team")}</h3>
              <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 12px" }}>{t("logo_team_hint")}</p>
              {(() => {
                const squadsWithLogo = player.squads.map((s) => s.squad).filter((s) => !!s.logoPath);
                if (squadsWithLogo.length === 0) {
                  return <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>{t("logo_team_no_squads")}</p>;
                }
                return (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                    {squadsWithLogo.map((squad) => {
                      const isSelected = player.teamLogoPath === squad.logoPath;
                      return (
                        <button
                          key={squad.id}
                          type="button"
                          onClick={async () => {
                            const newPath = isSelected ? null : squad.logoPath;
                            await fetch("/api/account/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ teamLogoPath: newPath }) });
                            await fetchPlayer();
                          }}
                          style={{
                            display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                            background: isSelected ? "color-mix(in srgb, var(--accent) 12%, var(--surface))" : "var(--bg)",
                            border: `2px solid ${isSelected ? "var(--accent)" : "var(--border)"}`,
                            borderRadius: 8, padding: "8px 10px", cursor: "pointer",
                          }}
                        >
                          <img src={squad.logoPath!} alt={squad.name} style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover" }} />
                          <span style={{ fontSize: 11, fontWeight: isSelected ? 700 : 400, color: isSelected ? "var(--accent)" : "var(--text-muted)", maxWidth: 72, textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {isSelected ? "✓ " : ""}{squad.name}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </div>
          )}

          {/* ── TAB: BADGES ── */}
          {tab === "badges" && (
            <div style={{ marginTop: 24 }}>
              <BadgeShowcase
                earnedBadges={player.badges}
                pinnedBadges={player.pinnedBadges}
                catalog={player.badgeCatalog}
                playerId={player.id}
                onRefresh={fetchPlayer}
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
          )}

          {/* ── TAB: MESSAGES ── */}
          {tab === "messages" && player && (
            <div style={{ marginTop: 24 }}>
              <MessagesClient
                conversations={conversations}
                currentPlayerId={player.id}
                charterAccepted={charterAccepted}
              />
            </div>
          )}

          {/* ── TAB: SETTINGS ── */}
          {tab === "settings" && (
            <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 24 }}>
              <div className="panel">
                <h3 style={{ margin: "0 0 16px" }}>{t("settings_notifications_title")}</h3>
                {notifPrefs ? (
                  <NotificationForm
                    initialEnabled={notifPrefs.enabled}
                    initialContinents={notifPrefs.continents}
                    initialCountries={notifPrefs.countries}
                    initialNotifyNewTournaments={notifPrefs.notifyNewTournaments}
                    initialNotifyFollowedClosing={notifPrefs.notifyFollowedClosing}
                    initialNotifySquadInvite={notifPrefs.notifySquadInvite}
                  />
                ) : (
                  <p style={{ fontSize: 13, color: "var(--text-muted)" }}>{t("loading")}</p>
                )}
              </div>

              <div className="panel">
                <button
                  type="button"
                  className="ghost"
                  style={{ fontSize: 14, width: "100%", justifyContent: "space-between" }}
                  onClick={() => { setPwOpen((v) => !v); setPwMsg(null); }}
                >
                  🔒 {t("pw_section")} {pwOpen ? "▲" : "▼"}
                </button>
                {pwOpen && (
                  <form onSubmit={handleChangePassword} style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
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

              <div className="panel">
                <button
                  type="button"
                  className="ghost"
                  style={{ fontSize: 14, width: "100%", justifyContent: "space-between", color: "var(--danger)" }}
                  onClick={() => { setDeleteOpen((v) => !v); setDeleteConfirm(""); setDeleteError(null); }}
                >
                  {t("delete_section")} {deleteOpen ? "▲" : "▼"}
                </button>
                {deleteOpen && (
                  <form onSubmit={handleDeleteAccount} style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16, padding: "12px 16px", background: "rgba(var(--danger-rgb,220,38,38),0.06)", border: "1px solid var(--danger)", borderRadius: 8 }}>
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
            </div>
          )}

        </div>{/* fin colonne droite */}
      </div>{/* fin account-main-layout */}
    </div>
  );
}
