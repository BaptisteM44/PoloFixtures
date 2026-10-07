"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { rankCandidates, isHardBlocked, type RefMatch, type RefereeRule, type RestPolicy, type CandidateState } from "@/engine/referees";

type ApiMatch = {
  id: string; startAt: string; court: string | null; status: string; started: boolean;
  stageKey: string; groupKey: string | null;
  teamA: string | null; teamB: string | null; teamAId: string | null; teamBId: string | null;
  refereeTeamId: string | null; refereeTeam: string | null; refereeAuto: boolean;
};
type RefData = {
  canManage: boolean;
  hidden: boolean;
  visible: boolean;
  configured: boolean;
  timezone: string;
  slotMs: number;
  settings: { rules: Record<string, RefereeRule>; rest: RestPolicy; excluded: string[] };
  stages: { key: string; name: string | null; groups: number }[];
  teams: { id: string; name: string; count: number }[];
  myTeamIds: string[];
  conflicts: { matchId: string; reason: string }[];
  matches: ApiMatch[];
};

const RESTS: RestPolicy[] = ["after", "both", "none"];
const STATE_ICON: Record<CandidateState, string> = {
  ok: "✅", just_played: "⚠️", plays_next: "⚠️", plays: "⛔", refs: "⛔", own: "⛔", excluded: "🚫",
};

/**
 * Onglet « Arbitres » (bêta) : chaque match est arbitré par une équipe, qui
 * s'organise en interne. Joueurs : leur programme (jouer / arbitrer) en tête.
 * Orga : réglages (règle par étape, repos, équipes dispensées, visibilité),
 * alertes, et un sélecteur qui montre qui est libre, reposé ou occupé.
 */
export function RefereeTab({ tournamentId, tournamentSlug }: { tournamentId: string; tournamentSlug: string }) {
  const t = useTranslations("referee_tab");
  const locale = useLocale();
  const [data, setData] = useState<RefData | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [view, setView] = useState<"mine" | "all" | "todo">("all");
  const [showDone, setShowDone] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pickFor, setPickFor] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const viewChosen = useRef(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/referees`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const json: RefData = await res.json();
      setData(json);
      setLoadError(false);
      if (!viewChosen.current) {
        viewChosen.current = true;
        if (!json.canManage && json.myTeamIds.length > 0 && json.visible) setView("mine");
      }
    } catch {
      setLoadError(true);
    }
  }, [tournamentId]);
  useEffect(() => { load(); }, [load]);

  // Direct : chaque match lancé/fini recale le planning et les désignations.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const es = new EventSource(`/api/sse?tournamentId=${tournamentId}`);
    const refresh = () => { if (timer) clearTimeout(timer); timer = setTimeout(load, 1500); };
    es.addEventListener("match", refresh);
    es.addEventListener("tournament", refresh);
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    return () => { es.close(); if (timer) clearTimeout(timer); clearInterval(tick); };
  }, [tournamentId, load]);

  useEffect(() => {
    if (!pickFor) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setPickFor(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pickFor]);

  const tz = data?.timezone || "UTC";
  const fmtTime = useMemo(() => new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", timeZone: tz }), [locale, tz]);
  const fmtDay = useMemo(() => new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", timeZone: tz }), [locale, tz]);
  const dayKey = useMemo(() => new Intl.DateTimeFormat("en-CA", { timeZone: tz }), [tz]);

  const refMatches: RefMatch[] = useMemo(() => (data?.matches ?? []).map((m) => ({
    id: m.id, startAt: new Date(m.startAt), courtName: m.court, teamAId: m.teamAId, teamBId: m.teamBId,
    stageKey: m.stageKey, groupKey: m.groupKey, status: m.status, started: m.started,
    refereeTeamId: m.refereeTeamId, refereeAuto: m.refereeAuto,
  })), [data]);

  if (loadError && !data) {
    return (
      <div className="panel ref-tab">
        <p className="ref-tab__error">{t("load_error")}</p>
        <button type="button" className="ghost" onClick={() => { setLoadError(false); load(); }} style={{ justifySelf: "start" }}>{t("retry")}</button>
      </div>
    );
  }
  if (!data) return <div className="panel ref-tab"><p className="meta">{t("loading")}</p></div>;

  const call = async (url: string, method: string, body: unknown) => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setNotice(t("error")); return null; }
      await load();
      return json;
    } catch {
      setNotice(t("error"));
      return null;
    } finally {
      setBusy(false);
    }
  };
  const patch = async (body: Record<string, unknown>) => {
    const res = await call(`/api/tournaments/${tournamentId}/referees`, "PATCH", body);
    if (res && typeof res.assigned === "number") setNotice(t("assigned", { count: res.assigned, conflicts: (res.conflicts ?? []).filter((c: { reason: string }) => c.reason === "no_candidate").length }));
    return res;
  };
  const assign = async (mode: "fill" | "recompute") => {
    if (mode === "recompute" && !confirm(t("confirm_recompute"))) return;
    const res = await call(`/api/tournaments/${tournamentId}/referees/assign`, "POST", { mode });
    if (res) setNotice(t("assigned", { count: res.assigned ?? 0, conflicts: (res.conflicts ?? []).filter((c: { reason: string }) => c.reason === "no_candidate").length }));
  };
  const setMatchReferee = async (matchId: string, teamId: string | null, auto = false) => {
    const res = await call(`/api/tournaments/${tournamentId}/referees/match`, "POST", { matchId, teamId, auto });
    if (res) setPickFor(null);
  };

  // ── Données dérivées ─────────────────────────────────────────────────────
  const mine = new Set(data.myTeamIds);
  const teamName = new Map(data.teams.map((x) => [x.id, x.name]));
  const excluded = new Set(data.settings.excluded);
  const conflictOf = new Map(data.conflicts.map((c) => [c.matchId, c.reason]));
  const ruleOf = (stageKey: string) => data.settings.rules[stageKey] ?? "manual";
  const assignable = (m: ApiMatch) => !m.started && m.status !== "FINISHED" && !!m.teamAId && !!m.teamBId;
  const unassigned = data.matches.filter((m) => assignable(m) && !m.refereeTeamId && ruleOf(m.stageKey) !== "manual");
  const unassignedIds = new Set(unassigned.map((m) => m.id));
  const todo = new Set([...unassignedIds, ...data.conflicts.map((c) => c.matchId)]);
  const isMineMatch = (m: ApiMatch) => (!!m.teamAId && mine.has(m.teamAId)) || (!!m.teamBId && mine.has(m.teamBId)) || (!!m.refereeTeamId && mine.has(m.refereeTeamId));
  const multiDay = new Set(data.matches.map((m) => dayKey.format(new Date(m.startAt)))).size > 1;

  // Sur chaque terrain, le premier match pas encore lancé derrière un match en cours/fini = « à suivre ».
  const onDeck = new Set<string>();
  const byCourt = new Map<string, ApiMatch[]>();
  for (const m of data.matches) {
    const k = m.court ?? "";
    if (!byCourt.has(k)) byCourt.set(k, []);
    byCourt.get(k)!.push(m);
  }
  for (const list of byCourt.values()) {
    const sorted = [...list].sort((a, b) => a.startAt.localeCompare(b.startAt));
    const i = sorted.findIndex((m) => !m.started && m.status !== "FINISHED");
    if (i > 0 || (i === 0 && sorted[0].status === "LIVE")) onDeck.add(sorted[i].id);
  }

  const relTime = (m: ApiMatch) => {
    if (m.started && m.status === "LIVE") return t("live_now");
    if (onDeck.has(m.id)) return t("on_deck");
    const mins = Math.round((new Date(m.startAt).getTime() - now) / 60_000);
    if (mins <= 0) return t("any_minute");
    if (mins < 90) return t("in_minutes", { count: mins });
    return null;
  };

  // Mon programme : mes matchs à jouer et à arbitrer, dans l'ordre.
  const myProgram = data.visible
    ? data.matches.filter((m) => m.status !== "FINISHED" && isMineMatch(m)).slice(0, 8)
    : [];
  const myDutyCount = data.matches.filter((m) => m.status !== "FINISHED" && m.refereeTeamId && mine.has(m.refereeTeamId)).length;

  // Liste filtrée
  const done = data.matches.filter((m) => m.status === "FINISHED");
  const shown = data.matches.filter((m) => {
    if (view === "mine" && !isMineMatch(m)) return false;
    if (view === "todo" && !todo.has(m.id)) return false;
    if (m.status === "FINISHED" && !showDone && view !== "todo") return false;
    return true;
  });
  const stageName = (key: string) => data.stages.find((s) => s.key === key)?.name ?? null;
  const sections: { key: string; title: string | null; matches: ApiMatch[] }[] = [];
  for (const m of shown) {
    const sk = m.stageKey;
    const dk = multiDay ? dayKey.format(new Date(m.startAt)) : "";
    const key = `${dk}|${sk}`;
    let sec = sections[sections.length - 1];
    if (!sec || sec.key !== key) {
      const parts = [multiDay ? fmtDay.format(new Date(m.startAt)) : null, data.stages.length > 1 ? stageName(sk) : null].filter(Boolean);
      sec = { key, title: parts.length ? parts.join(" · ") : null, matches: [] };
      sections.push(sec);
    }
    sec.matches.push(m);
  }

  const ruleSummary = () => {
    const used = data.stages.map((s) => ruleOf(s.key));
    const uniq = [...new Set(used)];
    return uniq.length === 1 ? t(`rule_${uniq[0]}`) : t("rules_mixed");
  };
  const pickMatch = pickFor ? data.matches.find((m) => m.id === pickFor) ?? null : null;
  const candidates = pickMatch
    ? rankCandidates({
        matches: refMatches, teamIds: data.teams.map((x) => x.id),
        options: { rules: data.settings.rules, rest: data.settings.rest, excluded: data.settings.excluded, slotMs: data.slotMs },
        matchId: pickMatch.id,
      })
    : [];
  const label = (m: ApiMatch) => `${m.teamA ?? "?"} – ${m.teamB ?? "?"}`;

  return (
    <div className="panel ref-tab">
      <header className="ref-tab__head">
        <div>
          <h2>🟨 {t("title")} <span className="ref-tab__beta">{t("beta")}</span></h2>
          <p className="meta">{t("intro")}</p>
        </div>
        <Link href="/labs" className="ref-tab__feedback">💬 {t("feedback")}</Link>
      </header>

      {!data.visible && <p className="ref-tab__hidden">🔒 {t("hidden_for_players")}</p>}

      {/* ── Mon programme ───────────────────────────────────────────── */}
      {myProgram.length > 0 && (
        <section className="ref-tab__program" aria-label={t("program_title")}>
          <h3>{t("program_title")}</h3>
          <ol>
            {myProgram.map((m, i) => {
              const refs = !!m.refereeTeamId && mine.has(m.refereeTeamId);
              const myId = [m.teamAId, m.teamBId].find((x) => x && mine.has(x));
              const opponent = myId === m.teamAId ? m.teamB : m.teamA;
              const rt = relTime(m);
              return (
                <li key={m.id} className={`ref-prog${refs ? " is-ref" : " is-play"}${i === 0 ? " is-next" : ""}`}>
                  <span className="ref-prog__time">{fmtTime.format(new Date(m.startAt))}</span>
                  <span className="ref-prog__what">
                    <strong>{refs ? `🟨 ${t("you_ref")}` : `🏑 ${t("you_play", { opponent: opponent ?? "?" })}`}</strong>
                    <small>{[refs ? label(m) : null, m.court].filter(Boolean).join(" · ")}</small>
                  </span>
                  {rt && <span className={`ref-prog__when${m.started || onDeck.has(m.id) ? " is-hot" : ""}`}>{rt}</span>}
                </li>
              );
            })}
          </ol>
          {myDutyCount > 0 && (
            <>
              <Link href={`/tournament/${tournamentSlug}/referee`} className="primary ref-tab__panel-btn">🟨 {t("open_panel")}</Link>
              <p className="meta">{t("my_duties_hint")}</p>
            </>
          )}
          <p className="meta ref-tab__estimate">{t("times_estimated")}</p>
        </section>
      )}

      {/* ── Orga : premier réglage ─────────────────────────────────── */}
      {data.canManage && !data.configured && (
        <section className="ref-tab__onboard">
          <h3>{t("onboard_title")}</h3>
          <p className="meta">{t("onboard_text")}</p>
          <div className="ref-tab__onboard-choices">
            <button type="button" className="primary" disabled={busy}
              onClick={() => patch({ rules: Object.fromEntries(data.stages.map((s) => [s.key, "rotation"])) })}>
              ⚡ {t("onboard_auto")}
            </button>
            {data.stages.some((s) => s.groups >= 2) && (
              <button type="button" className="ghost" disabled={busy}
                onClick={() => patch({ rules: Object.fromEntries(data.stages.map((s) => [s.key, s.groups >= 2 ? "cross_groups" : "rotation"])) })}>
                🔀 {t("onboard_cross")}
              </button>
            )}
          </div>
          <p className="meta">{t("onboard_manual")}</p>
        </section>
      )}

      {/* ── Orga : réglages (repliés une fois configurés) ───────────── */}
      {data.canManage && data.configured && (
        <section className="ref-tab__settings">
          {!settingsOpen ? (
            <div className="ref-tab__summary">
              <span>⚙️ {ruleSummary()} · {t(`rest_short_${data.settings.rest}`)} · {data.hidden ? `🔒 ${t("hidden_short")}` : `👁 ${t("visible_short")}`}
                {data.settings.excluded.length > 0 && <> · {t("excluded_short", { count: data.settings.excluded.length })}</>}
              </span>
              <button type="button" className="ghost" onClick={() => setSettingsOpen(true)}>{t("edit_settings")}</button>
            </div>
          ) : (
            <div className="ref-tab__settings-body">
              <div className="ref-tab__settings-top">
                <h3>{t("settings_title")}</h3>
                <button type="button" className="ghost" onClick={() => setSettingsOpen(false)}>{t("close")}</button>
              </div>
              {data.stages.map((s) => (
                <label key={s.key} className="ref-tab__field">
                  <span>{s.name ?? t("all_matches")}</span>
                  <select value={ruleOf(s.key)} disabled={busy} onChange={(e) => patch({ rules: { [s.key]: e.target.value } })}>
                    <option value="rotation">{t("rule_rotation")}</option>
                    {s.groups >= 2 && <option value="cross_groups">{t("rule_cross_groups")}</option>}
                    <option value="manual">{t("rule_manual")}</option>
                  </select>
                </label>
              ))}
              <label className="ref-tab__field">
                <span>{t("rest_label")}</span>
                <select value={data.settings.rest} disabled={busy} onChange={(e) => patch({ rest: e.target.value })}>
                  {RESTS.map((r) => <option key={r} value={r}>{t(`rest_${r}`)}</option>)}
                </select>
              </label>
              <p className="meta">{t("rules_hint")}</p>
              <div className="ref-tab__field ref-tab__field--block">
                <span>{t("excluded_label")}</span>
                <div className="ref-tab__chips">
                  {data.teams.map((x) => {
                    const off = excluded.has(x.id);
                    return (
                      <button key={x.id} type="button" disabled={busy} aria-pressed={off}
                        className={`ref-tab__chip ref-tab__chip--toggle${off ? " is-off" : ""}`}
                        onClick={() => patch({ excluded: off ? data.settings.excluded.filter((id) => id !== x.id) : [...data.settings.excluded, x.id] })}>
                        {off ? "🚫 " : ""}{x.name}
                      </button>
                    );
                  })}
                </div>
                <small className="meta">{t("excluded_hint")}</small>
              </div>
              <label className="ref-tab__toggle">
                <input type="checkbox" checked={!data.hidden} disabled={busy} onChange={(e) => patch({ hidden: !e.target.checked })} />
                {t("visible_toggle")}
              </label>
              <div className="ref-tab__actions">
                <button type="button" className="primary" disabled={busy} onClick={() => assign("fill")}>⚡ {t("btn_fill")}</button>
                <button type="button" className="ghost" disabled={busy} onClick={() => assign("recompute")}>{t("btn_recompute")}</button>
              </div>
            </div>
          )}
          {notice && <p className="ref-tab__notice" role="status">{notice}</p>}
        </section>
      )}
      {!data.canManage && notice && <p className="ref-tab__notice" role="status">{notice}</p>}

      {/* ── Orga : ce qui demande une action ───────────────────────── */}
      {data.canManage && todo.size > 0 && (
        <button type="button" className="ref-tab__alert" onClick={() => setView(view === "todo" ? "all" : "todo")}>
          ⚠️ {[
            unassigned.length > 0 ? t("alert_unassigned", { count: unassigned.length }) : null,
            data.conflicts.length > 0 ? t("alert_conflicts", { count: data.conflicts.length }) : null,
          ].filter(Boolean).join(" · ")}
          <span>{view === "todo" ? t("show_all") : t("show_todo")}</span>
        </button>
      )}

      {/* ── Filtres ────────────────────────────────────────────────── */}
      {data.matches.length > 0 && (
        <div className="ref-tab__filters">
          <div className="ref-tab__seg" role="tablist">
            {mine.size > 0 && data.visible && (
              <button type="button" role="tab" aria-selected={view === "mine"} className={view === "mine" ? "is-on" : ""} onClick={() => setView("mine")}>{t("filter_mine")}</button>
            )}
            <button type="button" role="tab" aria-selected={view === "all"} className={view === "all" ? "is-on" : ""} onClick={() => setView("all")}>{t("filter_all")}</button>
            {data.canManage && todo.size > 0 && (
              <button type="button" role="tab" aria-selected={view === "todo"} className={view === "todo" ? "is-on" : ""} onClick={() => setView("todo")}>{t("filter_todo", { count: todo.size })}</button>
            )}
          </div>
          {done.length > 0 && view !== "todo" && (
            <button type="button" className="ref-tab__done-toggle" onClick={() => setShowDone((v) => !v)}>
              {showDone ? t("hide_done") : t("show_done", { count: done.length })}
            </button>
          )}
        </div>
      )}

      {/* ── Charge par équipe ──────────────────────────────────────── */}
      {data.visible && data.teams.some((x) => x.count > 0) && (
        <div className="ref-tab__load">
          <span className="ref-tab__load-title">{t("load_title")}</span>
          <div className="ref-tab__chips">
            {[...data.teams].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).map((x) => (
              <span key={x.id} className={`ref-tab__chip${mine.has(x.id) ? " is-mine" : ""}${excluded.has(x.id) ? " is-off" : ""}`}>
                {x.name} <b>{x.count}</b>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Les matchs ─────────────────────────────────────────────── */}
      {data.matches.length === 0 ? (
        <p className="meta">{t("no_matches")}</p>
      ) : shown.length === 0 ? (
        <p className="meta">{view === "todo" ? t("nothing_todo") : t("nothing_here")}</p>
      ) : sections.map((sec) => (
        <section key={sec.key} className="ref-tab__stage">
          {sec.title && <h3>{sec.title}</h3>}
          <ul className="ref-tab__list">
            {sec.matches.map((m) => {
              const conflict = conflictOf.get(m.id);
              const isUnassigned = unassignedIds.has(m.id);
              const refMine = !!m.refereeTeamId && mine.has(m.refereeTeamId);
              const playMine = (!!m.teamAId && mine.has(m.teamAId)) || (!!m.teamBId && mine.has(m.teamBId));
              const live = m.status === "LIVE" && m.started;
              const editable = data.canManage && !m.started && m.status !== "FINISHED" && !!m.teamAId && !!m.teamBId;
              const refText = !data.visible ? "🔒" : m.refereeTeam ?? (isUnassigned ? t("no_referee") : "—");
              return (
                <li key={m.id} className={`ref-row${m.status === "FINISHED" ? " is-done" : ""}${refMine ? " is-ref-mine" : ""}${playMine ? " is-play-mine" : ""}${conflict || isUnassigned ? " is-alert" : ""}`}>
                  <span className="ref-row__time">
                    {fmtTime.format(new Date(m.startAt))}
                    {live && <em className="ref-row__live">{t("live")}</em>}
                    {!live && onDeck.has(m.id) && <em className="ref-row__deck">{t("next_short")}</em>}
                  </span>
                  <span className="ref-row__match">
                    <span className="ref-row__teams">{label(m)}</span>
                    {m.court && <small>{m.court}</small>}
                  </span>
                  {editable ? (
                    <button type="button" className={`ref-row__ref ref-row__ref--btn${!m.refereeTeamId ? " is-empty" : ""}`}
                      onClick={() => setPickFor(m.id)} aria-label={t("choose_for", { match: label(m) })}>
                      <span>🟨 {refText}</span>
                      <small>{m.refereeTeamId ? (m.refereeAuto ? t("auto") : t("manual")) : t("tap_to_choose")}</small>
                    </button>
                  ) : (
                    <span className="ref-row__ref"><span>🟨 {refText}</span></span>
                  )}
                  {(conflict || (isUnassigned && data.canManage)) && (
                    <small className="ref-row__problem">{conflict ? t(`conflict_${conflict}`) : t("conflict_no_candidate")}</small>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {/* ── Sélecteur de l'orga ────────────────────────────────────── */}
      {pickMatch && (
        <div className="ref-sheet-backdrop" onClick={() => setPickFor(null)}>
          <div className="ref-sheet" role="dialog" aria-modal="true" aria-label={t("pick_title")} onClick={(e) => e.stopPropagation()}>
            <div className="ref-sheet__head">
              <div>
                <h3>{t("pick_title")}</h3>
                <p className="meta">{label(pickMatch)} · {fmtTime.format(new Date(pickMatch.startAt))}{pickMatch.court ? ` · ${pickMatch.court}` : ""}</p>
              </div>
              <button type="button" className="ghost" onClick={() => setPickFor(null)} aria-label={t("close")}>✕</button>
            </div>
            <ul className="ref-sheet__list">
              {candidates.map((c) => {
                const blocked = isHardBlocked(c.state);
                const current = pickMatch.refereeTeamId === c.teamId;
                const restWarn = !blocked && c.state !== "ok";
                return (
                  <li key={c.teamId}>
                    <button type="button" disabled={blocked || busy || current} className={`ref-cand${current ? " is-current" : ""}${blocked ? " is-blocked" : ""}${restWarn ? " is-warn" : ""}`}
                      onClick={() => setMatchReferee(pickMatch.id, c.teamId)}>
                      <span className="ref-cand__name">{STATE_ICON[c.state]} {teamName.get(c.teamId)}</span>
                      <span className="ref-cand__why">
                        {current ? t("cand_current") : c.rested && c.state === "ok" ? t("cand_rested") : t(`cand_${c.state}`)}
                        {c.done && !blocked ? ` · ${t("cand_done")}` : ""}
                      </span>
                      <span className="ref-cand__load">{t("cand_load", { count: c.load })}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="ref-sheet__foot">
              {ruleOf(pickMatch.stageKey) !== "manual" && (
                <button type="button" className="ghost" disabled={busy} onClick={() => setMatchReferee(pickMatch.id, null, true)}>↺ {t("pick_auto")}</button>
              )}
              {pickMatch.refereeTeamId && (
                <button type="button" className="ghost" disabled={busy} onClick={() => setMatchReferee(pickMatch.id, null)}>{t("pick_none")}</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
