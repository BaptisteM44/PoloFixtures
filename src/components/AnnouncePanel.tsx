"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

type Props = {
  tournamentId: string;
  format?: string;
};

type Recipient = {
  playerId: string;
  name: string;
  isCaptain: boolean;
  groupId: string;
  groupName: string;
  inSelection: boolean;
  feePaid: boolean;
  needsAccommodation: boolean;
  reachable: boolean;
};

type Preset = "in" | "waitlist" | "unpaid" | "accommodation" | "captains";

const PRESET_MATCH: Record<Preset, (r: Recipient) => boolean> = {
  in: (r) => r.inSelection,
  waitlist: (r) => !r.inSelection,
  unpaid: (r) => r.inSelection && !r.feePaid,
  accommodation: (r) => r.needsAccommodation,
  captains: (r) => r.inSelection && r.isCaptain,
};

export function AnnouncePanel({ tournamentId }: Props) {
  const t = useTranslations("tournament");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [recipients, setRecipients] = useState<Recipient[] | null>(null);
  const [isSolo, setIsSolo] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<"idle" | "sending" | "ok" | "error" | "mailer_unavailable">("idle");
  const [result, setResult] = useState<{ sent: number; errors: string[]; skipped: number; failReason: string | null; failedPlayerIds: string[] } | null>(null);

  const applyPreset = (list: Recipient[], preset: Preset) =>
    setChecked(new Set(list.filter((r) => r.reachable && PRESET_MATCH[preset](r)).map((r) => r.playerId)));

  useEffect(() => {
    fetch(`/api/tournaments/${tournamentId}/announce`)
      .then((r) => (r.ok ? r.json() : { recipients: [], isSolo: false }))
      .then((d: { recipients: Recipient[]; isSolo: boolean }) => {
        setRecipients(d.recipients);
        setIsSolo(d.isSolo);
        applyPreset(d.recipients, "in");
      })
      .catch(() => setRecipients([]));
  }, [tournamentId]);

  const groups = useMemo(() => {
    const map = new Map<string, { id: string; name: string; inSelection: boolean; members: Recipient[] }>();
    for (const r of recipients ?? []) {
      const g = map.get(r.groupId) ?? { id: r.groupId, name: r.groupName, inSelection: r.inSelection, members: [] };
      g.members.push(r);
      map.set(r.groupId, g);
    }
    return [...map.values()];
  }, [recipients]);

  const presets: Preset[] = isSolo ? ["in", "waitlist", "unpaid"] : ["in", "waitlist", "unpaid", "accommodation", "captains"];
  const presetCount = (p: Preset) => (recipients ?? []).filter((r) => r.reachable && PRESET_MATCH[p](r)).length;

  const toggle = (ids: string[], on: boolean) =>
    setChecked((prev) => {
      const next = new Set(prev);
      for (const id of ids) (on ? next.add(id) : next.delete(id));
      return next;
    });

  const groupLabel = (g: { id: string; name: string }) =>
    g.name || (g.id === "waitlist" ? t("announce_group_waitlist") : t("announce_group_registered"));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (checked.size === 0) return;
    if (!confirm(t("announce_confirm_count", { count: checked.size }))) return;
    setStatus("sending");
    setResult(null);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/announce`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, message, playerIds: [...checked] }),
      });
      const data = await res.json();
      if (res.ok) {
        const failedIds: string[] = data.failedPlayerIds ?? [];
        setResult({ sent: data.sent, errors: data.errors ?? [], skipped: data.skipped ?? 0, failReason: data.failReason ?? null, failedPlayerIds: failedIds });
        setStatus("ok");
        // En cas d'échecs, on garde le texte pour pouvoir le renvoyer aux seuls échecs.
        if (failedIds.length === 0) {
          setSubject("");
          setMessage("");
        }
      } else if (res.status === 503 && data?.error === "mailer_unavailable") {
        setStatus("mailer_unavailable");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  };

  const chip = (active: boolean): React.CSSProperties => ({
    fontSize: 12, padding: "3px 10px", borderRadius: 999, cursor: "pointer",
    border: "2px solid var(--border)", boxShadow: "none", textTransform: "none", letterSpacing: "normal",
    background: active ? "var(--border)" : "var(--surface)", color: active ? "var(--surface)" : "var(--text)",
  });

  return (
    <div className="panel">
      <h3 style={{ fontFamily: "var(--font-display)", fontSize: 16, marginBottom: 4 }}>
        📢 {t("announce_title")}
      </h3>
      <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
        {t("announce_subtitle")}
      </p>

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "grid", gap: 8 }}>
          <strong style={{ fontSize: 13 }}>{t("announce_recipients")}</strong>
          {recipients === null ? (
            <p className="meta" style={{ margin: 0, fontSize: 13 }}>{t("chat_loading")}</p>
          ) : recipients.length === 0 ? (
            <p className="meta" style={{ margin: 0, fontSize: 13 }}>{t("announce_no_recipients")}</p>
          ) : (
            <>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {presets.map((p) => (
                  <button key={p} type="button" style={chip(false)} onClick={() => applyPreset(recipients, p)} disabled={presetCount(p) === 0}>
                    {t(`announce_preset_${p}`)} ({presetCount(p)})
                  </button>
                ))}
                <button type="button" style={chip(false)} onClick={() => setChecked(new Set())}>
                  {t("announce_preset_none")}
                </button>
              </div>

              <div style={{ maxHeight: 320, overflowY: "auto", border: "2px solid var(--border-light)", borderRadius: 8, padding: "6px 10px", display: "grid", gap: 8 }}>
                {groups.map((g) => {
                  const reachableIds = g.members.filter((m) => m.reachable).map((m) => m.playerId);
                  const allOn = reachableIds.length > 0 && reachableIds.every((id) => checked.has(id));
                  return (
                    <div key={g.id} style={{ display: "grid", gap: 2 }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                        <input type="checkbox" checked={allOn} disabled={reachableIds.length === 0} onChange={(e) => toggle(reachableIds, e.target.checked)} />
                        {groupLabel(g)}
                        {!g.inSelection && <span className="meta" style={{ fontSize: 11, fontWeight: 600 }}>· {t("announce_status_waitlist")}</span>}
                      </label>
                      {g.members.map((m) => (
                        <label key={m.playerId} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, paddingLeft: 22, cursor: m.reachable ? "pointer" : "default", opacity: m.reachable ? 1 : 0.55 }}>
                          <input type="checkbox" checked={checked.has(m.playerId)} disabled={!m.reachable} onChange={(e) => toggle([m.playerId], e.target.checked)} />
                          {m.name}
                          {m.isCaptain && <span className="meta" style={{ fontSize: 11 }}>· {t("announce_captain")}</span>}
                          {!m.reachable && <span className="meta" style={{ fontSize: 11 }}>· {t("announce_no_email")}</span>}
                        </label>
                      ))}
                    </div>
                  );
                })}
              </div>
              <p className="meta" style={{ margin: 0, fontSize: 12 }}>{t("announce_selected_count", { count: checked.size })}</p>
            </>
          )}
        </div>

        <label className="field-row">
          {t("announce_subject")}
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder={t("announce_subject_placeholder")}
            required
            minLength={3}
          />
        </label>

        <label className="field-row">
          {t("announce_message")}
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={5}
            placeholder={t("announce_message_placeholder")}
            required
            minLength={10}
          />
        </label>

        {status === "error" && (
          <p style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>
            {t("announce_error")}
          </p>
        )}

        {status === "mailer_unavailable" && (
          <p style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>
            {t("announce_mailer_unavailable")}
          </p>
        )}

        {status === "ok" && result && (
          <p style={{ color: result.sent === 0 ? "var(--danger)" : "var(--success, green)", fontSize: 13, margin: 0 }}>
            {result.sent === 0 ? t("announce_none_sent") : t("announce_sent_count", { count: result.sent })}
            {result.errors.length > 0 && ` (${t("announce_failed_count", { count: result.errors.length })})`}
          </p>
        )}
        {status === "ok" && result && result.failReason && (
          <p style={{ color: "var(--danger)", fontSize: 12, margin: 0, fontFamily: "monospace", wordBreak: "break-word" }}>
            {t("announce_fail_reason", { reason: result.failReason })}
          </p>
        )}
        {status === "ok" && result && result.failedPlayerIds.length > 0 && (
          <div style={{ display: "grid", gap: 6 }}>
            <p style={{ color: "var(--danger)", fontSize: 12, margin: 0 }}>
              {t("announce_failed_list", {
                names: result.failedPlayerIds.map((id) => recipients?.find((r) => r.playerId === id)?.name ?? "?").join(", "),
              })}
            </p>
            <button type="button" className="ghost" style={{ justifySelf: "start", fontSize: 12 }} onClick={() => setChecked(new Set(result.failedPlayerIds))}>
              {t("announce_recheck_failed")}
            </button>
          </div>
        )}
        {status === "ok" && result && result.skipped > 0 && (
          <p className="meta" style={{ fontSize: 12, margin: 0 }}>
            {t("announce_skipped", { count: result.skipped })}
          </p>
        )}

        <div>
          <button type="submit" className="primary" disabled={status === "sending" || checked.size === 0} style={{ width: "auto" }}>
            {status === "sending" ? t("announce_sending") : t("announce_send")}
          </button>
        </div>
      </form>
    </div>
  );
}
