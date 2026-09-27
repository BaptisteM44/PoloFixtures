"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

type Rule = "rotation" | "cross_groups" | "manual";
type RefMatch = {
  id: string; startAt: string; court: string | null; status: string;
  stageKey: string; groupKey: string | null;
  teamA: string | null; teamB: string | null; teamAId: string | null; teamBId: string | null;
  refereeTeamId: string | null; refereeTeam: string | null; refereeAuto: boolean;
};
type RefData = {
  canManage: boolean;
  hidden: boolean;
  visible: boolean;
  rules: Record<string, Rule>;
  stages: { key: string; name: string | null }[];
  teams: { id: string; name: string; count: number }[];
  myTeamIds: string[];
  conflicts: { matchId: string; reason: string }[];
  matches: RefMatch[];
};

const RULES: Rule[] = ["rotation", "cross_groups", "manual"];

/**
 * Onglet « Arbitrage » : les équipes désignées pour arbitrer chaque match
 * (l'équipe s'organise en interne). L'orga choisit une règle par étape,
 * répartit automatiquement, corrige à la main et peut cacher les
 * désignations ; les joueurs voient les arbitrages de leur équipe en tête.
 */
export function RefereeTab({ tournamentId, tournamentSlug }: { tournamentId: string; tournamentSlug: string }) {
  const t = useTranslations("referee_tab");
  const locale = useLocale();
  const [data, setData] = useState<RefData | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/tournaments/${tournamentId}/referees`, { cache: "no-store" });
    if (res.ok) setData(await res.json());
  }, [tournamentId]);
  useEffect(() => { load(); }, [load]);

  const time = (iso: string) => new Date(iso).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  const day = (iso: string) => new Date(iso).toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" });

  const call = async (url: string, method: string, body: unknown) => {
    setBusy(true);
    setNotice(null);
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setNotice(t("error")); return null; }
    await load();
    return json;
  };
  const setRule = (key: string, rule: Rule) => call(`/api/tournaments/${tournamentId}/referees`, "PATCH", { rules: { [key]: rule } });
  const setHidden = (hidden: boolean) => call(`/api/tournaments/${tournamentId}/referees`, "PATCH", { hidden });
  const assign = async (mode: "fill" | "recompute") => {
    if (mode === "recompute" && !confirm(t("confirm_recompute"))) return;
    const res = await call(`/api/tournaments/${tournamentId}/referees/assign`, "POST", { mode });
    if (res) setNotice(t("assigned", { count: res.assigned ?? 0, conflicts: res.conflicts?.length ?? 0 }));
  };
  const setMatchReferee = (matchId: string, teamId: string) =>
    call(`/api/tournaments/${tournamentId}/referees/match`, "POST", { matchId, teamId: teamId || null });

  const conflictOf = useMemo(() => new Map((data?.conflicts ?? []).map((c) => [c.matchId, c.reason])), [data]);

  if (!data) return <div className="panel ref-tab"><p className="meta">{t("loading")}</p></div>;

  const mine = new Set(data.myTeamIds);
  const myDuties = data.matches.filter((m) => m.refereeTeamId && mine.has(m.refereeTeamId) && m.status !== "FINISHED");
  const stageName = (key: string) => data.stages.find((s) => s.key === key)?.name ?? null;
  const byStage = data.stages.map((s) => ({ ...s, matches: data.matches.filter((m) => m.stageKey === s.key) }));
  const unknownStage = data.matches.filter((m) => !data.stages.some((s) => s.key === m.stageKey));
  if (unknownStage.length > 0) byStage.push({ key: "__other", name: null, matches: unknownStage });

  return (
    <div className="panel ref-tab">
      <div>
        <h2 style={{ margin: "0 0 4px" }}>🟨 {t("title")}</h2>
        <p className="meta" style={{ margin: 0 }}>{t("intro")}</p>
      </div>

      {/* Mes arbitrages */}
      {data.visible && myDuties.length > 0 && (
        <div className="ref-tab__mine">
          <strong>{t("my_duties", { count: myDuties.length })}</strong>
          <ul>
            {myDuties.map((m) => (
              <li key={m.id}>
                <span className="ref-tab__time">{day(m.startAt)} · {time(m.startAt)}</span>
                {m.court && <span className="ref-tab__court">{m.court}</span>}
                <span>{m.teamA ?? "?"} – {m.teamB ?? "?"}</span>
              </li>
            ))}
          </ul>
          <Link href={`/tournament/${tournamentSlug}/referee`} className="primary" style={{ justifySelf: "start", fontSize: 13 }}>
            {t("open_panel")}
          </Link>
          <p className="meta" style={{ margin: 0 }}>{t("my_duties_hint")}</p>
        </div>
      )}

      {!data.visible && <p className="ref-tab__hidden">🔒 {t("hidden_for_players")}</p>}

      {/* Réglages (orga) */}
      {data.canManage && (
        <div className="ref-tab__settings">
          <h3 style={{ margin: 0 }}>{t("settings_title")}</h3>
          {data.stages.map((s) => (
            <label key={s.key} className="ref-tab__rule">
              <span>{s.name ?? t("all_matches")}</span>
              <select value={data.rules[s.key] ?? "manual"} disabled={busy} onChange={(e) => setRule(s.key, e.target.value as Rule)}>
                {RULES.map((r) => <option key={r} value={r}>{t(`rule_${r}`)}</option>)}
              </select>
            </label>
          ))}
          <p className="meta" style={{ margin: 0 }}>{t("rules_hint")}</p>
          <label className="ref-tab__toggle">
            <input type="checkbox" checked={!data.hidden} disabled={busy} onChange={(e) => setHidden(!e.target.checked)} />
            {t("visible_toggle")}
          </label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="primary" disabled={busy} onClick={() => assign("fill")}>⚡ {t("btn_fill")}</button>
            <button type="button" className="ghost" disabled={busy} onClick={() => assign("recompute")}>{t("btn_recompute")}</button>
          </div>
          {notice && <p className="ref-tab__notice">{notice}</p>}
          {data.conflicts.length > 0 && (
            <p className="ref-tab__conflict">⚠️ {t("conflicts", { count: data.conflicts.length })}</p>
          )}
        </div>
      )}

      {/* Charge par équipe */}
      {data.visible && data.teams.some((x) => x.count > 0) && (
        <div className="ref-tab__load">
          {data.teams.map((x) => (
            <span key={x.id} className={`ref-tab__chip${mine.has(x.id) ? " is-mine" : ""}`}>{x.name} · {x.count}</span>
          ))}
        </div>
      )}

      {/* Les matchs */}
      {data.matches.length === 0 ? (
        <p className="meta">{t("no_matches")}</p>
      ) : byStage.filter((s) => s.matches.length > 0).map((s) => (
        <div key={s.key} className="ref-tab__stage">
          {byStage.length > 1 && <h3>{s.name ?? stageName(s.key) ?? t("all_matches")}</h3>}
          <div className="ref-tab__list">
            {s.matches.map((m) => {
              const conflict = conflictOf.get(m.id);
              const isMine = !!m.refereeTeamId && mine.has(m.refereeTeamId);
              return (
                <div key={m.id} className={`ref-tab__row${m.status === "FINISHED" ? " is-done" : ""}${isMine ? " is-mine" : ""}${conflict ? " is-conflict" : ""}`}>
                  <span className="ref-tab__time">{time(m.startAt)}</span>
                  <span className="ref-tab__court">{m.court ?? ""}</span>
                  <span className="ref-tab__teams">{m.teamA ?? "?"} – {m.teamB ?? "?"}</span>
                  <span className="ref-tab__ref">
                    {data.canManage && m.status !== "FINISHED" ? (
                      <select value={m.refereeTeamId ?? ""} disabled={busy} onChange={(e) => setMatchReferee(m.id, e.target.value)}>
                        <option value="">—</option>
                        {data.teams.filter((x) => x.id !== m.teamAId && x.id !== m.teamBId).map((x) => (
                          <option key={x.id} value={x.id}>{x.name}</option>
                        ))}
                      </select>
                    ) : (
                      <>🟨 {data.visible ? (m.refereeTeam ?? "—") : "🔒"}</>
                    )}
                    {data.canManage && m.refereeTeamId && (
                      <small className="meta">{m.refereeAuto ? t("auto") : t("manual")}</small>
                    )}
                    {conflict && <small className="ref-tab__conflict">{t(`conflict_${conflict}`)}</small>}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
