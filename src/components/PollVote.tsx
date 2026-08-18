"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";

type GuestField = { key: string; label: string; required?: boolean; type?: "text" | "club" };

export type PollData = {
  id: string;
  question: string;
  description: string | null;
  options: string[];
  multipleChoice: boolean;
  minChoices: number | null;
  maxChoices: number | null;
  allowComment: boolean;
  allowGuests: boolean;
  guestFields: GuestField[];
  status: "DRAFT" | "OPEN" | "CLOSED";
  closeAt: string | null;
};

type Results = { counts: Record<string, number>; totalBallots: number; voterCount: number };

const OTHER_CLUB = "__other__";

/** Champ club pour les guests : liste déroulante des clubs existants + option
 * "Autre" qui bascule sur un champ libre (le club recherché n'est pas listé). */
function ClubSelectField({
  value,
  onChange,
  label,
  required,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  required?: boolean;
}) {
  const t = useTranslations("poll");
  const [clubs, setClubs] = useState<{ id: string; name: string }[] | null>(null);
  const [mode, setMode] = useState<"select" | "other">("select");

  useEffect(() => {
    fetch("/api/clubs")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setClubs(Array.isArray(data) ? data : []))
      .catch(() => setClubs([]));
  }, []);

  // Si la valeur actuelle ne correspond à aucun club connu (ex: pré-remplie),
  // on bascule automatiquement en mode "autre" pour ne pas la perdre.
  useEffect(() => {
    if (clubs && value && !clubs.some((c) => c.name === value)) setMode("other");
  }, [clubs, value]);

  return (
    <label style={{ fontSize: 13, display: "grid", gap: 4 }}>
      {label}{required ? " *" : ""}
      {mode === "select" ? (
        <select
          value={value || ""}
          onChange={(e) => {
            if (e.target.value === OTHER_CLUB) { setMode("other"); onChange(""); }
            else onChange(e.target.value);
          }}
          required={required}
          style={{ padding: "8px 10px", borderRadius: 8, border: "2px solid var(--border)" }}
        >
          <option value="" disabled>{clubs === null ? "…" : t("select_choice")}</option>
          {clubs?.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
          <option value={OTHER_CLUB}>{t("club_other")}</option>
        </select>
      ) : (
        <div style={{ display: "flex", gap: 6 }}>
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            required={required}
            placeholder={t("club_other")}
            style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "2px solid var(--border)" }}
          />
          <button type="button" className="ghost" onClick={() => { setMode("select"); onChange(""); }} style={{ fontSize: 12 }}>
            {t("club_pick_list")}
          </button>
        </div>
      )}
    </label>
  );
}

export function PollVote({
  poll,
  isLoggedIn,
  hasVoted,
  initialResults,
}: {
  poll: PollData;
  isLoggedIn: boolean;
  hasVoted: boolean;
  initialResults: Results | null;
}) {
  const t = useTranslations("poll");
  const [selected, setSelected] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  const [email, setEmail] = useState("");
  const [guestValues, setGuestValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // "done" (inscrit ou déjà voté) | "pending" (guest, email envoyé)
  const [state, setState] = useState<"idle" | "done" | "pending">(hasVoted ? "done" : "idle");
  const [results, setResults] = useState<Results | null>(initialResults);
  const [timeLeft, setTimeLeft] = useState<string | null>(null);

  // Compte à rebours si une date de fermeture est programmée (incite à voter).
  useEffect(() => {
    if (!poll.closeAt || poll.status !== "OPEN") { setTimeLeft(null); return; }
    const close = new Date(poll.closeAt).getTime();
    const tick = () => {
      const diff = close - Date.now();
      if (diff <= 0) { setTimeLeft(null); return; }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      setTimeLeft(d > 0 ? `${d}j ${h}h` : h > 0 ? `${h}h ${m}min` : `${m}min`);
    };
    tick();
    const id = setInterval(tick, 60000);
    return () => clearInterval(id);
  }, [poll.closeAt, poll.status]);

  const toggle = (opt: string) => {
    setSelected((prev) =>
      poll.multipleChoice
        ? (prev.includes(opt) ? prev.filter((o) => o !== opt) : [...prev, opt])
        : [opt]
    );
  };

  const refreshResults = async () => {
    const res = await fetch(`/api/polls/${poll.id}/results`);
    if (!res.ok) return;
    const data = await res.json();
    // visible:false = l'orga a choisi de ne pas montrer les résultats maintenant
    // (showResults=AT_DATE/AT_CLOSE/HIDDEN) — le serveur ne renvoie pas les
    // chiffres dans ce cas, on ne les affiche donc pas non plus.
    if (data.visible) {
      setResults({ counts: data.counts, totalBallots: data.totalBallots, voterCount: data.voterCount });
    } else {
      setResults(null);
    }
  };

  const submit = async () => {
    setError(null);
    if (selected.length === 0) { setError(t("select_choice")); return; }
    // Validation min/max côté client (le serveur revérifie de toute façon).
    if (poll.multipleChoice) {
      if (poll.minChoices != null && selected.length < poll.minChoices) {
        setError(t("min_choices", { n: poll.minChoices })); return;
      }
      if (poll.maxChoices != null && selected.length > poll.maxChoices) {
        setError(t("max_choices", { n: poll.maxChoices })); return;
      }
    }
    if (!isLoggedIn && !email.trim()) { setError(t("email_required")); return; }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/polls/${poll.id}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          choices: selected,
          ...(poll.allowComment && comment.trim() ? { comment: comment.trim() } : {}),
          ...(isLoggedIn ? {} : { email: email.trim(), guestInfo: guestValues }),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(t(data.error && typeof data.error === "string" ? data.error : "closed"));
        return;
      }
      if (data.mode === "guest_pending") {
        setState("pending");
      } else {
        setState("done");
        await refreshResults();
      }
    } catch {
      setError(t("closed"));
    } finally {
      setSubmitting(false);
    }
  };

  // Re-vote (inscrits) : revient au formulaire avec la sélection actuelle.
  const editVote = () => { setState("idle"); setError(null); };

  const [shared, setShared] = useState(false);
  const share = async () => {
    const url = window.location.href;
    // API native (mobile) si dispo, sinon copie du lien dans le presse-papier.
    if (navigator.share) {
      try { await navigator.share({ title: poll.question, url }); return; } catch { /* annulé */ }
    }
    try { await navigator.clipboard.writeText(url); setShared(true); setTimeout(() => setShared(false), 2000); } catch { /* noop */ }
  };

  const maxCount = results ? Math.max(1, ...Object.values(results.counts)) : 1;

  return (
    <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 18, padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 24 }}>{poll.question}</h1>
          {poll.description && (
            <p style={{ marginTop: 8, color: "var(--text-muted)", lineHeight: 1.6 }}>{poll.description}</p>
          )}
        </div>
        <button className="ghost" onClick={share} style={{ fontSize: 13, flexShrink: 0 }} title={t("share")}>
          {shared ? "✓" : "🔗"} {t("share")}
        </button>
      </div>

      {poll.status !== "OPEN" && (
        <p style={{ color: "var(--text-muted)" }}>{t(poll.status === "CLOSED" ? "closed" : "not_open")}</p>
      )}

      {/* Compte à rebours de fermeture */}
      {timeLeft && (
        <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>⏳ {t("closes_in", { time: timeLeft })}</p>
      )}

      {/* Confirmation email guest en attente */}
      {state === "pending" && (
        <div style={{ background: "var(--yellow)", border: "2px solid var(--border)", borderRadius: 12, padding: 16 }}>
          <strong>{t("guest_pending_title")}</strong>
          <p style={{ margin: "6px 0 0", fontSize: 14 }}>{t("guest_pending_desc")}</p>
        </div>
      )}

      {/* Vote (si ouvert et pas déjà voté/en attente) */}
      {poll.status === "OPEN" && state === "idle" && (
        <>
          {/* Consigne de sélection multi-choix (exactement N / max N…) */}
          {poll.multipleChoice && (poll.minChoices != null || poll.maxChoices != null) && (
            <p style={{ fontSize: 13, color: "var(--teal)", fontWeight: 600, margin: 0 }}>
              {poll.minChoices != null && poll.minChoices === poll.maxChoices
                ? t("pick_exactly", { n: poll.minChoices })
                : poll.maxChoices != null
                  ? t("pick_up_to", { n: poll.maxChoices })
                  : t("pick_at_least", { n: poll.minChoices! })}
            </p>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {poll.options.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => toggle(opt)}
                style={{
                  textAlign: "left", padding: "12px 16px", borderRadius: 10,
                  border: `2px solid ${selected.includes(opt) ? "var(--teal)" : "var(--border)"}`,
                  background: selected.includes(opt) ? "color-mix(in srgb, var(--teal) 15%, var(--surface))" : "var(--surface)",
                  cursor: "pointer", fontSize: 15, fontWeight: 600,
                }}
              >
                {selected.includes(opt) ? "● " : "○ "}{opt}
              </button>
            ))}
          </div>

          {/* Commentaire optionnel (anonyme) si le sondage l'autorise */}
          {poll.allowComment && (
            <label style={{ fontSize: 13, display: "grid", gap: 4 }}>
              {t("comment_label")}
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={2}
                maxLength={1000}
                placeholder={t("comment_placeholder")}
                style={{ padding: "8px 10px", borderRadius: 8, border: "2px solid var(--border)", resize: "vertical" }}
              />
            </label>
          )}

          {/* Encart sécurité/anonymat — pourquoi on demande des infos perso alors
              que le vote est anonyme. Placé AVANT le formulaire guest pour lever
              la méfiance au bon moment (pas juste en petite ligne après coup). */}
          <div
            style={{
              display: "flex", gap: 10, alignItems: "flex-start",
              background: "color-mix(in srgb, var(--teal) 8%, var(--surface))",
              border: "1.5px solid var(--teal)", borderRadius: 10, padding: "12px 14px",
            }}
          >
            <span style={{ fontSize: 20, flexShrink: 0 }}>🔒</span>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: "var(--text)" }}>{t("security_note")}</p>
          </div>

          {/* Formulaire guest (uniquement si non connecté) */}
          {!isLoggedIn && poll.allowGuests && (
            <div style={{ borderTop: "1px solid var(--border-light)", paddingTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <strong style={{ fontSize: 14 }}>{t("guest_section")}</strong>
                <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-muted)" }}>{t("guest_intro")}</p>
              </div>
              {/* Vote définitif pour les guests (pas de re-vote via email). */}
              <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "var(--danger)" }}>⚠️ {t("guest_final_warning")}</p>
              <label style={{ fontSize: 13, display: "grid", gap: 4 }}>
                {t("email")} *
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                  style={{ padding: "8px 10px", borderRadius: 8, border: "2px solid var(--border)" }} />
              </label>
              {poll.guestFields.map((f) =>
                f.type === "club" ? (
                  <ClubSelectField
                    key={f.key}
                    label={f.label}
                    required={f.required}
                    value={guestValues[f.key] ?? ""}
                    onChange={(v) => setGuestValues((prev) => ({ ...prev, [f.key]: v }))}
                  />
                ) : (
                  <label key={f.key} style={{ fontSize: 13, display: "grid", gap: 4 }}>
                    {f.label}{f.required ? " *" : ""}
                    <input
                      type="text"
                      value={guestValues[f.key] ?? ""}
                      onChange={(e) => setGuestValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
                      required={f.required}
                      style={{ padding: "8px 10px", borderRadius: 8, border: "2px solid var(--border)" }}
                    />
                  </label>
                )
              )}
            </div>
          )}

          {error && <p style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>{error}</p>}

          <button className="primary" onClick={submit} disabled={submitting} style={{ fontSize: 15 }}>
            {submitting ? "…" : t("submit")}
          </button>
        </>
      )}

      {/* Déjà voté */}
      {state === "done" && (
        <>
          <p style={{ color: "var(--teal)", fontWeight: 600 }}>{hasVoted ? t("already_voted") : t("thanks")}</p>
          {!results && <p style={{ fontSize: 13, color: "var(--text-muted)" }}>{t("results_not_yet")}</p>}
          {/* Re-vote : seulement pour les inscrits, tant que le sondage est ouvert. */}
          {isLoggedIn && poll.status === "OPEN" && (
            <button className="ghost" onClick={editVote} style={{ fontSize: 13, alignSelf: "start" }}>
              ✏️ {t("change_vote")}
            </button>
          )}
        </>
      )}

      {/* Résultats (visibles une fois voté OU sondage fermé) */}
      {results && (state === "done" || poll.status === "CLOSED") && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, borderTop: "1px solid var(--border-light)", paddingTop: 16 }}>
          <strong>{t("results")}</strong>
          {poll.options.map((opt) => {
            const c = results.counts[opt] ?? 0;
            const pct = results.totalBallots > 0 ? Math.round((c / results.totalBallots) * 100) : 0;
            return (
              <div key={opt}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 2 }}>
                  <span>{opt}</span><span style={{ fontWeight: 700 }}>{c} · {pct}%</span>
                </div>
                <div style={{ height: 10, background: "var(--surface-2)", borderRadius: 999, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${(c / maxCount) * 100}%`, background: "var(--teal)", transition: "width .3s" }} />
                </div>
              </div>
            );
          })}
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "4px 0 0" }}>
            {t("total_votes", { count: results.voterCount })}
          </p>
        </div>
      )}
    </div>
  );
}
