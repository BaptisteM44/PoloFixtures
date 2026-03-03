"use client";

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
    t.submissionStatus === "APPROVED" ? "✓ Approuvé" :
    t.submissionStatus === "REJECTED" ? "✗ Refusé" :
    "⏳ En attente";

  return (
    <div className="panel" style={{ padding: "20px 24px" }}>
      <h3 style={{ margin: "0 0 16px", fontFamily: "var(--font-display)", fontSize: 14 }}>État du tournoi</h3>

      {/* Progress bar */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Complétion</span>
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
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Un admin va valider ton tournoi</span>
        )}
        {t.submissionStatus === "APPROVED" && (
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Ton tournoi est visible publiquement</span>
        )}
      </div>

      {/* Rejection reason */}
      {t.submissionStatus === "REJECTED" && t.rejectionReason && (
        <div style={{ marginBottom: 20, padding: "12px 14px", borderRadius: 8, border: "2px solid var(--pink)", background: "color-mix(in srgb, var(--pink) 8%, var(--surface))" }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: "var(--pink)", margin: "0 0 4px" }}>Raison du refus :</p>
          <p style={{ fontSize: 13, margin: 0 }}>{t.rejectionReason}</p>
        </div>
      )}

      {/* Checklist sections */}
      <Section title="Infos de base" items={[
        { label: "Nom du tournoi", done: !!t.name },
        { label: "Lieu (ville & pays)", done: !!t.country && !!t.city },
        { label: "Dates du tournoi", done: !!t.dateStart && !!t.dateEnd },
        { label: "Email de contact", done: !!t.contactEmail },
      ]} />

      <Section title="Format & compétition" items={[
        { label: "Nombre max d'équipes", done: t.maxTeams > 0 },
        { label: "Nombre de terrains", done: t.courtsCount > 0 },
      ]} />

      <Section title="Inscriptions" items={[
        { label: "Dates d'inscription", done: !!t.registrationStart && !!t.registrationEnd, hint: "Définir ouverture et fermeture" },
      ]} />

      <Section title="Logistique" items={[
        { label: "Lieu principal (samedi)", done: !!t.saturdayEventName && !!t.saturdayEventAddress, hint: "Nom et adresse du terrain samedi" },
        { label: "Accueil vendredi", done: !!t.fridayWelcomeName, hint: "Optionnel mais apprécié" },
      ]} />

      <Section title="Visuel & comms" items={[
        { label: "Bannière / affiche", done: !!t.bannerPath, hint: "Image de couverture du tournoi" },
        { label: "Sponsors", done: t.sponsorsCount > 0, hint: "Optionnel" },
        { label: "Co-organisateurs", done: t.coOrganizersCount > 0, hint: "Optionnel" },
      ]} />

      <Section title="Publication" items={[
        { label: "Approuvé par un admin", done: t.submissionStatus === "APPROVED", hint: "En attente de validation" },
      ]} />
    </div>
  );
}
