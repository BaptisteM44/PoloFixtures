"use client";

import { useTransition, useState, useRef, useEffect } from "react";
import Image from "next/image";
import { fixImageOrientation } from "@/lib/fix-orientation";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { ISO_COUNTRIES } from "@/lib/iso-countries";
import { CURRENCIES } from "@/lib/currencies";
import { RegistrationFieldsEditor } from "@/components/RegistrationFieldsEditor";

type MealDay = { day: number; breakfast: boolean; lunch: boolean; dinner: boolean };
type FaqItem = { question: string; answer: string };

type Tournament = {
  id: string;
  name: string;
  continentCode: string;
  region: string | null;
  country: string;
  city: string;
  dateStart: string;
  dateEnd: string;
  format: string;
  gameDurationMin: number;
  maxTeams: number;
  courtsCount: number;
  registrationFeePerTeam: number;
  registrationFeeCurrency: string;
  contactEmail: string;
  registrationStart: string | null;
  registrationEnd: string | null;
  venueName: string | null;
  venueAddress: string | null;
  venueMapsUrl: string | null;
  fridayWelcomeName: string | null;
  fridayWelcomeAddress: string | null;
  fridayWelcomeMapsUrl: string | null;
  saturdayEventName: string | null;
  saturdayEventAddress: string | null;
  saturdayEventMapsUrl: string | null;
  saturdayEveningName: string | null;
  saturdayEveningAddress: string | null;
  saturdayEveningMapsUrl: string | null;
  otherNotes: string | null;
  links: string[];
  bannerPath: string | null;
  streamYoutubeUrl: string | null;
  streamCourt1Url: string | null;
  streamCourt2Url: string | null;
  streamMultiplexUrl: string | null;
  chatMode: string;
  saturdayFormat: string;
  poolCount?: number | null;
  crossPool?: boolean;
  swissRounds?: number | null;
  poolRounds?: number | null;
  bracketSize?: number | null;
  sundayFormat: string;
  scoringSystem?: string | null;
  thirdPlaceMatch?: boolean;
  gfReset?: boolean;
  status: string;
  locked: boolean;
  testMode?: boolean;
  hidden?: boolean;
  accommodationAvailable?: boolean;
  accommodationType?: string | null;
  accommodationCapacity?: number | null;
  meals?: MealDay[] | null;
  kitList?: string | null;
  additionalInfo?: string | null;
  faq?: FaqItem[] | null;
  telegramUrl?: string | null;
  // Legacy
  breakfastProvided?: boolean;
  lunchProvided?: boolean;
  dinnerProvided?: boolean;
  maxSoloPlayers?: number | null;
  externalRegistrationUrl?: string | null;
  hostClubId?: string | null;
};

type Props = {
  tournament: Tournament;
  action: (formData: FormData) => Promise<{ ok?: boolean; error?: unknown }>;
  toggleLockAction: (id: string, confirmReset?: boolean) => Promise<{ ok?: boolean; locked?: boolean; confirm?: boolean; message?: string; error?: string }>;
};

function computeDays(dateStart: string, dateEnd: string): number {
  const start = new Date(dateStart);
  const end = new Date(dateEnd);
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
}

function dayLabel(dayIndex: number, totalDays: number, dateStart: string, dayText: string, locale: string): string {
  const d = new Date(dateStart);
  d.setDate(d.getDate() + dayIndex);
  const weekday = d.toLocaleDateString(locale, { weekday: "long" });
  const date = d.toLocaleDateString(locale, { day: "numeric", month: "short" });
  return `${dayText} ${dayIndex + 1} · ${weekday} ${date}`;
}

function initMeals(tournament: Tournament): MealDay[] {
  const days = computeDays(tournament.dateStart, tournament.dateEnd);
  const existing = (tournament.meals as MealDay[] | null) ?? [];
  return Array.from({ length: days }, (_, i) => {
    const found = existing.find((m) => m.day === i + 1);
    return found ?? { day: i + 1, breakfast: false, lunch: false, dinner: false };
  });
}

const sectionTitleStyle = { fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginBottom: 10, textTransform: "uppercase" as const, letterSpacing: "0.06em" };
const subTitleStyle = { fontFamily: "var(--font-display)", fontSize: 11, color: "var(--text-muted)", margin: 0, textTransform: "uppercase" as const, letterSpacing: "0.05em" };

export function TournamentEditForm({ tournament, action, toggleLockAction }: Props) {
  const t = useTranslations("tournament_edit");
  const locale = useLocale();
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLocked, setIsLocked] = useState(tournament.locked);
  const [lockPending, setLockPending] = useState(false);
  const [bannerPath, setBannerPath] = useState(tournament.bannerPath ?? "");
  const [bannerUploading, setBannerUploading] = useState(false);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  // Format
  const [currentFormat, setCurrentFormat] = useState(tournament.format);

  // Format preset
  type FormatPreset = "pool_de" | "pool_se" | "2pools_de" | "2pools_se" | "swiss_de" | "swiss_se" | "swiss6_split_se" | "cross_pool_bcn" | "berlin_mixed" | "graz" | "mtp_open" | "split_se" | "kiosque" | "big_apple" | "custom";
  type PresetConfig = { saturdayFormat: string; poolCount: number; swissRounds: number; bracketSize: number; sundayFormat: string; crossPool: boolean; thirdPlaceMatch: boolean; gfReset: boolean };

  const PRESETS: Record<Exclude<FormatPreset, "custom">, PresetConfig> = {
    pool_de:        { saturdayFormat: "ALL_DAY",      poolCount: 1, swissRounds: 5, bracketSize: 16, sundayFormat: "DE", crossPool: false, thirdPlaceMatch: false, gfReset: false },
    pool_se:        { saturdayFormat: "ALL_DAY",      poolCount: 1, swissRounds: 5, bracketSize: 16, sundayFormat: "SE", crossPool: false, thirdPlaceMatch: true,  gfReset: false },
    "2pools_de":    { saturdayFormat: "SPLIT_POOLS",  poolCount: 2, swissRounds: 5, bracketSize: 16, sundayFormat: "DE", crossPool: false, thirdPlaceMatch: false, gfReset: false },
    "2pools_se":    { saturdayFormat: "SPLIT_POOLS",  poolCount: 2, swissRounds: 5, bracketSize: 16, sundayFormat: "SE", crossPool: false, thirdPlaceMatch: true,  gfReset: false },
    swiss_de:       { saturdayFormat: "SWISS",        poolCount: 1, swissRounds: 5, bracketSize: 8,  sundayFormat: "DE", crossPool: false, thirdPlaceMatch: false, gfReset: false },
    swiss_se:       { saturdayFormat: "SWISS",        poolCount: 1, swissRounds: 5, bracketSize: 8,  sundayFormat: "SE", crossPool: false, thirdPlaceMatch: true,  gfReset: false },
    swiss6_split_se: { saturdayFormat: "SWISS",      poolCount: 1, swissRounds: 6, bracketSize: 18, sundayFormat: "SWISS_SPLIT_SE", crossPool: false, thirdPlaceMatch: false, gfReset: false },
    cross_pool_bcn: { saturdayFormat: "SPLIT_POOLS",  poolCount: 2, swissRounds: 5, bracketSize: 8,  sundayFormat: "DE", crossPool: true,  thirdPlaceMatch: false, gfReset: false },
    berlin_mixed:   { saturdayFormat: "BERLIN_MIXED", poolCount: 2, swissRounds: 5, bracketSize: 32, sundayFormat: "SE", crossPool: false, thirdPlaceMatch: true,  gfReset: false },
    graz:           { saturdayFormat: "GRAZ",         poolCount: 2, swissRounds: 7, bracketSize: 8,  sundayFormat: "SE", crossPool: false, thirdPlaceMatch: true,  gfReset: false },
    mtp_open:       { saturdayFormat: "MTP_OPEN",     poolCount: 2, swissRounds: 9, bracketSize: 16, sundayFormat: "DE",       crossPool: false, thirdPlaceMatch: false, gfReset: true  },
    split_se:       { saturdayFormat: "SPLIT_POOLS",  poolCount: 2, swissRounds: 5, bracketSize: 16, sundayFormat: "SPLIT_SE", crossPool: false, thirdPlaceMatch: false, gfReset: false },
    kiosque:        { saturdayFormat: "KIOSQUE",      poolCount: 2, swissRounds: 5, bracketSize: 8,  sundayFormat: "SE",       crossPool: false, thirdPlaceMatch: false, gfReset: false },
    big_apple:      { saturdayFormat: "BIG_APPLE",    poolCount: 2, swissRounds: 7, bracketSize: 8,  sundayFormat: "SE",       crossPool: false, thirdPlaceMatch: true,  gfReset: false },
  };

  function detectPreset(tn: Tournament): FormatPreset {
    for (const [key, cfg] of Object.entries(PRESETS)) {
      if (
        tn.saturdayFormat === cfg.saturdayFormat &&
        (tn.poolCount ?? 1) === cfg.poolCount &&
        tn.sundayFormat === cfg.sundayFormat &&
        (tn.crossPool ?? false) === cfg.crossPool
      ) return key as FormatPreset;
    }
    return "custom";
  }

  const [formatPreset, setFormatPreset] = useState<FormatPreset>(() => detectPreset(tournament));
  const [presetConfig, setPresetConfig] = useState<PresetConfig>(() =>
    detectPreset(tournament) === "custom"
      ? { saturdayFormat: tournament.saturdayFormat, poolCount: tournament.poolCount ?? 1, swissRounds: tournament.swissRounds ?? 5, bracketSize: tournament.bracketSize ?? 16, sundayFormat: tournament.sundayFormat, crossPool: tournament.crossPool ?? false, thirdPlaceMatch: tournament.thirdPlaceMatch ?? false, gfReset: tournament.gfReset ?? false }
      : { ...PRESETS[detectPreset(tournament) as Exclude<FormatPreset, "custom">], swissRounds: tournament.swissRounds ?? PRESETS[detectPreset(tournament) as Exclude<FormatPreset, "custom">].swissRounds, bracketSize: tournament.bracketSize ?? tournament.maxTeams ?? PRESETS[detectPreset(tournament) as Exclude<FormatPreset, "custom">].bracketSize, thirdPlaceMatch: tournament.thirdPlaceMatch ?? true, gfReset: tournament.gfReset ?? false }
  );
  const [savedCustomConfig, setSavedCustomConfig] = useState<PresetConfig | null>(
    detectPreset(tournament) === "custom" ? presetConfig : null
  );
  const [showFormatInfo, setShowFormatInfo] = useState(true);
  const [showFormatContact, setShowFormatContact] = useState(false);
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactMessage, setContactMessage] = useState("");
  const [contactStatus, setContactStatus] = useState<"idle" | "sending" | "ok" | "error">("idle");
  const [contactError, setContactError] = useState("");

  const sendFormatContact = async () => {
    setContactStatus("sending");
    setContactError("");
    try {
      const res = await fetch("/api/contact-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: contactName,
          email: contactEmail,
          subject: `Format personnalisé — ${tournament.name}`,
          message: contactMessage,
        }),
      });
      if (res.ok) {
        setContactStatus("ok");
      } else {
        const data = await res.json().catch(() => ({}));
        setContactError(data.error ?? t("error_generic"));
        setContactStatus("error");
      }
    } catch {
      setContactError(t("error_generic"));
      setContactStatus("error");
    }
  };

  function selectPreset(key: FormatPreset) {
    if (formatPreset === "custom") {
      setSavedCustomConfig({ ...presetConfig });
    }
    setFormatPreset(key);
    if (key === "custom") {
      if (savedCustomConfig) setPresetConfig(savedCustomConfig);
    } else {
      setPresetConfig(PRESETS[key as Exclude<FormatPreset, "custom">]);
    }
  }

  // ABC Chapeau
  const [maxSoloPlayers, setMaxSoloPlayers] = useState<string>(
    tournament.maxSoloPlayers != null ? String(tournament.maxSoloPlayers) : ""
  );

  // Rush registration
  const [rushRegistration, setRushRegistration] = useState(
    (tournament as { rushRegistration?: boolean }).rushRegistration ?? false
  );

  // Pool rounds limit
  const [poolRounds, setPoolRounds] = useState<string>(
    tournament.poolRounds != null ? String(tournament.poolRounds) : ""
  );

  // Test mode
  const [testMode, setTestMode] = useState(tournament.testMode ?? false);
  const [hidden, setHidden] = useState((tournament as { hidden?: boolean }).hidden ?? false);

  // Club hôte
  const [hostClubId, setHostClubId] = useState<string>(tournament.hostClubId ?? "");
  const [managedClubs, setManagedClubs] = useState<{ id: string; name: string; city: string; logoPath: string | null }[]>([]);
  const [clubSearch, setClubSearch] = useState<string>("");
  useEffect(() => {
    fetch("/api/clubs?mine=true").then((r) => r.json()).then((data) => { if (Array.isArray(data)) setManagedClubs(data); }).catch(() => {});
  }, []);

  const handleTestModeChange = (checked: boolean) => {
    setTestMode(checked);
    if (checked && !hidden) setHidden(true);
    if (!checked) setHidden(false);
  };

  // Hébergement
  const [accommodation, setAccommodation] = useState(tournament.accommodationAvailable ?? false);
  const [accommodationType, setAccommodationType] = useState(tournament.accommodationType ?? "");
  const [accommodationCapacity, setAccommodationCapacity] = useState(tournament.accommodationCapacity ?? "");

  // Repas dynamiques
  const [meals, setMeals] = useState<MealDay[]>(() => initMeals(tournament));

  // Kit list, info complémentaire
  const [kitList, setKitList] = useState(tournament.kitList ?? "");
  const [additionalInfo, setAdditionalInfo] = useState(tournament.additionalInfo ?? "");

  // FAQ
  const [faq, setFaq] = useState<FaqItem[]>(() => (tournament.faq as FaqItem[] | null) ?? []);

  const days = computeDays(tournament.dateStart, tournament.dateEnd);

  const toggleMeal = (dayIndex: number, meal: "breakfast" | "lunch" | "dinner") => {
    setMeals((prev) => prev.map((m, i) => i === dayIndex ? { ...m, [meal]: !m[meal] } : m));
  };

  const addFaq = () => setFaq((prev) => [...prev, { question: "", answer: "" }]);
  const removeFaq = (i: number) => setFaq((prev) => prev.filter((_, idx) => idx !== i));
  const updateFaq = (i: number, field: "question" | "answer", val: string) => {
    setFaq((prev) => prev.map((item, idx) => idx === i ? { ...item, [field]: val } : item));
  };

  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBannerUploading(true);
    setBannerError(null);
    const fd = new FormData();
    fd.append("file", await fixImageOrientation(file));
    fd.append("folder", "banners");
    try {
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (res.ok) {
        const data = await res.json();
        setBannerPath(data.path);
      } else {
        const text = await res.text();
        setBannerError(`${t("error_upload")} : ${text || res.status}`);
      }
    } catch {
      setBannerError(t("error_network"));
    }
    setBannerUploading(false);
    // Reset input so the same file can be re-selected after an error
    e.target.value = "";
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaved(false);
    setError(null);
    const formData = new FormData(e.currentTarget);
    // Les inputs datetime-local renvoient une heure locale SANS fuseau
    // ("2026-08-13T13:00"). On la convertit ici, côté navigateur, en ISO
    // absolue (new Date interprète alors selon le fuseau du client) — même
    // sémantique que le formulaire de création. Sans ça, l'action serveur
    // parserait la chaîne en UTC (fuseau du process), et chaque aller-retour
    // édition→save décalait l'heure du fuseau (+2h l'été en Europe).
    for (const field of ["registrationStart", "registrationEnd"] as const) {
      const v = formData.get(field);
      if (typeof v === "string" && v) formData.set(field, new Date(v).toISOString());
    }
    startTransition(async () => {
      const result = await action(formData);
      if (result?.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 4000);
      } else {
        setError(
          typeof result?.error === "string"
            ? result.error
            : t("error_generic")
        );
      }
    });
  };

  const [deletePending, setDeletePending] = useState(false);
  const router = useRouter();

  const handleDelete = async () => {
    if (!window.confirm(t("confirm_delete"))) return;
    setDeletePending(true);
    const res = await fetch(`/api/tournaments/${tournament.id}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/tournaments");
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? t("error_delete"));
      setDeletePending(false);
    }
  };

  const handleToggleLock = async () => {
    setLockPending(true);
    setError(null);
    const result = await toggleLockAction(tournament.id);

    if (result.confirm) {
      const ok = window.confirm(result.message);
      if (ok) {
        const confirmed = await toggleLockAction(tournament.id, true);
        if (confirmed.ok) setIsLocked(confirmed.locked ?? false);
        else if (confirmed.error) setError(confirmed.error);
      }
    } else if (result.ok) {
      setIsLocked(result.locked ?? false);
    } else if (result.error) {
      setError(result.error);
    }
    setLockPending(false);
  };

  return (
    <div className="panel" style={{ marginBottom: 24 }}>
      <div className="edit-header">
        <h2 style={{ margin: 0 }}>{t("title")}</h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            type="button"
            className="ghost"
            style={{ fontSize: 12, whiteSpace: "nowrap", padding: "6px 12px", color: "var(--pink)", borderColor: "var(--pink)" }}
            onClick={() => {
              if (!window.confirm(t("confirm_close_registrations"))) return;
              const input = document.getElementById("registrationEnd") as HTMLInputElement;
              if (input) input.value = new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
            }}
          >
            {t("close_registrations")}
          </button>
          <button
            type="button"
            className="ghost"
            onClick={handleDelete}
            disabled={deletePending}
            style={{ fontSize: 12, padding: "6px 12px", color: "var(--pink)", borderColor: "var(--pink)" }}
          >
            {deletePending ? "…" : t("delete")}
          </button>
        </div>
      </div>


      {error && (
        <div style={{ background: "var(--orange)", border: "2px solid var(--border)", borderRadius: 8, padding: "10px 16px", marginBottom: 16, fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14 }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 14 }}>
        <input type="hidden" name="id" value={tournament.id} />
        <input type="hidden" name="locked" value={isLocked ? "true" : "false"} />
        {isLocked && <>
          <input type="hidden" name="format" value={currentFormat} />
          <input type="hidden" name="maxTeams" value={tournament.maxTeams} />
          <input type="hidden" name="courtsCount" value={tournament.courtsCount} />
          <input type="hidden" name="saturdayFormat" value={presetConfig.saturdayFormat} />
          <input type="hidden" name="swissRounds" value={presetConfig.swissRounds} />
          <input type="hidden" name="poolRounds" value={poolRounds} />
          <input type="hidden" name="bracketSize" value={presetConfig.bracketSize} />
          <input type="hidden" name="sundayFormat" value={presetConfig.sundayFormat} />
          <input type="hidden" name="scoringSystem" value={tournament.scoringSystem ?? "3/1"} />
          <input type="hidden" name="thirdPlaceMatch" value={String(presetConfig.thirdPlaceMatch)} />
          <input type="hidden" name="gfReset" value={String(presetConfig.gfReset)} />
          <input type="hidden" name="poolCount" value={presetConfig.poolCount} />
          <input type="hidden" name="crossPool" value={presetConfig.crossPool ? "true" : ""} />
        </>}
        <input type="hidden" name="region" value={tournament.region ?? ""} />
        <input type="hidden" name="links" value={tournament.links.join("\n")} />
        <input type="hidden" name="otherNotes" value={tournament.otherNotes ?? ""} />

        {/* ABC Chapeau hidden field */}
        <input type="hidden" name="maxSoloPlayers" value={maxSoloPlayers} />
        <input type="hidden" name="rushRegistration" value={rushRegistration ? "true" : "false"} />
        <input type="hidden" name="testMode" value={testMode ? "true" : "false"} />
        <input type="hidden" name="hidden" value={hidden ? "true" : "false"} />
        <input type="hidden" name="hostClubId" value={hostClubId ?? ""} />
        {/* Hidden fields for new data */}
        <input type="hidden" name="accommodationAvailable" value={accommodation ? "true" : "false"} />
        <input type="hidden" name="accommodationType" value={accommodationType} />
        <input type="hidden" name="accommodationCapacity" value={accommodationCapacity} />
        <input type="hidden" name="meals" value={JSON.stringify(meals)} />
        <input type="hidden" name="kitList" value={kitList} />
        <input type="hidden" name="additionalInfo" value={additionalInfo} />
        <input type="hidden" name="faq" value={JSON.stringify(faq.filter((f) => f.question.trim()))} />

        {/* ── Infos générales ── */}
        <div className="form-grid">
          <p style={{ ...sectionTitleStyle, gridColumn: "1 / -1", marginBottom: 0 }}>{t("section_general")}</p>
          <label className="field-row">
            {t("field_name")}
            <input name="name" defaultValue={tournament.name} required />
          </label>
          <label className="field-row">
            {t("field_continent")}
            <select name="continentCode" defaultValue={tournament.continentCode} required>
              <option value="EU">{t("continent_eu")}</option>
              <option value="NA">{t("continent_na")}</option>
              <option value="SA">{t("continent_sa")}</option>
              <option value="AF">{t("continent_af")}</option>
              <option value="AS">{t("continent_as")}</option>
              <option value="OC">{t("continent_oc")}</option>
            </select>
          </label>
          <label className="field-row">
            {t("field_country")}
            <select name="country" defaultValue={tournament.country}>
              {ISO_COUNTRIES.map((c) => (
                <option key={c.code} value={c.name}>{c.name}</option>
              ))}
            </select>
          </label>
          <label className="field-row">
            {t("field_city")}
            <input name="city" defaultValue={tournament.city} required />
          </label>

          {/* Club hôte */}
          {managedClubs.length > 0 && (
            <div className="field-row" style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: 6 }}>
              <span>{t("field_host_club")}</span>
              {managedClubs.length > 10 && (
                <input
                  type="text"
                  placeholder="Rechercher un club..."
                  value={clubSearch}
                  onChange={(e) => setClubSearch(e.target.value)}
                  style={{ fontSize: 13 }}
                />
              )}
              <select value={hostClubId} onChange={(e) => setHostClubId(e.target.value)}>
                <option value="">{t("field_host_club_none")}</option>
                {managedClubs
                  .filter((c) => !clubSearch || `${c.name} ${c.city}`.toLowerCase().includes(clubSearch.toLowerCase()))
                  .map((c) => (
                    <option key={c.id} value={c.id}>{c.name} — {c.city}</option>
                  ))}
              </select>
            </div>
          )}
          <label className="field-row">
            {t("field_date_start")}
            <input type="date" name="dateStart" defaultValue={new Date(tournament.dateStart).toISOString().slice(0, 10)} />
          </label>
          <label className="field-row">
            {t("field_date_end")}
            <input type="date" name="dateEnd" defaultValue={new Date(tournament.dateEnd).toISOString().slice(0, 10)} />
          </label>
          <label className="field-row">
            {t("field_format")}
            <select name="format" value={currentFormat} onChange={(e) => setCurrentFormat(e.target.value)} disabled={isLocked} style={isLocked ? { opacity: 0.5 } : undefined}>
              <option value="2v2">2v2</option>
              <option value="3v3">3v3</option>
              <option value="4v4">4v4</option>
              <option value="5v5">5v5</option>
              <option value="ABC">ABC</option>
              <option value="ABC Chapeau">ABC Chapeau</option>
            </select>
          </label>
          <label className="field-row">
            {t("field_game_duration")}
            <input type="number" name="gameDurationMin" defaultValue={tournament.gameDurationMin} />
          </label>
          <label className="field-row">
            {t("field_courts")}
            <input type="number" name="courtsCount" defaultValue={tournament.courtsCount} disabled={isLocked} style={isLocked ? { opacity: 0.5 } : undefined} />
          </label>
          {currentFormat === "ABC Chapeau" && (
            <label className="field-row">
              {t("field_max_solo_players")} <span style={{ fontWeight: 400, color: "var(--text-muted)", fontSize: 11 }}>{t("field_max_solo_players_hint")}</span>
              <input
                type="number"
                min={3}
                value={maxSoloPlayers}
                onChange={(e) => setMaxSoloPlayers(e.target.value)}
                placeholder="Ex: 30"
              />
            </label>
          )}
          {/* ── Bloc inscription ── */}
          <div className="edit-grid-2" style={{ gridColumn: "1 / -1", border: "2px solid var(--teal)", borderRadius: 10, padding: "16px 18px", gap: "16px 24px", background: "color-mix(in srgb, var(--teal) 4%, var(--surface))" }}>
            <p style={{ gridColumn: "1 / -1", margin: 0, fontWeight: 700, fontFamily: "var(--font-display)", fontSize: 13, color: "var(--teal)", letterSpacing: "0.03em" }}>
              {t("section_registration")}
            </p>

            <label className="field-row" style={{ margin: 0 }}>
              {t("field_registration_start")}
              <input type="datetime-local" name="registrationStart" defaultValue={tournament.registrationStart ? new Date(new Date(tournament.registrationStart).getTime() - new Date(tournament.registrationStart).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ""} />
            </label>
            <label className="field-row" style={{ margin: 0 }}>
              {t("field_registration_end")}
              <input
                type="datetime-local"
                name="registrationEnd"
                id="registrationEnd"
                defaultValue={tournament.registrationEnd ? new Date(new Date(tournament.registrationEnd).getTime() - new Date(tournament.registrationEnd).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ""}
              />
            </label>
            <label className="field-row" style={{ margin: 0 }}>
              {t("field_max_teams")}
              <input type="number" name="maxTeams" defaultValue={tournament.maxTeams} disabled={isLocked} style={isLocked ? { opacity: 0.5 } : undefined} />
            </label>
            <label className="field-row" style={{ margin: 0 }}>
              {t("field_registration_fee")}
              <input type="number" name="registrationFeePerTeam" defaultValue={tournament.registrationFeePerTeam} />
            </label>
            <label className="field-row" style={{ margin: 0 }}>
              {t("field_currency")}
              <select name="registrationFeeCurrency" defaultValue={tournament.registrationFeeCurrency ?? "EUR"}>
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>{c.label}</option>
                ))}
              </select>
            </label>
            <label className="field-row" style={{ margin: 0 }}>
              {t("field_contact_email")}
              <input name="contactEmail" defaultValue={tournament.contactEmail} />
            </label>

            {/* Lien externe */}
            <div style={{ gridColumn: "1 / -1", display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
              <label className="field-row" style={{ flex: 1, margin: 0 }}>
                {t("field_external_registration_url")}
                <input
                  name="externalRegistrationUrl"
                  type="url"
                  defaultValue={tournament.externalRegistrationUrl ?? ""}
                  placeholder={t("field_external_registration_url_placeholder")}
                />
              </label>
              <p style={{ fontSize: 11, color: "var(--text-muted)", maxWidth: 220, marginTop: 22, lineHeight: 1.5 }}>
                {t("field_external_registration_url_hint")}
              </p>
            </div>

            {/* Champs personnalisés */}
            <div style={{ gridColumn: "1 / -1", padding: "14px 16px", border: "1.5px solid color-mix(in srgb, var(--teal) 30%, var(--border))", borderRadius: 8, background: "var(--surface)" }}>
              <RegistrationFieldsEditor tournamentId={tournament.id} />
            </div>

            {/* Rush */}
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={rushRegistration}
                  onChange={(e) => setRushRegistration(e.target.checked)}
                  style={{ marginTop: 2, flexShrink: 0, width: "auto" }}
                />
                <span>
                  <strong>{t("rush_registration")}</strong>
                  <span style={{ color: "var(--text-muted)", marginLeft: 6 }}>— {t("rush_registration_desc")}</span>
                  <br />
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    {t("rush_registration_hint")}
                  </span>
                </span>
              </label>
            </div>
          </div>

          {/* ── Format section (presets + lock) — masquée pour les tournois pipeline
                (leur format = la timeline d'étapes, pilotée dans l'onglet Planning) ── */}
          {!(tournament as any).usesPipeline && (
          <div style={{ gridColumn: "1 / -1", border: "2px solid var(--border)", borderRadius: 10, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Header row */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <p style={{ ...sectionTitleStyle, marginBottom: 0 }}>{t("format_section_title")}</p>
              <button
                type="button"
                className={isLocked ? "ghost" : "primary"}
                onClick={handleToggleLock}
                disabled={lockPending}
                style={{ fontSize: 12, padding: "5px 12px", display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}
              >
                {lockPending ? "…" : isLocked ? "🔒 " + t("locked") : "🔓 " + t("unlocked")}
              </button>
            </div>

            {/* Info panel */}
            {showFormatInfo && (
              <div style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "12px 14px", fontSize: 12, color: "var(--text-muted)", display: "flex", flexDirection: "column", gap: 8 }}>
                <p style={{ margin: 0, fontWeight: 700, color: "var(--text)", fontSize: 12 }}>{t("format_info_title")}</p>
                <p style={{ margin: 0 }}>{t("format_info_body")}</p>
                <p style={{ margin: 0 }}>🔒 {t("format_lock_info")}</p>
              </div>
            )}

            {isLocked && (
              <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
                {t("locked_fields_notice")}
              </p>
            )}

            {/* Standard presets — grille fixe 3 colonnes */}
            <div>
              <p style={{ ...subTitleStyle, marginBottom: 8 }}>{t("format_standard")}</p>
              <div className="grid-3col">
                {([
                  ["pool_de",   t("preset_pool_de"),   t("preset_pool_de_desc")],
                  ["pool_se",   t("preset_pool_se"),   t("preset_pool_se_desc")],
                  ["2pools_de", t("preset_2pools_de"), t("preset_2pools_de_desc")],
                  ["2pools_se", t("preset_2pools_se"), t("preset_2pools_se_desc")],
                  ["swiss_de",  t("preset_swiss_de"),  t("preset_swiss_de_desc")],
                  ["swiss_se",  t("preset_swiss_se"),  t("preset_swiss_se_desc")],
                  ["swiss6_split_se", t("preset_swiss6_split_se"), t("preset_swiss6_split_se_desc")],
                ] as [FormatPreset, string, string][]).map(([key, label, sub]) => {
                  const active = formatPreset === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={isLocked}
                      onClick={() => selectPreset(key)}
                      style={{
                        padding: "8px 10px", borderRadius: 8,
                        border: "2px solid var(--border)",
                        outline: active ? "2px solid var(--border)" : "none",
                        outlineOffset: 0,
                        background: active ? "color-mix(in srgb, var(--primary) 18%, var(--bg-panel))" : "var(--bg-panel)",
                        color: "var(--text)",
                        cursor: isLocked ? "not-allowed" : "pointer", opacity: isLocked ? 0.5 : 1,
                        textAlign: "left", width: "100%",
                      }}
                    >
                      <div style={{ fontWeight: 700, fontSize: 12 }}>{label}</div>
                      <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>{sub}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Special presets */}
            <div>
              <p style={{ ...subTitleStyle, marginBottom: 8 }}>{t("format_special")}</p>
              <div className="grid-2col">
                {([
                  ["cross_pool_bcn", t("preset_cross_pool_bcn"), t("preset_cross_pool_bcn_desc")],
                  ["berlin_mixed",   "🐻 Berlin Mixed",          "3 jours · 2×Swiss Ven · 2×Swiss Sam · Grand Swiss + Top32/Bottom16 Dim"],
                  ["graz",           "🇦🇹 Graz",                  "2 jours · 2×RR Poules · Regroup 4 groupes · SE Top 8"],
                  ["mtp_open",       "MTP Open",                 "2 jours · Pool A + Pool B (sam.) · Barrage SE×4 + DE×16 (dim.)"],
                  ["split_se",       t("preset_split_se"),       t("preset_split_se_desc")],
                  ["kiosque",        "Kiosque",                  "2 pools Swiss J1 → Top 4 (2 rounds) + Bottom 12 (3 rounds) → SE × 8"],
                  ["big_apple",      "🍎 Big Apple",             "2 jours · 2×RR Poules (sam.) · Swiss 3 rounds (3-8) + Placement 1&2 · SE Top 8"],
                  ["custom",         t("format_custom"),         t("format_custom_desc")],
                ] as [FormatPreset, string, string][]).map(([key, label, sub]) => {
                  const active = formatPreset === key;
                  const isCustom = key === "custom";
                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={isLocked}
                      onClick={() => selectPreset(key)}
                      style={{
                        padding: "8px 12px", borderRadius: 8,
                        border: "2px solid var(--border)",
                        outline: active ? "2px solid var(--border)" : "none",
                        outlineOffset: 0,
                        background: active ? "color-mix(in srgb, var(--primary) 18%, var(--bg-panel))" : "var(--bg-panel)",
                        color: "var(--text)",
                        cursor: isLocked ? "not-allowed" : "pointer", opacity: isLocked ? 0.5 : 1,
                        textAlign: "left", width: "100%",
                      }}
                    >
                      <div style={{ fontWeight: 700, fontSize: 12 }}>{label}</div>
                      <div style={{ fontSize: 10, opacity: 0.8, marginTop: 2 }}>{sub}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Format constraint warnings */}
            {(formatPreset === "swiss_de" || formatPreset === "swiss_se") && (
              <div style={{ fontSize: 12, color: "var(--orange)", background: "color-mix(in srgb, var(--orange) 10%, var(--bg-panel))", border: "1px solid var(--orange)", borderRadius: 8, padding: "8px 12px" }}>
                ⚠ {t("format_warn_swiss_even")}
              </div>
            )}
            {formatPreset === "swiss6_split_se" && (
              <div style={{ fontSize: 12, color: "var(--orange)", background: "color-mix(in srgb, var(--orange) 10%, var(--bg-panel))", border: "1px solid var(--orange)", borderRadius: 8, padding: "8px 12px" }}>
                ⚠ {t("format_warn_split_se_min18")}
              </div>
            )}
            {formatPreset === "cross_pool_bcn" && (
              <div style={{ fontSize: 12, color: "var(--orange)", background: "color-mix(in srgb, var(--orange) 10%, var(--bg-panel))", border: "1px solid var(--orange)", borderRadius: 8, padding: "8px 12px" }}>
                ⚠ {t("format_warn_cross_pool_equal")}
              </div>
            )}

            {/* Hidden inputs for preset values (when not locked — locked case handled above) */}
            {!isLocked && formatPreset !== "custom" && <>
              <input type="hidden" name="saturdayFormat" value={presetConfig.saturdayFormat} />
              <input type="hidden" name="poolCount" value={presetConfig.poolCount} />
              {/* swissRounds: hidden by default, overridden by visible input below for swiss presets */}
              {!["swiss_de", "swiss_se", "swiss6_split_se", "mtp_open"].includes(formatPreset) && (
                <input type="hidden" name="swissRounds" value={presetConfig.swissRounds} />
              )}
              <input type="hidden" name="poolRounds" value={poolRounds} />
              {!["swiss_de", "swiss_se"].includes(formatPreset) && (
                <input type="hidden" name="bracketSize" value={presetConfig.bracketSize} />
              )}
              <input type="hidden" name="sundayFormat" value={presetConfig.sundayFormat} />
              <input type="hidden" name="crossPool" value={presetConfig.crossPool ? "true" : ""} />
              <input type="hidden" name="thirdPlaceMatch" value={String(presetConfig.thirdPlaceMatch)} />
              <input type="hidden" name="gfReset" value={String(presetConfig.gfReset)} />
            </>}

            {/* Options supplémentaires pour les presets standards (3e place en SE, GF reset en DE) */}
            {!isLocked && formatPreset !== "custom" && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 16, paddingTop: 2, alignItems: "center" }}>
                {["swiss_de", "swiss_se", "swiss6_split_se", "mtp_open"].includes(formatPreset) && (<>
                  <label style={{ display: "flex", flexDirection: "row", gap: 8, alignItems: "center", fontSize: 13 }}>
                    {t("field_swiss_rounds")}
                    <input
                      type="number"
                      name="swissRounds"
                      value={presetConfig.swissRounds}
                      min={1}
                      max={20}
                      onChange={(e) => setPresetConfig((p) => ({ ...p, swissRounds: Number(e.target.value) }))}
                      style={{ width: 60 }}
                    />
                  </label>
                  {["swiss_de", "swiss_se"].includes(formatPreset) && (
                    <label style={{ display: "flex", flexDirection: "row", gap: 8, alignItems: "center", fontSize: 13 }}>
                      {t("field_bracket_size")}
                      <input
                        type="number"
                        name="bracketSize"
                        value={presetConfig.bracketSize}
                        min={2}
                        max={64}
                        onChange={(e) => setPresetConfig((p) => ({ ...p, bracketSize: Number(e.target.value) }))}
                        style={{ width: 60 }}
                      />
                    </label>
                  )}
                </>)}
                {presetConfig.sundayFormat === "SE" && (
                  <label style={{ display: "flex", flexDirection: "row", gap: 8, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={presetConfig.thirdPlaceMatch}
                      onChange={(e) => setPresetConfig((p) => ({ ...p, thirdPlaceMatch: e.target.checked }))}
                      style={{ width: "auto", flexShrink: 0 }}
                    />
                    {t("option_third_place")}
                  </label>
                )}
                {presetConfig.sundayFormat === "DE" && (
                  <label style={{ display: "flex", flexDirection: "row", gap: 8, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={presetConfig.gfReset}
                      onChange={(e) => setPresetConfig((p) => ({ ...p, gfReset: e.target.checked }))}
                      style={{ width: "auto", flexShrink: 0 }}
                    />
                    {t("option_gf_reset")}
                  </label>
                )}
              </div>
            )}

            {/* Custom/advanced fields */}
            {!isLocked && formatPreset === "custom" && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, paddingTop: 4 }}>
                <label className="field-row">
                  {t("field_day1_format")}
                  <select name="saturdayFormat" value={presetConfig.saturdayFormat} onChange={(e) => setPresetConfig((p) => ({ ...p, saturdayFormat: e.target.value }))}>
                    <option value="ALL_DAY">{t("saturday_all_day")}</option>
                    <option value="SPLIT_POOLS">{t("saturday_split_pools")}</option>
                    <option value="SWISS">{t("saturday_swiss")}</option>
                  </select>
                </label>
                <label className="field-row">
                  {t("field_pool_count")}
                  <select name="poolCount" value={String(presetConfig.poolCount)} onChange={(e) => setPresetConfig((p) => ({ ...p, poolCount: Number(e.target.value) }))}>
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                    <option value="4">4</option>
                  </select>
                </label>
                <label className="field-row">
                  {t("field_swiss_rounds")}
                  <input type="number" name="swissRounds" value={presetConfig.swissRounds} min={1} max={20} onChange={(e) => setPresetConfig((p) => ({ ...p, swissRounds: Number(e.target.value) }))} />
                </label>
                <label className="field-row">
                  {t("field_bracket_size")}
                  <input type="number" name="bracketSize" value={presetConfig.bracketSize} min={2} max={64} onChange={(e) => setPresetConfig((p) => ({ ...p, bracketSize: Number(e.target.value) }))} />
                </label>
                <label className="field-row">
                  {t("field_day2_format")}
                  <select name="sundayFormat" value={presetConfig.sundayFormat} onChange={(e) => setPresetConfig((p) => ({ ...p, sundayFormat: e.target.value }))}>
                    <option value="SE">{t("sunday_single_elim")}</option>
                    <option value="DE">{t("sunday_double_elim")}</option>
                    <option value="SPLIT_SE">{t("sunday_split_se")}</option>
                  </select>
                </label>
                <label className="field-row">
                  {t("field_scoring_system")}
                  <select name="scoringSystem" defaultValue={tournament.scoringSystem ?? "3/1"}>
                    <option value="3/1">{t("scoring_classic")}</option>
                    <option value="1/0.5">{t("scoring_challonge")}</option>
                  </select>
                </label>
                <label style={{ display: "flex", flexDirection: "row", gap: 8, alignItems: "flex-start", fontSize: 13, cursor: "pointer", gridColumn: "1 / -1" }}>
                  <input type="checkbox" name="crossPool" value="true" checked={presetConfig.crossPool} onChange={(e) => setPresetConfig((p) => ({ ...p, crossPool: e.target.checked }))} style={{ marginTop: 3, flexShrink: 0, width: "auto" }} />
                  <span>{t("option_cross_pool")} <span style={{ color: "var(--text-muted)", fontSize: 12 }}>— {t("option_cross_pool_desc")}</span></span>
                </label>
                <label style={{ display: "flex", flexDirection: "row", gap: 8, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
                  <input type="checkbox" name="thirdPlaceMatch" value="true" checked={presetConfig.thirdPlaceMatch} onChange={(e) => setPresetConfig((p) => ({ ...p, thirdPlaceMatch: e.target.checked }))} style={{ width: "auto" }} />
                  {t("option_third_place")}
                </label>
                <label style={{ display: "flex", flexDirection: "row", gap: 8, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
                  <input type="checkbox" name="gfReset" value="true" checked={presetConfig.gfReset} onChange={(e) => setPresetConfig((p) => ({ ...p, gfReset: e.target.checked }))} style={{ width: "auto" }} />
                  {t("option_gf_reset")}
                </label>
              </div>
            )}

            {/* Pool rounds limit — visible for POOL formats */}
            {(presetConfig.saturdayFormat === "ALL_DAY" || presetConfig.saturdayFormat === "SPLIT_POOLS") && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, margin: 0 }}>
                  {t("field_pool_rounds")}
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={poolRounds}
                    onChange={(e) => setPoolRounds(e.target.value)}
                    placeholder={t("field_pool_rounds_placeholder")}
                    style={{ width: 70 }}
                  />
                </label>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{t("field_pool_rounds_hint")}</span>
              </div>
            )}

            {/* Résumé + scoring (pour tous les modes) */}
            <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
              {formatPreset !== "custom" && (
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  <strong>{t("format_summary_label")}</strong>{" "}
                  {presetConfig.saturdayFormat === "MTP_OPEN"
                    ? "Pool A (sam. matin) + Pool B (sam. après-midi) → Barrage SE×4 → DE×16"
                    : presetConfig.saturdayFormat === "GRAZ"
                    ? "2×RR Poules → Regroup 4 groupes → SE Top 8"
                    : presetConfig.saturdayFormat === "BIG_APPLE"
                    ? "2×RR Poules (sam.) → Swiss 3 rounds (3-8) + Placement 1&2 → SE Top 8"
                    : presetConfig.saturdayFormat === "ALL_DAY"
                    ? t("format_summary_pool1")
                    : presetConfig.saturdayFormat === "SPLIT_POOLS"
                      ? `${presetConfig.poolCount} ${t("format_summary_pools")}`
                      : `${t("format_summary_swiss")} (${presetConfig.swissRounds} ${t("format_summary_rounds")})`}
                  {" → "}{presetConfig.crossPool ? `${t("format_summary_crosspool")} ` : ""}
                  {presetConfig.sundayFormat === "DE" ? t("format_summary_de") : t("format_summary_se")}
                  {presetConfig.thirdPlaceMatch ? ` · ${t("format_summary_3rd")}` : ""}
                  {presetConfig.gfReset ? ` · ${t("format_summary_gf")}` : ""}
                </div>
              )}
              {formatPreset !== "custom" && (
                <label className="field-row" style={{ maxWidth: 280 }}>
                  {t("field_scoring_system")}
                  <select name="scoringSystem" defaultValue={tournament.scoringSystem ?? "3/1"}>
                    <option value="3/1">{t("scoring_classic")}</option>
                    <option value="1/0.5">{t("scoring_challonge")}</option>
                  </select>
                </label>
              )}
            </div>

            {/* Request custom format */}
            <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
              {!showFormatContact ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12, color: "var(--text-muted)", flex: 1 }}>
                    {t("format_request_custom_desc")}
                  </span>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => { setShowFormatContact(true); setContactStatus("idle"); }}
                    style={{ fontSize: 12, padding: "5px 12px", whiteSpace: "nowrap" }}
                  >
                    {t("format_request_custom_btn")} ✉
                  </button>
                </div>
              ) : contactStatus === "ok" ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 13 }}>✅</span>
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("format_contact_sent")}</span>
                  <button type="button" className="ghost" onClick={() => { setShowFormatContact(false); setContactStatus("idle"); setContactName(""); setContactEmail(""); setContactMessage(""); }} style={{ fontSize: 11, padding: "3px 8px", marginLeft: "auto" }}>✕</button>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <p style={{ ...subTitleStyle, marginBottom: 0 }}>{t("format_request_custom")}</p>
                    <button type="button" onClick={() => setShowFormatContact(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 15, lineHeight: 1 }}>✕</button>
                  </div>
                  <div className="edit-grid-2" style={{ gap: 10 }}>
                    <label className="field-row">
                      {t("contact_name")}
                      <input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder={t("contact_name_placeholder")} required />
                    </label>
                    <label className="field-row">
                      {t("contact_email")}
                      <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="you@example.com" required />
                    </label>
                  </div>
                  <label className="field-row">
                    {t("contact_message")}
                    <textarea value={contactMessage} onChange={(e) => setContactMessage(e.target.value)} rows={3} placeholder={t("contact_message_placeholder")} required style={{ resize: "vertical" }} />
                  </label>
                  {contactStatus === "error" && (
                    <p style={{ color: "var(--danger)", fontSize: 12, margin: 0 }}>{contactError}</p>
                  )}
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button type="button" className="ghost" onClick={() => setShowFormatContact(false)} style={{ fontSize: 12 }}>{t("contact_cancel")}</button>
                    <button
                      type="button"
                      className="primary"
                      disabled={contactStatus === "sending" || !contactName || !contactEmail || !contactMessage}
                      onClick={sendFormatContact}
                      style={{ fontSize: 12 }}
                    >
                      {contactStatus === "sending" ? "…" : t("contact_send")}
                    </button>
                  </div>
                </div>
              )}
            </div>

          </div>
          )}

          {/* Pipeline : le format vit dans l'onglet Étapes */}
          {(tournament as any).usesPipeline && (
            <div style={{ gridColumn: "1 / -1", border: "2px dashed var(--border)", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "var(--text-muted)" }}>
              🧩 {t("pipeline_format_hint")}
            </div>
          )}

          {/* ── Statut & visibilité ── */}
          <div style={{ gridColumn: "1 / -1", border: "2px solid var(--border)", borderRadius: 10, padding: "16px 18px", display: "grid", gap: 12 }}>
            <p style={{ ...sectionTitleStyle, marginBottom: 0 }}>{t("section_status_visibility")}</p>
            <label className="field-row" style={{ margin: 0, maxWidth: 280 }}>
              {t("field_status")}
              <select name="status" defaultValue={tournament.status}>
                <option value="UPCOMING">{t("status_upcoming")}</option>
                <option value="LIVE">{t("status_live")}</option>
                <option value="COMPLETED">{t("status_completed")}</option>
              </select>
            </label>
            <div style={{ border: "1.5px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
              <label style={{ display: "flex", flexDirection: "row", gap: 12, alignItems: "center", fontSize: 13, cursor: "pointer", padding: "12px 16px", background: testMode ? "color-mix(in srgb, var(--yellow) 8%, var(--surface))" : "var(--bg-secondary)", margin: 0 }}>
                <input
                  type="checkbox"
                  checked={testMode}
                  onChange={(e) => handleTestModeChange(e.target.checked)}
                  style={{ width: 18, height: 18, cursor: "pointer", flexShrink: 0 }}
                />
                <span style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>🧪 {t("field_test_mode")}</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{t("field_test_mode_desc")}</div>
                </span>
              </label>
              {testMode && (
                <div style={{ borderTop: "1px solid var(--border)", padding: "10px 16px 10px 46px", background: "var(--bg-secondary)" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 13, margin: 0 }}>
                    <input
                      type="checkbox"
                      checked={hidden}
                      onChange={(e) => setHidden(e.target.checked)}
                      style={{ width: 16, height: 16, cursor: "pointer", flexShrink: 0 }}
                    />
                    <span>
                      <div style={{ fontWeight: 600 }}>👁 {t("field_hidden")}</div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 1 }}>{t("field_hidden_desc")}</div>
                    </span>
                  </label>
                </div>
              )}
            </div>
          </div>

          {/* ── Diffusion & communication ── */}
          <div className="edit-grid-2" style={{ gridColumn: "1 / -1", border: "2px solid var(--border)", borderRadius: 10, padding: "16px 18px", gap: "16px 24px" }}>
            <p style={{ ...sectionTitleStyle, gridColumn: "1 / -1", marginBottom: 0 }}>{t("section_communication")}</p>
            <label className="field-row" style={{ margin: 0 }}>
              {t("field_stream_youtube")}
              <input id="streamYoutubeUrl" name="streamYoutubeUrl" defaultValue={tournament.streamYoutubeUrl ?? ""} />
            </label>
            <label className="field-row" style={{ margin: 0 }}>
              {t("field_stream_court1" as any) ?? "Stream Court 1"}
              <input id="streamCourt1Url" name="streamCourt1Url" defaultValue={tournament.streamCourt1Url ?? ""} placeholder="https://youtube.com/live/..." />
            </label>
            <label className="field-row" style={{ margin: 0 }}>
              {t("field_stream_court2" as any) ?? "Stream Court 2"}
              <input id="streamCourt2Url" name="streamCourt2Url" defaultValue={tournament.streamCourt2Url ?? ""} placeholder="https://youtube.com/live/..." />
            </label>
            <label className="field-row" style={{ margin: 0 }}>
              {t("field_stream_multiplex" as any) ?? "Stream Multiplex (QCQC)"}
              <input id="streamMultiplexUrl" name="streamMultiplexUrl" defaultValue={tournament.streamMultiplexUrl ?? ""} placeholder="https://youtube.com/live/..." />
            </label>
            <label className="field-row" style={{ margin: 0 }}>
              {t("field_telegram")}
              <input name="telegramUrl" defaultValue={tournament.telegramUrl ?? ""} placeholder="https://t.me/mongroupe" />
            </label>
            <label className="field-row" style={{ margin: 0 }}>
              {t("field_chat")}
              <select name="chatMode" defaultValue={tournament.chatMode ?? "DISABLED"}>
                <option value="DISABLED">{t("chat_disabled")}</option>
                <option value="OPEN">{t("chat_open")}</option>
                <option value="ORG_ONLY">{t("chat_org_only")}</option>
              </select>
            </label>
          </div>
        </div>

        {/* ── Affiche / Bannière ── */}
        <div>
          <p style={sectionTitleStyle}>{t("section_banner")}</p>
          <input type="hidden" name="bannerPath" value={bannerPath} />
          {/* Note: the hidden field above must stay inside <form> */}
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
            {bannerPath && (
              <div style={{ position: "relative", display: "inline-block" }}>
                <Image
                  src={bannerPath}
                  alt={t("banner_alt")}
                  width={71}
                  height={100}
                  style={{ height: 100, width: "auto", borderRadius: 8, border: "2px solid var(--border)", objectFit: "cover" }}
                />
                <button type="button" onClick={() => setBannerPath("")} style={{ position: "absolute", top: -8, right: -8, background: "var(--danger)", color: "#fff", border: "none", borderRadius: "50%", width: 22, height: 22, minWidth: 22, minHeight: 22, padding: 0, cursor: "pointer", fontSize: 12, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
              </div>
            )}
            <div>
              <input ref={bannerInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleBannerUpload} />
              <button type="button" className="ghost" style={{ fontSize: 12 }} onClick={() => bannerInputRef.current?.click()} disabled={bannerUploading}>
                {bannerUploading ? t("banner_uploading") : bannerPath ? t("banner_change") : t("banner_upload")}
              </button>
              {bannerError && (
                <p style={{ color: "var(--danger)", fontSize: 12, marginTop: 6 }}>{bannerError}</p>
              )}
              {!bannerPath && (
                <div style={{ marginTop: 8 }}>
                  <input placeholder={t("banner_paste_url")} value={bannerPath} onChange={(e) => setBannerPath(e.target.value)} style={{ fontSize: 12 }} />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Lieux ── */}
        <div>
          <p style={sectionTitleStyle}>{t("section_venues")}</p>
          <div style={{ display: "grid", gap: 16 }}>
            {/* Adresse du terrain */}
            <div style={{ display: "grid", gap: 8 }}>
              <p style={subTitleStyle}>{t("venue_court_address")}</p>
              <div className="edit-grid-3">
                <label className="field-row">
                  {t("venue_name")}
                  <input name="venueName" defaultValue={tournament.venueName ?? ""} placeholder={t("venue_name_placeholder")} />
                </label>
                <label className="field-row">
                  {t("venue_address")}
                  <input name="venueAddress" defaultValue={tournament.venueAddress ?? ""} placeholder={t("venue_address_placeholder")} />
                </label>
                <label className="field-row">
                  {t("venue_maps_link")}
                  <input name="venueMapsUrl" defaultValue={tournament.venueMapsUrl ?? ""} placeholder="https://maps.google.com/..." />
                </label>
              </div>
            </div>

            {/* Hidden fields for saturday event (keep data but don't show UI) */}
            <input type="hidden" name="saturdayEventName" value={tournament.saturdayEventName ?? ""} />
            <input type="hidden" name="saturdayEventAddress" value={tournament.saturdayEventAddress ?? ""} />
            <input type="hidden" name="saturdayEventMapsUrl" value={tournament.saturdayEventMapsUrl ?? ""} />

            <div className="edit-grid-2">
              {/* Accueil vendredi */}
              <div style={{ display: "grid", gap: 8 }}>
                <p style={subTitleStyle}>{t("venue_friday_welcome")} <span style={{ fontWeight: 400 }}>({t("optional")})</span></p>
                <label className="field-row">
                  {t("venue_name")}
                  <input name="fridayWelcomeName" defaultValue={tournament.fridayWelcomeName ?? ""} placeholder={t("venue_friday_name_placeholder")} />
                </label>
                <label className="field-row">
                  {t("venue_address")}
                  <input name="fridayWelcomeAddress" defaultValue={tournament.fridayWelcomeAddress ?? ""} placeholder={t("venue_friday_address_placeholder")} />
                </label>
                <label className="field-row">
                  Maps
                  <input name="fridayWelcomeMapsUrl" defaultValue={tournament.fridayWelcomeMapsUrl ?? ""} />
                </label>
              </div>

              {/* Soirée samedi */}
              <div style={{ display: "grid", gap: 8 }}>
                <p style={subTitleStyle}>{t("venue_saturday_evening")} <span style={{ fontWeight: 400 }}>({t("optional")})</span></p>
                <label className="field-row">
                  {t("venue_name")}
                  <input name="saturdayEveningName" defaultValue={tournament.saturdayEveningName ?? ""} placeholder={t("venue_saturday_name_placeholder")} />
                </label>
                <label className="field-row">
                  {t("venue_address")}
                  <input name="saturdayEveningAddress" defaultValue={tournament.saturdayEveningAddress ?? ""} />
                </label>
                <label className="field-row">
                  Maps
                  <input name="saturdayEveningMapsUrl" defaultValue={tournament.saturdayEveningMapsUrl ?? ""} />
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* ── Hébergement ── */}
        <div>
          <p style={sectionTitleStyle}>{t("section_accommodation")}</p>
          <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "8px 12px", borderRadius: 8, border: `2px solid ${accommodation ? "var(--teal)" : "var(--border)"}`, background: accommodation ? "color-mix(in srgb, var(--teal) 8%, var(--surface))" : "var(--surface)", fontSize: 13, transition: "border-color 0.15s, background 0.15s", marginBottom: 10 }}>
            <input type="checkbox" checked={accommodation} onChange={(e) => setAccommodation(e.target.checked)} style={{ accentColor: "var(--teal)", width: 15, height: 15 }} />
            <span style={{ fontWeight: accommodation ? 700 : 400 }}>{t("accommodation_available")}</span>
          </label>
          {accommodation && (
            <div className="edit-grid-2" style={{ paddingLeft: 4 }}>
              <label className="field-row">
                {t("accommodation_type")}
                <input value={accommodationType} onChange={(e) => setAccommodationType(e.target.value)} placeholder={t("accommodation_type_placeholder")} />
              </label>
              <label className="field-row">
                {t("accommodation_capacity")}
                <input type="number" value={accommodationCapacity} onChange={(e) => setAccommodationCapacity(e.target.value)} placeholder={t("accommodation_capacity_placeholder")} />
              </label>
            </div>
          )}
        </div>

        {/* ── Repas dynamiques ── */}
        <div>
          <p style={sectionTitleStyle}>{t("section_meals", { count: days })}</p>
          <div style={{ display: "grid", gap: 8 }}>
            {meals.slice(0, days).map((m, i) => (
              <div key={i} className="meal-row">
                <span className="meal-row-label">
                  {dayLabel(i, days, tournament.dateStart, t("day"), locale)}
                </span>
                <div className="meal-row-checks">
                  {(["breakfast", "lunch", "dinner"] as const).map((meal) => {
                    const labels = { breakfast: t("meal_breakfast"), lunch: t("meal_lunch"), dinner: t("meal_dinner") };
                    const active = m[meal];
                    return (
                      <label key={meal} style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 12, fontWeight: active ? 700 : 400, color: active ? "var(--text)" : "var(--text-muted)" }}>
                        <input type="checkbox" checked={active} onChange={() => toggleMeal(i, meal)} style={{ accentColor: "var(--teal)", width: 13, height: 13 }} />
                        {labels[meal]}
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Kit list ── */}
        <div>
          <p style={sectionTitleStyle}>{t("section_kit_list")}</p>
          <textarea
            value={kitList}
            onChange={(e) => setKitList(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder={t("kit_list_placeholder")}
            style={{ resize: "vertical", fontFamily: "inherit", fontSize: 13, width: "100%" }}
          />
        </div>

        {/* ── Informations complémentaires ── */}
        <div>
          <p style={sectionTitleStyle}>{t("section_additional_info")}</p>
          <textarea
            value={additionalInfo}
            onChange={(e) => setAdditionalInfo(e.target.value)}
            rows={4}
            maxLength={2000}
            placeholder={t("additional_info_placeholder")}
            style={{ resize: "vertical", fontFamily: "inherit", fontSize: 13, width: "100%" }}
          />
        </div>

        {/* ── FAQ ── */}
        <div>
          <p style={sectionTitleStyle}>{t("section_faq")}</p>
          <div style={{ display: "grid", gap: 10 }}>
            {faq.map((item, i) => (
              <div key={i} style={{ display: "grid", gap: 6, padding: "10px 12px", borderRadius: 8, border: "2px solid var(--border)", background: "var(--surface)", position: "relative" }}>
                <button type="button" onClick={() => removeFaq(i)} style={{ position: "absolute", top: 6, right: 8, background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "var(--text-muted)" }}>✕</button>
                <input
                  value={item.question}
                  onChange={(e) => updateFaq(i, "question", e.target.value)}
                  placeholder={t("faq_question_placeholder")}
                  style={{ fontWeight: 700, fontSize: 13 }}
                />
                <textarea
                  value={item.answer}
                  onChange={(e) => updateFaq(i, "answer", e.target.value)}
                  placeholder={t("faq_answer_placeholder")}
                  rows={2}
                  style={{ resize: "vertical", fontFamily: "inherit", fontSize: 13 }}
                />
              </div>
            ))}
          </div>
          <button type="button" className="ghost" style={{ fontSize: 12, marginTop: 8 }} onClick={addFaq}>
            {t("faq_add")}
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            className="primary"
            type="submit"
            disabled={isPending}
            style={{ width: "fit-content" }}
          >
            {isPending ? t("saving") : t("save")}
          </button>
          {saved && (
            <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 13, color: "var(--teal)" }}>
              ✓ {t("saved_success")}
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
