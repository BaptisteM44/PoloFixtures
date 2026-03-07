"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import ReactMarkdown from "react-markdown";

type Team = { id: string; name: string } | null;

type Props = {
  tournament: {
    id: string;
    name: string;
    bannerPath: string | null;
    recapText: string | null;
    photoFinishPath: string | null;
    podiumNote: string | null;
  };
  podium: { first: Team; second: Team; third: Team };
  isOrga: boolean;
};

export function TournamentRecap({ tournament, podium, isOrga }: Props) {
  const t = useTranslations("tournament");
  const [isPending, startTransition] = useTransition();

  const [recapText, setRecapText]         = useState(tournament.recapText ?? "");
  const [photoFinish, setPhotoFinish]     = useState(tournament.photoFinishPath ?? "");
  const [podiumNote, setPodiumNote]       = useState(tournament.podiumNote ?? "");

  const [editingText, setEditingText]     = useState(false);
  const [editingNote, setEditingNote]     = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const api = `/api/tournaments/${tournament.id}/recap`;

  const save = (data: Record<string, string | null>) => {
    startTransition(async () => {
      await fetch(api, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    });
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    if (res.ok) {
      const { path } = await res.json();
      setPhotoFinish(path);
      save({ photoFinishPath: path });
    }
    setUploadingPhoto(false);
  };

  const medals = [
    { place: "second", medal: "🥈", team: podium.second, label: t("recap_2nd") },
    { place: "first",  medal: "🥇", team: podium.first,  label: t("recap_1st") },
    { place: "third",  medal: "🥉", team: podium.third,  label: t("recap_3rd") },
  ];

  return (
    <div className="recap-page">

      {/* ── Bannière hero ── */}
      {tournament.bannerPath && (
        <div className="recap-hero">
          <img src={tournament.bannerPath} alt={tournament.name} />
          <div className="recap-hero__overlay">
            <h2 className="recap-hero__title">{tournament.name}</h2>
          </div>
        </div>
      )}

      {/* ── Podium ── */}
      <section className="recap-section">
        <h3 className="recap-section__title">{t("recap_podium_title")}</h3>
        {!podium.first && !podium.second ? (
          <p className="meta" style={{ textAlign: "center", padding: 20 }}>{t("recap_no_podium")}</p>
        ) : (
          <div className="recap-podium">
            {medals.map(({ place, medal, team, label }) => (
              <div key={place} className={`recap-podium__card recap-podium__card--${place}`}>
                <span className="recap-podium__medal">{medal}</span>
                <span className="recap-podium__label">{label}</span>
                <strong className="recap-podium__team">{team?.name ?? "—"}</strong>
              </div>
            ))}
          </div>
        )}

        {/* Note podium éditable */}
        {(podiumNote || isOrga) && (
          <div className="recap-podium-note">
            {editingNote ? (
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <textarea
                  value={podiumNote}
                  onChange={(e) => setPodiumNote(e.target.value)}
                  placeholder={t("recap_podium_note_placeholder")}
                  rows={2}
                  autoFocus
                  style={{ flex: 1, fontSize: 13, resize: "vertical" }}
                />
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <button className="primary" style={{ fontSize: 11, padding: "4px 10px" }}
                    onClick={() => { setEditingNote(false); save({ podiumNote }); }}
                    disabled={isPending}
                  >{t("recap_text_save")}</button>
                  <button className="ghost" style={{ fontSize: 11, padding: "4px 10px" }}
                    onClick={() => setEditingNote(false)}
                  >✕</button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <p className="meta" style={{ flex: 1, fontStyle: "italic" }}>
                  {podiumNote || <span style={{ opacity: 0.4 }}>{t("recap_podium_note_placeholder")}</span>}
                </p>
                {isOrga && (
                  <button className="ghost recap-edit-btn" onClick={() => setEditingNote(true)}>
                    {t("recap_text_edit")}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── Photo finish ── */}
      <section className="recap-section">
        <h3 className="recap-section__title">{t("recap_photo_finish")}</h3>
        {photoFinish ? (
          <div className="recap-photo-finish">
            <img src={photoFinish} alt="Photo finish" />
            {isOrga && (
              <label className="ghost recap-edit-btn" style={{ marginTop: 8, display: "inline-block", cursor: "pointer" }}>
                {uploadingPhoto ? "…" : t("recap_photo_add")}
                <input type="file" accept="image/*" onChange={handlePhotoUpload} style={{ display: "none" }} />
              </label>
            )}
          </div>
        ) : isOrga ? (
          <label className="recap-photo-placeholder" style={{ cursor: "pointer" }}>
            <span style={{ fontSize: 36 }}>📸</span>
            <span>{uploadingPhoto ? "Upload en cours…" : t("recap_photo_add")}</span>
            <input type="file" accept="image/*" onChange={handlePhotoUpload} style={{ display: "none" }} />
          </label>
        ) : null}
      </section>

      {/* ── Texte récap markdown ── */}
      <section className="recap-section">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 className="recap-section__title" style={{ margin: 0 }}>{t("recap_text_title")}</h3>
          {isOrga && !editingText && (
            <button className="ghost recap-edit-btn" onClick={() => setEditingText(true)}>
              {t("recap_text_edit")}
            </button>
          )}
        </div>

        {editingText ? (
          <div>
            <textarea
              value={recapText}
              onChange={(e) => setRecapText(e.target.value)}
              placeholder={t("recap_text_placeholder")}
              rows={12}
              style={{ width: "100%", fontSize: 14, resize: "vertical", fontFamily: "monospace" }}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button className="primary" style={{ fontSize: 13, padding: "6px 16px" }}
                onClick={() => { setEditingText(false); save({ recapText }); }}
                disabled={isPending}
              >{t("recap_text_save")}</button>
              <button className="ghost" style={{ fontSize: 13, padding: "6px 16px" }}
                onClick={() => setEditingText(false)}
              >Annuler</button>
            </div>
          </div>
        ) : recapText ? (
          <div className="recap-text">
            <ReactMarkdown>{recapText}</ReactMarkdown>
          </div>
        ) : isOrga ? (
          <button className="ghost" style={{ width: "100%", padding: 24, fontSize: 13, color: "var(--text-muted)" }}
            onClick={() => setEditingText(true)}
          >
            + {t("recap_text_placeholder")}
          </button>
        ) : null}
      </section>

    </div>
  );
}
