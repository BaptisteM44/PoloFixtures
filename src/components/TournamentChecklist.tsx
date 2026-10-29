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
  venueName: string | null | undefined;
  venueAddress: string | null | undefined;
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
  stagesCount: number;
  usesPipeline: boolean;
};

type CheckItem = {
  label: string;
  done: boolean;
  hint?: string;
  /** Où compléter ce point : onglet du dashboard + section (cf. OrgaDashboard « orga:goto »). */
  go?: { tab: string; anchor?: string };
};

function goTo(go: CheckItem["go"]) {
  if (go) window.dispatchEvent(new CustomEvent("orga:goto", { detail: go }));
}

function Section({ title, items }: { title: string; items: CheckItem[] }) {
  const doneCount = items.filter((i) => i.done).length;
  const allDone = doneCount === items.length;
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--text-muted)", fontFamily: "var(--font-display)" }}>{title}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: allDone ? "var(--teal)" : "var(--text-muted)" }}>{doneCount}/{items.length}</span>
      </div>
      <div style={{ display: "grid", gap: 2 }}>
        {items.map((item) => {
          const body = (
            <>
              <span className={`checklist-item__state${item.done ? " is-done" : ""}`} aria-hidden>{item.done ? "✓" : ""}</span>
              <span className="checklist-item__text">
                <span className="checklist-item__label">{item.label}</span>
                {!item.done && item.hint && <span className="checklist-item__hint">{item.hint}</span>}
              </span>
              {item.go && <span className="checklist-item__go" aria-hidden>›</span>}
            </>
          );
          // Chaque point mène au champ à compléter : un vrai bouton, qui en a l'air.
          return item.go ? (
            <button key={item.label} type="button" className={`checklist-item${item.done ? " is-done" : ""}`} onClick={() => goTo(item.go)}>
              {body}
            </button>
          ) : (
            <div key={item.label} className={`checklist-item checklist-item--static${item.done ? " is-done" : ""}`}>{body}</div>
          );
        })}
      </div>
    </div>
  );
}

export function TournamentChecklist({ t }: { t: ChecklistTournament }) {
  const tl = useTranslations("checklist");
  const fiche = "config";
  const sections: Array<{ title: string; items: CheckItem[] }> = [
    { title: tl("section_basics"), items: [
      { label: tl("item_name"), done: !!t.name, go: { tab: fiche, anchor: "edit-general" } },
      { label: tl("item_location"), done: !!t.country && !!t.city, go: { tab: fiche, anchor: "edit-general" } },
      { label: tl("item_dates"), done: !!t.dateStart && !!t.dateEnd, go: { tab: fiche, anchor: "edit-general" } },
      { label: tl("item_email"), done: !!t.contactEmail, go: { tab: fiche, anchor: "edit-general" } },
    ] },
    { title: tl("section_format"), items: [
      { label: tl("item_format"), done: t.stagesCount > 0, hint: tl("hint_format"), go: { tab: "stages", anchor: "edit-format" } },
      { label: tl("item_max_teams"), done: t.maxTeams > 0, go: { tab: fiche, anchor: "edit-registration" } },
      { label: tl("item_courts"), done: t.courtsCount > 0, go: { tab: fiche, anchor: "edit-game" } },
    ] },
    { title: tl("section_registration"), items: [
      { label: tl("item_reg_dates"), done: !!t.registrationStart && !!t.registrationEnd, hint: tl("hint_reg_dates"), go: { tab: fiche, anchor: "edit-registration" } },
    ] },
    { title: tl("section_logistics"), items: [
      { label: tl("item_saturday_venue"), done: !!t.venueName && !!t.venueAddress, hint: tl("hint_saturday_venue"), go: { tab: fiche, anchor: "edit-venues" } },
      { label: tl("item_friday_welcome"), done: !!t.fridayWelcomeName, hint: tl("hint_friday_welcome"), go: { tab: fiche, anchor: "edit-venues" } },
    ] },
    { title: tl("section_visual"), items: [
      { label: tl("item_banner"), done: !!t.bannerPath, hint: tl("hint_banner"), go: { tab: fiche, anchor: "edit-banner" } },
      { label: tl("item_sponsors"), done: t.sponsorsCount > 0, hint: tl("hint_optional"), go: { tab: fiche, anchor: "edit-sponsors" } },
      { label: tl("item_co_orga"), done: t.coOrganizersCount > 0, hint: tl("hint_optional"), go: { tab: "orga", anchor: "edit-coorgs" } },
    ] },
  ];
  // La validation admin n'est pas dans le % : l'orga n'a pas la main dessus.
  const all = sections.flatMap((x) => x.items);
  const totalItems = all.length;
  const doneItems = all.filter((i) => i.done).length;

  const pct = Math.round((doneItems / totalItems) * 100);

  const statusColor = t.submissionStatus === "APPROVED" ? "var(--teal)" : "var(--pink)";
  const statusLabel = t.submissionStatus === "APPROVED" ? tl("status_approved") : tl("status_rejected");

  return (
    <div className="panel" style={{ padding: "20px 24px" }}>
      <h3 style={{ margin: "0 0 2px", fontFamily: "var(--font-display)", fontSize: 14 }}>{tl("title")}</h3>
      <p style={{ margin: "0 0 14px", fontSize: 12, color: "var(--text-muted)" }}>{tl("click_hint")}</p>

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

      {/* Submission status — « en attente » est expliqué en haut du dashboard (frise) */}
      {t.submissionStatus !== "PENDING" && <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, padding: "10px 14px", borderRadius: 8, border: `2px solid ${statusColor}`, background: `color-mix(in srgb, ${statusColor} 10%, var(--surface))` }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: statusColor, whiteSpace: "nowrap" }}>{statusLabel}</span>
        {t.submissionStatus === "APPROVED" && (
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{tl("approved_desc")}</span>
        )}
      </div>}

      {/* Rejection reason */}
      {t.submissionStatus === "REJECTED" && t.rejectionReason && (
        <div style={{ marginBottom: 20, padding: "12px 14px", borderRadius: 8, border: "2px solid var(--pink)", background: "color-mix(in srgb, var(--pink) 8%, var(--surface))" }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: "var(--pink)", margin: "0 0 4px" }}>{tl("rejection_reason_label")}</p>
          <p style={{ fontSize: 13, margin: 0 }}>{t.rejectionReason}</p>
        </div>
      )}

      {/* Checklist sections — chaque ligne mène au champ à compléter */}
      {sections.map((sec) => <Section key={sec.title} title={sec.title} items={sec.items} />)}
    </div>
  );
}
