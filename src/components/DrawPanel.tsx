"use client";

/**
 * Panneau orga ABC Chapeau : inscrits (paiement, niveau, liste d'attente),
 * ajout de joueurs par l'orga (avec ou sans compte), tirage automatique et
 * composition des équipes à la main. Chaque changement est enregistré tout
 * de suite (actions serveur de edit/abc-actions), plus de bouton « Sauvegarder ».
 */

import { Fragment, useCallback, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from "@/lib/payment-methods";
import { ABC_LEVELS, LEVEL_SCORE, getTier, tierMix } from "@/lib/abc-draw";
import {
  abcAddPlayerAction, abcRemoveEntryAction, abcMoveEntryAction, abcSetLevelAction,
  abcCreateTeamAction, abcDeleteTeamAction, abcRevealTeamsAction,
} from "@/app/[locale]/tournament/[id]/edit/abc-actions";
import { renameTeamAction } from "@/app/[locale]/tournament/[id]/edit/actions";

type SoloEntry = {
  id: string;
  player: { id: string; name: string; account?: { email?: string | null } | null };
  level: string;
  teamId: string | null;
  waitlisted: boolean;
  feePaid?: boolean;
  paymentMethod?: PaymentMethod | null;
};

type SoloAnswer = {
  id: string;
  value: string;
  field: { label: string; target: string };
};

type DrawnTeam = {
  id: string;
  name: string;
};

type PlayerResult = { id: string; name: string; city: string | null; country: string };

const th: React.CSSProperties = { textAlign: "left", padding: "6px 10px", fontFamily: "var(--font-display)", fontSize: 11, color: "var(--text-muted)" };
const small: React.CSSProperties = { fontSize: 12, padding: "4px 12px" };

function LevelSelect({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <select
      className="level-badge"
      data-level={getTier(value)}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      style={{ cursor: disabled ? "default" : "pointer", padding: "2px 4px" }}
    >
      {ABC_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
    </select>
  );
}

export function DrawPanel({
  tournamentId,
  soloEntries: initialEntries,
  teams: initialTeams,
  feePerPlayer = 0,
  feeCurrency = "EUR",
  selectionLocked = false,
  toggleLockAction,
  maxSoloPlayers = null,
  teamsRevealed = false,
  tournamentStarted = false,
}: {
  tournamentId: string;
  soloEntries: SoloEntry[];
  teams: DrawnTeam[];
  feePerPlayer?: number;
  feeCurrency?: string;
  /** Équipes validées (même verrou que la sélection des tournois classiques) */
  selectionLocked?: boolean;
  toggleLockAction?: (tId: string, locked: boolean) => Promise<{ ok?: boolean; error?: string }>;
  /** Limite de joueurs : l'orga peut la dépasser, le compteur passe alors en alerte. */
  maxSoloPlayers?: number | null;
  /** Équipes visibles du public (dévoilées, ou tournoi lancé). Avant : seuls les orgas les voient. */
  teamsRevealed?: boolean;
  tournamentStarted?: boolean;
}) {
  const t = useTranslations("draw");
  const router = useRouter();
  const [locked, setLocked] = useState(selectionLocked);
  const [revealed, setRevealed] = useState(teamsRevealed);
  const [lockPending, startLock] = useTransition();
  const [entries, setEntries] = useState<SoloEntry[]>(initialEntries);
  const [teams, setTeams] = useState<DrawnTeam[]>(initialTeams);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null); // id de la ligne / équipe en cours d'enregistrement
  const [editingTeam, setEditingTeam] = useState<{ id: string; name: string } | null>(null);
  // Composition au clic : joueur·euse sélectionné·e, à placer dans une équipe
  const [pickedId, setPickedId] = useState<string | null>(null);
  // Glisser-déposer (souris) : joueur·euse en cours de glisser, et zone survolée
  // (id d'équipe, ou "pool" pour les non placé·e·s). Le clic reste pour le tactile.
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  // Réponses au questionnaire par inscription (chargées à la demande)
  const [openAnswers, setOpenAnswers] = useState<Record<string, SoloAnswer[] | "loading">>({});

  const toggleAnswers = async (entryId: string) => {
    if (openAnswers[entryId]) {
      setOpenAnswers((prev) => {
        const next = { ...prev };
        delete next[entryId];
        return next;
      });
      return;
    }
    setOpenAnswers((prev) => ({ ...prev, [entryId]: "loading" }));
    try {
      const res = await fetch(`/api/solo-entries/${entryId}/answers`);
      const data: SoloAnswer[] = res.ok ? await res.json() : [];
      setOpenAnswers((prev) => ({ ...prev, [entryId]: data }));
    } catch {
      setOpenAnswers((prev) => ({ ...prev, [entryId]: [] }));
    }
  };

  const activeEntries = entries.filter((e) => !e.waitlisted);
  const waitlistEntries = entries.filter((e) => e.waitlisted);
  const unplaced = activeEntries.filter((e) => !e.teamId || !teams.some((tm) => tm.id === e.teamId));
  const hasTeams = teams.length > 0;
  const hasPlacedPlayers = activeEntries.some((e) => e.teamId && teams.some((tm) => tm.id === e.teamId));
  const picked = pickedId ? activeEntries.find((e) => e.id === pickedId) ?? null : null;
  const dragProps = (entry: SoloEntry): React.HTMLAttributes<HTMLElement> & { draggable?: boolean } => locked ? {} : {
    draggable: true,
    onDragStart: (ev) => {
      ev.dataTransfer.setData("text/plain", entry.id);
      ev.dataTransfer.effectAllowed = "move";
      setDragId(entry.id);
      setPickedId(null);
    },
    onDragEnd: () => { setDragId(null); setOverId(null); },
  };

  /** Zone de dépôt : une équipe (teamId) ou les non placé·e·s (""). */
  const dropProps = (teamId: string): React.HTMLAttributes<HTMLElement> => {
    const zone = teamId || "pool";
    return locked ? {} : {
      onDragOver: (ev) => {
        if (!dragId) return;
        ev.preventDefault();
        ev.dataTransfer.dropEffect = "move";
        if (overId !== zone) setOverId(zone);
      },
      onDragLeave: (ev) => {
        if (!ev.currentTarget.contains(ev.relatedTarget as Node | null)) setOverId((o) => (o === zone ? null : o));
      },
      onDrop: (ev) => {
        ev.preventDefault();
        const id = ev.dataTransfer.getData("text/plain") || dragId;
        setDragId(null);
        setOverId(null);
        const entry = entries.find((x) => x.id === id && !x.waitlisted);
        if (!entry) return;
        const current = entry.teamId && teams.some((tm) => tm.id === entry.teamId) ? entry.teamId : "";
        if (current !== teamId) moveEntry(entry, teamId);
      },
    };
  };

  const overCapacity = maxSoloPlayers !== null && activeEntries.length > maxSoloPlayers;

  /** Lance une action serveur pour une ligne, affiche son erreur, rafraîchit la page serveur. */
  const run = async (key: string, fn: () => Promise<{ ok?: boolean; error?: string }>): Promise<boolean> => {
    setPending(key);
    setError(null);
    const res = await fn();
    setPending(null);
    if (res?.error) { setError(res.error); return false; }
    router.refresh();
    return true;
  };

  // Dévoiler = rendre les équipes publiques (+ notif aux joueur·euses) ; recacher avant le lancement
  const setReveal = (next: boolean) => {
    if (!window.confirm(next ? t("reveal_confirm") : t("hide_confirm"))) return;
    setError(null);
    startLock(async () => {
      const res = await abcRevealTeamsAction(tournamentId, next);
      if ("error" in res && res.error) { setError(res.error); return; }
      setRevealed(next);
      router.refresh();
    });
  };

  // Valider les équipes = figer le tirage (plus de relance ni de changement d'équipe)
  const setLock = (next: boolean) => {
    if (!toggleLockAction) return;
    if (!next && !window.confirm(t("unlock_confirm"))) return;
    setError(null);
    startLock(async () => {
      const res = await toggleLockAction(tournamentId, next);
      if (res?.error) { setError(res.error); return; }
      setLocked(next);
      router.refresh();
    });
  };

  const handleDraw = async () => {
    // Relancer efface la composition actuelle (tirée ou faite à la main)
    if (hasPlacedPlayers && !window.confirm(t("redraw_confirm", { count: teams.length }))) return;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/tournaments/${tournamentId}/draw`, { method: "POST" });
    setLoading(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setError(data.error ?? t("error_draw")); return; }
    // La route renvoie la liste complète : on remplace (les anciennes équipes n'existent plus)
    setTeams(data.teams as DrawnTeam[]);
    const byEntry = new Map((data.entries as { id: string; teamId: string | null }[]).map((e) => [e.id, e.teamId]));
    setEntries((prev) => prev.map((e) => (byEntry.has(e.id) ? { ...e, teamId: byEntry.get(e.id) ?? null } : e)));
    router.refresh();
  };

  const moveEntry = async (entry: SoloEntry, teamId: string) => {
    const target = teamId || null;
    const before = entry.teamId;
    setEntries((prev) => prev.map((e) => (e.id === entry.id ? { ...e, teamId: target } : e)));
    const ok = await run(entry.id, () => abcMoveEntryAction(tournamentId, entry.id, target));
    if (!ok) setEntries((prev) => prev.map((e) => (e.id === entry.id ? { ...e, teamId: before } : e)));
  };

  const setLevel = async (entry: SoloEntry, level: string) => {
    const before = entry.level;
    setEntries((prev) => prev.map((e) => (e.id === entry.id ? { ...e, level } : e)));
    const ok = await run(entry.id, () => abcSetLevelAction(tournamentId, entry.id, level));
    if (!ok) setEntries((prev) => prev.map((e) => (e.id === entry.id ? { ...e, level: before } : e)));
  };

  const removeEntry = async (entry: SoloEntry) => {
    if (!window.confirm(t("remove_confirm", { name: entry.player.name }))) return;
    if (await run(entry.id, () => abcRemoveEntryAction(tournamentId, entry.id))) {
      setEntries((prev) => prev.filter((e) => e.id !== entry.id));
    }
  };

  const createTeams = async (count = 1) => {
    setPending("new-team");
    setError(null);
    const res = await abcCreateTeamAction(tournamentId, count);
    setPending(null);
    if ("error" in res && res.error) { setError(res.error); return false; }
    if (res.ok) setTeams((prev) => [...prev, ...res.teams]);
    router.refresh();
    return true;
  };

  // Composer à la main : prépare les équipes vides (inscrits ÷ 3) si aucune
  // n'existe encore, puis amène l'orga au tableau de composition.
  const boardRef = useRef<HTMLDivElement>(null);
  const startManual = async () => {
    if (!hasTeams && !(await createTeams(Math.max(1, Math.floor(activeEntries.length / 3))))) return;
    requestAnimationFrame(() => boardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const deleteTeam = async (team: DrawnTeam) => {
    const count = activeEntries.filter((e) => e.teamId === team.id).length;
    if (count > 0 && !window.confirm(t("delete_team_confirm", { name: team.name, count }))) return;
    if (await run(team.id, () => abcDeleteTeamAction(tournamentId, team.id))) {
      setTeams((prev) => prev.filter((tm) => tm.id !== team.id));
      setEntries((prev) => prev.map((e) => (e.teamId === team.id ? { ...e, teamId: null } : e)));
    }
  };

  const renameTeam = async () => {
    if (!editingTeam) return;
    const { id, name } = editingTeam;
    if (await run(id, () => renameTeamAction(id, name, tournamentId))) {
      setTeams((prev) => prev.map((tm) => (tm.id === id ? { ...tm, name: name.trim() } : tm)));
      setEditingTeam(null);
    }
  };

  const togglePaid = async (entry: SoloEntry) => {
    if (!entry.feePaid) {
      const ok = window.confirm(t("confirm_paid", { name: entry.player.name }));
      if (!ok) return;
    }
    setPending(entry.id);
    await fetch(`/api/tournaments/${tournamentId}/solo-entries/${entry.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feePaid: !entry.feePaid }),
    });
    setEntries((prev) => prev.map((e) => (e.id === entry.id ? { ...e, feePaid: !entry.feePaid, paymentMethod: !entry.feePaid ? e.paymentMethod : null } : e)));
    setPending(null);
  };

  const setPaymentMethod = async (entry: SoloEntry, method: PaymentMethod) => {
    setPending(entry.id);
    await fetch(`/api/tournaments/${tournamentId}/solo-entries/${entry.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feePaid: true, paymentMethod: method }),
    });
    setEntries((prev) => prev.map((e) => (e.id === entry.id ? { ...e, feePaid: true, paymentMethod: method } : e)));
    setPending(null);
  };

  // Bascule manuelle IN ↔ liste d'attente, sans passer par le tirage.
  // En liste d'attente, le joueur quitte aussi son équipe (côté serveur).
  const toggleWaitlisted = async (entry: SoloEntry) => {
    const next = !entry.waitlisted;
    setPending(entry.id);
    setError(null);
    const res = await fetch(`/api/tournaments/${tournamentId}/solo-entries/${entry.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ waitlisted: next }),
    });
    setPending(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? t("error_save"));
      return;
    }
    setEntries((prev) => prev.map((e) => (e.id === entry.id ? { ...e, waitlisted: next, teamId: next ? null : e.teamId } : e)));
    router.refresh();
  };

  const paidCount = activeEntries.filter((e) => e.feePaid).length;
  const byMethod = (Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[])
    .map((m) => ({ method: m, count: activeEntries.filter((e) => e.feePaid && e.paymentMethod === m).length }))
    .filter((x) => x.count > 0);
  const unspecifiedPaid = activeEntries.filter((e) => e.feePaid && !e.paymentMethod).length;

  const teamSelect = (entry: SoloEntry) => (
    <select
      value={entry.teamId && teams.some((tm) => tm.id === entry.teamId) ? entry.teamId : ""}
      onChange={(e) => moveEntry(entry, e.target.value)}
      disabled={locked || pending === entry.id}
      aria-label={t("move_to", { name: entry.player.name })}
      style={{ fontSize: 12, padding: "3px 6px", maxWidth: 160 }}
    >
      <option value="">{t("no_team")}</option>
      {teams.map((tm) => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
    </select>
  );

  return (
    <div style={{ display: "grid", gap: 20, marginTop: 16 }}>
      <div className="panel">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
          <h3 style={{ margin: 0 }}>
            {t("title")}
            <span className="meta" style={{ marginLeft: 10, fontWeight: 400, fontSize: 13 }}>
              <span style={overCapacity ? { color: "var(--danger)", fontWeight: 700 } : undefined} title={overCapacity ? t("over_capacity_hint") : undefined}>
                {maxSoloPlayers !== null
                  ? t("registered_count_max", { count: activeEntries.length, max: maxSoloPlayers })
                  : t("registered_count", { count: activeEntries.length })}
              </span>
              {waitlistEntries.length > 0 && ` · ${t("waitlist_count", { count: waitlistEntries.length })}`}
              {feePerPlayer > 0 && ` · ${t("paid_count", { paid: paidCount, total: activeEntries.length })}`}
            </span>
          </h3>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {locked ? (
              <>
                {toggleLockAction && (
                  <button className="ghost" style={{ fontSize: 13, padding: "6px 16px" }} onClick={() => setLock(false)} disabled={lockPending}>
                    🔓 {t("btn_unlock")}
                  </button>
                )}
                {!revealed ? (
                  <button className="primary" style={{ fontSize: 13, padding: "6px 16px" }} onClick={() => setReveal(true)} disabled={lockPending}>
                    🎲 {t("btn_reveal")}
                  </button>
                ) : !tournamentStarted && (
                  <button className="ghost" style={{ fontSize: 13, padding: "6px 16px" }} onClick={() => setReveal(false)} disabled={lockPending}>
                    🙈 {t("btn_hide")}
                  </button>
                )}
              </>
            ) : (
              <>
                <button
                  className={hasPlacedPlayers ? "ghost" : "primary"}
                  style={{ fontSize: 13, padding: "6px 16px" }}
                  onClick={handleDraw}
                  disabled={loading || activeEntries.length < 3}
                  title={t("btn_draw_hint")}
                >
                  {loading ? t("btn_drawing") : hasPlacedPlayers ? t("btn_redraw") : t("btn_draw")}
                </button>
                <button
                  className="ghost"
                  style={{ fontSize: 13, padding: "6px 16px" }}
                  onClick={startManual}
                  disabled={loading || pending === "new-team"}
                  title={t("btn_compose_hint")}
                >
                  ✋ {t("btn_compose")}
                </button>
                {hasPlacedPlayers && toggleLockAction && (
                  <button
                    className="primary"
                    style={{ fontSize: 13, padding: "6px 16px" }}
                    onClick={() => setLock(true)}
                    disabled={lockPending || loading || pending !== null}
                  >
                    ✅ {t("btn_validate")}
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Visibilité publique de la composition */}
        <p className="meta" style={{ margin: "0 0 12px", fontSize: 13 }}>
          {revealed ? `👁 ${t("visibility_revealed")}` : `🙈 ${t("visibility_hidden")}`}
        </p>

        {locked && (
          <p className="draw-locked-banner" style={{ margin: "0 0 12px", padding: "8px 12px", border: "2px solid var(--border)", borderRadius: 8, background: "var(--surface-2)", fontSize: 13 }}>
            🔒 {t("locked_banner")}
          </p>
        )}
        {error && <p className="error" style={{ marginBottom: 12 }}>{error}</p>}

        {!locked && (
          <AddPlayerForm
            tournamentId={tournamentId}
            onAdded={(entry) => { setEntries((prev) => [...prev, entry]); router.refresh(); }}
            onError={setError}
          />
        )}

        {feePerPlayer > 0 && (byMethod.length > 0 || unspecifiedPaid > 0) && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
            {byMethod.map(({ method, count }) => (
              <span key={method} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: "color-mix(in srgb, var(--teal) 10%, var(--bg-panel))", border: "1px solid var(--teal)", color: "var(--teal)", fontWeight: 600 }}>
                {PAYMENT_METHOD_LABELS[method]} : {count * feePerPlayer} {feeCurrency}
              </span>
            ))}
            {unspecifiedPaid > 0 && (
              <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: "var(--bg-panel)", border: "1px solid var(--border)", color: "var(--text-muted)" }}>
                {t("method_unspecified")} : {unspecifiedPaid * feePerPlayer} {feeCurrency}
              </span>
            )}
          </div>
        )}

        {/* Liste des inscrits actifs */}
        <div style={{ overflowX: "auto" }}>
          <table className="abc-entries" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid var(--border)" }}>
                <th style={th}>{t("col_player")}</th>
                <th style={th}>{t("col_level")}</th>
                <th style={th}>{t("col_team")}</th>
                {feePerPlayer > 0 && <th style={th}>{t("col_paid")}</th>}
                <th style={{ ...th, textAlign: "right" }}>{t("col_status")}</th>
              </tr>
            </thead>
            <tbody>
              {activeEntries.map((entry) => (
                <Fragment key={entry.id}>
                <tr className="abc-entry" style={{ borderBottom: openAnswers[entry.id] ? "none" : "1px solid var(--border-light)", opacity: pending === entry.id ? 0.6 : 1 }}>
                  <td className="abc-entry__name" style={{ padding: "8px 10px", fontWeight: 600 }}>
                    <button
                      type="button"
                      onClick={() => toggleAnswers(entry.id)}
                      title={t("view_registration_answers")}
                      style={{ background: "none", border: "none", cursor: "pointer", padding: 0, marginRight: 6, color: "var(--text-muted)", fontSize: 11, boxShadow: "none" }}
                    >
                      {openAnswers[entry.id] ? "▾" : "▸"}
                    </button>
                    {entry.player.name}
                    {!entry.player.account && (
                      <span className="meta" style={{ marginLeft: 6, fontSize: 11, fontWeight: 400 }}>· {t("no_account")}</span>
                    )}
                    {!entry.player.account && !locked && (
                      <MergeGuest
                        player={entry.player}
                        onMerged={(target) => {
                          // Déjà inscrit·e sous son vrai profil : la fusion a supprimé le doublon
                          setEntries((prev) =>
                            prev.some((e) => e.player.id === target.id)
                              ? prev.filter((e) => e.id !== entry.id)
                              : prev.map((e) => (e.id === entry.id ? { ...e, player: { id: target.id, name: target.name, account: { email: null } } } : e)));
                          router.refresh();
                        }}
                      />
                    )}
                    {entry.player.account?.email && (
                      <div style={{ fontSize: 11, color: "var(--text-muted)", userSelect: "all", wordBreak: "break-all", paddingLeft: 17 }}>
                        {entry.player.account.email}
                      </div>
                    )}
                  </td>
                  <td className="abc-entry__level" style={{ padding: "8px 10px" }}>
                    {locked
                      ? <span className="level-badge" data-level={getTier(entry.level)}>{entry.level}</span>
                      : <LevelSelect value={entry.level} onChange={(v) => setLevel(entry, v)} disabled={pending === entry.id} />}
                  </td>
                  <td className="abc-entry__team" style={{ padding: "8px 10px" }}>
                    {hasTeams && !locked
                      ? teamSelect(entry)
                      : <span style={{ color: "var(--text-muted)" }}>{teams.find((tm) => tm.id === entry.teamId)?.name ?? "—"}</span>}
                  </td>
                  {feePerPlayer > 0 && (
                    <td className="abc-entry__paid" style={{ padding: "8px 10px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <button
                          type="button"
                          onClick={() => togglePaid(entry)}
                          disabled={pending === entry.id}
                          style={{
                            width: 20, height: 20, borderRadius: 4, flexShrink: 0,
                            border: `2px solid ${entry.feePaid ? "var(--teal)" : "var(--border)"}`,
                            background: entry.feePaid ? "var(--teal)" : "transparent",
                            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 12, color: "#fff", padding: 0,
                          }}
                        >
                          {entry.feePaid ? "✓" : ""}
                        </button>
                        {entry.feePaid && (
                          <select
                            value={entry.paymentMethod ?? ""}
                            onChange={(e) => setPaymentMethod(entry, e.target.value as PaymentMethod)}
                            disabled={pending === entry.id}
                            style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4, border: "1px solid var(--border)", background: "var(--bg-panel)" }}
                          >
                            <option value="" disabled>{t("method_placeholder")}</option>
                            {(Object.entries(PAYMENT_METHOD_LABELS) as [PaymentMethod, string][]).map(([key, label]) => (
                              <option key={key} value={key}>{label}</option>
                            ))}
                          </select>
                        )}
                        <span style={{ fontSize: 11, color: entry.feePaid ? "var(--teal)" : "var(--text-muted)" }}>
                          {feePerPlayer} {feeCurrency}
                        </span>
                      </div>
                    </td>
                  )}
                  <td className="abc-entry__status" style={{ padding: "8px 10px", textAlign: "right", whiteSpace: "nowrap" }}>
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => toggleWaitlisted(entry)}
                      disabled={locked || pending === entry.id}
                      title={t("mark_out_hint")}
                      style={{ fontSize: 11, padding: "3px 10px" }}
                    >
                      {t("mark_out")}
                    </button>
                    {!locked && (
                      <button
                        type="button"
                        className="ghost"
                        onClick={() => removeEntry(entry)}
                        disabled={pending === entry.id}
                        title={t("remove_hint")}
                        aria-label={t("remove_hint")}
                        style={{ fontSize: 11, padding: "3px 8px", marginLeft: 6, color: "var(--danger)", borderColor: "var(--danger)" }}
                      >
                        ✕
                      </button>
                    )}
                  </td>
                </tr>
                {openAnswers[entry.id] && (
                  <tr className="abc-entry-answers" style={{ borderBottom: "1px solid var(--border-light)" }}>
                    <td colSpan={feePerPlayer > 0 ? 5 : 4} style={{ padding: "0 10px 10px 30px" }}>
                      {openAnswers[entry.id] === "loading" ? (
                        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>…</span>
                      ) : (openAnswers[entry.id] as SoloAnswer[]).length === 0 ? (
                        <span style={{ fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>{t("no_answers")}</span>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          {(openAnswers[entry.id] as SoloAnswer[]).map((a) => (
                            <div key={a.id} style={{ fontSize: 12 }}>
                              <span style={{ fontWeight: 700, color: "var(--text-muted)" }}>{a.field.label} : </span>
                              {a.value}
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>

        {/* Liste d'attente */}
        {waitlistEntries.length > 0 && (
          <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--border-light)" }}>
            <p style={{ fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginBottom: 8, textTransform: "uppercase" }}>
              {t("waitlist_title", { count: waitlistEntries.length })}
            </p>
            <div style={{ display: "grid", gap: 6 }}>
              {waitlistEntries.map((entry) => (
                <div key={entry.id} style={{ display: "flex", gap: 12, alignItems: "center", fontSize: 13, color: "var(--text-muted)" }}>
                  <span style={{ fontWeight: 600 }}>{entry.player.name}</span>
                  <span className="level-badge" data-level={getTier(entry.level)} style={{ opacity: 0.7 }}>{entry.level}</span>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => toggleWaitlisted(entry)}
                    disabled={locked || pending === entry.id}
                    style={{ fontSize: 11, padding: "2px 10px", marginLeft: "auto", color: "var(--teal)", borderColor: "var(--teal)" }}
                  >
                    {t("mark_in")}
                  </button>
                  {!locked && (
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => removeEntry(entry)}
                      disabled={pending === entry.id}
                      title={t("remove_hint")}
                      aria-label={t("remove_hint")}
                      style={{ fontSize: 11, padding: "2px 8px", color: "var(--danger)", borderColor: "var(--danger)" }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Composition des équipes : tirage auto puis retouches, ou tout à la main */}
        <div ref={boardRef} style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--border-light)", scrollMarginTop: 80 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
            <p style={{ fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", margin: 0, textTransform: "uppercase" }}>
              {t("formed_teams_title", { count: teams.length })}
            </p>
            {!locked && (
              <button className="ghost" style={small} onClick={() => createTeams(1)} disabled={pending === "new-team"}>
                + {t("btn_new_team")}
              </button>
            )}
          </div>
          {!hasTeams && !locked && <p className="meta" style={{ fontSize: 13, margin: "0 0 10px" }}>{t("compose_hint")}</p>}

          {/* Placer : clic sur un·e joueur·euse (non placé·e ou déjà en équipe), puis sur l'équipe */}
          {hasTeams && !locked && (
            <p className="meta" style={{ fontSize: 12, margin: "0 0 10px" }}>
              {picked ? t("pick_now_team", { name: picked.player.name }) : t("pick_or_drag_hint")}
              {picked && (
                <button type="button" className="abc-link" onClick={() => setPickedId(null)}>{t("cancel")}</button>
              )}
            </p>
          )}

          {hasTeams && (unplaced.length > 0 || dragId) && (
            <div className={`abc-pool${overId === "pool" ? " is-over" : ""}`} {...dropProps("")}>
              <p className="abc-pool__title">{t("unplaced_title", { count: unplaced.length })}</p>
              {/* Groupé par niveau (A, B, C), du meilleur au moins bon : plus simple pour équilibrer */}
              {(["A", "B", "C"] as const).map((tier) => {
                const group = unplaced
                  .filter((e) => getTier(e.level) === tier)
                  .sort((a, b) => (LEVEL_SCORE[b.level] ?? 4) - (LEVEL_SCORE[a.level] ?? 4) || a.player.name.localeCompare(b.player.name));
                if (group.length === 0) return null;
                return (
                  <div key={tier} className="abc-pool__tier">
                    <span className="abc-pool__tier-label level-badge" data-level={tier}>{tier} · {group.length}</span>
                    <div className="abc-pool__chips">
                      {group.map((e) => (
                        <button
                          key={e.id}
                          type="button"
                          className={`abc-chip${pickedId === e.id ? " is-picked" : ""}${dragId === e.id ? " is-dragging" : ""}`}
                          {...dragProps(e)}
                          onClick={() => !locked && setPickedId(pickedId === e.id ? null : e.id)}
                          disabled={locked || pending === e.id}
                          aria-pressed={pickedId === e.id}
                        >
                          <span className="level-badge" data-level={getTier(e.level)}>{e.level}</span>
                          <span className="abc-chip__name">{e.player.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="abc-teams">
            {teams.map((team) => {
              const teamEntries = activeEntries.filter((e) => e.teamId === team.id);
              const mix = tierMix(teamEntries.map((e) => e.level));
              const canDrop = !!picked && picked.teamId !== team.id;
              return (
                <div
                  key={team.id}
                  className={`abc-team${canDrop ? " is-target" : ""}${overId === team.id ? " is-over" : ""}`}
                  style={{ opacity: pending === team.id ? 0.6 : 1 }}
                  {...dropProps(team.id)}
                >
                  <div className="abc-team__head">
                    {editingTeam?.id === team.id ? (
                      <form onSubmit={(ev) => { ev.preventDefault(); renameTeam(); }} style={{ display: "flex", gap: 6, flex: 1 }}>
                        <input
                          value={editingTeam.name}
                          onChange={(ev) => setEditingTeam({ id: team.id, name: ev.target.value })}
                          autoFocus
                          style={{ flex: 1, minWidth: 0, fontSize: 13, padding: "3px 8px" }}
                        />
                        <button className="primary" type="submit" style={{ fontSize: 11, padding: "3px 10px" }}>OK</button>
                      </form>
                    ) : (
                      <>
                        <p className="abc-team__name">{team.name}</p>
                        <span className="meta" style={{ fontSize: 11, whiteSpace: "nowrap" }} title={t("mix_hint")}>
                          {mix.A}A · {mix.B}B · {mix.C}C
                        </span>
                        {!locked && (
                          <>
                            <button type="button" className="ghost abc-icon" onClick={() => setEditingTeam({ id: team.id, name: team.name })} title={t("rename_team")} aria-label={t("rename_team")}>✎</button>
                            <button type="button" className="ghost abc-icon abc-icon--danger" onClick={() => deleteTeam(team)} title={t("delete_team")} aria-label={t("delete_team")}>✕</button>
                          </>
                        )}
                      </>
                    )}
                  </div>
                  <div className="abc-team__players">
                    {teamEntries.map((e) => (
                      <div key={e.id} className="abc-team__player" style={{ opacity: pending === e.id ? 0.6 : 1 }}>
                        <button
                          type="button"
                          className={`abc-chip abc-chip--flat${pickedId === e.id ? " is-picked" : ""}${dragId === e.id ? " is-dragging" : ""}`}
                          {...dragProps(e)}
                          onClick={() => !locked && setPickedId(pickedId === e.id ? null : e.id)}
                          disabled={locked || pending === e.id}
                          aria-pressed={pickedId === e.id}
                          title={locked ? undefined : t("pick_to_move")}
                        >
                          <span className="level-badge" data-level={getTier(e.level)}>{e.level}</span>
                          <span className="abc-chip__name">{e.player.name}</span>
                        </button>
                        {!locked && (
                          <button type="button" className="abc-unplace" onClick={() => moveEntry(e, "")} disabled={pending === e.id} title={t("unplace")} aria-label={t("unplace")}>↩</button>
                        )}
                      </div>
                    ))}
                    {teamEntries.length === 0 && !canDrop && <span className="meta" style={{ fontSize: 12 }}>{t("no_player")}</span>}
                    {canDrop && (
                      <button type="button" className="abc-drop" onClick={() => { const e = picked!; setPickedId(null); moveEntry(e, team.id); }}>
                        + {t("place_here", { name: picked!.player.name })}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Fusion d'un profil sans compte dans le vrai profil de la personne (même
 * route que la gestion des équipes) : inscription, équipe, buts… suivent.
 */
function MergeGuest({ player, onMerged }: { player: { id: string; name: string }; onMerged: (target: PlayerResult) => void }) {
  const t = useTranslations("team_manager");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlayerResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = (q: string) => {
    if (debounce.current) clearTimeout(debounce.current);
    if (q.trim().length < 2) { setResults([]); return; }
    debounce.current = setTimeout(async () => {
      const res = await fetch(`/api/players?search=${encodeURIComponent(q)}&hasAccount=true`);
      const data: PlayerResult[] = res.ok ? await res.json() : [];
      setResults(data.filter((p) => p.id !== player.id));
    }, 250);
  };

  const merge = async (target: PlayerResult) => {
    if (!window.confirm(t("confirm_merge", { source: player.name, target: target.name }))) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/players/${player.id}/merge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetPlayerId: target.id }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(data.error ?? t("error_fallback")); return; }
    setOpen(false);
    onMerged(target);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => { setOpen((o) => !o); setQuery(""); setResults([]); setError(null); }}
        style={{ background: "none", border: "none", padding: 0, marginLeft: 6, fontSize: 11, fontWeight: 400, color: "var(--text-muted)", textDecoration: "underline", cursor: "pointer", boxShadow: "none" }}
      >
        {open ? t("merge_cancel") : t("merge")}
      </button>
      {open && (
        <div style={{ display: "grid", gap: 4, marginTop: 6, paddingLeft: 17, fontWeight: 400 }}>
          <input
            placeholder={t("merge_search_placeholder")}
            value={query}
            onChange={(e) => { setQuery(e.target.value); search(e.target.value); }}
            autoFocus
            style={{ fontSize: 12, padding: "4px 8px", maxWidth: 260 }}
          />
          {results.length > 0 && (
            <div style={{ background: "var(--surface)", border: "1.5px solid var(--border)", borderRadius: 8, overflow: "hidden", maxWidth: 320 }}>
              {results.slice(0, 10).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => merge(p)}
                  disabled={busy}
                  style={{ display: "block", width: "100%", textAlign: "left", padding: "7px 12px", background: "none", border: "none", borderBottom: "1px solid var(--border-light)", cursor: "pointer", fontSize: 12, boxShadow: "none", color: "var(--text)" }}
                >
                  <strong>{p.name}</strong>
                  <span style={{ marginLeft: 8, color: "var(--text-muted)", fontSize: 11 }}>{p.city ? `${p.city}, ` : ""}{p.country}</span>
                </button>
              ))}
            </div>
          )}
          {error && <span style={{ fontSize: 11, color: "var(--danger)" }}>{error}</span>}
        </div>
      )}
    </>
  );
}

/** Ajout d'un joueur par l'orga : profil existant (recherche) ou sans compte. */
function AddPlayerForm({
  tournamentId,
  onAdded,
  onError,
}: {
  tournamentId: string;
  onAdded: (entry: SoloEntry) => void;
  onError: (msg: string | null) => void;
}) {
  const t = useTranslations("draw");
  const [mode, setMode] = useState<"search" | "manual" | null>(null);
  const [level, setLevel] = useState("B");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlayerResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [busy, setBusy] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reset = () => { setMode(null); setQuery(""); setResults([]); setSearched(false); setName(""); setCity(""); setCountry(""); };

  const search = useCallback((q: string) => {
    if (debounce.current) clearTimeout(debounce.current);
    if (q.trim().length < 2) { setResults([]); setSearched(false); return; }
    debounce.current = setTimeout(async () => {
      const res = await fetch(`/api/players?search=${encodeURIComponent(q)}&hasAccount=true`);
      setResults(res.ok ? await res.json() : []);
      setSearched(true);
    }, 250);
  }, []);

  const add = async (player: Parameters<typeof abcAddPlayerAction>[1]) => {
    setBusy(true);
    onError(null);
    const res = await abcAddPlayerAction(tournamentId, player, level);
    setBusy(false);
    if ("error" in res && res.error) { onError(res.error); return; }
    if (res.ok) { onAdded(res.entry); reset(); }
  };

  if (mode === null) {
    return (
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        <button className="ghost" style={small} onClick={() => setMode("search")}>+ {t("add_player_existing")}</button>
        <button className="ghost" style={small} onClick={() => setMode("manual")}>+ {t("add_player_guest")}</button>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 8, marginBottom: 14, padding: 12, border: "2px solid var(--border)", borderRadius: 8, background: "var(--surface-2)" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <strong style={{ fontSize: 13 }}>{mode === "search" ? t("add_player_existing") : t("add_player_guest")}</strong>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, marginLeft: "auto" }}>
          {t("col_level")}
          <LevelSelect value={level} onChange={setLevel} />
        </label>
      </div>

      {mode === "search" ? (
        <div style={{ position: "relative" }}>
          <input
            placeholder={t("search_placeholder")}
            value={query}
            onChange={(e) => { setQuery(e.target.value); search(e.target.value); }}
            autoFocus
            style={{ width: "100%" }}
          />
          {results.length > 0 && (
            <div style={{ marginTop: 4, background: "var(--surface)", border: "2px solid var(--border)", borderRadius: 8, maxHeight: 200, overflowY: "auto" }}>
              {results.slice(0, 20).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  disabled={busy}
                  onClick={() => add({ type: "existing", playerId: p.id })}
                  style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", background: "none", border: "none", borderBottom: "1px solid var(--border-light)", cursor: "pointer", boxShadow: "none", color: "var(--text)" }}
                >
                  <strong style={{ fontSize: 13 }}>{p.name}</strong>
                  <span className="meta" style={{ marginLeft: 8, fontSize: 12 }}>{p.city ? `${p.city}, ` : ""}{p.country}</span>
                </button>
              ))}
            </div>
          )}
          {searched && results.length === 0 && (
            <p className="meta" style={{ margin: "6px 0 0", fontSize: 12 }}>
              {t("search_no_results")}{" "}
              <button type="button" className="link-btn" onClick={() => { setName(query); setMode("manual"); }} style={{ background: "none", border: "none", padding: 0, textDecoration: "underline", cursor: "pointer", fontSize: 12, boxShadow: "none", color: "inherit" }}>
                {t("search_add_as_guest")}
              </button>
            </p>
          )}
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim() || !country.trim()) { onError(t("guest_required")); return; }
            add({ type: "manual", name: name.trim(), city: city.trim() || null, country: country.trim() });
          }}
          style={{ display: "grid", gap: 8 }}
        >
          <div className="edit-grid-3" style={{ gap: 8 }}>
            <input placeholder={t("guest_name")} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            <input placeholder={t("guest_city")} value={city} onChange={(e) => setCity(e.target.value)} />
            <input placeholder={t("guest_country")} value={country} onChange={(e) => setCountry(e.target.value)} />
          </div>
          <p className="meta" style={{ margin: 0, fontSize: 12 }}>{t("guest_hint")}</p>
          <div>
            <button className="primary" type="submit" style={small} disabled={busy}>{busy ? "…" : t("btn_add")}</button>
          </div>
        </form>
      )}

      <div>
        <button className="ghost" type="button" style={small} onClick={reset}>{t("cancel")}</button>
      </div>
    </div>
  );
}
