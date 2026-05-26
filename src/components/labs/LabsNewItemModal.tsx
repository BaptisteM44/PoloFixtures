"use client";

import { useState, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";

const TYPE_OPTIONS = [
  { value: "idea",        label: "type_idea",        desc: "type_idea_desc" },
  { value: "bug",         label: "type_bug",         desc: "type_bug_desc" },
  { value: "translation", label: "type_translation", desc: "type_translation_desc" },
];

interface Props {
  playerId: string | null;
  charterAccepted: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function LabsNewItemModal({ playerId, charterAccepted: _charterAccepted, onClose, onCreated }: Props) {
  const t = useTranslations("labs");
  const [type, setType] = useState<"idea" | "bug" | "translation">("idea");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [anonName, setAnonName] = useState("");
  const [charterAgreed, setCharterAgreed] = useState(false);
  const [postAnon, setPostAnon] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const canSubmit = title.trim().length >= 10 && body.trim().length >= 20 && (!playerId ? charterAgreed : true);

  const effectiveAuthorName = !playerId
    ? (anonName.trim() || "Anonyme")
    : (postAnon ? (anonName.trim() || "Anonyme") : undefined);

  const submit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/community/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          title: title.trim(),
          body: body.trim(),
          authorName: effectiveAuthorName,
        }),
      });
      if (res.ok) {
        onCreated();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? t("submit_error"));
      }
    } catch {
      setError(t("submit_error"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      ref={backdropRef}
      onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(0,0,0,0.65)",
        zIndex: 2000,
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        padding: "16px 12px", overflowY: "auto",
      }}
    >
      <div
        style={{
          width: "100%", maxWidth: 560,
          background: "var(--bg)",
          border: "2px solid var(--border)",
          borderRadius: 10,
          boxShadow: "6px 6px 0 var(--border)",
          overflow: "hidden",
          marginTop: 32,
          marginBottom: 40,
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 18px",
          background: "var(--surface-2)",
          borderBottom: "2px solid var(--border)",
        }}>
          <h2 style={{
            fontFamily: "var(--font-display)",
            fontSize: 18, fontWeight: 900,
            margin: 0,
          }}>
            {t("modal_new_title")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="header-icon-btn"
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "20px 20px" }}>
          {/* Bannière constructive */}
          <div style={{
            background: "color-mix(in srgb, var(--yellow) 18%, var(--surface))",
            border: "2px solid var(--yellow)",
            borderRadius: 6, padding: "10px 14px",
            marginBottom: 16,
            fontSize: 12, lineHeight: 1.5, color: "var(--text)",
            fontWeight: 600,
          }}>
            {t("constructive_banner")}
          </div>

          {/* Type */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)", display: "block", marginBottom: 8 }}>
              {t("field_type")}
            </label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setType(opt.value as typeof type)}
                  title={t(opt.desc as any)}
                  style={{
                    fontSize: 13, fontWeight: 700,
                    padding: "8px 14px",
                    border: "2px solid var(--border)",
                    borderRadius: 6,
                    cursor: "pointer",
                    background: type === opt.value ? "var(--text)" : "var(--surface)",
                    color: type === opt.value ? "var(--bg)" : "var(--text)",
                    boxShadow: type === opt.value ? "none" : "2px 2px 0 var(--border)",
                    transform: type === opt.value ? "translate(2px, 2px)" : "none",
                    transition: "all 0.1s",
                  }}
                >
                  {t(opt.label as any)}
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)", display: "block", marginBottom: 6 }}>
              {t("field_title")}
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("title_placeholder")}
              maxLength={120}
              style={{
                width: "100%", padding: "10px 12px", fontSize: 14,
                border: "2px solid var(--border)", borderRadius: 6,
                background: "var(--surface)", color: "var(--text)",
                fontFamily: "var(--font-body)", boxSizing: "border-box",
              }}
            />
            <div style={{ fontSize: 11, color: title.trim().length < 10 ? "#e67e22" : "var(--teal)", textAlign: "right", marginTop: 3, fontWeight: 600 }}>
              {title.length < 10 ? `${title.length}/10 min` : `${title.length}/120 ✓`}
            </div>
          </div>

          {/* Body */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)", display: "block", marginBottom: 6 }}>
              {t("field_details")}
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={t("details_placeholder")}
              rows={5}
              maxLength={2000}
              style={{
                width: "100%", padding: "10px 12px", fontSize: 13,
                border: "2px solid var(--border)", borderRadius: 6,
                background: "var(--surface)", color: "var(--text)",
                resize: "vertical", fontFamily: "var(--font-body)",
                boxSizing: "border-box",
              }}
            />
            <div style={{ fontSize: 11, color: body.trim().length < 20 ? "#e67e22" : "var(--teal)", textAlign: "right", marginTop: 3, fontWeight: 600 }}>
              {body.length < 20 ? `${body.length}/20 min` : `${body.length}/2000 ✓`}
            </div>
          </div>

          {/* Toggle anonyme (utilisé connecté OU non connecté) */}
          {playerId && (
            <div style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, userSelect: "none" }}>
                <input
                  type="checkbox"
                  checked={postAnon}
                  onChange={(e) => { setPostAnon(e.target.checked); if (!e.target.checked) setAnonName(""); }}
                  style={{ cursor: "pointer", width: 16, height: 16 }}
                />
                {postAnon ? t("post_as_anon") : t("post_as_me")}
              </label>
            </div>
          )}

          {/* Pseudo anonyme */}
          {(postAnon || !playerId) && (
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)", display: "block", marginBottom: 6 }}>
                {t("field_anon")}
              </label>
              <input
                value={anonName}
                onChange={(e) => setAnonName(e.target.value)}
                placeholder={t("anon_name_placeholder")}
                maxLength={50}
                style={{
                  width: "100%", padding: "10px 12px", fontSize: 13,
                  border: "2px solid var(--border-light)", borderRadius: 6,
                  background: "var(--surface)", color: "var(--text)",
                  fontFamily: "var(--font-body)", boxSizing: "border-box",
                }}
              />
            </div>
          )}

          {/* Charte (non connecté uniquement) */}
          {!playerId && (
            <div style={{
              background: "color-mix(in srgb, var(--yellow) 15%, var(--surface))",
              border: "2px solid var(--yellow)",
              borderRadius: 6, padding: "12px 14px",
              marginBottom: 14,
            }}>
              <p style={{ fontSize: 12, color: "var(--text)", marginBottom: 8, lineHeight: 1.5 }}>
                {t("charter_before")}{" "}
                <a href="/legal/charter" target="_blank" rel="noopener noreferrer" style={{ color: "var(--teal)", textDecoration: "underline" }}>
                  {t("charter_link")}
                </a>{" "}
                {t("charter_after")}
              </p>
              <label style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={charterAgreed}
                  onChange={(e) => setCharterAgreed(e.target.checked)}
                  style={{ marginTop: 2, cursor: "pointer" }}
                />
                <span style={{ fontSize: 12, fontWeight: 600 }}>
                  {t("charter_accept")}
                </span>
              </label>
            </div>
          )}

          {error && (
            <div style={{
              background: "color-mix(in srgb, #e74c3c 12%, var(--surface))",
              border: "2px solid #e74c3c",
              borderRadius: 6, padding: "10px 12px",
              fontSize: 13, color: "#e74c3c", marginBottom: 12,
            }}>
              {error}
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button type="button" onClick={onClose} className="ghost" style={{ padding: "10px 18px", fontSize: 14 }}>
              {t("cancel")}
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit || submitting}
              className="primary"
              style={{ padding: "10px 22px", fontSize: 14, fontWeight: 700 }}
            >
              {submitting ? t("submitting") : t("submit")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
