"use client";

import { useTranslations } from "next-intl";

type ChecklistTournament = {
  name: string;
  country: string;
  city: string;
  dateStart: string;
  dateEnd: string;
  contactEmail: string;
  registrationStart: string | null;
  registrationEnd: string | null;
  registrationFeePerTeam: number;
  fridayWelcomeName: string | null | undefined;
  saturdayEventName: string | null | undefined;
  saturdayEventAddress: string | null | undefined;
  bannerPath: string | null | undefined;
  maxTeams: number;
  courtsCount: number;
  accommodationAvailable: boolean;
  submissionStatus: "PENDING" | "APPROVED" | "REJECTED";
  rejectionReason: string | null | undefined;
  coOrganizersCount: number;
  sponsorsCount: number;
};

type CheckItem = {
  label: string;
  done: boolean;
  hint?: string;
};

function Section({ title, items }: { title: string; items: CheckItem[] }) {
  const doneCount = items.filter((i) => i.done).length;
  const allDone = doneCount === items.length;
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--text-muted)", fontFamily: "var(--font-display)" }}>{title}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: allDone ? "var(--teal)" : "var(--text-muted)" }}>{doneCount}/{items.length}</span>
      </div>
      <div style={{ display: "grid", gap: 4 }}>
        {items.map((item) => (
          <div key={item.label} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13 }}>
            <span style={{ flexShrink: 0, fontSize: 14, marginTop: 1, color: item.done ? "var(--teal)" : "var(--border)" }}>
              {item.done ? "✓" : "○"}
            </span>
            <div>
              <span style={{ color: item.done ? "var(--text)" : "var(--text-muted)", fontWeight: item.done ? 600 : 400 }}>{item.label}</span>
              {!item.done && item.hint && (
                <span style={{ display: "block", fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>{item.hint}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TournamentChecklist({ t }: { t: ChecklistTournament }) {
  const tl = useTranslations("checklist");
  const totalItems = 14;
  const doneItems = [
    !!t.name,
    !!t.country,
    !!t.city,
    !!t.dateStart && !!t.dateEnd,
    !!t.contactEmail,
    !!t.registrationStart && !!t.registrationEnd,
    t.maxTeams > 0,
    t.courtsCount > 0,
    !!t.saturdayEventName && !!t.saturdayEventAddress,
    !!t.fridayWelcomeName,
    !!t.bannerPath,
    t.sponsorsCount > 0,
    t.coOrganizersCount > 0,
    t.submissionStatus === "APPROVED",
  ].filter(Boolean).length;

  const pct = Math.round((doneItems / totalItems) * 100);

  const statusColor =
    t.submissionStatus === "APPROVED" ? "var(--teal)" :
    t.submissionStatus === "REJECTED" ? "var(--pink)" :
    "var(--yellow)";

  const statusLabel =
    t.submissionStatus === "APPROVED" ? tl("status_approved") :
    t.submissionStatus === "REJECTED" ? tl("status_rejected") :
    tl("status_pending");

  return (
    <div className="panel" style={{ padding: "20px 24px" }}>
      <h3 style={{ margin: "0 0 16px", fontFamily: "var(--font-display)", fontSize: 14 }}>{tl("title")}</h3>

      {/* Progress bar */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{tl("completion")}</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: pct === 100 ? "var(--teal)" : "var(--text)" }}>{pct}%</span>
        </div>
        <div style={{ height: 6, background: "var(--border)", borderRadius: 3, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${pct}%`, background: pct === 100 ? "var(--teal)" : "var(--yellow)", borderRadius: 3, transition: "width 0.4s ease" }} />
        </div>
      </div>

      {/* Submission status */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, padding: "10px 14px", borderRadius: 8, border: `2px solid ${statusColor}`, background: `color-mix(in srgb, ${statusColor} 10%, var(--surface))` }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: statusColor }}>{statusLabel}</span>
        {t.submissionStatus === "PENDING" && (
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{tl("pending_desc")}</span>
        )}
        {t.submissionStatus === "APPROVED" && (
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{tl("approved_desc")}</span>
        )}
      </div>

      {/* Rejection reason */}
      {t.submissionStatus === "REJECTED" && t.rejectionReason && (
        <div style={{ marginBottom: 20, padding: "12px 14px", borderRadius: 8, border: "2px solid var(--pink)", background: "color-mix(in srgb, var(--pink) 8%, var(--surface))" }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: "var(--pink)", margin: "0 0 4px" }}>{tl("rejection_reason_label")}</p>
          <p style={{ fontSize: 13, margin: 0 }}>{t.rejectionReason}</p>
        </div>
      )}

      {/* Checklist sections */}
      <Section title={tl("section_basics")} items={[
        { label: tl("item_name"), done: !!t.name },
        { label: tl("item_location"), done: !!t.country && !!t.city },
        { label: tl("item_dates"), done: !!t.dateStart && !!t.dateEnd },
        { label: tl("item_email"), done: !!t.contactEmail },
      ]} />

      <Section title={tl("section_format")} items={[
        { label: tl("item_max_teams"), done: t.maxTeams > 0 },
        { label: tl("item_courts"), done: t.courtsCount > 0 },
      ]} />

      <Section title={tl("section_registration")} items={[
        { label: tl("item_reg_dates"), done: !!t.registrationStart && !!t.registrationEnd, hint: tl("hint_reg_dates") },
      ]} />

      <Section title={tl("section_logistics")} items={[
        { label: tl("item_saturday_venue"), done: !!t.saturdayEventName && !!t.saturdayEventAddress, hint: tl("hint_saturday_venue") },
        { label: tl("item_friday_welcome"), done: !!t.fridayWelcomeName, hint: tl("hint_friday_welcome") },
      ]} />

      <Section title={tl("section_visual")} items={[
        { label: tl("item_banner"), done: !!t.bannerPath, hint: tl("hint_banner") },
        { label: tl("item_sponsors"), done: t.sponsorsCount > 0, hint: tl("hint_optional") },
        { label: tl("item_co_orga"), done: t.coOrganizersCount > 0, hint: tl("hint_optional") },
      ]} />

      <Section title={tl("section_publication")} items={[
        { label: tl("item_approved"), done: t.submissionStatus === "APPROVED", hint: tl("hint_approved") },
      ]} />
    </div>
  );
}
